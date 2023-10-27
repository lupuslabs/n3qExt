import log = require('loglevel');
import { as } from '../lib/as';
import * as jid from '@xmpp/jid';
import * as ltx from 'ltx';
import { Config } from '../lib/Config';
import { ItemProperties, Pid } from '../lib/ItemProperties';
import { BackpackShowItemData, BackpackRemoveItemData, ContentMessage } from '../lib/ContentMessage';
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

    isItem(itemId: string): boolean
    {
        let item = this.items[itemId];
        if (item) {
            return true;
        }
        return false;
    }

    getItem(itemId: string): Item
    {
        let item = this.items[itemId];
        if (item == null) { throw new ItemException(ItemException.Fact.UnknownError, ItemException.Reason.ItemDoesNotExist, itemId); }
        return item;
    }

    getItems(): { [id: string]: ItemProperties; }
    {
        let itemProperties: { [id: string]: ItemProperties; } = {};
        for (let id in this.items) {
            let item = this.items[id];
            itemProperties[id] = item.getProperties();
        }
        return itemProperties
    }

    getItemCount(): number
    {
        let count = 0;
        for (let id in this.items) {
            count++;
        }
        return count;
    }

    getRezzedItemCount(): number
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

    requestSendPresenceFromTab(roomJid: string)
    {
        this.app.sendRoomPresence(roomJid);
    }

    sendAddItemToAllTabs(itemId: string)
    {
        const data = new BackpackShowItemData(itemId, this.getItem(itemId).getProperties());
        this.app.sendToAllTabs({ type: ContentMessage.type_onBackpackShowItem, data });
    }

    sendRemoveItemToAllTabs(itemId: string)
    {
        const data = new BackpackRemoveItemData(itemId, this.getItem(itemId).getProperties());
        this.app.sendToAllTabs({ type: ContentMessage.type_onBackpackHideItem, data });
    }

    public maintain(loadItems: boolean): void
    {
        const providerConfigs = Config.get('itemProviders', {});
        const enabledProviders: string[] = Config.getArray('items.enabledProviders', []);

        for (const providerId of this.providers.keys()) {
            const provider = this.providers.get(providerId);
            if (provider && !enabledProviders.includes(providerId)) {
                this.disableProvider(providerId, provider);
            }
        }

        for (const providerId in providerConfigs) {
            const providerConfig = providerConfigs[providerId] ?? {};
            const providerConfigJson = JSON.stringify(providerConfig);
            if (providerConfigJson === this.lastProviderConfigJsons.get(providerId)) {
                continue;
            }
            this.lastProviderConfigJsons.set(providerId, providerConfigJson);
            if (!enabledProviders.includes(providerId)) {
                log.info('Backpack.init', 'provider disabled', providerId);
                continue;
            }
            log.info('Backpack.init', 'provider initializing', providerId);
            const provider = this.makeProvider(providerId, providerConfig, loadItems);
            if (!provider) {
                continue;
            }
            this.providers.set(providerId, provider);
        }
        this.providers.forEach(provider => provider.maintain());
    }

    private disableProvider(providerId: string, provider: IItemProvider): void
    {
        log.info('Backpack.init', 'formerly enabled provider became disabled', providerId);
        provider.stop();
        this.providers.delete(providerId);
        for (const itemId in this.items) {
            const item = this.items[itemId];
            if (item.getProperties()[Pid.Provider] === providerId) {
                this.sendRemoveItemToAllTabs(itemId);
                this.deleteRepositoryItem(itemId);
            }
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
                log.info('Backpack.init', 'Unknown provider type!', { providerId, providerConfig });
                return null;
            }
        }
    }

    async loadWeb3Items(): Promise<void>
    {
        return await this.getProviderFromName('n3q').loadWeb3Items();
    }

    async applyItemToItem(activeId: string, passiveId: string): Promise<ItemProperties>
    {
        return await this.getProvider(activeId).applyItemToItem(activeId, passiveId);
    }

    async transferAuthorize(itemId: string, duration: number): Promise<string>
    {
        return await this.getProvider(itemId).transferAuthorize(itemId, duration);
    }

    async transferUnauthorize(itemId: string): Promise<void>
    {
        await this.getProvider(itemId).transferUnauthorize(itemId);
    }

    async transferComplete(provider: string, senderInventory: string, senderItem: string, transferToken: string): Promise<string>
    {
        return await this.getProviderFromName(provider).transferComplete(senderInventory, senderItem, transferToken);
    }

    // Tests whether a known item has been deleted. Removes it from backpack if it isn't known by the repository:
    async isItemStillInRepo(itemId: string): Promise<boolean>
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

    async createItem(provider: string, auth: string, method: string, args: ItemProperties): Promise<ItemProperties>
    {
        return await this.getProviderFromName(provider).createItem(auth, method, args);
    }

    async getOrCreatePointsItem(): Promise<Item>
    {
        let pointsItems = this.findItems(props => as.Bool(props[Pid.PointsAspect], false));

        if (pointsItems.length > 1) {
            let maxPoints = -1;
            let maxItem: Item;
            for (let i = 0; i < pointsItems.length; i++) {
                let item = pointsItems[i];
                let points = as.Int(item.getProperties()[Pid.PointsTotal], 0);
                if (points > maxPoints) {
                    maxPoints = points;
                    maxItem = item;
                }
            }
            return maxItem;
        } else if (pointsItems.length == 0) {
            // Points item is now server based.
            // Will be restored by Config call if deleted.
            // Not created on the fly here as before

            // let template = 'Points';
            // try {
            //     return await this.createItemByTemplate(template, {});
            // } catch (error) {
            //     log.info('Backpack.getOrCreatePointsItem', 'failed to create item', template, error);
            // }
            return null;
        } else if (pointsItems.length == 1) {
            return pointsItems[0]
        }
    }

    getProvider(itemId: string): IItemProvider
    {
        const item = this.getItem(itemId);
        if (item) {
            return this.getProviderFromProperties(item.getProperties());
        }
        throw new ItemException(ItemException.Fact.InternalError, ItemException.Reason.NoSuchItem, itemId + ' while Backpack.getProvider');
    }

    getProviderFromProperties(props: ItemProperties): IItemProvider
    {
        const providerName = as.String(props[Pid.Provider], '');
        try {
            return this.getProviderFromName(providerName);
        } catch (error) {
            const itemId = as.String(props[Pid.Id], 'no-id');
            throw new ItemException(ItemException.Fact.InternalError, ItemException.Reason.NoItemProviderForItem, itemId + ' provider=' + providerName);
        }
    }

    getProviderFromName(name: string): IItemProvider
    {
        if (this.providers.has(name)) {
            return this.providers.get(name);
        }
        throw new ItemException(ItemException.Fact.InternalError, ItemException.Reason.NoSuchItemProvider, name);
    }

    async addItem(itemId: string, props: ItemProperties, options: ItemChangeOptions): Promise<void>
    {
        await this.getProviderFromProperties(props).addItem(itemId, props, options);
    }

    async deleteItem(itemId: string, options: ItemChangeOptions): Promise<void>
    {
        await this.getProvider(itemId).deleteItem(itemId, options);
    }

    findItems(filter: (props: ItemProperties) => boolean): Array<Item>
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

    findItemsByProperties(filterProperties: ItemProperties): Item[]
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

    createRepositoryItem(itemId: string, props: ItemProperties): Item
    {
        props[Pid.OwnerId] = this.app.getUserId();

        let item = this.items[itemId];
        if (item == null) {
            item = new Item(this.app, this, itemId, props);
            this.items[itemId] = item;
        }
        return item;
    }

    deleteRepositoryItem(itemId: string): void
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

    setRepositoryItemProperties(itemId: string, props: ItemProperties, options: ItemChangeOptions): void
    {
        let item = this.items[itemId];
        if (item == null) { throw new ItemException(ItemException.Fact.UnknownError, ItemException.Reason.ItemDoesNotExist, itemId); }

        item.setProperties(props, options);
    }

    getRepositoryItemProperties(itemId: string): ItemProperties
    {
        let item = this.items[itemId];
        if (item == null) { throw new ItemException(ItemException.Fact.UnknownError, ItemException.Reason.ItemDoesNotExist, itemId); } // throw unhandled, maybe return null?
        return item.getProperties();
    }

    addToRoom(itemId: string, roomJid: string): void
    {
        let rezzedIds = this.rooms[roomJid];
        if (rezzedIds == null) {
            rezzedIds = new Array<string>();
            this.rooms[roomJid] = rezzedIds;
        }
        rezzedIds.push(itemId);
    }

    removeFromRoom(itemId: string, roomJid: string): void
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

    async modifyItemProperties(itemId: string, changed: ItemProperties, deleted: Array<string>, options: ItemChangeOptions): Promise<void>
    {
        await this.getProvider(itemId).modifyItemProperties(itemId, changed, deleted, options);
    }

    async executeItemAction(itemId: string, action: string, args: any, involvedIds: Array<string>, allowUnrezzed: boolean): Promise<ItemProperties>
    {
        return await this.getProvider(itemId).itemAction(itemId, action, args, involvedIds, allowUnrezzed);
    }

    async rezItem(itemId: string, roomJid: string, rezzedX: number, destinationUrl: string, options: ItemChangeOptions): Promise<void>
    {
        await this.getProvider(itemId).rezItem(itemId, roomJid, rezzedX, destinationUrl, options);
    }

    async derezItem(itemId: string, roomJid: string, inventoryX: number, inventoryY: number, changed: ItemProperties, deleted: Array<string>, options: ItemChangeOptions): Promise<void>
    {
        await this.getProvider(itemId).derezItem(itemId, roomJid, inventoryX, inventoryY, changed, deleted, options);
    }

    getItemsByInventoryItemIds(itemsToGet: ItemProperties[]): Promise<ItemProperties[]>
    {
        const itemsPromises = [...this.providers.values()]
        .map(provider => provider.getItemsByInventoryItemIds(itemsToGet));
        return Promise.all(itemsPromises).then(itemLists => [].concat(...itemLists));
    }

    stanzaOutFilter(stanza: ltx.Element): ltx.Element
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

    stanzaInFilter(stanza: ltx.Element): ltx.Element
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

    replayPresence(roomJid: string, participantNick: string): void
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
