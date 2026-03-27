import log = require('loglevel');
import { as } from '../lib/as';
import { iter } from '../lib/Iter'
import XmlElement from 'ltx/lib/Element.js';
import { Config } from '../lib/Config';
import { ItemProperties, Pid } from '../lib/ItemProperties';
import { ContentMessage, BackpackUpdateData } from '../lib/ContentMessage';
import { ItemException } from '../lib/ItemException';
import { ItemChangeOptions } from '../lib/ItemChangeOptions';
import { BackgroundApp } from './BackgroundApp';
import { IItemProvider } from './ItemProvider';
import { HostedInventoryItemProvider } from './HostedInventoryItemProvider';
import { is } from '../lib/is';
import { RetryStrategyMaker, RetryStrategyFactorGrowthMaker } from '../lib/RetryStrategy'
import { ItemPropertiesUrlProcessor } from './ItemPropertiesUrlProcessor'
import { DependentPresenceHelper } from './DependentPresenceHelper'
import { CallableEventListeners, EventListeners } from '../lib/EventListeners'

export type BackpackUpdateEventData = {itemsDeleted: ReadonlyArray<Readonly<ItemProperties>>, itemsNewOrChanged: ReadonlyArray<Readonly<ItemProperties>>}

export class Backpack
{
    private readonly app: BackgroundApp
    private readonly retryStrategyMaker: RetryStrategyMaker
    private readonly dependentPresenceHelper: DependentPresenceHelper
    private readonly lastProviderConfigJsons: Map<string, string> = new Map();
    private readonly itemPropertiesUrlProcessor: ItemPropertiesUrlProcessor;

    private readonly items: Map<string,Readonly<ItemProperties>> = new Map();
    private readonly rooms: Map<string,Set<string>> = new Map(); // room JID => Set of item ID
    private readonly providers: Map<string, IItemProvider> = new Map<string, IItemProvider>();

    private readonly callableBackpackUpdateListeners: CallableEventListeners<BackpackUpdateEventData> = new CallableEventListeners('backpackUpdate');

    public readonly backpackUpdateListeners: EventListeners<BackpackUpdateEventData>;

    constructor(app: BackgroundApp)
    {
        this.app = app;
        this.retryStrategyMaker = new RetryStrategyFactorGrowthMaker(1.0, 2.0, 120.0);
        this.dependentPresenceHelper = new DependentPresenceHelper(app);
        this.itemPropertiesUrlProcessor = new ItemPropertiesUrlProcessor(app);
        this.backpackUpdateListeners = this.callableBackpackUpdateListeners;
    }

    public isItem(itemId: string): boolean
    {
        return this.items.has(itemId);
    }

    public getItem(itemId: string): Readonly<ItemProperties>
    {
        const item = this.items.get(itemId);
        if (item == null) { throw new ItemException(ItemException.Fact.UnknownError, ItemException.Reason.NoSuchItem, itemId); }
        return item;
    }

    public getItemOrNull(itemId: string): null|Readonly<ItemProperties>
    {
        return this.items.get(itemId) ?? null;
    }

    public getItems(): ReadonlyMap<string,Readonly<ItemProperties>>
    {
        return this.items;
    }

    public getRoomItems(roomJid: string): ReadonlyArray<Readonly<ItemProperties>>
    {
        return iter(this.rooms.get(roomJid))
            .map(itemId => this.items.get(itemId))
            .filter(item => !is.nil(item))
            .toArray();
    }

    public getItemCount(): number
    {
        return this.items.size;
    }

    public getRezzedItemCount(): number
    {
        let count = 0;
        for (const item of this.items.values()) {
            if (ItemProperties.getIsRezzed(item)) {
                count++;
            }
        }
        return count;
    }

