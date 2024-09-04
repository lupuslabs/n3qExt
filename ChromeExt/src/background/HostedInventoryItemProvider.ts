import log = require('loglevel');
import { as } from '../lib/as';
import { is } from '../lib/is';
import * as ltx from 'ltx';
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
import { BackgroundApp } from './BackgroundApp';
import { RetryStrategy, RetryStrategyMaker } from '../lib/RetryStrategy'
const Web3Eth = require('web3-eth');

export namespace HostedInventoryItemProvider
{
    export interface Config
    {
        itemApiUrl: string;
        createItemWiCryptoClaimAuth: string;
    }

    export interface Definition
    {
        name: string;
        type: string;
        description: string;
        configUrl: string;
    }

    class ItemCacheEntry
    {
        public accessTime = Date.now();
        constructor(private itemProperties: ItemProperties) { }
        getProperties(): ItemProperties
        {
            this.accessTime = Date.now();
            return this.itemProperties;
        }
    }

    // Init state progression is strictly from left to right, top to bottom:
    type ProviderInitState = 'start'
        |'loadConfig'|'loadingConfig'|'afterConfigLoaded'
        |'loadServerItems'|'loadingServerItems'|'afterServerItemsLoaded'
        |'loadWeb3Items'|'loadingWeb3Items'|'afterWeb3ItemsLoaded'
        |'running'|'stopped';

    export class Provider implements IItemProvider
    {
        private readonly app: BackgroundApp;
        private readonly backpack: Backpack;
        private readonly retryStrategyMaker: RetryStrategyMaker
        private readonly id: string;
        private readonly providerDefinition: Definition
        private config: null|Config = null;

        static readonly type = 'HostedInventoryItemProvider';
        private readonly rpcClient: RpcClient = new RpcClient();
        private readonly userId: string;
        private readonly accessToken: string;

        private loadUserItems: boolean;
        private userItemsLoaded: boolean = false; // Mainly whether the "default" item should be known.
        private running: boolean = false; // Whether this is configured and not stopped. Items may or may not be loaded.
        private initState: ProviderInitState = 'start';
        private retryStrategy: RetryStrategy;

        constructor(app: BackgroundApp, backpack: Backpack, retryStrategyMaker: RetryStrategyMaker, loadUserItems: boolean, id: string, providerDefinition: Definition)
        {
            this.app = app;
            this.backpack = backpack;
            this.retryStrategyMaker = retryStrategyMaker;
            this.loadUserItems = loadUserItems;
            this.id = id;
            this.providerDefinition = providerDefinition;
            this.userId = this.app.getUserId();
            this.accessToken = this.app.getUserToken();
        }

        stop(): void
        {
            this.initState = 'stopped';
            this.maintain();
        }

