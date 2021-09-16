import log = require('loglevel');
import { as } from '../lib/as';
import { xml, jid } from '@xmpp/client';
import { Config } from '../lib/Config';
import { ItemProperties, Pid } from '../lib/ItemProperties';
import { BackpackShowItemData, BackpackRemoveItemData, BackpackSetItemData, ContentMessage } from '../lib/ContentMessage';
import { ItemException } from '../lib/ItemException';
import { ItemChangeOptions } from '../lib/ItemChangeOptions';
import { RpcProtocol } from '../lib/RpcProtocol';
import { RpcClient } from '../lib/RpcClient';
import { Memory } from '../lib/Memory';
import { Utils } from '../lib/Utils';
import { BackgroundApp } from './BackgroundApp';
import { Item } from './Item';
import { WeblinClientApi } from '../lib/WeblinClientApi';
//const Web3 = require('web3');
const Web3Eth = require('web3-eth');

export class Backpack
{
    private static BackpackIdsKey = 'BackpackIds';
    private static BackpackPropsPrefix = 'BackpackItem-';
    private items: { [id: string]: Item; } = {};
    private rooms: { [jid: string]: Array<string>; } = {};
    private rpcClient: RpcClient = new RpcClient();

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

    getBackpackIdsKey(): string
    {
        if (Config.get('config.clusterName', 'prod') == 'dev') {
            return Backpack.BackpackIdsKey + '-dev';
        }
        return Backpack.BackpackIdsKey;
    }

    constructor(private app: BackgroundApp, rpcClient: RpcClient = null)
    {
        if (rpcClient) { this.rpcClient = rpcClient; }
    }

    async init(): Promise<void>
    {
        await this.loadLocalItems();

        if (Config.get('backpack.loadWeb3Items', false)) {
            await this.loadWeb3Items();
        }
    }

    async loadLocalItems()
    {
        let isFirstLoad = await this.checkIsFirstLoad();

        let itemIds = await Memory.getLocal(this.getBackpackIdsKey(), []);
        if (itemIds == null || !Array.isArray(itemIds)) {
            log.warn('Backpack.loadLocalItems', this.getBackpackIdsKey(), 'not an array');
            return;
        }

        for (let i = 0; i < itemIds.length; i++) {
            let itemId = itemIds[i];

            let props = await Memory.getLocal(Backpack.BackpackPropsPrefix + itemId, null);
            if (props == null || typeof props != 'object') {
                log.info('Backpack.loadLocalItems', Backpack.BackpackPropsPrefix + itemId, 'not an object, skipping');
                continue;
            }

            let item = await this.createRepositoryItem(itemId, props);
            if (item.isRezzed()) {
                let roomJid = item.getProperties()[Pid.RezzedLocation];
                if (roomJid) {
                    this.addToRoom(itemId, roomJid);
                }
            }
        }

        this.createInitialItems();
    }

    async checkIsFirstLoad(): Promise<boolean>
    {
        let itemIds = await Memory.getLocal(this.getBackpackIdsKey(), null);
        if (itemIds == null) {
            await Memory.setLocal(this.getBackpackIdsKey(), []);
            return true;
        }
        return false;
    }

    async createInitialItems(): Promise<void>
    {
        await this.createInitialItemsPhase1();
    }

    async createInitialItemsPhase1(): Promise<void>
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

    async createInitialItem(template: string, x: number = -1, y: number = -1): Promise<boolean>
    {
        try {
            let item = await this.createItemByTemplate(template, { [Pid.InventoryX]: as.String(x), [Pid.InventoryY]: as.String(y), });
            return true;
        } catch (error) {
            log.info('Backpack.createInitialItem', 'failed to create starter item', template, error);
            return false;
        }
    }