    public async onItemUpdateFromProvider(itemsDeleted: ReadonlyArray<string>, itemsCreatedOrUpdated: ReadonlyArray<ItemProperties>): Promise<void>
    {
        itemsDeleted.forEach(itemId => this.itemPropertiesUrlProcessor.forgetItem(itemId))
        itemsCreatedOrUpdated.forEach(item => this.itemPropertiesUrlProcessor.processItem(item))

        const reallyDeletedItems: ItemProperties[] = [];
        const reallyChangedItems: ItemProperties[] = [];
        const changedRooms = new Set<string>();
        itemsCreatedOrUpdated.forEach(item => this.onCreateOrUpdateItem(item, reallyChangedItems, changedRooms));
        itemsDeleted.forEach(itemId => this.onDeleteItem(itemId, reallyDeletedItems, changedRooms));

        this.sendUpdateToAllTabs(reallyDeletedItems, reallyChangedItems);
        for (const room of changedRooms) {
            this.app.sendRoomPresence(room);
        }
        if (reallyDeletedItems.length !== 0 || reallyChangedItems.length !== 0) {
            const data = {itemsDeleted: reallyDeletedItems, itemsNewOrChanged: reallyChangedItems}
            this.callableBackpackUpdateListeners.callListeners(data)
        }
    }

    private onCreateOrUpdateItem(propsNew: ItemProperties, changedItemsAccu: ItemProperties[], changedRoomsAccu: Set<string>): void
    {
        propsNew[Pid.OwnerId] = this.app.getUserId();
        const itemId = as.String(propsNew[Pid.Id]);
        const propsOld = this.items.get(itemId) ?? {};

        const versionOld = as.Int(propsOld[Pid.Version]);
        const versionNew = as.Int(propsNew[Pid.Version]);
        if (versionOld > versionNew) {
            return;
        }
        const changedPids = ItemProperties.getDifferentPids(propsOld, propsNew);
        if (changedPids.size === 0) {
            return;
        }
        this.items.set(itemId, propsNew);
        changedItemsAccu.push(propsNew);

        const isRezzedOld = ItemProperties.getIsRezzed(propsOld);
        const roomOld = ItemProperties.getRezzedLocation(propsOld) ?? '';
        const isRezzedNew = ItemProperties.getIsRezzed(propsNew);
        const roomNew = ItemProperties.getRezzedLocation(propsNew) ?? '';
        if (isRezzedOld || isRezzedNew) {
            changedPids.delete(Pid.Version);
            changedPids.delete(Pid.InventoryX);
            changedPids.delete(Pid.InventoryY);
            changedPids.delete(Pid.AutorezIsActive);
            if (changedPids.size !== 0) {
                if (isRezzedOld) {
                    this.removeFromRoom(itemId, roomOld);
                    changedRoomsAccu.add(roomOld);
                }
                if (isRezzedNew) {
                    this.addToRoom(itemId, roomNew);
                    changedRoomsAccu.add(roomNew);
                }
            }
        }
    }

    private onDeleteItem(itemId: string, processedDeletedItemsAccu: ItemProperties[], changedRoomsAccu: Set<string>): void
    {
        const propsOld: null|ItemProperties = this.items.get(itemId) ?? null;
        if (!propsOld) {
            return;
        }

        const isRezzedOld = ItemProperties.getIsRezzed(propsOld);
        if (isRezzedOld) {
            const roomOld = ItemProperties.getRezzedLocation(propsOld) ?? '';
            this.removeFromRoom(itemId, roomOld);
            changedRoomsAccu.add(roomOld);
        }

        processedDeletedItemsAccu.push(propsOld);
        this.items.delete(itemId);
    }

    private sendUpdateToAllTabs(itemsHide: ItemProperties[], itemsShowOrSet: ItemProperties[])
    {
        if (!itemsShowOrSet.length && !itemsHide.length) {
            return;
        }
        const data = new BackpackUpdateData(itemsHide, itemsShowOrSet);
        this.app.sendToAllTabs({ type: ContentMessage.type_onBackpackUpdate, data });
    }

