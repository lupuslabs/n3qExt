import log = require('loglevel');
import { as } from '../lib/as';
import { xml } from '@xmpp/client';
import { Config } from '../lib/Config';
import { ItemChangeOptions } from '../lib/ItemChangeOptions';
import { ItemException } from '../lib/ItemException';
import { ItemProperties, Pid, Property } from '../lib/ItemProperties';
import { Memory } from '../lib/Memory';
import { RpcClient } from '../lib/RpcClient';
import { RpcProtocol } from '../lib/RpcProtocol';
import { Utils } from '../lib/Utils';
import { Backpack } from './Backpack';
import { IItemProvider } from './ItemProvider';
import { Item } from './Item';
const Web3Eth = require('web3-eth');

export class LocalStorageItemProvider implements IItemProvider
{
    static type = 'LocalStorageItemProvider';
    private static BackpackIdsKey = 'BackpackIds';
    private static BackpackPropsPrefix = 'BackpackItem-';
    private rpcClient: RpcClient = new RpcClient();

    constructor(private backpack: Backpack, private id, private providerDescription: any)
    {
    }

    private getBackpackIdsKey(): string
    {
        if (Config.get('config.clusterName', 'prod') == 'dev') {
            return LocalStorageItemProvider.BackpackIdsKey + '-dev';
        }
        return LocalStorageItemProvider.BackpackIdsKey;
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
    }