    async loadWeb3Items(): Promise<void>
    {
        let currentWeb3ItemIds = this.findItems(props => { return (as.Bool(props[Pid.Web3BasedAspect], false)); }).map(item => item.getProperties()[Pid.Id]);
        let unverifiedWeb3ItemIds = currentWeb3ItemIds;

        let wallets = this.findItems(props => { return (as.Bool(props[Pid.Web3WalletAspect], false)); });
        if (wallets.length == 0) {
            if (Utils.logChannel('web3', true)) { log.info('backpack.loadWeb3Items', 'No wallet item'); }
            return;
        }

        for (let walletsIdx = 0; walletsIdx < wallets.length; walletsIdx++) {
            let wallet = wallets[walletsIdx];
            let walletAddress = wallet.getProperties()[Pid.Web3WalletAddress];
            let network = wallet.getProperties()[Pid.Web3WalletNetwork];

            let web3ItemIdsOfWallet = await this.loadWeb3ItemsForWallet(walletAddress, network);

            for (let claimItemIdsOfWalletIdx = 0; claimItemIdsOfWalletIdx < web3ItemIdsOfWallet.length; claimItemIdsOfWalletIdx++) {
                let id = web3ItemIdsOfWallet[claimItemIdsOfWalletIdx];
                const index = unverifiedWeb3ItemIds.indexOf(id, 0);
                if (index > -1) { unverifiedWeb3ItemIds.splice(index, 1); }
            }
        }

        for (let previouWeb3ItemIdsIdx = 0; previouWeb3ItemIdsIdx < unverifiedWeb3ItemIds.length; previouWeb3ItemIdsIdx++) {
            this.deleteItem(unverifiedWeb3ItemIds[previouWeb3ItemIdsIdx], { skipContentNotification: true, skipPresenceUpdate: true });
        }
    }

    async loadWeb3ItemsForWallet(walletAddress: string, network: string): Promise<Array<string>>
    {
        if (walletAddress == '' || network == '') {
            log.info('backpack.loadWeb3ItemsFromWallet', 'Missing walletAddress=', walletAddress, 'network=', network);
            return [];
        }

        let idsCreatedByWallet: Array<string> = [];

        try {
            let contractAddress = Config.get('web3.weblinItemContractAddess.' + network, '');
            let contractABI = Config.get('web3.weblinItemContractAbi', null);
            if (contractAddress == null || contractAddress == '' || contractABI == null) {
                log.info('backpack.loadWeb3ItemsForWallet', 'Missing contract config', 'contractAddress=', contractAddress, 'contractABI=', contractABI);
            } else {
                let httpProvider = Config.get('web3.provider.' + network, '');
                let idsCreatedByWalletAndContract = await this.loadWeb3ItemsForWalletFromContract(walletAddress, httpProvider, contractAddress, contractABI);
                for (let i = 0; i < idsCreatedByWalletAndContract.length; i++) {
                    idsCreatedByWallet.push(idsCreatedByWalletAndContract[i]);
                }
            }
        } catch (error) {
            log.info(error);
        }

        try {
            let contracts = this.findItems(props => { return (as.Bool(props[Pid.Web3ContractAspect], false)); });
            for  (let contractIdx = 0; contractIdx < contracts.length; contractIdx++) {
                let contract = contracts[contractIdx];

                let contractAddress = as.String(contract.getProperties()[Pid.Web3ContractAddress], '');
                let contractABI = Config.get('web3.minimumItemableContractAbi', null);
                if (contractAddress == null || contractAddress == '' || contractABI == null) {
                    log.info('backpack.loadWeb3ItemsForWallet', 'Missing contract config', 'contractAddress=', contractAddress, 'contractABI=', contractABI);
                } else {
                    let httpProvider = Config.get('web3.provider.' + network, '');
                    let idsCreatedByWalletAndContract = await this.loadWeb3ItemsForWalletFromContract(walletAddress, httpProvider, contractAddress, contractABI);
                    for (let i = 0; i < idsCreatedByWalletAndContract.length; i++) {
                        idsCreatedByWallet.push(idsCreatedByWalletAndContract[i]);
                    }
                }

            }
        } catch (error) {
            log.info(error);
        }

        return idsCreatedByWallet;
    }

    async loadWeb3ItemsForWalletFromContract(walletAddress: string, httpProvider: string, contractAddress: string, contractABI: any): Promise<Array<string>>
    {
        let createdIds: Array<string> = [];

        let web3eth = new Web3Eth(new Web3Eth.providers.HttpProvider(httpProvider));
        let contract = new web3eth.Contract(contractABI, contractAddress);
        let numberOfItems = await contract.methods.balanceOf(walletAddress).call();
        for (let i = 0; i < numberOfItems; i++) {
            let tokenId = await contract.methods.tokenOfOwnerByIndex(walletAddress, i).call();
            let tokenUri = await contract.methods.tokenURI(tokenId).call();

            if (Config.get('config.clusterName', 'prod') == 'dev') {
                tokenUri = tokenUri.replace('https://webit.vulcan.weblin.com/', 'http://localhost:5000/');
                tokenUri = tokenUri.replace('https://item.weblin.com/', 'http://localhost:5000/');
            }

            let response = await fetch(tokenUri);

            if (!response.ok) {
                log.info('backpack.loadWeb3ItemsForWalletFromContract', 'fetch failed', 'tokenId', tokenId, 'tokenUri', tokenUri, response);
            } else {
                const metadata = await response.json();

                let ids = await this.getOrCreateWeb3ItemFromMetadata(walletAddress, metadata);
                for (let i = 0; i < ids.length; i++) {
                    createdIds.push(ids[i]);
                }

            }
        }

        return createdIds;
    }

