import log = require('loglevel');
import { as } from '../lib/as';
import * as jid from '@xmpp/jid';
import * as ltx from 'ltx';
import { Config } from '../lib/Config';
import { ItemProperties, Pid } from '../lib/ItemProperties';
import { ContentMessage, BackpackUpdateData } from '../lib/ContentMessage';
import { ItemException } from '../lib/ItemException';
import { ItemChangeOptions } from '../lib/ItemChangeOptions';
import { BackgroundApp } from './BackgroundApp';
import { Item } from './Item';
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

    private readonly items: { [id: string]: Item; } = {};
    private readonly rooms: { [jid: string]: Array<string>; } = {};
    private readonly providers: Map<string, IItemProvider> = new Map<string, IItemProvider>();

    constructor(app: BackgroundApp)
    {
        this.app = app;
        this.retryStrategyMaker = new RetryStrategyFactorGrowthMaker(1.0, 2.0, 120.0);
    }

    public isItem(itemId: string): boolean
    {
        let item = this.items[itemId];
        if (item) {
            return true;
        }
        return false;
    }

    public getItem(itemId: string): Item
    {
        let item = this.items[itemId];
        if (item == null) { throw new ItemException(ItemException.Fact.UnknownError, ItemException.Reason.NoSuchItem, itemId); }
        return item;
    }

    public getItems(): { [id: string]: ItemProperties; }
    {
        let itemProperties: { [id: string]: ItemProperties; } = {};
        for (let id in this.items) {
            let item = this.items[id];
            itemProperties[id] = item.getProperties();
        }
        return itemProperties
    }

    public getItemCount(): number
    {
        let count = 0;
        for (let id in this.items) {
            count++;
        }
        return count;
    }

    public getRezzedItemCount(): number
    {
        let count = 0;
        for (let id in this.items) {
            let item = this.items[id];
            if (item.isRezzed()) {
                count++;
            }
        }
        return count;
    }

    public requestSendPresenceFromTab(roomJid: string)
    {
        this.app.sendRoomPresence(roomJid);
    }

    public sendAddItemToAllTabs(itemId: string)
    {
        this.sendUpdateToAllTabs([], [this.getItem(itemId).getProperties()]);
    }

    public sendRemoveItemToAllTabs(itemId: string)
    {
        this.sendUpdateToAllTabs([this.getItem(itemId).getProperties()], []);
    }

    public sendUpdateToAllTabs(itemsHide: ItemProperties[], itemsShowOrSet: ItemProperties[])
    {
        if (!itemsShowOrSet.length && !itemsHide.length) {
            return;
        }
        const data = new BackpackUpdateData(itemsHide, itemsShowOrSet);
        this.app.sendToAllTabs({ type: ContentMessage.type_onBackpackUpdate, data });
    }

    public sendUpdateToTab(tabId: number, itemsHide: ItemProperties[], itemsShowOrSet: ItemProperties[])
    {
        if (!itemsShowOrSet.length && !itemsHide.length) {
            return;
        }
        const data = new BackpackUpdateData(itemsHide, itemsShowOrSet);
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
        for (const itemId in this.items) {
            const item = this.items[itemId];
            if (item.getProperties()[Pid.Provider] === providerId) {
                this.sendRemoveItemToAllTabs(itemId);
                this.deleteRepositoryItem(itemId);
            }
        }
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

        // Synchronous section start.
        if (!this.isItem(itemId)) {
            // Item unknown now. Removed while waiting for provider.getItemIds.
            return false;
        }
        if (providerItemIds.includes(itemId)) {
            // Item known and in repository.
            return true;
        }
        // Item known but removed from repository.
        const item = this.getItem(itemId);
        const wasRezzed = item.isRezzed();
        const room = item.getProperties()[Pid.RezzedLocation];
        this.sendRemoveItemToAllTabs(itemId);
        this.deleteRepositoryItem(itemId);
        if (wasRezzed) {
            this.requestSendPresenceFromTab(room);
        }
        // Synchronous section end.

        return false;
    }

    public async createItem(provider: string, auth: string, method: string, args: ItemProperties): Promise<ItemProperties>
    {
        return await this.getProviderFromName(provider).createItem(auth, method, args);
    }

    public getPointsItem(): null|Item
    {
        let pointsItems = this.findItems(props => as.Bool(props[Pid.PointsAspect], false));

        let maxPoints = -1;
        let maxItem: Item = null;
        for (let i = 0; i < pointsItems.length; i++) {
            let item = pointsItems[i];
            let points = as.Int(item.getProperties()[Pid.PointsTotal], 0);
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
        if (item) {
            return this.getProviderFromProperties(item.getProperties());
        }
        throw new ItemException(ItemException.Fact.InternalError, ItemException.Reason.NoSuchItem, itemId + ' while Backpack.getProvider');
    }

    private getProviderFromProperties(props: ItemProperties): IItemProvider
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

    public findItems(filter: (props: ItemProperties) => boolean): Array<Item>
    {
        let found: Array<Item> = [];

        for (let itemId in this.items) {
            let item = this.items[itemId];
            if (item) {
                if (filter(item.getProperties())) {
                    found.push(item);
                }
            }
        }

        return found;
    }

    private findItemsByProperties(filterProperties: ItemProperties): Item[]
    {
        const filterKVs = Object.entries(filterProperties);
        const filter = itemProps => filterKVs.every(([pid, value]) => itemProps[pid] === value);
        return this.findItems(filter);
    }

    public getFirstFilteredItemsPropertyValue(filterProperties: ItemProperties, propertyPid: string): null|string
    {
        for (const item of this.findItemsByProperties(filterProperties)) {
            const value = item.getProperties()[propertyPid] ?? null;
            if (!is.nil(value)) {
                return value;
            }
        }
        return null;
    }

    public createRepositoryItem(itemId: string, props: ItemProperties): Item
    {
        props[Pid.OwnerId] = this.app.getUserId();

        let item = this.items[itemId];
        if (item == null) {
            item = new Item(this.app, this, itemId, props);
            this.items[itemId] = item;
        }
        return item;
    }

    public deleteRepositoryItem(itemId: string): void
    {
        for (const roomJid in this.rooms) {
            const roomItemIds = this.rooms[roomJid];
            const itemIndex = roomItemIds.findIndex(elementId => elementId === itemId);
            if (itemIndex > -1) {
                roomItemIds.splice(itemIndex, 1);
            }
        }
        if (this.items[itemId]) {
            delete this.items[itemId];
        }
    }

    public setRepositoryItemProperties(itemId: string, props: ItemProperties, options: ItemChangeOptions): void
    {
        let item = this.items[itemId];
        if (item == null) { throw new ItemException(ItemException.Fact.UnknownError, ItemException.Reason.NoSuchItem, itemId); }

        item.setProperties(props, options);
    }

    public getRepositoryItemProperties(itemId: string): ItemProperties
    {
        let item = this.items[itemId];
        if (item == null) { throw new ItemException(ItemException.Fact.UnknownError, ItemException.Reason.NoSuchItem, itemId); } // throw unhandled, maybe return null?
        return item.getProperties();
    }

    public addToRoom(itemId: string, roomJid: string): void
    {
        let rezzedIds = this.rooms[roomJid];
        if (rezzedIds == null) {
            rezzedIds = new Array<string>();
            this.rooms[roomJid] = rezzedIds;
        }
        rezzedIds.push(itemId);
    }

    public removeFromRoom(itemId: string, roomJid: string): void
    {
        let rezzedIds = this.rooms[roomJid];
        if (rezzedIds) {
            const index = rezzedIds.indexOf(itemId, 0);
            if (index > -1) {
                rezzedIds.splice(index, 1);
                if (!rezzedIds.length) {
                    delete this.rooms[roomJid];
                }
            }
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
        const itemId = items[0].getId()
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
            const rezzedIds = this.rooms[roomJid];
            if (rezzedIds && rezzedIds.length > 0) {
                let dependentExtension = this.getDependentPresence(roomJid);
                if (dependentExtension) {
                    stanza.cnode(dependentExtension);
                }
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
    private getDependentPresence(roomJid: string): ltx.Element
    {
        let result = new ltx.Element('x', { 'xmlns': 'vp:dependent' });

        let ids = [];

        for (let id in this.items) {
            if (this.items[id].isRezzedTo(roomJid)) {
                ids.push(id);
            }
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

        for (let i = 0; i < ids.length; i++) {
            let id = ids[i];
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
