import log = require('loglevel');
import { as } from '../lib/as';
import { Config } from '../lib/Config';
import { ItemException } from '../lib/ItemException';
import { Pid } from '../lib/ItemProperties';
import { RpcClient } from '../lib/RpcClient';
import { RpcProtocol } from '../lib/RpcProtocol';
import { Backpack } from './Backpack';
import { Item } from './Item';
import { IItemProvider } from './ItemProvider';

export namespace HostedInventoryItemProvider
{
    export interface Config
    {
        apiUrl: string;
    }

    export class Provider implements IItemProvider
    {
        static type = 'HostedInventoryItemProvider';
        private rpcClient: RpcClient = new RpcClient();

        constructor(private backpack: Backpack, private config: Config)
        {
        }

        async loadItems(): Promise<void>
        {
            let itemIds = [];
            try {
                let request = new RpcProtocol.UserGetItemIdsRequest(await this.backpack.getUserId(), await this.backpack.getUserToken());
                const response = <RpcProtocol.UserGetItemIdsResponse>await this.rpcClient.call(this.config.apiUrl, request);
                itemIds = response.itemIds;
            } catch (ex) {
                if (ex.fact) {
                    throw new ItemException(ItemException.factFrom(ex.fact), ItemException.reasonFrom(ex.reason), ex.detail);
                } else {
                    throw new ItemException(ItemException.Fact.NoItemsReceived, ItemException.Reason.NetworkProblem, as.String(ex.message, as.String(ex.status, '')));
                }
            }

            let itemPropertySet = {};
            if (itemIds.length > 0) {
                try {
                    const request = new RpcProtocol.UserGetItemPropertiesRequest(await this.backpack.getUserId(), await this.backpack.getUserToken(), itemIds);
                    const response = <RpcProtocol.UserGetItemPropertiesResponse>await this.rpcClient.call(this.config.apiUrl, request);
                    itemPropertySet = response.itemPropertySet;
                } catch (ex) {
                    if (ex.fact) {
                        throw new ItemException(ItemException.factFrom(ex.fact), ItemException.reasonFrom(ex.reason), ex.detail);
                    } else {
                        throw new ItemException(ItemException.Fact.NoItemsReceived, ItemException.Reason.NetworkProblem, as.String(ex.message, as.String(ex.status, '')));
                    }
                }
            }

            for (let itemId in itemPropertySet) {
                const props = itemPropertySet[itemId];
                const item = await this.backpack.createRepositoryItem(itemId, props);
                if (item.isRezzed()) {
                    const roomJid = item.getProperties()[Pid.RezzedLocation];
                    if (roomJid) {
                        this.backpack.addToRoom(itemId, roomJid);
                    }
                }
            }
        }

        async saveItem(itemId: string, item: Item): Promise<void>
        {
        }

        async deleteItem(itemId: string): Promise<void>
        {
        }

        async itemAction(itemId: string, action: string, args: any, involvedIds: string[], allowUnrezzed: boolean): Promise<void>
        {
            try {
                let request = new RpcProtocol.UserItemActionRequest(
                    await this.backpack.getUserId(),
                    await this.backpack.getUserToken(),
                    itemId,
                    action,
                    args,
                    involvedIds
                );
                const response = <RpcProtocol.UserItemActionResponse>await this.rpcClient.call(this.config.apiUrl, request);

                let changedOrCreated = [];
                for (let i = 0; i < response.changedIds.length; i++) {
                    const id = response.changedIds[i];
                    if (!changedOrCreated.includes(id)) {
                        changedOrCreated.push(id);
                    }
                }
                for (let i = 0; i < response.createdIds.length; i++) {
                    const id = response.createdIds[i];
                    if (!changedOrCreated.includes(id)) {
                        changedOrCreated.push(id);
                    }
                }

                let itemPropertySet = {};
                if (changedOrCreated.length > 0) {
                    try {
                        const request = new RpcProtocol.UserGetItemPropertiesRequest(await this.backpack.getUserId(), await this.backpack.getUserToken(), changedOrCreated);
                        const response = <RpcProtocol.UserGetItemPropertiesResponse>await this.rpcClient.call(this.config.apiUrl, request);
                        itemPropertySet = response.itemPropertySet;
                    } catch (ex) {
                        if (ex.fact) {
                            throw new ItemException(ItemException.factFrom(ex.fact), ItemException.reasonFrom(ex.reason), ex.detail);
                        } else {
                            throw new ItemException(ItemException.Fact.NoItemsReceived, ItemException.Reason.NetworkProblem, as.String(ex.message, as.String(ex.status, '')));
                        }
                    }
                }

                if (response.createdIds) {
                    for (let i = 0; i < response.createdIds.length; i++) {
                        const id = response.createdIds[i];
                        const props = itemPropertySet[id];
                        let item = await this.backpack.createRepositoryItem(id, props);
                        if (item.isRezzed()) {
                            let roomJid = item.getProperties()[Pid.RezzedLocation];
                            if (roomJid) {
                                this.backpack.addToRoom(id, roomJid);
                            }
                        }
                    }
                }

                if (response.changedIds) {
                    for (let i = 0; i < response.changedIds.length; i++) {
                        const id = response.changedIds[i];
                        const props = itemPropertySet[id];
                        await this.backpack.setItemProperties(id, props, {});
                    }
                }

                if (response.deletedIds) {
                    for (let i = 0; i < response.deletedIds.length; i++) {
                        const id = response.deletedIds[i];
                        await this.backpack.deleteItem(id, {});
                    }
                }

            } catch (ex) {
                if (ex.fact) {
                    throw new ItemException(ItemException.factFrom(ex.fact), ItemException.reasonFrom(ex.reason), ex.detail);
                } else {
                    throw new ItemException(ItemException.Fact.NoItemsReceived, ItemException.Reason.NetworkProblem, as.String(ex.message, as.String(ex.status, '')));
                }
            }
        }
    }

}