    public sendAllOwnItemsToTab(tabId: number)
    {
        const items = [...this.items.values()];
        const data = new BackpackUpdateData([], items);
        this.app.sendToTab(tabId, { type: ContentMessage.type_onBackpackUpdate, data });
    }

    public maintain(loadItems: boolean): void
    {
        const providerConfigs = Config.get('itemProviders', {});
        const enabledProviders: string[] = Config.getArray('items.enabledProviders', []);

        for (const [providerId, provider] of this.providers.entries()) {
            if (!enabledProviders.includes(providerId)) {
                log.info('Backpack.maintain', 'formerly enabled provider became disabled', { providerId });
                this.disableProvider(providerId, provider);
            }
        }

        for (const providerId of enabledProviders) {
            const providerConfig = providerConfigs[providerId] ?? {};
            this.maintainProvider(providerId, providerConfig, loadItems);
        }

        this.itemPropertiesUrlProcessor.maintain();
    }

    private disableProvider(providerId: string, provider: IItemProvider): void
    {
        log.info('Backpack.disableProvider', 'Provider stopping.', { providerId });
        try {
            provider.stop();
        } catch (error) {
            log.info('Backpack.disableProvider', 'Provider stopping failed!', { providerId }, error);
        }
        this.lastProviderConfigJsons.delete(providerId);
        this.providers.delete(providerId);
        const itemIdsToRemove = iter(this.items.entries())
            .filter(([itemId, item]) => item[Pid.Provider] === providerId)
            .map(([itemId, item]) => itemId)
            .toArray();
        this.onItemUpdateFromProvider(itemIdsToRemove, []).then(() => {});
    }

    private maintainProvider(providerId: string, providerConfig: {[p:string]:any}, loadItems: boolean): void
    {
        const providerConfigJson = JSON.stringify(providerConfig);
        let provider: null|IItemProvider = this.providers.get(providerId) ?? null;

        const lastProviderConfigJson = this.lastProviderConfigJsons.get(providerId)
        if (providerConfigJson !== lastProviderConfigJson) {
            if (provider) {
                log.info('Backpack.maintainProvider', 'Enabled provider\'s config changed.', { providerId, providerConfigJson, lastProviderConfigJson });
                this.disableProvider(providerId, provider);
                provider = null;
            }
            log.info('Backpack.maintainProvider', 'Provider initializing.', { providerId, providerConfig });

            try {
                provider = this.makeProvider(providerId, providerConfig, loadItems);
            } catch (error) {
                log.info('Backpack.maintainProvider', 'Provider initialization failed!', { providerId, providerConfig, error }, error);
                return;
            }
            this.lastProviderConfigJsons.set(providerId, providerConfigJson);
            if (provider) {
                this.providers.set(providerId, provider);
            }
        }

        try {
            provider?.maintain();
        } catch (error) {
            log.info('Backpack.maintainProvider', 'Provider maintenance failed!', { providerId, providerConfig, error }, error);
        }
    }

    private makeProvider(providerId: string, providerConfig: {[p:string]:any}, loadItems: boolean): null|IItemProvider
    {
        switch (as.String(providerConfig.type, 'unknown')) {
            case HostedInventoryItemProvider.Provider.type: {
                return new HostedInventoryItemProvider.Provider(this.app, this, this.retryStrategyMaker, loadItems, providerId, <HostedInventoryItemProvider.Definition>providerConfig);
            } break;
            default: {
                log.info('Backpack.makeProvider', 'Unknown provider type!', { providerId, providerConfig });
                return null;
            }
        }
    }

    public async loadWeb3Items(): Promise<void>
    {
        return await this.getProviderFromName('n3q').loadWeb3Items();
    }

    public async applyItemToItem(activeId: string, passiveId: string): Promise<ItemProperties>
    {
        return await this.getProvider(activeId).applyItemToItem(activeId, passiveId);
    }

    public async transferAuthorize(itemId: string, duration: number): Promise<string>
    {
        return await this.getProvider(itemId).transferAuthorize(itemId, duration);
    }