    async persistentWriteItem(itemId: string): Promise<void>
    {
        let item = this.backpack.getItem(itemId);
        if (item == null) { throw new ItemException(ItemException.Fact.UnknownError, ItemException.Reason.ItemDoesNotExist, itemId); }

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

    async persistentDeleteItem(itemId: string): Promise<void>
    {
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

    async loadWeb3Items(): Promise<void>
    {
        let currentWeb3ItemIds = this.backpack.findItems(props => { return (as.Bool(props[Pid.Web3BasedAspect], false)); }).map(item => item.getProperties()[Pid.Id]);
        let unverifiedWeb3ItemIds = currentWeb3ItemIds;

        let wallets = this.backpack.findItems(props => { return (as.Bool(props[Pid.Web3WalletAspect], false)); });
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
            let contracts = this.backpack.findItems(props => { return (as.Bool(props[Pid.Web3ContractAspect], false)); });
            for (let contractIdx = 0; contractIdx < contracts.length; contractIdx++) {
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
                let existingItems = this.backpack.findItems(props =>
                {
                    return as.Bool(props[Pid.Web3BasedAspect], false) && as.Bool(props[Pid.ClaimAspect], false) && as.String(props[Pid.ClaimUrl], '') == domain;
                });
                if (existingItems.length == 0) {
                    try {
                        let itemId = await this.createItemByTemplate('', template, data);
                        knownIds.push(itemId);
                        if (Utils.logChannel('web3', true)) { log.info('Backpack.getOrCreateWeb3ItemFromMetadata', 'Creating', template, itemId); }
                    } catch (error) {
                        log.info(error);
                    }
                } else {
                    for (let i = 0; i < existingItems.length; i++) {
                        let item = existingItems[i];
                        let itemId = item.getId();
                        knownIds.push(itemId);
                        if (Utils.logChannel('web3', true)) { log.info('Backpack.getOrCreateWeb3ItemFromMetadata', 'Confirming', template, itemId); }
                    }
                }
            } break;

            default:
                log.info('Backpack.getOrCreateWeb3ItemFromMetadata', 'Not supported', data);
                break;
        }

        return knownIds;
    }

    createItemByTemplate(auth: string, templateName: string, args: ItemProperties): Promise<string>
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

                resolve(itemId);
            } catch (error) {
                reject(error);
            }
        });
    }

    createItemByNft(contractNetwork: string, contractAddress: string, tokenId: string, tokenUri: string): Promise<string>
    {
        return new Promise(async (resolve, reject) =>
        {
            try {

                let userId = await Memory.getLocal(Utils.localStorageKey_Id(), '');
                if (userId == null || userId == '') { throw new ItemException(ItemException.Fact.NotExecuted, ItemException.Reason.NoUserId); }

                let providerId = 'nine3q';
                let apiUrl = Config.get('itemProviders.' + providerId + '.config.backpackApiUrl', '');
                if (apiUrl == null || apiUrl == '') { throw new ItemException(ItemException.Fact.NotExecuted, ItemException.Reason.SeeDetail, 'Missing backpackApi for ' + providerId); }

                let request = new RpcProtocol.BackpackCreateNftRequest();
                request.method = RpcProtocol.BackpackCreateNftRequest.method;
                request.user = userId;
                request.contractNetwork = contractNetwork;
                request.contractAddress = contractAddress;
                request.tokenId = tokenId;
                request.tokenUri = tokenUri;

                let response = <RpcProtocol.BackpackCreateResponse>await this.rpcClient.call(apiUrl, request);

                let props = response.properties;
                let itemId = props.Id;
                await this.addItem(itemId, props, {});

                resolve(itemId);
            } catch (error) {
                reject(error);
            }
        });
    }

    // API

    async init(): Promise<void>
    {
    }

    async loadItems(): Promise<void>
    {
        await this.loadLocalItems();

        if (Config.get('backpack.loadWeb3Items', false)) {
            await this.loadWeb3Items();
        }
    }

    async addItem(itemId: string, props: ItemProperties, options: ItemChangeOptions): Promise<void>
    {
        let item = await this.backpack.createRepositoryItem(itemId, props);
        if (item == null) { throw new ItemException(ItemException.Fact.UnknownError, ItemException.Reason.ItemDoesNotExist, itemId); }

        if (item.isRezzed()) {
            let roomJid = item.getProperties()[Pid.RezzedLocation];
            if (roomJid) {
                this.backpack.addToRoom(itemId, roomJid);
            }

            if (!options.skipPresenceUpdate) {
                item.sendPresence();
            }
        }

        if (!options.skipPersistentStorage) {
            await this.persistentWriteItem(itemId);
        }

        if (!options.skipContentNotification) {
            this.backpack.sendRemoveItemToAllTabs(itemId);
        }
    }

    async deleteItem(itemId: string, options: ItemChangeOptions): Promise<void>
    {
        let item = this.backpack.getItem(itemId);
        if (item == null) { throw new ItemException(ItemException.Fact.UnknownError, ItemException.Reason.ItemDoesNotExist, itemId); }

        if (item.isRezzed()) {
            let roomJid = item.getProperties()[Pid.RezzedLocation];
            if (roomJid) {
                await this.derezItem(itemId, roomJid, -1, -1, {}, [], options);
            }

            if (!options.skipPresenceUpdate) {
                item.sendPresence();
            }
        }

        if (!options.skipPersistentStorage) {
            this.persistentDeleteItem(itemId);
        }

        if (!options.skipContentNotification) {
            this.backpack.sendRemoveItemToAllTabs(itemId);
        }

        this.backpack.deleteRepositoryItem(itemId);
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
        await this.persistentWriteItem(itemId);
    }

    async itemAction(itemId: string, action: string, args: any, involvedIds: string[], allowUnrezzed: boolean): Promise<ItemProperties>
    {
        return new Promise(async (resolve, reject) =>
        {
            try {
                let item = this.backpack.getItem(itemId);

                let userId = await Memory.getLocal(Utils.localStorageKey_Id(), '');
                if (userId == null || userId == '') { throw new ItemException(ItemException.Fact.NotExecuted, ItemException.Reason.NoUserId); }

                let apiUrl = as.String(this.providerDescription.config.backpackApiUrl, '');
                if (apiUrl == null || apiUrl == '') { throw new ItemException(ItemException.Fact.NotExecuted, ItemException.Reason.SeeDetail, 'Missing backpackApi for ' + this.id); }

                let roomJid = null;
                if (!allowUnrezzed && !as.Bool(item.getProperties()[Pid.IsUnrezzedAction], false)) {
                    roomJid = item.getProperties()[Pid.RezzedLocation];
                    if (roomJid == null || roomJid == '') { throw new ItemException(ItemException.Fact.NotExecuted, ItemException.Reason.SeeDetail, 'Item ' + itemId + ' missing RezzedLocation'); }
                }

                let items: { [id: string]: ItemProperties } = {};
                for (let i = 0; i < involvedIds.length; i++) {
                    items[involvedIds[i]] = this.backpack.getRepositoryItemProperties(involvedIds[i]);
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
                        this.backpack.setRepositoryItemProperties(id, props, {});
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

                resolve(response.result);
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
            await this.persistentWriteItem(itemId);
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
            await this.persistentWriteItem(itemId);
        }

        if (!options.skipContentNotification) {
            // really?
            // this.backpack.sendPresence(roomJid);
        }

        if (!options.skipPresenceUpdate) {
            this.backpack.requestSendPresenceFromTab(roomJid);
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
            [Pid.Provider]: this.id
        };
        let signed = as.String(props[Pid.Signed], '').split(' ');
        for (let pid in props) {
            if (Property.inPresence(pid) || (signed.length > 0 && signed.includes(pid))) {
                attrs[pid] = props[pid];
            }
        }
        presence.append(xml('x', attrs));
        return presence;
    }

    async onDependentPresence(itemId: string, roomJid: string, participantNick: string, dependentPresence: xml): Promise<void>
    {
    }
}