        maintain(): void { switch (this.initState) {

            case 'start': {
                this.initState = 'loadConfig';
                this.retryStrategy = this.retryStrategyMaker.makeRetryStrategy();
                this.maintain();
                return;
            }

            case 'loadConfig': {
                if (this.retryStrategy.getNoTriesLeft()) {
                    log.info('loadConfig tries exhausted!');
                    this.initState = 'stopped';
                    this.maintain();
                    return;
                }
                if (!this.retryStrategy.getTryNow(Date.now())) {
                    return;
                }
                this.initState = 'loadingConfig';
                this.loadConfig()
                    .then(() => {
                        if (this.initState === 'loadingConfig') {
                            this.initState = 'afterConfigLoaded';
                            this.maintain();
                        }
                    }).catch(error => {
                        log.info('loadConfig failed!', error);
                        if (this.initState === 'loadingConfig') {
                            this.initState = 'loadConfig';
                            this.maintain();
                        }
                    });
                return;
            }
            case 'loadingConfig': {
                return;
            }
            case 'afterConfigLoaded': {
                this.retryStrategy = this.retryStrategyMaker.makeRetryStrategy();
                this.initState = this.loadUserItems ? 'loadServerItems' : 'afterServerItemsLoaded';
                this.running = true;
                this.maintain();
                return;
            }

            case 'loadServerItems': {
                if (this.retryStrategy.getNoTriesLeft()) {
                    log.info('loadServerItems tries exhausted!');
                    this.loadUserItems = false;
                    this.initState = 'afterServerItemsLoaded';
                    this.maintain();
                    return;
                }
                if (!this.retryStrategy.getTryNow(Date.now())) {
                    return;
                }
                this.initState = 'loadingServerItems';
                this.loadServerItems()
                    .then(() => {
                        if (this.initState === 'loadingServerItems') {
                            this.initState = 'afterServerItemsLoaded';
                            this.userItemsLoaded = true;
                            this.maintain();
                        }
                    }).catch(error => {
                        log.info('loadServerItems failed!', error);
                        if (this.initState === 'loadingServerItems') {
                            this.initState = 'loadServerItems';
                            this.maintain();
                        }
                    });
                return;
            }
            case 'loadingServerItems': {
                return;
            }
            case 'afterServerItemsLoaded': {
                this.retryStrategy = this.retryStrategyMaker.makeRetryStrategy();
                this.initState = this.loadUserItems ? 'loadWeb3Items' : 'afterWeb3ItemsLoaded';
                this.maintain();
                return;
            }

            case 'loadWeb3Items': {
                if (!Config.get('backpack.loadWeb3Items', false)) {
                    this.initState = 'afterWeb3ItemsLoaded';
                    this.maintain();
                    return;
                }
                if (this.retryStrategy.getNoTriesLeft()) {
                    log.info('loadWeb3Items tries exhausted!');
                    this.initState = 'afterWeb3ItemsLoaded';
                    this.maintain();
                    return;
                }
                if (!this.retryStrategy.getTryNow(Date.now())) {
                    return;
                }
                this.initState = 'loadingWeb3Items';
                this.loadWeb3Items()
                    .then(() => {
                        if (this.initState === 'loadingWeb3Items') {
                            this.initState = 'afterWeb3ItemsLoaded';
                            this.maintain();
                        }
                    }).catch(error => {
                        log.info('loadWeb3Items failed!', error);
                        if (this.initState === 'loadingWeb3Items') {
                            this.initState = 'loadWeb3Items';
                            this.maintain();
                        }
                    });
                return;
            }
            case 'loadingWeb3Items': {
                return;
            }
            case 'afterWeb3ItemsLoaded': {
                this.initState = 'running';
                this.maintain();
                return;
            }

            case 'running': {
                this.checkMaintainItemCache();
                return;
            }

            default:
            case 'stopped': {
                this.running = false;
                return;
            }

        }}

        private getConfig(): Config
        {
            if (this.config === null) {
                throw new Error('Config not initialized!');
            }
            return this.config;
        }

        private async loadConfig(): Promise<void>
        {
            let url = as.String(this.providerDefinition.configUrl, 'https://webit.vulcan.weblin.com/Config?user={user}&token={token}&client={client}')
                .replace('{user}', encodeURIComponent(this.userId))
                .replace('{token}', encodeURIComponent(this.accessToken))
                .replace('{client}', encodeURIComponent(JSON.stringify(Client.getDetails())))
                ;
            if (Utils.logChannel('startup', true)) { log.info('HostedInventoryItemProvider.init', 'fetch', url); }
            this.config = await this.app.getUrlFetcher().fetchJson(url);
            if (Utils.logChannel('startup', true)) { log.info('HostedInventoryItemProvider.init', 'fetched', this.config); }
        }

        public async getItemIds(): Promise<string[]>
        {
            let itemIds = [];
            try {
                let request = new RpcProtocol.UserGetItemIdsRequest(this.userId, this.accessToken, this.app.getLanguage(), this.userId);
                const response = <RpcProtocol.UserGetItemIdsResponse>await this.rpcClient.call(this.getConfig().itemApiUrl, request);
                itemIds = response.items;
            } catch (error) {
                // this.handleException(ex);
                throw error;
            }
            return itemIds;
        }

        async getItemsByInventoryItemIds(itemsToGet: ItemProperties[]): Promise<ItemProperties[]>
        {
            const { itemsLoaded, itemsToLoadByInventory } = this.getItemsLoadedAndInventoryItemIdsToLoad(itemsToGet);
            const rermainingItemsPromise = this.requestItemsFromServer(itemsToLoadByInventory);
            itemsLoaded.push(...await rermainingItemsPromise);
            return itemsLoaded;
        }

