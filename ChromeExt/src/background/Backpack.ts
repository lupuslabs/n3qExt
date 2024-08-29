import log = require('loglevel');
import { as } from '../lib/as';
import { iter } from '../lib/Iter'
import * as jid from '@xmpp/jid';
import * as ltx from 'ltx';
import { Config } from '../lib/Config';
import { ItemProperties, Pid } from '../lib/ItemProperties';
import { ContentMessage, BackpackUpdateData } from '../lib/ContentMessage';
import { ItemException } from '../lib/ItemException';
import { ItemChangeOptions } from '../lib/ItemChangeOptions';
import { BackgroundApp } from './BackgroundApp';
import { WeblinClientApi } from '../lib/WeblinClientApi';
import { IItemProvider } from './ItemProvider';
import { LocalStorageItemProvider } from './LocalStorageItemProvider';
import { HostedInventoryItemProvider } from './HostedInventoryItemProvider';
import { is } from '../lib/is';
import { RetryStrategyMaker, RetryStrategyFactorGrowthMaker } from '../lib/RetryStrategy'

export class Backpack
{
    private readonly app: BackgroundApp
    private readonly retryStrategyMaker: RetryStrategyMaker
    private readonly lastProviderConfigJsons: Map<string, string> = new Map();

    private readonly items: Map<string,Readonly<ItemProperties>> = new Map();
    private readonly rooms: Map<string,Set<string>> = new Map(); // room JID => Set of item ID
    private readonly providers: Map<string, IItemProvider> = new Map<string, IItemProvider>();

