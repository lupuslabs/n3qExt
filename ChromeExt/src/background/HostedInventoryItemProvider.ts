import log = require('loglevel');
import { as } from '../lib/as';
import { is } from '../lib/is';
import { xml } from '@xmpp/client';
import { ItemChangeOptions } from '../lib/ItemChangeOptions';
import { ItemException } from '../lib/ItemException';
import { ItemProperties, Pid } from '../lib/ItemProperties';
import { Memory } from '../lib/Memory';
import { RpcClient } from '../lib/RpcClient';
import { RpcProtocol } from '../lib/RpcProtocol';
import { Utils } from '../lib/Utils';
import { Backpack } from './Backpack';
import { IItemProvider } from './ItemProvider';
import { Config } from '../lib/Config';
import { Client } from '../lib/Client';

export namespace HostedInventoryItemProvider
{
    export interface Config
    {
        apiUrl: string;
    }

    export interface Definition
    {
        name: string;
        type: string;
        description: string;
        configUrl: string;
        config: Config,
    }

    class ItemCacheEntry
    {
        public accessTime = Date.now();
        constructor(private itemProperties: ItemProperties, public roomJid: string, public participantNick: string) { }
        getProperties(): ItemProperties
        {
            this.accessTime = Date.now();
            return this.itemProperties;
        }
    }

    class DeferredItemPropertiesRequest
    {
        public itemIds = new Set<string>();
        constructor(
            public timer: number, 
            public inventoryId: string, 
            public roomJid: string, 
            public participantNick: string) 
            { }
    }

    export class Provider implements IItemProvider
    {
        static type = 'HostedInventoryItemProvider';
        private rpcClient: RpcClient = new RpcClient();
        private userId: string;
        private accessToken: string;

        constructor(private backpack: Backpack, private id, private definition: Definition) { }

        config(): Config
        {
            return this.definition.config;
        }

        async init(): Promise<void>
        {
            this.userId = await this.backpack.getUserId();
            this.accessToken = await this.backpack.getUserToken();

            try {

                let url = as.String(this.definition.configUrl, 'https://webit.vulcan.weblin.com/Config?user={user}&token={token}&client={client}')
                    .replace('{user}', encodeURIComponent(this.userId))
                    .replace('{token}', encodeURIComponent(this.accessToken))
                    .replace('{client}', encodeURIComponent(JSON.stringify(Client.getDetails())))
                    ;
                if (Utils.logChannel('startup', true)) { log.info('HostedInventoryItemProvider.init', 'fetch', url); }
                let response = await fetch(url);
                if (!response.ok) {
                    log.info('HostedInventoryItemProvider.init', 'fetch failed', url, response);
                } else {
                    const config = await response.json();
                    if (Utils.logChannel('startup', true)) { log.info('HostedInventoryItemProvider.init', 'fetched', config); }
                    this.definition.config = config;
                }
            } catch (error) {
                log.info('HostedInventoryItemProvider.init', error);
                throw error;
            }
        }

        async loadItems(): Promise<void>
        {
            let itemIds = [];
            try {
                let request = new RpcProtocol.UserGetItemIdsRequest(this.userId, this.accessToken, this.userId);
                const response = <RpcProtocol.UserGetItemIdsResponse>await this.rpcClient.call(this.config().apiUrl, request);
                itemIds = response.items;
            } catch (error) {
                // this.handleException(ex);
                throw error;
            }

            let multiItemProperties = {};
            if (itemIds.length > 0) {
                try {
                    const request = new RpcProtocol.UserGetItemPropertiesRequest(this.userId, this.accessToken, this.userId, itemIds);
                    const response = <RpcProtocol.UserGetItemPropertiesResponse>await this.rpcClient.call(this.config().apiUrl, request);
                    multiItemProperties = response.multiItemProperties;
                } catch (error) {
                    // this.handleException(ex);
                    throw error;
                }
            }

            for (let itemId in multiItemProperties) {
                const props = multiItemProperties[itemId];
                const item = await this.backpack.createRepositoryItem(itemId, props);
                if (item.isRezzed()) {
                    this.backpack.addToRoom(itemId, item.getProperties()[Pid.RezzedLocation]);
                }
            }
        }