        public getLoadedItemsByInventoryItemIds(itemsToGet: Readonly<ItemProperties>[]): { itemsLoaded: ItemProperties[], itemsToLoad: ItemProperties[] }
        {
            const itemsLoaded = []
            const itemsToLoad = []
            const itemDefinitionsForUs = itemsToGet.filter(itemDef => ItemProperties.getProviderId(itemDef) === this.id)
            for (const itemDefinition of itemDefinitionsForUs) {
                const loadedItem = this.getLoadedItemByInventoryItemId(itemDefinition)
                if (loadedItem) {
                    itemsLoaded.push(loadedItem)
                } else {
                    itemsToLoad.push(itemDefinition)
                }
            }
            return { itemsLoaded, itemsToLoad }
        }

        async loadServerItems(): Promise<void>
        {
            let itemIds = await this.getItemIds();

            let multiItemProperties = {};
            if (itemIds.length > 0) {
                try {
                    const request = new RpcProtocol.UserGetItemPropertiesRequest(this.userId, this.accessToken, this.app.getLanguage(), this.userId, itemIds);
                    const response = <RpcProtocol.UserGetItemPropertiesResponse>await this.rpcClient.call(this.getConfig().itemApiUrl, request);
                    multiItemProperties = response.multiItemProperties;
                } catch (error) {
                    // this.handleException(ex);
                    throw error;
                }
            }

            if (!this.running) {
                return;
            }
            await this.backpack.onItemUpdateFromProvider([], Object.values(multiItemProperties));
        }

        async loadWeb3Items(): Promise<void>
        {
            let currentWeb3SyncedItemIds = this.backpack.findItems(props =>
            {
                return as.Bool(props[Pid.NftAspect], false) && as.Bool(props[Pid.NftSync], true);
            }).map(item => ItemProperties.getId(item));
            let unverifiedWeb3ItemIds = currentWeb3SyncedItemIds;

            let wallets = this.backpack.findItems(props => as.Bool(props[Pid.Web3WalletAspect], false));
            if (wallets.length === 0) {
                if (Utils.logChannel('web3', true)) { log.info('HostedInventoryItemProvider.loadWeb3Items', 'No wallet item'); }
            }

            for (const wallet of wallets) {
                let walletAddress = wallet[Pid.Web3WalletAddress] ?? '';
                let network = wallet[Pid.Web3WalletNetwork] ?? '';

                let web3ItemIdsOfWallet = await this.loadWeb3ItemsForWallet(walletAddress, network);

                for (let claimItemIdsOfWalletIdx = 0; claimItemIdsOfWalletIdx < web3ItemIdsOfWallet.length; claimItemIdsOfWalletIdx++) {
                    let id = web3ItemIdsOfWallet[claimItemIdsOfWalletIdx];
                    const index = unverifiedWeb3ItemIds.indexOf(id, 0);
                    if (index > -1) {
                        unverifiedWeb3ItemIds.splice(index, 1);
                    }
                }
            }

            for (const itemId of unverifiedWeb3ItemIds) {
                this.deleteItem(itemId, {});
            }
        }