    constructor(app: BackgroundApp)
    {
        this.app = app;
        this.retryStrategyMaker = new RetryStrategyFactorGrowthMaker(1.0, 2.0, 120.0);
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

    public getItems(): ReadonlyMap<string,Readonly<ItemProperties>>
    {
        return this.items;
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
        const processedDeletedItems: ItemProperties[] = [];
        const processedChangedItems: ItemProperties[] = [];
        const changedRooms = new Set<string>();
        itemsCreatedOrUpdated.forEach(item => this.onCreateOrUpdateItem(item, processedChangedItems, changedRooms));
        itemsDeleted.forEach(itemId => this.onDeleteItem(itemId, processedDeletedItems, changedRooms));

        this.sendUpdateToAllTabs(processedDeletedItems, processedChangedItems);
        for (const room of changedRooms) {
            this.app.sendRoomPresence(room);
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
        const propsDifferentchanged = ItemProperties.getDifferentPids(propsOld, propsNew);
        if (propsDifferentchanged.size === 0) {
            return;
        }
        this.items.set(itemId, propsNew);
        changedItemsAccu.push(propsNew);

        const isRezzedOld = ItemProperties.getIsRezzed(propsOld);
        const roomOld = ItemProperties.getRezzedLocation(propsOld) ?? '';
        const isRezzedNew = ItemProperties.getIsRezzed(propsNew);
        const roomNew = ItemProperties.getRezzedLocation(propsNew) ?? '';
        if (isRezzedOld || isRezzedNew) {
            propsDifferentchanged.delete(Pid.Version);
            propsDifferentchanged.delete(Pid.InventoryX);
            propsDifferentchanged.delete(Pid.InventoryY);
            propsDifferentchanged.delete(Pid.AutorezIsActive);
            if (propsDifferentchanged.size !== 0) {
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
            case LocalStorageItemProvider.type: {
                return new LocalStorageItemProvider(this, providerId, providerConfig);
            } break;
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

    public async rezItem(itemId: string, roomJid: string, rezzedX: number, destinationUrl: string, options: ItemChangeOptions): Promise<void>
    {
        await this.getProvider(itemId).rezItem(itemId, roomJid, rezzedX, destinationUrl, options);
    }

    public async derezItem(itemId: string, roomJid: string, inventoryX: number, inventoryY: number, changed: ItemProperties, deleted: Array<string>, options: ItemChangeOptions): Promise<void>
    {
        await this.getProvider(itemId).derezItem(itemId, roomJid, inventoryX, inventoryY, changed, deleted, options);
    }

    public async getItemsByInventoryItemIds(itemsToGet: ItemProperties[]): Promise<ItemProperties[]>
    {
        const itemsPromises = [...this.providers.values()]
            .map(provider => provider.getItemsByInventoryItemIds(itemsToGet));
        const itemLists = await Promise.all(itemsPromises);
        return [].concat(...itemLists);
    }

    public stanzaOutFilter(stanza: ltx.Element): ltx.Element
    {
        for (let [providerId, provider] of this.providers) {
            try {
                stanza = provider.stanzaOutFilter(stanza);
            } catch (error) {
                log.info('Backpack.stanzaOutFilter', 'provider.stanzaOutFilter failed for provider', providerId);
            }
        }

        if (stanza.name === 'presence' && as.String(stanza.attrs['type'], 'available') === 'available') {
            let toJid = jid(stanza.attrs.to);
            let roomJid = toJid.bare().toString();
            let dependentExtension = this.getDependentPresence(roomJid);
            if (dependentExtension) {
                stanza.cnode(dependentExtension);
            }
        }

        return stanza;
    }

    public stanzaInFilter(stanza: ltx.Element): ltx.Element
    {
        if (stanza.name === 'presence' && as.String(stanza.attrs['type'], 'available') === 'available') {
            const fromJid = jid(stanza.attrs.from);
            const roomJid = fromJid.bare().toString();
            const participantNick = fromJid.getResource();
            const dependentPresences = stanza.getChildren('x', 'vp:dependent')[0]?.getChildren('presence') ?? [];
            for (const dependentPresence of dependentPresences) {
                const vpProps = dependentPresence.getChildren('x', 'vp:props')[0];
                if (vpProps) {
                    const itemId = vpProps.attrs[Pid.Id];
                    const providerName = as.String(vpProps.attrs[Pid.Provider], '');
                    if (this.providers.has(providerName)) {
                        const provider = this.providers.get(providerName);
                        provider.onDependentPresence(itemId, roomJid, participantNick, dependentPresence);
                    }
                }
            }
        }

        return stanza;
    }

    public replayPresence(roomJid: string, participantNick: string): void
    {
        this.app.replayPresence(roomJid, participantNick);
    }

    private warningNotificatonTime = 0;
    private limitNotificatonTime = 0;
    private getDependentPresence(roomJid: string): null|ltx.Element
    {
        let result = new ltx.Element('x', { 'xmlns': 'vp:dependent' });

        let ids = iter(this.rooms.get(roomJid)).toArray();
        if (ids.length === 0) {
            return null;
        }

        if (ids.length > Config.get('backpack.dependentPresenceItemsWarning', 20)) {
            let now = Date.now();
            if (ids.length > Config.get('backpack.dependentPresenceItemsLimit', 25)) {
                if ((now - this.limitNotificatonTime) / 1000 > Config.get('backpack.dependentPresenceItemsWarningIntervalSec', 30.0)) {
                    this.limitNotificatonTime = now;
                    this.showToast(roomJid,
                        this.app.translateText('Backpack.Too many items'),
                        this.app.translateText('Backpack.Page items disabled.'),
                        'DependentPresenceLimit',
                        WeblinClientApi.ClientNotificationRequest.iconType_warning,
                    );
                }
                return result;
            } else {

                if ((now - this.warningNotificatonTime) / 1000 > Config.get('backpack.dependentPresenceItemsWarningIntervalSec', 30.0)) {
                    this.warningNotificatonTime = now;
                    this.showToast(roomJid,
                        this.app.translateText('Backpack.Too many items'),
                        this.app.translateText('Backpack.You are close to the limit of items on a page.'),
                        'DependentPresenceWarning',
                        WeblinClientApi.ClientNotificationRequest.iconType_notice,
                    );
                }
            }
        }

        for (const id of ids) {
            const itemPresence = this.getProvider(id).getDependentPresence(id, roomJid);
            result.cnode(itemPresence);
        }

        return result;
    }

    private showToast(roomJid: string, title: string, text: string, type: string, iconType: string): void
    {
        let data = new WeblinClientApi.ClientNotificationRequest(WeblinClientApi.ClientNotificationRequest.type, '');
        data.title = title;
        data.text = text;
        data.type = type;
        data.iconType = iconType;
        this.app.sendToTabsForRoom(roomJid, { type: ContentMessage.type_clientNotification, data });
    }

}
