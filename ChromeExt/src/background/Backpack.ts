import log = require('loglevel');
import { as } from '../lib/as';
import { xml, jid } from '@xmpp/client';
import { Config } from '../lib/Config';
import { ItemProperties, Pid } from '../lib/ItemProperties';
import { BackpackShowItemData, BackpackRemoveItemData, BackpackSetItemData, ContentMessage } from '../lib/ContentMessage';
import { ItemException } from '../lib/ItemException';
import { ItemChangeOptions } from '../lib/ItemChangeOptions';
import { RpcProtocol } from '../lib/RpcProtocol';
import { Memory } from '../lib/Memory';
import { Utils } from '../lib/Utils';
import { BackgroundApp } from './BackgroundApp';
import { Item } from './Item';
import { WeblinClientApi } from '../lib/WeblinClientApi';
import { IItemProvider } from './ItemProvider';
import { LocalStorageItemProvider } from './LocalStorageItemProvider';
import { HostedInventoryItemProvider } from './HostedInventoryItemProvider';
import { RpcClient } from '../lib/RpcClient';
//const Web3 = require('web3');
const Web3Eth = require('web3-eth');

export class Backpack
{
    private items: { [id: string]: Item; } = {};
    private rooms: { [jid: string]: Array<string>; } = {};
    private providers: Map<string, IItemProvider> = new Map<string, IItemProvider>();
    private rpcClient: RpcClient = new RpcClient();

    async getUserId(): Promise<string> { return await this.app.getUserId(); }
    async getUserToken(): Promise<string> { return await this.app.getUserToken(); }

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

    constructor(private app: BackgroundApp, rpcClient: RpcClient = null)
    {
        if (rpcClient) { this.rpcClient = rpcClient; }
    }

    async init(): Promise<void>
    {
        let providerConfigs = Config.get('itemProviders', {});
        for (let providerId in providerConfigs) {
            const providerConfig = providerConfigs[providerId];
            switch (as.String(providerConfig.type, 'unknown')) {
                case LocalStorageItemProvider.type:
                    this.providers.set(providerId, new LocalStorageItemProvider(this, providerConfig.config));
                    break;
                case HostedInventoryItemProvider.Provider.type:
                    this.providers.set(providerId, new HostedInventoryItemProvider.Provider(this, <HostedInventoryItemProvider.Config>providerConfig.config));
                    break;
                default:
                    break;
            }
        }

        for (let [name, provider] of this.providers) {
            await provider.loadItems();
        }

        if (Config.get('backpack.loadWeb3Items', false)) {
            await this.loadWeb3Items();
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

    getProvider(itemId: string): IItemProvider
    {
        const item = this.items[itemId];
        if (item) {
            const providerName = as.String(item.getProperties()[Pid.Provider], '');
            if (this.providers.has(providerName)) {
                return this.providers.get(providerName);
            } else throw new ItemException(ItemException.Fact.InternalError, ItemException.Reason.NoItemProviderForItem, itemId + ' provider=' + providerName);
        } else { throw new ItemException(ItemException.Fact.InternalError, ItemException.Reason.NoSuchItem, itemId); }
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
            await this.getProvider(itemId).saveItem(itemId);
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
                await this.getProvider(itemId).deleteItem(itemId, options);
            }

            if (!options.skipContentNotification) {
                let data = new BackpackRemoveItemData(itemId);
                this.app.sendToAllTabs(ContentMessage.type_onBackpackHideItem, data);
            }

            if (!options.skipPresenceUpdate) {
                item.sendPresence();
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
        await this.getProvider(itemId).saveItem(itemId);
    }

    getItemProperties(itemId: string): ItemProperties
    {
        let item = this.items[itemId];
        if (item == null) { throw new ItemException(ItemException.Fact.UnknownError, ItemException.Reason.ItemDoesNotExist, itemId); } // throw unhandled, maybe return null?
        return item.getProperties();
    }

    async modifyItemProperties(itemId: string, changed: ItemProperties, deleted: Array<string>, options: ItemChangeOptions): Promise<void>
    {
        await this.getProvider(itemId).modifyItemProperties(itemId, changed, deleted, options);
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

    createItemByNft(contractNetwork: string, contractAddress: string, tokenId: string, tokenUri: string): Promise<Item>
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
                let item = this.items[itemId];

                resolve(item);
            } catch (error) {
                reject(error);
            }
        });
    }

    async executeItemAction(itemId: string, action: string, args: any, involvedIds: Array<string>, allowUnrezzed: boolean): Promise<void>
    {
        await this.getProvider(itemId).itemAction(itemId, action, args, involvedIds, allowUnrezzed);
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
        await this.getProvider(itemId).rezItem(itemId, roomJid, rezzedX, destinationUrl, options);
    }

    async derezItem(itemId: string, roomJid: string, inventoryX: number, inventoryY: number, changed: ItemProperties, deleted: Array<string>, options: ItemChangeOptions): Promise<void>
    {
        await this.getProvider(itemId).derezItem(itemId, roomJid, inventoryX, inventoryY, changed, deleted, options);
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