        async loadWeb3ItemsForWallet(walletAddress: string, network: string): Promise<Array<string>>
        {
            if (walletAddress === '' || network === '') {
                log.info('HostedInventoryItemProvider.loadWeb3ItemsFromWallet', 'Missing walletAddress=', walletAddress, 'network=', network);
                return [];
            }

            let idsCreatedByWallet: Array<string> = [];

            try {
                let contractAddress = Config.get('web3.weblinItemContractAddess.' + network, '');
                let contractABI = Config.get('web3.weblinItemContractAbi', null);
                if (contractAddress == null || contractAddress === '' || contractABI == null) {
                    log.info('HostedInventoryItemProvider.loadWeb3ItemsForWallet', 'Missing contract config', 'contractAddress=', contractAddress, 'contractABI=', contractABI);
                } else {
                    let httpProvider = Config.get('web3.provider.' + network, '');
                    if (Utils.logChannel('web3', true)) { log.info('HostedInventoryItemProvider.loadWeb3ItemsForWallet', 'network=', network, 'httpProvider=', httpProvider); }
                    let idsCreatedByWalletAndContract = await this.loadWeb3ItemsForWalletFromContract(network, walletAddress, httpProvider, contractAddress, contractABI);
                    idsCreatedByWallet.push(...idsCreatedByWalletAndContract);
                }
            } catch (error) {
                log.info(error);
            }

            try {
                let contracts = this.backpack.findItems(props => { return (as.Bool(props[Pid.Web3ContractAspect], false)); });
                for (let contractIdx = 0; contractIdx < contracts.length; contractIdx++) {
                    let contract = contracts[contractIdx];

                    let contractAddress = as.String(contract[Pid.Web3ContractAddress], '');
                    let contractABI = Config.get('web3.minimumItemableContractAbi', null);
                    if (contractAddress === '' || contractABI == null) {
                        log.info('HostedInventoryItemProvider.loadWeb3ItemsForWallet', 'Missing contract config', 'contractAddress=', contractAddress, 'contractABI=', contractABI);
                    } else {
                        let httpProvider = Config.get('web3.provider.' + network, '');
                        if (Utils.logChannel('web3', true)) { log.info('HostedInventoryItemProvider.loadWeb3ItemsForWallet', { network, httpProvider }); }
                        let idsCreatedByWalletAndContract = await this.loadWeb3ItemsForWalletFromContract(network, walletAddress, httpProvider, contractAddress, contractABI);
                        idsCreatedByWallet.push(...idsCreatedByWalletAndContract);
                    }

                }
            } catch (error) {
                log.info('HostedInventoryItemProvider.loadWeb3ItemsForWallet', error);
            }

            return idsCreatedByWallet;
        }

        async loadWeb3ItemsForWalletFromContract(network: string, walletAddress: string, httpProvider: string, contractAddress: string, contractABI: any): Promise<Array<string>>
        {
            let createdIds: Array<string> = [];

            let web3eth = new Web3Eth(new Web3Eth.providers.HttpProvider(httpProvider));
            let contract = new web3eth.Contract(contractABI, contractAddress);
            if (Utils.logChannel('web3', true)) { log.info('HostedInventoryItemProvider.loadWeb3ItemsForWalletFromContract', { 'call': 'balanceOf', walletAddress, contractAddress }); }
            let numberOfItems = await contract.methods.balanceOf(walletAddress).call();
            for (let i = 0; i < numberOfItems; i++) {
                if (Utils.logChannel('web3', true)) { log.info('HostedInventoryItemProvider.loadWeb3ItemsForWalletFromContract', { 'call': 'tokenOfOwnerByIndex', i, walletAddress, contractAddress }); }
                let tokenId = await contract.methods.tokenOfOwnerByIndex(walletAddress, i).call();
                if (Utils.logChannel('web3', true)) { log.info('HostedInventoryItemProvider.loadWeb3ItemsForWalletFromContract', { 'call': 'tokenURI', tokenId, walletAddress, contractAddress }); }
                let tokenUri = await contract.methods.tokenURI(tokenId).call();

                if (Config.get('config.clusterName', 'prod') === 'dev') {
                    tokenUri = tokenUri.replace('https://webit.vulcan.weblin.com/', 'https://localhost:5100/');
                    tokenUri = tokenUri.replace('https://item.weblin.com/', 'https://localhost:5100/');
                }

                let response = await fetch(tokenUri);

                if (!response.ok) {
                    log.info('HostedInventoryItemProvider.loadWeb3ItemsForWalletFromContract', 'fetch failed', 'tokenId', tokenId, 'tokenUri', tokenUri, response);
                } else {
                    const metadata = await response.json();

                    let ids = await this.getOrCreateWeb3ItemFromMetadata(network, walletAddress, contractAddress, tokenId, metadata);
                    createdIds.push(...ids);

                }
            }

            return createdIds;
        }