    public async transferUnauthorize(itemId: string): Promise<void>
    {
        await this.getProvider(itemId).transferUnauthorize(itemId);
    }

    public async transferComplete(provider: string, senderInventory: string, senderItem: string, transferToken: string): Promise<string>
    {
        return await this.getProviderFromName(provider).transferComplete(senderInventory, senderItem, transferToken);
    }

    // Tests whether a known item has been deleted. Removes it from backpack if it isn't known by the repository:
    public async isItemStillInRepo(itemId: string): Promise<boolean>
    {
        if (!this.isItem(itemId)) {
            // Item unknown now. Probably lost a race.
            return false;
        }
        const provider = this.getProvider(itemId);
        const providerItemIds = await provider.getItemIds();

        if (!this.isItem(itemId)) {
            // Item unknown now. Removed while waiting for provider.getItemIds.
            return false;
        }
        if (providerItemIds.includes(itemId)) {
            // Item known and in repository.
            return true;
        }
        // Item known but removed from repository.
        await this.onItemUpdateFromProvider([itemId], []);

        return false;
    }

    public async createItem(provider: string, auth: string, method: string, args: ItemProperties): Promise<ItemProperties>
    {
        return await this.getProviderFromName(provider).createItem(auth, method, args);
    }

    public getPointsItem(): null|Readonly<ItemProperties>
    {
        let pointsItems = this.findItems(props => as.Bool(props[Pid.PointsAspect], false));

        let maxPoints = -1;
        let maxItem: Readonly<ItemProperties> = null;
        for (let i = 0; i < pointsItems.length; i++) {
            let item = pointsItems[i];
            let points = as.Int(item[Pid.PointsTotal], 0);
            if (points > maxPoints) {
                maxPoints = points;
                maxItem = item;
            }
        }
        return maxItem;
    }

    private getProvider(itemId: string): IItemProvider
    {
        const item = this.getItem(itemId);
        return this.getProviderFromProperties(item);
    }

    private getProviderFromProperties(props: Readonly<ItemProperties>): IItemProvider
    {
        const providerName = as.String(props[Pid.Provider], '');
        try {
            return this.getProviderFromName(providerName);
        } catch (error) {
            const itemId = as.String(props[Pid.Id], 'no-id');
            throw new ItemException(ItemException.Fact.InternalError, ItemException.Reason.NoItemProviderForItem, itemId + ' provider=' + providerName);
        }
    }

    private getProviderFromName(name: string): IItemProvider
    {
        if (this.providers.has(name)) {
            return this.providers.get(name);
        }
        throw new ItemException(ItemException.Fact.InternalError, ItemException.Reason.NoSuchItemProvider, name);
    }

    public async addItem(itemId: string, props: ItemProperties, options: ItemChangeOptions): Promise<void>
    {
        await this.getProviderFromProperties(props).addItem(itemId, props, options);
    }

    public async deleteItem(itemId: string, options: ItemChangeOptions): Promise<void>
    {
        await this.getProvider(itemId).deleteItem(itemId, options);
    }

    public findItems(filter: (props: Readonly<ItemProperties>) => boolean): Readonly<ItemProperties>[]
    {
        const found: Readonly<ItemProperties>[] = iter(this.items.values()).filter(filter).toArray();
        return found;
    }

    private findItemsByProperties(filterProperties: Readonly<ItemProperties>): Readonly<ItemProperties>[]
    {
        const filterKVs = Object.entries(filterProperties);
        const filter = itemProps => filterKVs.every(([pid, value]) => itemProps[pid] === value);
        return this.findItems(filter);
    }

    public getFirstFilteredItemsPropertyValue(filterProperties: Readonly<ItemProperties>, propertyPid: string): null|string
    {
        for (const item of this.findItemsByProperties(filterProperties)) {
            const value = item[propertyPid] ?? null;
            if (!is.nil(value)) {
                return value;
            }
        }
        return null;
    }

