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

export namespace HostedInventoryItemProvider
{
    export interface Config
    {
        apiUrl: string;
    }

    class ItemCacheEntry
    {
        constructor(public itemProperties: ItemProperties, public roomJid: string, public participantNick: string) { }
    }

    class DeferredItemPropertiesRequest
    {
        public itemIds = new Set<string>();
        constructor(public timer: number, public ownerId: string, public roomJid: string, public participantNick: string) { }
    }

    export class Provider implements IItemProvider
    {
        static type = 'HostedInventoryItemProvider';
        private rpcClient: RpcClient = new RpcClient();
        private userId: string;
        private accessToken: string;

        constructor(private backpack: Backpack, private id, private config: Config) { }

        async init(): Promise<void>
        {
            this.userId = await this.backpack.getUserId();
            this.accessToken = await this.backpack.getUserToken();
        }

        async loadItems(): Promise<void>
        {
            let itemIds = [];
            try {
                let request = new RpcProtocol.UserGetItemIdsRequest(this.userId, this.accessToken);
                const response = <RpcProtocol.UserGetItemIdsResponse>await this.rpcClient.call(this.config.apiUrl, request);
                itemIds = response.itemIds;
            } catch (ex) {
                this.handleException(ex);
            }

            let multiItemProperties = {};
            if (itemIds.length > 0) {
                try {
                    const request = new RpcProtocol.UserGetItemPropertiesRequest(this.userId, this.accessToken, this.userId, itemIds);
                    const response = <RpcProtocol.UserGetItemPropertiesResponse>await this.rpcClient.call(this.config.apiUrl, request);
                    multiItemProperties = response.multiItemProperties;
                } catch (ex) {
                    this.handleException(ex);
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

        async addItem(itemId: string, props: ItemProperties, options: ItemChangeOptions): Promise<void>
        {
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
                    action,
                    args,
                    involvedIds
                );
                const response = <RpcProtocol.UserItemActionResponse>await this.rpcClient.call(this.config.apiUrl, request);

                createdIds = response.createdIds;
                deletedIds = response.deletedIds;
                changedIds = response.changedIds;

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
                        const response = <RpcProtocol.UserGetItemPropertiesResponse>await this.rpcClient.call(this.config.apiUrl, request);
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
                'provider': this.id,
                [Pid.Id]: itemId,
            };

            const version = as.String(props[Pid.Version], '');
            if (version !== '') {
                attrs[Pid.Version] = version;
            }
            const ownerId = as.String(props[Pid.OwnerId], '');
            if (ownerId !== '') {
                attrs[Pid.OwnerId] = ownerId;
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

        private cachedProperties = new Map<string, ItemCacheEntry>();
        private requestedProperties = new Set<string>();

        async onDependentPresenceReceived(itemId: string, roomJid: string, participantNick: string, dependentPresence: xml): Promise<void>
        {
            // log.info('HostedInventoryItemProvider.onDependentPresenceReceived', 'presence for', itemId, dependentPresence);
            const vpProps = dependentPresence.getChildren('x').find(child => (child.attrs == null) ? false : child.attrs.xmlns === 'vp:props');
            if (vpProps) {
                const vpVersion = as.Int(vpProps.attrs[Pid.Version], -1);
                if (this.cachedProperties.has(itemId)) {
                    const cacheEntry = this.cachedProperties.get(itemId);
                    const cachedProps = cacheEntry.itemProperties;
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
                        const ownerId = as.String(vpProps.attrs[Pid.OwnerId], '');
                        if (ownerId !== '') {
                            this.requestItemPropertiesForDependentPresence(itemId, ownerId, roomJid, participantNick);
                        }
                    }

                } else {
                    const ownerId = as.String(vpProps.attrs[Pid.OwnerId], '');
                    if (ownerId !== '') {
                        this.requestItemPropertiesForDependentPresence(itemId, ownerId, roomJid, participantNick);
                    }
                }
            }
        }

        private deferredItemPropertiesRequests = new Map<string, DeferredItemPropertiesRequest>();

        async requestItemPropertiesForDependentPresence(itemId: string, ownerId: string, roomJid: string, participantNick: string): Promise<void>
        {
            if (this.requestedProperties.has(itemId)) return;

            this.requestedProperties.add(itemId);
            
            const timerKey = roomJid + '/' + participantNick;
            if (this.deferredItemPropertiesRequests.has(timerKey)) {
                let deferredRequest = this.deferredItemPropertiesRequests.get(timerKey);
                deferredRequest.itemIds.add(itemId);
            } else {
                const timer = window.setTimeout(async () =>
                {
                    const deferredRequest = this.deferredItemPropertiesRequests.get(timerKey);
                    this.deferredItemPropertiesRequests.delete(timerKey);

                    const request = new RpcProtocol.UserGetItemPropertiesRequest(this.userId, this.accessToken, deferredRequest.ownerId, Array.from(deferredRequest.itemIds));
                    this.rpcClient.call(this.config.apiUrl, request)
                        .then(async r =>
                        {
                            for (let id of deferredRequest.itemIds) {
                                this.requestedProperties.delete(id);
                            }

                            const response = <RpcProtocol.UserGetItemPropertiesResponse>r;

                            for (let id in response.multiItemProperties) {
                                const props = response.multiItemProperties[id];
                                this.cachedProperties.set(id, new ItemCacheEntry(props, deferredRequest.roomJid, deferredRequest.participantNick));
                                await this.forwardCachedProperties(id);
                            }
                        })
                        .catch(error =>
                        {
                            console.info('HostedInventoryItemProvider.onDependentPresenceReceived', error);
                        });
                }, Config.get('itemCache.clusterItemFetchSec', 0.1) * 1000);
                let deferredRequest = new DeferredItemPropertiesRequest(timer, ownerId, roomJid, participantNick);
                deferredRequest.itemIds.add(itemId);
                this.deferredItemPropertiesRequests.set(timerKey, deferredRequest);
            }
        }

        async forwardCachedProperties(itemId: string)
        {
            if (this.cachedProperties.has(itemId)) {
                const cacheEntry = this.cachedProperties.get(itemId);
                await this.backpack.replayPresence(cacheEntry.roomJid, cacheEntry.participantNick);
            }
        }

    }
}