    async getOrCreateWeb3ItemFromMetadata(ownerAddress: string, metadata: any): Promise<Array<string>>
    {
        let data = metadata.data;
        if (data == null) {
            log.info('backpack.getOrCreateWeb3ItemFromMetadata', 'No item creation data in', metadata);
            return [];
        }

        let knownIds: Array<string> = [];

        data[Pid.Web3BasedOwner] = ownerAddress;

        let template = as.String(data[Pid.Template], '');
        switch (template) {

            case 'CryptoClaim': {
                let domain = as.String(data[Pid.ClaimUrl], '');
                let existingItems = this.findItems(props =>
                {
                    return as.Bool(props[Pid.Web3BasedAspect], false) && as.Bool(props[Pid.ClaimAspect], false) && as.String(props[Pid.ClaimUrl], '') == domain;
                });
                if (existingItems.length == 0) {
                    try {
                        let item = await this.createItemByTemplate(template, data);
                        knownIds.push(item.getId());
                        if (Utils.logChannel('web3', true)) { log.info('Backpack.getOrCreateWeb3ItemFromMetadata', 'Creating', template, item.getId()); }
                    } catch (error) {
                        log.info(error);
                    }
                } else {
                    for (let i = 0; i < existingItems.length; i++) {
                        let item = existingItems[i];
                        knownIds.push(item.getId());
                        if (Utils.logChannel('web3', true)) { log.info('Backpack.getOrCreateWeb3ItemFromMetadata', 'Confirming', template, item.getId()); }
                    }
                }
            } break;

            default:
                log.info('Backpack.getOrCreateWeb3ItemFromMetadata', 'Not supported', data);
                break;
        }

        return knownIds;
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
            let template = 'Points';
            try {
                return await this.createItemByTemplate(template, {});
            } catch (error) {
                log.info('Backpack.getOrCreatePointsItem', 'failed to create item', template, error);
            }
            return null;
        } else if (pointsItems.length == 1) {
            return pointsItems[0]
        }
    }

    async addItem(itemId: string, props: ItemProperties, options: ItemChangeOptions): Promise<void>
    {
        let item = await this.createRepositoryItem(itemId, props);

        if (item.isRezzed()) {
            let roomJid = item.getProperties()[Pid.RezzedLocation];
            if (roomJid) {
                this.addToRoom(itemId, roomJid);
            }

            if (!options.skipPresenceUpdate) {
                item.sendPresence();
            }
        }

        if (!options.skipPersistentStorage) {
            await this.persistentSaveItem(itemId);
        }

        if (!options.skipContentNotification) {
            let data = new BackpackShowItemData(itemId, props);
            this.app.sendToAllTabs(ContentMessage.type_onBackpackShowItem, data);
        }
    }

    async deleteItem(itemId: string, options: ItemChangeOptions): Promise<void>
    {
        let item = this.items[itemId];
        if (item) {
            if (item.isRezzed()) {
                let roomJid = item.getProperties()[Pid.RezzedLocation];
                if (roomJid) {
                    await this.derezItem(itemId, roomJid, -1, -1, {}, [], options);
                }
            }

            if (!options.skipPersistentStorage) {
                await this.persistentDeleteItem(itemId);
            }

            if (!options.skipContentNotification) {
                let data = new BackpackRemoveItemData(itemId);
                this.app.sendToAllTabs(ContentMessage.type_onBackpackHideItem, data);
            }

            this.deleteRepositoryItem(itemId);
        }
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

    private async createRepositoryItem(itemId: string, props: ItemProperties): Promise<Item>
    {
        props[Pid.OwnerId] = await Memory.getLocal(Utils.localStorageKey_Id(), '');

        let item = this.items[itemId];
        if (item == null) {
            item = new Item(this.app, this, itemId, props);
            this.items[itemId] = item;
        }
        return item;
    }

    private deleteRepositoryItem(itemId: string): void
    {
        if (this.items[itemId]) {
            delete this.items[itemId];
        }
    }

    private async persistentSaveItem(itemId: string): Promise<void>
    {
        let item = this.items[itemId];
        if (item) {
            let props = item.getProperties();
            let itemIds = await Memory.getLocal(this.getBackpackIdsKey(), []);
            if (itemIds && Array.isArray(itemIds)) {
                await Memory.setLocal(Backpack.BackpackPropsPrefix + itemId, props);
                if (!itemIds.includes(itemId)) {
                    itemIds.push(itemId);
                    await Memory.setLocal(this.getBackpackIdsKey(), itemIds);
                }
            }
        }
    }

    private async persistentDeleteItem(itemId: string): Promise<void>
    {
        let itemIds = await Memory.getLocal(this.getBackpackIdsKey(), []);
        if (itemIds && Array.isArray(itemIds)) {
            await Memory.deleteLocal(Backpack.BackpackPropsPrefix + itemId);
            if (itemIds.includes(itemId)) {
                const index = itemIds.indexOf(itemId, 0);
                if (index > -1) {
                    itemIds.splice(index, 1);
                    await Memory.setLocal(this.getBackpackIdsKey(), itemIds);
                }
            }
        }
    }

    private addToRoom(itemId: string, roomJid: string): void
    {
        let rezzedIds = this.rooms[roomJid];
        if (rezzedIds == null) {
            rezzedIds = new Array<string>();
            this.rooms[roomJid] = rezzedIds;
        }
        rezzedIds.push(itemId);
    }

    private removeFromRoom(itemId: string, roomJid: string): void
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

    async setItemProperties(itemId: string, props: ItemProperties, options: ItemChangeOptions): Promise<void>
    {
        let item = this.items[itemId];
        if (item == null) { throw new ItemException(ItemException.Fact.UnknownError, ItemException.Reason.ItemDoesNotExist, itemId); }

        item.setProperties(props, options);
        await this.persistentSaveItem(itemId);
    }

    getItemProperties(itemId: string): ItemProperties
    {
        let item = this.items[itemId];
        if (item == null) { throw new ItemException(ItemException.Fact.UnknownError, ItemException.Reason.ItemDoesNotExist, itemId); } // throw unhandled, maybe return null?
        return item.getProperties();
    }

    async modifyItemProperties(itemId: string, changed: ItemProperties, deleted: Array<string>, options: ItemChangeOptions): Promise<void>
    {
        let item = this.items[itemId];
        if (item == null) { throw new ItemException(ItemException.Fact.UnknownError, ItemException.Reason.ItemDoesNotExist, itemId); }

        let clonedProps = Utils.cloneObject(item.getProperties());

        for (let key in changed) {
            clonedProps[key] = changed[key];
        }
        for (let i = 0; i < deleted.length; i++) {
            delete clonedProps[deleted[i]];
        }
        item.setProperties(clonedProps, options);
        await this.persistentSaveItem(itemId);
    }

    createItemByTemplate(templateName: string, args: ItemProperties): Promise<Item>
    {
        return new Promise(async (resolve, reject) =>
        {
            try {

                let userId = await Memory.getLocal(Utils.localStorageKey_Id(), '');
                if (userId == null || userId == '') { throw new ItemException(ItemException.Fact.NotExecuted, ItemException.Reason.NoUserId); }

                let providerId = 'nine3q';
                let apiUrl = Config.get('itemProviders.' + providerId + '.config.backpackApiUrl', '');
                if (apiUrl == null || apiUrl == '') { throw new ItemException(ItemException.Fact.NotExecuted, ItemException.Reason.SeeDetail, 'Missing backpackApi for ' + providerId); }

                let request = new RpcProtocol.BackpackCreateRequest();
                request.method = RpcProtocol.BackpackCreateRequest.method;
                request.user = userId;
                request.template = templateName;
                request.args = args;

                let response = <RpcProtocol.BackpackCreateResponse>await this.rpcClient.call(apiUrl, request);

                let props = response.properties;
                let itemId = props.Id;
                await this.addItem(itemId, props, {});
                let item = this.items[itemId];

                resolve(item);
            } catch (error) {
                reject(error);
            }
        });
    }

    executeItemAction(itemId: string, action: string, args: any, involvedIds: Array<string>, allowUnrezzed: boolean): Promise<void>
    {
        return new Promise(async (resolve, reject) =>
        {
            try {

                let item = this.items[itemId];
                if (item == null) { throw new ItemException(ItemException.Fact.NotExecuted, ItemException.Reason.ItemDoesNotExist, itemId); }

                let userId = await Memory.getLocal(Utils.localStorageKey_Id(), '');
                if (userId == null || userId == '') { throw new ItemException(ItemException.Fact.NotExecuted, ItemException.Reason.NoUserId); }

                let providerId = 'nine3q';
                let apiUrl = Config.get('itemProviders.' + providerId + '.config.backpackApiUrl', '');
                if (apiUrl == null || apiUrl == '') { throw new ItemException(ItemException.Fact.NotExecuted, ItemException.Reason.SeeDetail, 'Missing backpackApi for ' + providerId); }

                let roomJid = null;
                if (!allowUnrezzed) {
                    roomJid = item.getProperties()[Pid.RezzedLocation];
                    if (roomJid == null || roomJid == '') { throw new ItemException(ItemException.Fact.NotExecuted, ItemException.Reason.SeeDetail, 'Item ' + itemId + ' missing RezzedLocation'); }
                }

                let items: { [id: string]: ItemProperties } = {};
                for (let i = 0; i < involvedIds.length; i++) {
                    items[involvedIds[i]] = this.getItemProperties(involvedIds[i]);
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
                        await this.setItemProperties(id, props, {});
                    }
                }

                if (response.created) {
                    for (let id in response.created) {
                        let props = response.created[id];
                        await this.addItem(id, props, {});
                    }
                }

                if (response.deleted) {
                    for (let i = 0; i < response.deleted.length; i++) {
                        let id = response.deleted[i];
                        await this.deleteItem(id, {});
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

    getItems(): { [id: string]: ItemProperties; }
    {
        let itemProperties: { [id: string]: ItemProperties; } = {};
        for (let id in this.items) {
            let item = this.items[id];
            itemProperties[id] = item.getProperties();
        }
        return itemProperties
    }

    async rezItem(itemId: string, roomJid: string, rezzedX: number, destinationUrl: string, options: ItemChangeOptions): Promise<void>
    {
        let item = this.items[itemId];
        if (item == null) { throw new ItemException(ItemException.Fact.NotRezzed, ItemException.Reason.ItemDoesNotExist, itemId); }
        if (item.isRezzed()) { throw new ItemException(ItemException.Fact.NotRezzed, ItemException.Reason.ItemAlreadyRezzed); }

        this.addToRoom(itemId, roomJid);

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
            await this.persistentSaveItem(itemId);
        }

        if (!options.skipPresenceUpdate) {
            this.app.sendToTabsForRoom(roomJid, { 'type': ContentMessage.type_sendPresence });
        }
    }

    async derezItem(itemId: string, roomJid: string, inventoryX: number, inventoryY: number, changed: ItemProperties, deleted: Array<string>, options: ItemChangeOptions): Promise<void>
    {
        let item = this.items[itemId];
        if (item == null) { throw new ItemException(ItemException.Fact.NotDerezzed, ItemException.Reason.ItemDoesNotExist, itemId); }
        if (!item.isRezzed()) { return; }
        if (!item.isRezzedTo(roomJid)) { throw new ItemException(ItemException.Fact.NotDerezzed, ItemException.Reason.ItemNotRezzedHere); }

        let clonedProps = Utils.cloneObject(item.getProperties());

        this.removeFromRoom(itemId, roomJid);

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
            await this.persistentSaveItem(itemId);
        }

        if (!options.skipContentNotification) {
            this.app.sendToTabsForRoom(roomJid, { 'type': ContentMessage.type_sendPresence });
        }

        if (!options.skipPresenceUpdate) {
            this.app.sendToTabsForRoom(roomJid, { 'type': ContentMessage.type_sendPresence });
        }
    }

    stanzaOutFilter(stanza: xml): any
    {
        let toJid = new jid(stanza.attrs.to);
        let roomJid = toJid.bare().toString();
        let itemNick = toJid.getResource();

        if (stanza.name == 'presence') {
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

        // if (stanza.name == 'message') {
        //     if (as.String(stanza.attrs['type'], 'normal') == 'chat') {
        //         if (this.isItem(itemNick)) {
        //             stanza = null;
        //         }
        //     }
        // }

        return stanza;
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
                        'Limit=' + Config.get('backpack.dependentPresenceItemsLimit', 25)
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
                        'Current=' + ids.length + ' Limit=' + Config.get('backpack.dependentPresenceItemsLimit', 25)
                    );
                }
            }
        }

        for (let i = 0; i < ids.length; i++) {
            let id = ids[i];
            let itemPresence: xml = this.items[id].getDependentPresence(roomJid);
            result.append(itemPresence);
        }

        return result;
    }

    private showToast(roomJid: string, title: string, text: string, type: string, iconType: string, detail: string): void
    {
        let data = new WeblinClientApi.ClientNotificationRequest(WeblinClientApi.ClientNotificationRequest.type, '');
        data.title = title;
        data.text = text;
        data.type = type;
        data.iconType = iconType;
        data.detail = detail;
        this.app.sendToTabsForRoom(roomJid, { 'type': ContentMessage.type_clientNotification, 'data': data });
    }

}
