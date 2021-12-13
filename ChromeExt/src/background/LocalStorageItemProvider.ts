import log = require('loglevel');
import { as } from '../lib/as';
import { Config } from '../lib/Config';
import { ItemChangeOptions } from '../lib/ItemChangeOptions';
import { ItemException } from '../lib/ItemException';
import { ItemProperties, Pid } from '../lib/ItemProperties';
import { Memory } from '../lib/Memory';
import { RpcClient } from '../lib/RpcClient';
import { RpcProtocol } from '../lib/RpcProtocol';
import { Utils } from '../lib/Utils';
import { Backpack } from './Backpack';
import { Item } from './Item';
import { IItemProvider } from './ItemProvider';

export class LocalStorageItemProvider implements IItemProvider
{
    static type = 'LocalStorageItemProvider';
    private static BackpackIdsKey = 'BackpackIds';
    private static BackpackPropsPrefix = 'BackpackItem-';
    private rpcClient: RpcClient = new RpcClient();

    constructor(private backpack: Backpack, private config: any)
    {
    }

    private getBackpackIdsKey(): string
    {
        if (Config.get('config.clusterName', 'prod') == 'dev') {
            return LocalStorageItemProvider.BackpackIdsKey + '-dev';
        }
        return LocalStorageItemProvider.BackpackIdsKey;
    }

    private async createInitialItems(): Promise<void>
    {
        await this.createInitialItemsPhase1();
    }

    private async createInitialItemsPhase1(): Promise<void>
    {
        let nextPhase = 1;
        let currentPhase = as.Int(await Memory.getLocal(Utils.localStorageKey_BackpackPhase(), 0));
        if (currentPhase < nextPhase) {
            if (true
                && await this.createInitialItem('BlueprintLibrary', 68, 58)
                && await this.createInitialItem('Maker', 167, 54)
                && await this.createInitialItem('Recycler', 238, 54)
                && await this.createInitialItem('MiningDrill', 310, 54)
                && await this.createInitialItem('WaterPump', 78, 188)
                && await this.createInitialItem('SolarPanel', 250, 188)
                && await this.createInitialItem('CoffeeBeans', 382, 143)
                && await this.createInitialItem('PirateFlag', 371, 45)
            ) {
                await Memory.setLocal(Utils.localStorageKey_BackpackPhase(), nextPhase);
            }
        }
    }

    private async createInitialItem(template: string, x: number = -1, y: number = -1): Promise<boolean>
    {
        try {
            let item = await this.backpack.createItemByTemplate(template, { [Pid.InventoryX]: as.String(x), [Pid.InventoryY]: as.String(y), });
            return true;
        } catch (error) {
            log.info('Backpack.createInitialItem', 'failed to create starter item', template, error);
            return false;
        }
    }

    private async loadLocalItems()
    {
        let itemIds = await Memory.getLocal(this.getBackpackIdsKey(), []);
        if (itemIds == null || !Array.isArray(itemIds)) {
            log.warn('Backpack.loadLocalItems', this.getBackpackIdsKey(), 'not an array');
            return;
        }

        for (let i = 0; i < itemIds.length; i++) {
            let itemId = itemIds[i];

            let props = await Memory.getLocal(LocalStorageItemProvider.BackpackPropsPrefix + itemId, null);
            if (props == null || typeof props != 'object') {
                log.info('Backpack.loadLocalItems', LocalStorageItemProvider.BackpackPropsPrefix + itemId, 'not an object, skipping');
                continue;
            }

            let item = await this.backpack.createRepositoryItem(itemId, props);
            if (item.isRezzed()) {
                let roomJid = item.getProperties()[Pid.RezzedLocation];
                if (roomJid) {
                    this.backpack.addToRoom(itemId, roomJid);
                }
            }
        }

        this.createInitialItems();
    }

    // API

    async loadItems(): Promise<void>
    {
        await this.loadLocalItems();
    }

    async saveItem(itemId: string): Promise<void>
    {
        let item = this.backpack.getItem(itemId);
        let props = item.getProperties();
        let itemIds = await Memory.getLocal(this.getBackpackIdsKey(), []);
        if (itemIds && Array.isArray(itemIds)) {
            await Memory.setLocal(LocalStorageItemProvider.BackpackPropsPrefix + itemId, props);
            if (!itemIds.includes(itemId)) {
                itemIds.push(itemId);
                await Memory.setLocal(this.getBackpackIdsKey(), itemIds);
            }
        }
    }

