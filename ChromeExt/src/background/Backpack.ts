import log = require('loglevel');
import { as } from '../lib/as';
import { xml, jid } from '@xmpp/client';
import { Config } from '../lib/Config';
import { ItemProperties, Pid } from '../lib/ItemProperties';
import { BackpackShowItemData, BackpackRemoveItemData, BackpackSetItemData, ContentMessage } from '../lib/ContentMessage';
import { ItemException } from '../lib/ItemException';
import { ItemChangeOptions } from '../lib/ItemChangeOptions';
import { Memory } from '../lib/Memory';
import { Utils } from '../lib/Utils';
import { BackgroundApp } from './BackgroundApp';
import { Item } from './Item';
import { WeblinClientApi } from '../lib/WeblinClientApi';
import { IItemProvider } from './ItemProvider';
import { LocalStorageItemProvider } from './LocalStorageItemProvider';
import { HostedInventoryItemProvider } from './HostedInventoryItemProvider';
import { RpcClient } from '../lib/RpcClient';

export class Backpack
{
    private items: { [id: string]: Item; } = {};
    private rooms: { [jid: string]: Array<string>; } = {};
    private providers: Map<string, IItemProvider> = new Map<string, IItemProvider>();
    private rpcClient: RpcClient = new RpcClient();

    constructor(private app: BackgroundApp, rpcClient: RpcClient = null)
    {
        if (rpcClient) { this.rpcClient = rpcClient; }
    }

    async getUserId(): Promise<string> { return await this.app.getUserId(); }
    async getUserToken(): Promise<string> { return await this.app.getUserToken(); }

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
        this.app.sendToTabsForRoom(roomJid, { 'type': ContentMessage.type_sendPresence });
    }

    sendAddItemToAllTabs(itemId: string)
    {
        const data = new BackpackShowItemData(itemId, this.getItem(itemId).getProperties());
        this.app.sendToAllTabs(ContentMessage.type_onBackpackShowItem, data);
    }

    sendRemoveItemToAllTabs(itemId: string)
    {
        const data = new BackpackRemoveItemData(itemId);
        this.app.sendToAllTabs(ContentMessage.type_onBackpackHideItem, data);
    }

    async init(): Promise<void>
    {
        let providerConfigs = Config.get('itemProviders', {});
        for (let providerId in providerConfigs) {
            const providerConfig = providerConfigs[providerId];
            if (providerConfig != null) {
                let provider: IItemProvider = null;
                switch (as.String(providerConfig.type, 'unknown')) {
                    case LocalStorageItemProvider.type:
                        provider = new LocalStorageItemProvider(this, providerId, providerConfig);
                        break;
                    case HostedInventoryItemProvider.Provider.type:
                        provider = new HostedInventoryItemProvider.Provider(this, providerId, <HostedInventoryItemProvider.Definition>providerConfig);
                        break;
                    default:
                        break;
                }
                if (provider != null) {
                    this.providers.set(providerId, provider);
                }
            }
        }

        {
            let failedProviderIds = new Set<string>();
            for (let [providerId, provider] of this.providers) {
                try {
                    await provider.init();
                } catch (error) {
                    failedProviderIds.add(providerId);
                }
            }
            for (let providerId of failedProviderIds) {
                log.info('HostedInventoryItemProvider.init', 'provider.init() failed, removing', providerId);
                this.providers.delete(providerId);
            }
        }

        {
            let failedProviderIds = new Set<string>();
            for (let [providerId, provider] of this.providers) {
                try {
                    await provider.loadItems();
                } catch (error) {
                    failedProviderIds.add(providerId);
                }
            }
            for (let providerId of failedProviderIds) {
                log.info('HostedInventoryItemProvider.init', 'provider.loadItems() failed, removing', providerId);
                this.providers.delete(providerId);
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

    async createRepositoryItem(itemId: string, props: ItemProperties): Promise<Item>
    {
        props[Pid.OwnerId] = await Memory.getLocal(Utils.localStorageKey_Id(), '');

        let item = this.items[itemId];
        if (item == null) {
            item = new Item(this.app, this, itemId, props);
            this.items[itemId] = item;
        }
        return item;
    }

    deleteRepositoryItem(itemId: string): void
    {
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
                if (rezzedIds.length == 0) {
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

    stanzaOutFilter(stanza: xml): xml
    {
        for (let [providerId, provider] of this.providers) {
            try {
                stanza = provider.stanzaOutFilter(stanza);
            } catch (error) {
                log.info('Backpack.stanzaOutFilter', 'provider.stanzaOutFilter failed for provider', providerId);
            }
        }

        if (stanza.name == 'presence') {
            let toJid = new jid(stanza.attrs.to);
            let roomJid = toJid.bare().toString();

            if (as.String(stanza.attrs['type'], 'available') == 'available') {

                var rezzedIds = this.rooms[roomJid];
                if (rezzedIds && rezzedIds.length > 0) {
                    let dependentExtension = this.getDependentPresence(roomJid);
                    if (dependentExtension) {
                        stanza.append(dependentExtension);
                    }
                }

            }
        }

        return stanza;
    }

    async stanzaInFilter(stanza: xml): Promise<xml>
    {
        if (stanza.name == 'presence') {
            const fromJid = new jid(stanza.attrs.from);
            const roomJid = fromJid.bare().toString();
            const participantNick = fromJid.getResource();

            if (as.String(stanza.attrs['type'], 'available') == 'available') {
                const vpDependent = stanza.getChildren('x').find(stanzaChild => (stanzaChild.attrs == null) ? false : stanzaChild.attrs.xmlns === 'vp:dependent');
                if (vpDependent) {
                    const dependentPresences = vpDependent.getChildren('presence');
                    if (dependentPresences.length > 0) {
                        for (let i = 0; i < dependentPresences.length; i++) {
                            const dependentPresence = dependentPresences[i];
                            const dependentFrom = jid(dependentPresence.attrs.from);
                            const vpProps = dependentPresence.getChildren('x').find(child => (child.attrs == null) ? false : child.attrs.xmlns === 'vp:props');
                            if (vpProps) {
                                const itemId = vpProps.attrs[Pid.Id];
                                const providerName = as.String(vpProps.attrs[Pid.Provider], '');
                                if (this.providers.has(providerName)) {
                                    const provider = this.providers.get(providerName);
                                    await provider.onDependentPresence(itemId, roomJid, participantNick, dependentPresence);
                                }
                            }
                        }
                    }
                }
            }
        }

        return stanza;
    }

    async replayPresence(roomJid: string, participantNick: string)
    {
        await this.app.replayPresence(roomJid, participantNick);
    }

    private warningNotificatonTime = 0;
    private limitNotificatonTime = 0;
    private getDependentPresence(roomJid: string): xml
    {
        let result = xml('x', { 'xmlns': 'vp:dependent' });

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
            result.append(itemPresence);
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
        this.app.sendToTabsForRoom(roomJid, { 'type': ContentMessage.type_clientNotification, 'data': data });
    }

}