        async loadWeb3Items(): Promise<void>
        {
            log.info('HostedInventoryItemProvider.loadWeb3Items', 'not implemented');
        }

        async createItemByTemplate(templateName: string, args: ItemProperties): Promise<string>
        {
            log.info('HostedInventoryItemProvider.createItemByTemplate', 'not implemented');
            return null;
        }

        async createItemByNft(contractNetwork: string, contractAddress: string, tokenId: string, tokenUri: string): Promise<string>
        {
            log.info('HostedInventoryItemProvider.createItemByNft', 'not implemented');
            return null;
        }

        async addItem(itemId: string, props: ItemProperties, options: ItemChangeOptions): Promise<void>
        {
            log.info('HostedInventoryItemProvider.addItem', 'not implemented');
        }

        async deleteItem(itemId: string, options: ItemChangeOptions): Promise<void>
        {
            try {
                await this.itemAction(
                    itemId,
                    'Deletable.DeleteMe',
                    {},
                    [itemId],
                    false
                );
            } catch (ex) {
                this.handleException(ex);
            }
        }

        async modifyItemProperties(itemId: string, changed: ItemProperties, deleted: Array<string>, options: ItemChangeOptions): Promise<void>
        {
            let item = this.backpack.getItem(itemId);
            if (item == null) { throw new ItemException(ItemException.Fact.UnknownError, ItemException.Reason.ItemDoesNotExist, itemId); }

            try {
                if (as.Int(changed[Pid.RezzedX], -1) >= 0) {
                    await this.itemAction(
                        itemId,
                        'Rezable.MoveTo',
                        {
                            x: as.Int(changed[Pid.RezzedX], -1),
                        },
                        [itemId],
                        false
                    );
                } else if (as.Int(changed[Pid.InventoryX], -1) >= 0 && as.Int(changed[Pid.InventoryY], -1) >= 0) {
                    await this.itemAction(
                        itemId,
                        'ClientInventory.MoveTo',
                        {
                            x: as.Int(changed[Pid.InventoryX], -1),
                            y: as.Int(changed[Pid.InventoryY], -1),
                        },
                        [itemId],
                        true
                    );
                } else if (as.String(changed[Pid.State], null) !== null) {
                    await this.itemAction(
                        itemId,
                        'Stateful.SetState',
                        {
                            state: as.String(changed[Pid.State], ''),
                        },
                        [itemId],
                        true
                    );
                }
            } catch (ex) {
                this.handleException(ex);
            }
        }