    async deleteItem(itemId: string, options: ItemChangeOptions): Promise<void>
    {
        let item = this.backpack.getItem(itemId);
        if (item) {
            if (item.isRezzed()) {
                let roomJid = item.getProperties()[Pid.RezzedLocation];
                if (roomJid) {
                    await this.derezItem(itemId, roomJid, -1, -1, {}, [], options);
                }
            }

            if (!options.skipPersistentStorage) {
                let itemIds = await Memory.getLocal(this.getBackpackIdsKey(), []);
                if (itemIds && Array.isArray(itemIds)) {
                    await Memory.deleteLocal(LocalStorageItemProvider.BackpackPropsPrefix + itemId);
                    if (itemIds.includes(itemId)) {
                        const index = itemIds.indexOf(itemId, 0);
                        if (index > -1) {
                            itemIds.splice(index, 1);
                            await Memory.setLocal(this.getBackpackIdsKey(), itemIds);
                        }
                    }
                }
            }

            if (!options.skipContentNotification) {
                this.backpack.sendRemoveItemToAllTabs(itemId);
            }

            if (!options.skipPresenceUpdate) {
                item.sendPresence();
            }

            this.backpack.deleteRepositoryItem(itemId);
        }
    }

    async modifyItemProperties(itemId: string, changed: ItemProperties, deleted: Array<string>, options: ItemChangeOptions): Promise<void>
    {
        let item = this.backpack.getItem(itemId);
        if (item == null) { throw new ItemException(ItemException.Fact.UnknownError, ItemException.Reason.ItemDoesNotExist, itemId); }

        let clonedProps = Utils.cloneObject(item.getProperties());

        for (let key in changed) {
            clonedProps[key] = changed[key];
        }
        for (let i = 0; i < deleted.length; i++) {
            delete clonedProps[deleted[i]];
        }
        item.setProperties(clonedProps, options);
        await this.saveItem(itemId);
    }

    async itemAction(itemId: string, action: string, args: any, involvedIds: string[], allowUnrezzed: boolean): Promise<void>
    {
        return new Promise(async (resolve, reject) =>
        {
            try {
                let item = this.backpack.getItem(itemId);

                let userId = await Memory.getLocal(Utils.localStorageKey_Id(), '');
                if (userId == null || userId == '') { throw new ItemException(ItemException.Fact.NotExecuted, ItemException.Reason.NoUserId); }

                let providerId = 'nine3q';
                let apiUrl = Config.get('itemProviders.' + providerId + '.config.backpackApiUrl', '');
                if (apiUrl == null || apiUrl == '') { throw new ItemException(ItemException.Fact.NotExecuted, ItemException.Reason.SeeDetail, 'Missing backpackApi for ' + providerId); }

                let roomJid = null;
                if (!allowUnrezzed && !as.Bool(item.getProperties()[Pid.IsUnrezzedAction], false)) {
                    roomJid = item.getProperties()[Pid.RezzedLocation];
                    if (roomJid == null || roomJid == '') { throw new ItemException(ItemException.Fact.NotExecuted, ItemException.Reason.SeeDetail, 'Item ' + itemId + ' missing RezzedLocation'); }
                }

                let items: { [id: string]: ItemProperties } = {};
                for (let i = 0; i < involvedIds.length; i++) {
                    items[involvedIds[i]] = this.backpack.getItemProperties(involvedIds[i]);
                }

                let request = new RpcProtocol.BackpackActionRequest();
                request.method = RpcProtocol.BackpackActionRequest.method;
                request.user = userId;
                request.item = itemId;
                if (roomJid) { request.room = roomJid; }
                request.action = action;
                request.args = args;
                request.items = items;

                let response = <RpcProtocol.BackpackActionResponse>await this.rpcClient.call(apiUrl, request);

                if (response.changed) {
                    for (let id in response.changed) {
                        let props = response.changed[id];
                        await this.backpack.setItemProperties(id, props, {});
                    }
                }

                if (response.created) {
                    for (let id in response.created) {
                        let props = response.created[id];
                        await this.backpack.addItem(id, props, {});
                    }
                }

                if (response.deleted) {
                    for (let i = 0; i < response.deleted.length; i++) {
                        let id = response.deleted[i];
                        await this.backpack.deleteItem(id, {});
                    }
                }

                resolve();
            } catch (ex) {
                if (ex.fact) {
                    reject(new ItemException(ItemException.factFrom(ex.fact), ItemException.reasonFrom(ex.reason), ex.detail));
                } else {
                    reject(new ItemException(ItemException.Fact.NotExecuted, ItemException.Reason.NetworkProblem, as.String(ex.message, as.String(ex.status, ''))));
                }
            }
        });
    }