    private addToRoom(itemId: string, roomJid: string): void
    {
        let rezzedIds = this.rooms.get(roomJid);
        if (!rezzedIds) {
            rezzedIds = new Set<string>();
            this.rooms.set(roomJid, rezzedIds);
        }
        rezzedIds.add(itemId);
    }

    private removeFromRoom(itemId: string, roomJid: string): void
    {
        const rezzedIds = this.rooms.get(roomJid) ?? null;
        rezzedIds?.delete(itemId);
        if ((rezzedIds?.size ?? null) === 0) {
            this.rooms.delete(roomJid);
        }
    }

    public async modifyItemProperties(itemId: string, changed: ItemProperties, deleted: Array<string>, options: ItemChangeOptions): Promise<void>
    {
        await this.getProvider(itemId).modifyItemProperties(itemId, changed, deleted, options);
    }

    public async executeItemAction(itemId: string, action: string, args: any, involvedIds: Array<string>, allowUnrezzed: boolean): Promise<ItemProperties>
    {
        return await this.getProvider(itemId).itemAction(itemId, action, args, involvedIds, allowUnrezzed);
    }

    public async executeItemActionOnGenericitem(action: string, args: any, involvedIds: Array<string>, allowUnrezzed: boolean): Promise<ItemProperties>
    {
        const filter = { [Pid.N3qAspect]: 'true', [Pid.Provider]: 'n3q' }
        const items = this.findItemsByProperties(filter)
        if (items.length === 0) {
            throw new ItemException(ItemException.Fact.InternalError, ItemException.Reason.NoSuchItem, 'Generic item missing for action!')
        }
        const itemId = ItemProperties.getId(items[0])
        return await this.executeItemAction(itemId, action, args, involvedIds, allowUnrezzed)
    }

    public async rezItem(itemId: string, roomJid: string, rezzedX: number, destinationUrl: string): Promise<void>
    {
        await this.getProvider(itemId).rezItem(itemId, roomJid, rezzedX, destinationUrl);
    }

    public async derezItem(itemId: string, roomJid: string, inventoryX: number, inventoryY: number): Promise<void>
    {
        await this.getProvider(itemId).derezItem(itemId, roomJid, inventoryX, inventoryY);
    }

    public async getItemsByInventoryItemIds(itemsToGet: ItemProperties[]): Promise<ItemProperties[]>
    {
        const itemsPromises = [...this.providers.values()]
            .map(provider => provider.getItemsByInventoryItemIds(itemsToGet));
        const items = (await Promise.all(itemsPromises)).flat();
        return items;
    }

    public getLoadedItemsByInventoryItemIds(itemsToGet: ItemProperties[]): { itemsLoaded: ItemProperties[], itemsToLoad: ItemProperties[] }
    {
        const providerResults = iter(this.providers.values())
            .map(provider => provider.getLoadedItemsByInventoryItemIds(itemsToGet))
            .toArray();
        const itemsToLoad = iter(providerResults).flatmap(({ itemsToLoad }) => itemsToLoad).toArray();
        const itemsLoaded = iter(providerResults).flatmap(({ itemsLoaded }) => itemsLoaded).toArray();
        return { itemsLoaded, itemsToLoad };
    }

    public stanzaOutFilter(stanza: XmlElement): XmlElement
    {
        for (const [providerId, provider] of this.providers) {
            try {
                stanza = provider.stanzaOutFilter(stanza);
            } catch (error) {
                log.info('Backpack.stanzaOutFilter', 'provider.stanzaOutFilter failed for provider', providerId);
            }
        }
        this.dependentPresenceHelper.modifyOutgoingStanza(stanza);
        return stanza;
    }

    public stanzaInFilter(stanza: XmlElement): XmlElement
    {
        this.dependentPresenceHelper.modifyIncomingStanza(stanza);
        return stanza;
    }

}