        async itemAction(itemId: string, action: string, args: any, involvedIds: string[], allowUnrezzed: boolean): Promise<void>
        {
            let createdIds = [];
            let deletedIds = [];
            let changedIds = [];
            try {
                const request = new RpcProtocol.UserItemActionRequest(
                    this.userId,
                    this.accessToken,
                    itemId,
                    this.userId,
                    action,
                    args,
                    involvedIds
                );
                const response = <RpcProtocol.UserItemActionResponse>await this.rpcClient.call(this.config().apiUrl, request);

                createdIds = response.created;
                deletedIds = response.deleted;
                changedIds = response.changed;

            } catch (ex) {
                this.handleException(ex);
            }

            let changedOrCreated = [];
            for (let i = 0; i < changedIds.length; i++) {
                const id = changedIds[i];
                if (!changedOrCreated.includes(id)) {
                    changedOrCreated.push(id);
                }
            }
            for (let i = 0; i < createdIds.length; i++) {
                const id = createdIds[i];
                if (!changedOrCreated.includes(id)) {
                    changedOrCreated.push(id);
                }
            }

            let multiItemProperties = {};
            try {
                if (changedOrCreated.length > 0) {
                    try {
                        const request = new RpcProtocol.UserGetItemPropertiesRequest(this.userId, this.accessToken, this.userId, changedOrCreated);
                        const response = <RpcProtocol.UserGetItemPropertiesResponse>await this.rpcClient.call(this.config().apiUrl, request);
                        multiItemProperties = response.multiItemProperties;
                    } catch (ex) {
                        this.handleException(ex);
                    }
                }
            } catch (ex) {
                this.handleException(ex);
            }

            let changedRooms = new Set<string>();

            if (createdIds) {
                for (let i = 0; i < createdIds.length; i++) {
                    const id = createdIds[i];
                    const props = multiItemProperties[id];
                    let item = await this.backpack.createRepositoryItem(id, props);
                    if (item.isRezzed()) {
                        const room = item.getProperties()[Pid.RezzedLocation];
                        this.backpack.addToRoom(id, room);
                        changedRooms.add(room);
                    }
                    this.backpack.sendAddItemToAllTabs(id);
                }
            }

            if (changedIds) {
                for (let i = 0; i < changedIds.length; i++) {
                    const id = changedIds[i];
                    const item = this.backpack.getItem(id);
                    if (item != null) {
                        const wasRezzed = item.isRezzed();
                        const room = item.getProperties()[Pid.RezzedLocation];
                        if (wasRezzed) {
                            changedRooms.add(room);
                        }

                        const props = multiItemProperties[id];
                        this.backpack.setRepositoryItemProperties(id, props, { skipPresenceUpdate: true });

                        const isRezzed = item.isRezzed();
                        if (!wasRezzed && isRezzed) {
                            const newRoom = item.getProperties()[Pid.RezzedLocation];
                            this.backpack.addToRoom(id, newRoom);
                            changedRooms.add(newRoom);
                        } else if (wasRezzed && !isRezzed) {
                            this.backpack.removeFromRoom(id, room);
                            changedRooms.add(room);
                        }
                    }
                }
            }

            if (deletedIds) {
                for (let i = 0; i < deletedIds.length; i++) {
                    const id = deletedIds[i];
                    const item = this.backpack.getItem(id);
                    if (item != null) {
                        const wasRezzed = item.isRezzed();
                        const room = item.getProperties()[Pid.RezzedLocation];
                        if (wasRezzed) {
                            changedRooms.add(room);
                        }
                    }
                    this.backpack.sendRemoveItemToAllTabs(id);
                    this.backpack.deleteRepositoryItem(id);
                }
            }

            for (let room of changedRooms) {
                this.backpack.requestSendPresenceFromTab(room);
            }

        }

        async rezItem(itemId: string, roomJid: string, rezzedX: number, destinationUrl: string, options: ItemChangeOptions): Promise<void>
        {
            try {
                await this.itemAction(
                    itemId,
                    'Rezable.Rez',
                    {
                        room: roomJid,
                        x: rezzedX,
                        destination: destinationUrl,
                        OwnerName: await Memory.getLocal(Utils.localStorageKey_Nickname(), ''),

                    },
                    [itemId],
                    true
                );
            } catch (ex) {
                this.handleException(ex);
            }
        }

        async derezItem(itemId: string, roomJid: string, inventoryX: number, inventoryY: number, changed: ItemProperties, deleted: Array<string>, options: ItemChangeOptions): Promise<void>
        {
            try {
                await this.itemAction(
                    itemId,
                    'Rezable.Derez',
                    {
                        room: roomJid,
                        x: inventoryX,
                        y: inventoryY,
                    },
                    [itemId],
                    true
                );
            } catch (ex) {
                this.handleException(ex);
            }
        }

        private handleException(ex: any): void
        {
            if (!is.nil(ex.fact)) {
                throw new ItemException(ItemException.factFrom(ex.fact), ItemException.reasonFrom(ex.reason), ex.detail);
            } else {
                throw new ItemException(ItemException.Fact.UnknownError, ItemException.Reason.UnknownReason, as.String(ex.message, as.String(ex.status, '')));
            }
        }