    async rezItem(itemId: string, roomJid: string, rezzedX: number, destinationUrl: string, options: ItemChangeOptions): Promise<void>
    {
        let item = this.backpack.getItem(itemId);
        if (item == null) { throw new ItemException(ItemException.Fact.NotRezzed, ItemException.Reason.ItemDoesNotExist, itemId); }
        if (item.isRezzed()) { throw new ItemException(ItemException.Fact.NotRezzed, ItemException.Reason.ItemAlreadyRezzed); }

        this.backpack.addToRoom(itemId, roomJid);

        let clonedProps = Utils.cloneObject(item.getProperties());

        clonedProps[Pid.IsRezzed] = 'true';
        if (rezzedX >= 0) {
            clonedProps[Pid.RezzedX] = '' + rezzedX;
        }
        if (as.Int(clonedProps[Pid.RezzedX], -1) < 0) {
            clonedProps[Pid.RezzedX] = '' + Utils.randomInt(100, 400);
        }
        clonedProps[Pid.RezzedDestination] = destinationUrl;
        clonedProps[Pid.RezzedLocation] = roomJid;
        clonedProps[Pid.OwnerName] = await Memory.getLocal(Utils.localStorageKey_Nickname(), as.String(clonedProps[Pid.OwnerName]));

        let setPropertiesOption = { skipPresenceUpdate: true };
        Object.assign(setPropertiesOption, options);
        item.setProperties(clonedProps, setPropertiesOption);

        if (!options.skipPersistentStorage) {
            await this.saveItem(itemId);
        }

        if (!options.skipPresenceUpdate) {
            this.backpack.requestSendPresenceFromTab(roomJid);
        }
    }

    async derezItem(itemId: string, roomJid: string, inventoryX: number, inventoryY: number, changed: ItemProperties, deleted: Array<string>, options: ItemChangeOptions): Promise<void>
    {
        let item = this.backpack.getItem(itemId);
        if (item == null) { throw new ItemException(ItemException.Fact.NotDerezzed, ItemException.Reason.ItemDoesNotExist, itemId); }
        if (!item.isRezzed()) { return; }
        if (!item.isRezzedTo(roomJid)) { throw new ItemException(ItemException.Fact.NotDerezzed, ItemException.Reason.ItemNotRezzedHere); }

        let clonedProps = Utils.cloneObject(item.getProperties());

        this.backpack.removeFromRoom(itemId, roomJid);

        delete clonedProps[Pid.IsRezzed];
        if (inventoryX > 0 && inventoryY > 0) {
            clonedProps[Pid.InventoryX] = '' + inventoryX;
            clonedProps[Pid.InventoryY] = '' + inventoryY;
        }
        // delete props[Pid.RezzedX]; // preserve for rez by button
        delete clonedProps[Pid.RezzedDestination];
        delete clonedProps[Pid.RezzedLocation];

        for (let pid in changed) {
            clonedProps[pid] = changed[pid];
        }
        for (let i = 0; i < deleted.length; i++) {
            delete clonedProps[deleted[i]];
        }

        let setPropertiesOption = { skipPresenceUpdate: true };
        Object.assign(setPropertiesOption, options);
        item.setProperties(clonedProps, setPropertiesOption);

        if (!options.skipPersistentStorage) {
            await this.saveItem(itemId);
        }

        if (!options.skipContentNotification) {
            // really?
            // this.backpack.sendPresence(roomJid);
        }

        if (!options.skipPresenceUpdate) {
            this.backpack.requestSendPresenceFromTab(roomJid);
        }
    }
}
