import log = require('loglevel');
import { as } from '../lib/as';
import { is } from '../lib/is';
import { xml, jid } from '@xmpp/client';
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

        constructor(private backpack: Backpack, private id, private providerDefinition: Definition) { }

        config(): Config
        {
            return this.providerDefinition.config;
        }

        async init(): Promise<void>
        {
            this.userId = await this.backpack.getUserId();
            this.accessToken = await this.backpack.getUserToken();

            try {

                let url = as.String(this.providerDefinition.configUrl, 'https://webit.vulcan.weblin.com/Config?user={user}&token={token}&client={client}')
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
                    this.providerDefinition.config = config;
                }
            } catch (error) {
                log.info('HostedInventoryItemProvider.init', error);
                throw error;
            }
        }

        async loadItems(): Promise<void>
        {
            await this.loadServerItems();

            if (Config.get('backpack.loadWeb3Items', false)) {
                await this.loadWeb3Items();
            }
        }

        public async getItemIds(): Promise<string[]>
        {
            let itemIds = [];
            try {
                let request = new RpcProtocol.UserGetItemIdsRequest(this.userId, this.accessToken, this.userId);
                const response = <RpcProtocol.UserGetItemIdsResponse>await this.rpcClient.call(this.config().itemApiUrl, request);
                itemIds = response.items;
            } catch (error) {
                // this.handleException(ex);
                throw error;
            }
            return itemIds;
        }

        async loadServerItems(): Promise<void>
        {
            let itemIds = await this.getItemIds();

            let multiItemProperties = {};
            if (itemIds.length > 0) {
                try {
                    const request = new RpcProtocol.UserGetItemPropertiesRequest(this.userId, this.accessToken, this.userId, itemIds);
                    const response = <RpcProtocol.UserGetItemPropertiesResponse>await this.rpcClient.call(this.config().itemApiUrl, request);
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
            let currentWeb3SyncedItemIds = this.backpack.findItems(props =>
            {
                return as.Bool(props[Pid.NftAspect], false) && as.Bool(props[Pid.NftSync], true);
            }).map(item => item.getProperties()[Pid.Id]);
            let unverifiedWeb3ItemIds = currentWeb3SyncedItemIds;

            let wallets = this.backpack.findItems(props => { return (as.Bool(props[Pid.Web3WalletAspect], false)); });
            if (wallets.length == 0) {
                if (Utils.logChannel('web3', true)) { log.info('HostedInventoryItemProvider.loadWeb3Items', 'No wallet item'); }
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
                this.deleteItem(unverifiedWeb3ItemIds[previouWeb3ItemIdsIdx], {});
            }
        }

        async loadWeb3ItemsForWallet(walletAddress: string, network: string): Promise<Array<string>>
        {
            if (walletAddress == '' || network == '') {
                log.info('HostedInventoryItemProvider.loadWeb3ItemsFromWallet', 'Missing walletAddress=', walletAddress, 'network=', network);
                return [];
            }

            let idsCreatedByWallet: Array<string> = [];

            try {
                let contractAddress = Config.get('web3.weblinItemContractAddess.' + network, '');
                let contractABI = Config.get('web3.weblinItemContractAbi', null);
                if (contractAddress == null || contractAddress == '' || contractABI == null) {
                    log.info('HostedInventoryItemProvider.loadWeb3ItemsForWallet', 'Missing contract config', 'contractAddress=', contractAddress, 'contractABI=', contractABI);
                } else {
                    let httpProvider = Config.get('web3.provider.' + network, '');
                    let idsCreatedByWalletAndContract = await this.loadWeb3ItemsForWalletFromContract(network, walletAddress, httpProvider, contractAddress, contractABI);
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
                        log.info('HostedInventoryItemProvider.loadWeb3ItemsForWallet', 'Missing contract config', 'contractAddress=', contractAddress, 'contractABI=', contractABI);
                    } else {
                        let httpProvider = Config.get('web3.provider.' + network, '');
                        let idsCreatedByWalletAndContract = await this.loadWeb3ItemsForWalletFromContract(network, walletAddress, httpProvider, contractAddress, contractABI);
                        for (let i = 0; i < idsCreatedByWalletAndContract.length; i++) {
                            idsCreatedByWallet.push(idsCreatedByWalletAndContract[i]);
                        }
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
            let numberOfItems = await contract.methods.balanceOf(walletAddress).call();
            for (let i = 0; i < numberOfItems; i++) {
                let tokenId = await contract.methods.tokenOfOwnerByIndex(walletAddress, i).call();
                let tokenUri = await contract.methods.tokenURI(tokenId).call();

                if (Config.get('config.clusterName', 'prod') == 'dev') {
                    tokenUri = tokenUri.replace('https://webit.vulcan.weblin.com/', 'https://localhost:5100/');
                    tokenUri = tokenUri.replace('https://item.weblin.com/', 'https://localhost:5100/');
                }

                let response = await fetch(tokenUri);

                if (!response.ok) {
                    log.info('HostedInventoryItemProvider.loadWeb3ItemsForWalletFromContract', 'fetch failed', 'tokenId', tokenId, 'tokenUri', tokenUri, response);
                } else {
                    const metadata = await response.json();

                    let ids = await this.getOrCreateWeb3ItemFromMetadata(network, walletAddress, contractAddress, tokenId, metadata);
                    for (let i = 0; i < ids.length; i++) {
                        createdIds.push(ids[i]);
                    }

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
                        return as.Bool(props[Pid.NftAspect], false) && as.Bool(props[Pid.ClaimAspect], false) && as.String(props[Pid.ClaimUrl], '') == domain;
                    });
                    if (existingItems.length == 0) {
                        try {
                            let props = await this.createItem(this.config().createItemWiCryptoClaimAuth, 'ByTemplate', data);
                            let itemId = props[Pid.Id];
                            knownIds.push();
                            if (Utils.logChannel('web3', true)) { log.info('HostedInventoryItemProvider.getOrCreateWeb3ItemFromMetadata', 'Creating', template, itemId, data); }
                        } catch (error) {
                            log.info(error);
                        }
                    } else {
                        for (let i = 0; i < existingItems.length; i++) {
                            let item = existingItems[i];
                            let itemId = item.getId();
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

        getGenericItemId(): string
        {
            let clientItemIds = this.backpack.findItems(
                props => { return (as.Bool(props[Pid.N3qAspect], false) && as.String(props[Pid.Provider]) == this.id); }
            ).map(item => item.getProperties()[Pid.Id]);

            if (clientItemIds.length == 0) { throw new ItemException(ItemException.Fact.NotCreated, ItemException.Reason.NoClientItem, ''); }

            return clientItemIds[0];
        }

        async applyItemToItem(activeId: string, passiveId: string): Promise<void>
        {
            try {
                await this.itemAction(
                    activeId,
                    'Applier.Apply',
                    { 'passive': passiveId },
                    [activeId, passiveId],
                    false
                );
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

        async itemAction(itemId: string, action: string, args: any, involvedIds: string[], allowUnrezzed: boolean): Promise<ItemProperties>
        {
            let createdIds = [];
            let deletedIds = [];
            let changedIds = [];
            let result = {};
            let multiItemProperties = {};
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
                request.responseMode = 'items';
                const response = <RpcProtocol.UserItemActionResponse>await this.rpcClient.call(this.config().itemApiUrl, request);

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
            //         const request = new RpcProtocol.UserGetItemPropertiesRequest(this.userId, this.accessToken, this.userId, changedOrCreated);
            //         const response = <RpcProtocol.UserGetItemPropertiesResponse>await this.rpcClient.call(this.config().itemApiUrl, request);
            //         multiItemProperties = response.multiItemProperties;
            //     } catch (ex) {
            //         this.handleException(ex);
            //     }
            // }

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

            return result;
        }

        async genericAction(action: string, args: ItemProperties): Promise<ItemProperties>
        {
            const guard: (ItemProperties) => boolean = props =>
            {
                return as.Bool(props[Pid.N3qAspect])
                    && as.String(props[Pid.Provider]) === this.id;
            };
            const clientItemIds = this.backpack.findItems(guard).map(item => item.getProperties()[Pid.Id]);
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

        private handleException(ex: any): never
        {
            if (!is.nil(ex.fact)) {
                throw new ItemException(ItemException.factFrom(ex.fact), ItemException.reasonFrom(ex.reason), ex.detail);
            } else {
                throw new ItemException(ItemException.Fact.UnknownError, ItemException.Reason.UnknownReason, as.String(ex.message, as.String(ex.status, '')));
            }
        }

        nicknameKnownByServer = '';
        stanzaOutFilter(stanza: xml): xml
        {
            if (stanza.name == 'presence') {
                if (as.String(stanza.attrs['type'], 'available') == 'available') {

                    const vpPropsNode = stanza.getChildren('x').find(stanzaChild => (stanzaChild.attrs == null) ? false : stanzaChild.attrs.xmlns === 'vp:props');
                    if (vpPropsNode) {
                        const attrs = vpPropsNode.attrs;
                        if (attrs) {
                            const vpNickname = as.String(attrs.Nickname);

                            if (vpNickname != '' && vpNickname != this.nicknameKnownByServer) {
                                try {
                                    /* (intentionally async) */ this.sendNicknameToServer(vpNickname);
                                    this.nicknameKnownByServer = vpNickname;
                                } catch (error) {
                                    log.info('HostedInventoryItemProvider.stanzaOutFilter', 'set nickname=', vpNickname, ' at server failed', error);
                                }
                            }
                        }
                    }

                }
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
                log.info('HostedInventoryItemProvider.sendNicknameToServer', 'set name at server failed', ex);
            }
        }

        getDependentPresence(itemId: string, roomJid: string): xml
        {
            let item = this.backpack.getItem(itemId);
            if (item == null) { throw new ItemException(ItemException.Fact.NotDerezzed, ItemException.Reason.ItemDoesNotExist, itemId); }

            const props = item.getProperties();
            var presence = xml('presence', { 'from': roomJid + '/' + as.String(props[Pid.InventoryId], '') + itemId });
            let attrs = {
                'xmlns': 'vp:props',
                'type': 'item',
                [Pid.Provider]: this.id,
                [Pid.Id]: itemId,
                [Pid.InventoryId]: as.String(props[Pid.InventoryId], ''),
                [Pid.Digest]: as.String(props[Pid.Digest], ''),
            };

            // const rezzedX = as.Int(props[Pid.RezzedX], -1);
            // if (rezzedX > 0) {
            //     attrs[Pid.RezzedX] = rezzedX;
            // }

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

        async onDependentPresence(itemId: string, roomJid: string, participantNick: string, dependentPresence: xml): Promise<void>
        {
            const vpProps = dependentPresence.getChildren('x').find(child => (child.attrs == null) ? false : child.attrs.xmlns === 'vp:props');
            if (vpProps) {
                dependentPresence.attrs._incomplete = true;

                if (this.backpack.isItem(itemId)) {
                    const backpackProps = this.backpack.getItem(itemId).getProperties();
                    this.completeDependentPresence(backpackProps, dependentPresence, vpProps);

                } else if (this.itemCache.has(itemId)) {
                    const inventoryId = as.String(vpProps.attrs[Pid.InventoryId], '');
                    const vpDigest = as.String(vpProps.attrs[Pid.Digest], '');
                    const cacheEntry = this.itemCache.get(itemId);

                    if (Utils.logChannel('HostedInventoryItemProviderItemCache', true)) {
                        let now = Date.now();
                        const cacheEntry = this.itemCache.get(itemId);
                        log.info('HostedInventoryItemProvider.onDependentPresence', 'access',
                            '(age=' + (now - this.itemCache.get(itemId).accessTime) / 1000 + ')',
                            itemId, cacheEntry.roomJid, cacheEntry.participantNick);
                    }

                    const cachedProps = cacheEntry.getProperties();
                    const cachedDigest = as.String(cachedProps[Pid.Digest], '');

                    let cacheIsGood = true;
                    if (vpDigest !== '' && cachedDigest !== '') {
                        if (vpDigest !== cachedDigest) {
                            cacheIsGood = false;
                        }
                    }

                    this.completeDependentPresence(cachedProps, dependentPresence, vpProps);

                    if (!cacheIsGood) {
                        this.requestItemPropertiesForDependentPresence(itemId, inventoryId, roomJid, participantNick);
                    }

                } else {
                    const inventoryId = as.String(vpProps.attrs[Pid.InventoryId], '');
                    this.requestItemPropertiesForDependentPresence(itemId, inventoryId, roomJid, participantNick);
                }
            }

            this.checkMaintainItemCache();
        }

        completeDependentPresence(props: ItemProperties, dependentPresence: xml, vpProps: any): void
        {
            delete dependentPresence.attrs._incomplete;
            for (let key in props) {
                vpProps.attrs[key] = props[key];
            }
        }

        private deferredItemPropertiesRequests = new Map<string, DeferredItemPropertiesRequest>();

        async requestItemPropertiesForDependentPresence(itemId: string, inventoryId: string, roomJid: string, participantNick: string): Promise<void>
        {
            if (inventoryId === '') { return; }
            if (this.itemRequests.has(itemId)) { return; }

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
                    this.rpcClient.call(this.config().itemApiUrl, request)
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
                                    log.info('HostedInventoryItemProvider.requestItemPropertiesForDependentPresence', 'set', id, cacheEntry.roomJid, cacheEntry.participantNick);
                                }

                                await this.forwardCachedProperties(id);
                            }
                        })
                        .catch(error =>
                        {
                            console.info('HostedInventoryItemProvider.requestItemPropertiesForDependentPresence', error);
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