        getDependentPresence(itemId: string, roomJid: string): xml
        {
            let item = this.backpack.getItem(itemId);
            if (item == null) { throw new ItemException(ItemException.Fact.NotDerezzed, ItemException.Reason.ItemDoesNotExist, itemId); }

            const props = item.getProperties();
            var presence = xml('presence', { 'from': roomJid + '/' + itemId });
            let attrs = {
                'xmlns': 'vp:props',
                'type': 'item',
                [Pid.Provider]: this.id,
                [Pid.Id]: itemId,
                [Pid.InventoryId]: as.String(props[Pid.InventoryId], ''),
            };

            const version = as.String(props[Pid.Version], '');
            if (version !== '') {
                attrs[Pid.Version] = version;
            }
            const rezzedX = as.Int(props[Pid.RezzedX], -1);
            if (rezzedX > 0) {
                attrs[Pid.RezzedX] = rezzedX;
            }
            // const ownerName = await Memory.getLocal(Utils.localStorageKey_Nickname(), as.String(clonedProps[Pid.OwnerName])),
            // if (ownerName !== '') {
            //     attrs[Pid.OwnerName] = ownerName;
            // }

            presence.append(xml('x', attrs));

            return presence;
        }

        // -------------------- item cache ----------------------

        private itemCache = new Map<string, ItemCacheEntry>();
        private itemRequests = new Set<string>();
        private lastItemCacheMaintenanceTime = 0;

        checkMaintainItemCache(): void
        {
            let now = Date.now();
            let maintenanceIntervalSec = Config.get('itemCache.maintenanceIntervalSec', 60);
            if (now - this.lastItemCacheMaintenanceTime > maintenanceIntervalSec * 1000) {
                this.maintainItemCache();
                this.lastItemCacheMaintenanceTime = now;
            }
        }

        maintainItemCache(): void
        {
            if (Utils.logChannel('HostedInventoryItemProviderItemCache', true)) { log.info('HostedInventoryItemProvider.maintainItemCache', 'size=' + this.itemCache.size); }
            let cacheTimeout = Config.get('itemCache.maxAgeSec', 600);
            let now = Date.now();

            let deleteKeys = new Array<string>();
            for (let [key, cacheEntry] of this.itemCache) {
                if (now - cacheEntry.accessTime > cacheTimeout * 1000) {
                    deleteKeys.push(key);
                }
            }

            for (let key of deleteKeys) {
                if (Utils.logChannel('HostedInventoryItemProviderItemCache', true)) {
                    const cacheEntry = this.itemCache.get(key);
                    log.info('HostedInventoryItemProvider.maintainItemCache', 'delete',
                        '(age=' + (now - this.itemCache.get(key).accessTime) / 1000 + ')',
                        key, cacheEntry.roomJid, cacheEntry.participantNick);
                }
                this.itemCache.delete(key);
            }
        }

        // -----------------------------------------------------

        async onDependentPresenceReceived(itemId: string, roomJid: string, participantNick: string, dependentPresence: xml): Promise<void>
        {
            // log.info('HostedInventoryItemProvider.onDependentPresenceReceived', 'presence for', itemId, dependentPresence);
            const vpProps = dependentPresence.getChildren('x').find(child => (child.attrs == null) ? false : child.attrs.xmlns === 'vp:props');
            if (vpProps) {
                const vpVersion = as.Int(vpProps.attrs[Pid.Version], -1);
                if (this.itemCache.has(itemId)) {
                    const cacheEntry = this.itemCache.get(itemId);

                    if (Utils.logChannel('HostedInventoryItemProviderItemCache', true)) {
                        let now = Date.now();
                        const cacheEntry = this.itemCache.get(itemId);
                        log.info('HostedInventoryItemProvider.maintainItemCache', 'access',
                            '(age=' + (now - this.itemCache.get(itemId).accessTime) / 1000 + ')',
                            itemId, cacheEntry.roomJid, cacheEntry.participantNick);
                    }
                    const cachedProps = cacheEntry.getProperties();

                    const cachedVersion = as.Int(cachedProps[Pid.Version], -1);

                    let cacheIsGood = true;
                    if (vpVersion >= 0 && cachedVersion >= 0) {
                        if (vpVersion > cachedVersion) { cacheIsGood = false; }
                    }

                    if (cacheIsGood) {
                        for (let key in cachedProps) {
                            vpProps.attrs[key] = cachedProps[key];
                        }
                    } else {
                        const inventoryId = as.String(vpProps.attrs[Pid.InventoryId], '');
                        if (inventoryId !== '') {
                            this.requestItemPropertiesForDependentPresence(itemId, inventoryId, roomJid, participantNick);
                        }
                    }

                } else {
                    const inventoryId = as.String(vpProps.attrs[Pid.InventoryId], '');
                    if (inventoryId !== '') {
                        this.requestItemPropertiesForDependentPresence(itemId, inventoryId, roomJid, participantNick);
                    }
                }
            }

            this.checkMaintainItemCache();
        }