        async getOrCreateWeb3ItemFromMetadata(network: string, ownerAddress: string, contractAddress: string, tokenId: string, metadata: any): Promise<Array<string>>
        {
            let data = metadata.data;
            if (data == null) {
                log.info('HostedInventoryItemProvider.getOrCreateWeb3ItemFromMetadata', 'No item creation data in', metadata);
                return [];
            }

            let knownIds: Array<string> = [];

            data[Pid.NftOwner] = ownerAddress;
            data[Pid.NftNetwork] = network;
            data[Pid.NftContract] = contractAddress;
            data[Pid.NftTokenId] = tokenId;

            let template = as.String(data[Pid.Template], '');
            switch (template) {

                case 'CryptoClaim': {
                    let domain = as.String(data[Pid.ClaimUrl], '');
                    let existingItems = this.backpack.findItems(props =>
                    {
                        return as.Bool(props[Pid.NftAspect], false) && as.Bool(props[Pid.ClaimAspect], false) && as.String(props[Pid.ClaimUrl], '') === domain;
                    });
                    if (existingItems.length === 0) {
                        try {
                            let props = await this.createItem(this.getConfig().createItemWiCryptoClaimAuth, 'ByTemplate', data);
                            let itemId = props[Pid.Id];
                            knownIds.push(itemId);
                            if (Utils.logChannel('web3', true)) { log.info('HostedInventoryItemProvider.getOrCreateWeb3ItemFromMetadata', 'Creating', template, itemId, data); }
                        } catch (error) {
                            log.info(error);
                        }
                    } else {
                        for (const item of existingItems) {
                            const itemId = ItemProperties.getId(item);
                            knownIds.push(itemId);
                            if (Utils.logChannel('web3', true)) { log.info('HostedInventoryItemProvider.getOrCreateWeb3ItemFromMetadata', 'Confirming', template, itemId); }
                        }
                    }
                } break;

                default:
                    log.info('HostedInventoryItemProvider.getOrCreateWeb3ItemFromMetadata', 'Not supported', data);
                    break;
            }

            return knownIds;
        }

        private getGenericItemId(): string
        {
            const filter = props => as.Bool(props[Pid.N3qAspect], false) && props[Pid.Provider] === this.id;
            const clientItemIds = this.backpack.findItems(filter).map(item => ItemProperties.getId(item));

            if (clientItemIds.length === 0) {
                throw new ItemException(ItemException.Fact.NotCreated, ItemException.Reason.NoClientItem, '');
            }

            return clientItemIds[0];
        }

        async applyItemToItem(activeId: string, passiveId: string): Promise<ItemProperties>
        {
            try {
                const result = await this.itemAction(
                    activeId,
                    'Applier.Apply',
                    { 'passive': passiveId },
                    [activeId, passiveId],
                    false
                );
                return result;
            } catch (ex) {
                this.handleException(ex);
            }
        }

        async createItem(auth: string, method: string, args: ItemProperties): Promise<ItemProperties>
        {
            const itemId = this.getGenericItemId();

            try {
                const result = await this.itemAction(
                    itemId,
                    'N3q.CreateItem',
                    {
                        'Method': method,
                        'Auth': auth,
                        'Properties': JSON.stringify(args),
                    },
                    [itemId],
                    true
                );

                return result;
            } catch (ex) {
                this.handleException(ex);
            }
        }

        async transferAuthorize(itemId: string, duration: number): Promise<string>
        {
            try {
                const action = 'Transferable.Authorize';
                const args = { duration: String(duration) };
                const result = await this.itemAction(itemId, action, args, [itemId], false);
                const transferToken = result.TransferToken;
                return transferToken;
            } catch (ex) {
                this.handleException(ex);
            }
        }

        async transferUnauthorize(itemId: string): Promise<void>
        {
            try {
                const action = 'Transferable.RemoveAuthorization';
                await this.itemAction(itemId, action, {}, [itemId], false);
            } catch (ex) {
                this.handleException(ex);
            }
        }