        private deferredItemPropertiesRequests = new Map<string, DeferredItemPropertiesRequest>();

        async requestItemPropertiesForDependentPresence(itemId: string, inventoryId: string, roomJid: string, participantNick: string): Promise<void>
        {
            if (this.itemRequests.has(itemId)) return;

            this.itemRequests.add(itemId);

            const timerKey = roomJid + '/' + participantNick;
            if (this.deferredItemPropertiesRequests.has(timerKey)) {
                let deferredRequest = this.deferredItemPropertiesRequests.get(timerKey);
                deferredRequest.itemIds.add(itemId);
            } else {
                const timer = window.setTimeout(async () =>
                {
                    const deferredRequest = this.deferredItemPropertiesRequests.get(timerKey);
                    this.deferredItemPropertiesRequests.delete(timerKey);

                    if (Utils.logChannel('HostedInventoryItemProviderItemCache', true)) { log.info('HostedInventoryItemProvider.requestItemPropertiesForDependentPresence', 'inventory=' + deferredRequest.inventoryId, Array.from(deferredRequest.itemIds).join(' ')); }

                    const request = new RpcProtocol.UserGetItemPropertiesRequest(this.userId, this.accessToken, deferredRequest.inventoryId, Array.from(deferredRequest.itemIds));
                    this.rpcClient.call(this.config().apiUrl, request)
                        .then(async r =>
                        {
                            for (let id of deferredRequest.itemIds) {
                                this.itemRequests.delete(id);
                            }

                            const response = <RpcProtocol.UserGetItemPropertiesResponse>r;

                            for (let id in response.multiItemProperties) {
                                const props = response.multiItemProperties[id];

                                this.itemCache.set(id, new ItemCacheEntry(props, deferredRequest.roomJid, deferredRequest.participantNick));

                                if (Utils.logChannel('HostedInventoryItemProviderItemCache', true)) {
                                    const cacheEntry = this.itemCache.get(id);
                                    log.info('HostedInventoryItemProvider.maintainItemCache', 'set',
                                        id, cacheEntry.roomJid, cacheEntry.participantNick);
                                }

                                await this.forwardCachedProperties(id);
                            }
                        })
                        .catch(error =>
                        {
                            console.info('HostedInventoryItemProvider.onDependentPresenceReceived', error);
                        });
                }, Config.get('itemCache.clusterItemFetchSec', 0.1) * 1000);
                let deferredRequest = new DeferredItemPropertiesRequest(timer, inventoryId, roomJid, participantNick);
                deferredRequest.itemIds.add(itemId);
                this.deferredItemPropertiesRequests.set(timerKey, deferredRequest);
            }
        }

        async forwardCachedProperties(itemId: string)
        {
            if (this.itemCache.has(itemId)) {
                const cacheEntry = this.itemCache.get(itemId);
                await this.backpack.replayPresence(cacheEntry.roomJid, cacheEntry.participantNick);
            }
        }

    }
}