        async transferComplete(senderInventoryId: string, senderItemId: string, transferToken: string): Promise<string>
        {
            const action = 'Transferable.CompleteTransfer';
            const args = { senderInventory: senderInventoryId, senderItem: senderItemId, transferToken: transferToken };
            const result = await this.genericAction(action, args);
            const receivedId = result[Pid.Id];
            return receivedId;
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
            const _item = this.backpack.getItem(itemId);

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

        async itemAction(itemId: string, action: string, args: any, involvedIds: string[], allowUnrezzed: boolean): Promise<ItemProperties>
        {
            let createdIds = [];
            let deletedIds = [];
            let changedIds = [];
            let result = {};
            let multiItemProperties: { [prop: string]: ItemProperties } = {};
            try {
                const request = new RpcProtocol.UserItemActionRequest(
                    this.userId,
                    this.accessToken,
                    this.app.getLanguage(),
                    itemId,
                    this.userId,
                    action,
                    args,
                    involvedIds
                );
                request.responseMode = 'items';
                const response = <RpcProtocol.UserItemActionResponse>await this.rpcClient.call(this.getConfig().itemApiUrl, request);

                createdIds = response.created;
                deletedIds = response.deleted;
                changedIds = response.changed;
                result = response.result;
                multiItemProperties = response.multiItemProperties;

            } catch (ex) {
                this.handleException(ex);
            }

            // let changedOrCreated = [];
            // for (let i = 0; i < changedIds.length; i++) {
            //     const id = changedIds[i];
            //     if (!changedOrCreated.includes(id)) {
            //         changedOrCreated.push(id);
            //     }
            // }
            // for (let i = 0; i < createdIds.length; i++) {
            //     const id = createdIds[i];
            //     if (!changedOrCreated.includes(id)) {
            //         changedOrCreated.push(id);
            //     }
            // }

            // if (changedOrCreated.length > 0) {
            //     try {
            //         const request = new RpcProtocol.UserGetItemPropertiesRequest(this.userId, this.accessToken, this.app.getLanguage(), this.userId, changedOrCreated);
            //         const response = <RpcProtocol.UserGetItemPropertiesResponse>await this.rpcClient.call(this.config().itemApiUrl, request);
            //         multiItemProperties = response.multiItemProperties;
            //     } catch (ex) {
            //         this.handleException(ex);
            //     }
            // }

            await this.backpack.onItemUpdateFromProvider(deletedIds ?? [], Object.values(multiItemProperties ?? {}));
            return result;
        }

        async genericAction(action: string, args: ItemProperties): Promise<ItemProperties>
        {
            const guard: (ItemProperties) => boolean = props =>
            {
                return as.Bool(props[Pid.N3qAspect])
                    && as.String(props[Pid.Provider]) === this.id;
            };
            const clientItemIds = this.backpack.findItems(guard).map(item => ItemProperties.getId(item));
            if (clientItemIds.length === 0) {
                throw new ItemException(ItemException.Fact.NotExecuted, ItemException.Reason.NoClientItem, '');
            }
            const itemId = clientItemIds[0];

            return await this.itemAction(itemId, action, args, [itemId], true);
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
                        OwnerName: as.String(await Memory.getLocal(Utils.localStorageKey_Nickname())),
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

        private handleException(ex: any): never
        {
            if (!is.nil(ex.fact)) {
                throw new ItemException(ItemException.factFrom(ex.fact), ItemException.reasonFrom(ex.reason), ex.detail);
            } else {
                throw new ItemException(ItemException.Fact.UnknownError, ItemException.Reason.UnknownReason, as.String(ex.message, as.String(ex.status, '')));
            }
        }

        nicknameKnownByServer = '';
        avatarKnownByServer = '';
        stanzaOutFilter(stanza: ltx.Element): ltx.Element
        {
            if (!this.running || !this.userItemsLoaded || stanza.name !== 'presence') {
                return stanza;
            }
            const type = as.String(stanza.attrs['type'], 'available');
            if (type !== 'available') {
                return stanza;
            }

            const filter = stanzaChild => (stanzaChild.attrs == null) ? false : stanzaChild.attrs.xmlns === 'vp:props';
            const vpPropsNode = stanza.getChildren('x').find(filter);
            const attrs = vpPropsNode?.attrs;
            if (!attrs) {
                return stanza;
            }

            const vpNickname = as.String(attrs.Nickname);
            if (vpNickname !== '' && vpNickname !== this.nicknameKnownByServer) {
                this.nicknameKnownByServer = vpNickname;
                /* (intentionally async) */ this.sendNicknameToServer(vpNickname).catch(error =>
                {
                    log.info('HostedInventoryItemProvider.stanzaOutFilter', 'set nickname=', vpNickname, ' at server failed', error);
                });
            }

            const vpAvatar = as.String(attrs.AvatarUrl);
            if (vpAvatar !== '' && vpAvatar !== this.avatarKnownByServer) {
                this.avatarKnownByServer = vpAvatar;
                /* (intentionally async) */ this.sendAvatarToServer(vpAvatar).catch(error =>
                {
                    log.info('HostedInventoryItemProvider.stanzaOutFilter', 'set avatar=', vpAvatar, ' at server failed', error);
                });
            }

            return stanza;
        }

        async sendNicknameToServer(nickname: string)
        {
            const itemId = this.getGenericItemId();

            try {
                const result = await this.itemAction(
                    itemId,
                    'N3q.SetNickname',
                    {
                        Nickname: nickname,
                    },
                    [itemId],
                    true
                );

                return result;
            } catch (ex) {
                log.info('HostedInventoryItemProvider.sendNicknameToServer', 'set nickname at server failed', ex);
            }
        }

        async sendAvatarToServer(avatar: string)
        {
            const itemId = this.getGenericItemId();

            try {
                const result = await this.itemAction(
                    itemId,
                    'N3q.SetAvatar',
                    {
                        Avatar: avatar,
                    },
                    [itemId],
                    true
                );

                return result;
            } catch (ex) {
                log.info('HostedInventoryItemProvider.sendAvatarToServer', 'set avatar at server failed', ex);
            }
        }

        // -------------------- item cache ----------------------

        private itemCache = new Map<string, ItemCacheEntry>();
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
                        '(age=' + (now - this.itemCache.get(key).accessTime) / 1000 + ')', key);
                }
                this.itemCache.delete(key);
            }
        }

        private makeItemCacheKey(inventoryId: string, itemId: string): string { return `${inventoryId}:${itemId}` }

        // -------------------- Generic item loading ----------------------

        private getLoadedItemByInventoryItemId(itemDefinition: Readonly<ItemProperties>): null|Readonly<ItemProperties>
        {
            const itemId = ItemProperties.getId(itemDefinition);
            const version = ItemProperties.getVersion(itemDefinition);
            const inventoryId = ItemProperties.getInventoryId(itemDefinition);
            if (inventoryId === this.userId) {
                const itemLoaded = this.backpack.getItemOrNull(itemId)
                if (itemLoaded && (is.nil(version) || version <= ItemProperties.getVersion(itemLoaded))) {
                    return itemLoaded;
                }
                return null;
            }
            const cacheKey = this.makeItemCacheKey(inventoryId, itemId);
            const cacheEntry = this.itemCache.get(cacheKey);
            if (is.nil(cacheEntry)) {
                return null;
            }
            const itemLoaded = cacheEntry.getProperties();
            if (is.nil(version) || version <= ItemProperties.getVersion(itemLoaded)) {
                return itemLoaded;
            }
            return null;
        }

        private getItemsLoadedAndInventoryItemIdsToLoad(
            itemDefinitions: ItemProperties[]
        ): { itemsLoaded: ItemProperties[], itemsToLoadByInventory: Map<string, { itemId: string, cacheKey: string }[]> }
        {
            const { itemsLoaded, itemsToLoad } = this.getLoadedItemsByInventoryItemIds(itemDefinitions);
            const itemsToLoadByInventory = new Map<string, { itemId: string, cacheKey: string }[]>();
            for (const itemDefinition of itemsToLoad) {
                const itemId = ItemProperties.getId(itemDefinition);
                const inventoryId = ItemProperties.getInventoryId(itemDefinition);
                const cacheKey = this.makeItemCacheKey(inventoryId, itemId);
                const inventoryItemIds = itemsToLoadByInventory.get(inventoryId) ?? [];
                itemsToLoadByInventory.set(inventoryId, inventoryItemIds);
                inventoryItemIds.push({ itemId, cacheKey });
            }
            return { itemsLoaded, itemsToLoadByInventory };
        }

        private itemRequests = new Map<string, ((item?: ItemProperties) => void)[]>();

        private requestItemsFromServer(
            itemsToLoadByInventory: Map<string, { itemId: string, cacheKey: string }[]>
        ): Promise<ItemProperties[]>
        {
            const itemPromises: Promise<ItemProperties | null>[] = [];
            for (const [inventoryId, itemIdCacheKeys] of itemsToLoadByInventory) {
                const itemIdCacheKeysToRequest
                    = this.generateItemPromisesForInventoryItemsRequest(itemIdCacheKeys, itemPromises);
                if (itemIdCacheKeysToRequest.size !== 0) {
                    this.performInventoryItemsRequest(inventoryId, itemIdCacheKeysToRequest);
                }
            }
            const itemsPromise = Promise.all(itemPromises)
                .then((items: (ItemProperties | null)[]) => items.filter(item => !is.nil(item)));
            return itemsPromise;
        }

        private generateItemPromisesForInventoryItemsRequest(
            itemIdCacheKeys: { itemId: string, cacheKey: string }[], itemPromisesAccu: Promise<ItemProperties | null>[],
        ): Map<string, string>
        {
            const itemIdCacheKeysToRequest = new Map<string, string>();
            for (const { itemId, cacheKey } of itemIdCacheKeys) {
                let requestItemCallbacks = this.itemRequests.get(cacheKey);
                if (is.nil(requestItemCallbacks)) {
                    requestItemCallbacks = [];
                    this.itemRequests.set(cacheKey, requestItemCallbacks);
                    itemIdCacheKeysToRequest.set(itemId, cacheKey);
                }
                itemPromisesAccu.push(new Promise<ItemProperties | null>(resolve =>
                {
                    requestItemCallbacks.push(resolve);
                }));
            }
            return itemIdCacheKeysToRequest;
        }

        private performInventoryItemsRequest(inventoryId: string, itemIdCacheKeysToRequest: Map<string, string>): void
        {
            const itemIds = [...itemIdCacheKeysToRequest.keys()];
            const [userId, token] = [this.userId, this.accessToken];
            if (Utils.logChannel('HostedInventoryItemProviderItemCache', true)) {
                log.info('HostedInventoryItemProvider.performInventoryItemsRequest', { inventoryId, itemIds });
            }
            const request = new RpcProtocol.UserGetItemPropertiesRequest(userId, token, this.app.getLanguage(), inventoryId, itemIds);
            this.rpcClient.call(this.getConfig().itemApiUrl, request)
                .then(response => this.handleInventoryItemsResponse(
                    inventoryId, itemIdCacheKeysToRequest, <RpcProtocol.UserGetItemPropertiesResponse>response
                )).catch(error =>
                {
                    console.info('HostedInventoryItemProvider.performInventoryItemsRequest', { error });
                }).finally(() =>
                {
                    // Resolve remaining callbacks for which no item has been returned:
                    for (const cacheKey of itemIdCacheKeysToRequest.values()) {
                        const callbacks = this.itemRequests.get(cacheKey) ?? [];
                        this.itemRequests.delete(cacheKey);
                        callbacks.forEach(resolve => resolve(null));
                    }
                });
        }

        private handleInventoryItemsResponse(
            inventoryId: string,
            itemIdCacheKeysToRequest: Map<string, string>,
            response: RpcProtocol.UserGetItemPropertiesResponse,
        ): void
        {
            const logEnabled = Utils.logChannel('HostedInventoryItemProviderItemCache', true);
            const items = Object.values(response.multiItemProperties);
            if (logEnabled) {
                const msg = 'HostedInventoryItemProvider.handleInventoryItemsResponse: Loaded items.';
                log.info(msg, { inventoryId, items });
            }
            const isOwnBackpack = inventoryId === this.userId;

            for (const item of items) {
                const itemId = item[Pid.Id];
                const cacheKey = itemIdCacheKeysToRequest.get(itemId);
                itemIdCacheKeysToRequest.delete(itemId);

                if (!isOwnBackpack) {
                    const cacheEntry = new ItemCacheEntry(item);
                    this.itemCache.set(cacheKey, cacheEntry);
                }

                const callbacks = this.itemRequests.get(cacheKey) ?? [];
                this.itemRequests.delete(cacheKey);
                callbacks.forEach(resolve => resolve(item));
            }
            if (isOwnBackpack) {
                this.backpack.onItemUpdateFromProvider([...itemIdCacheKeysToRequest.keys()], items).then(() => {});
            }

            itemIdCacheKeysToRequest.forEach((cacheKey, itemId) =>
            {
                const callbacks = this.itemRequests.get(cacheKey) ?? [];
                this.itemRequests.delete(cacheKey);
                callbacks.forEach(resolve => resolve(null));
            });

            if (logEnabled && itemIdCacheKeysToRequest.size !== 0) {
                const itemIds = itemIdCacheKeysToRequest.keys();
                const msg = 'HostedInventoryItemProvider.handleInventoryItemsResponse: Some requested items don\'t exist or are invisible to this user!';
                log.info(msg, { inventoryId, itemIds });
            }
        }

    }
}
