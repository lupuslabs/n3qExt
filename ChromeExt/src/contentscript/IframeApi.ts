import log = require('loglevel');
import { is } from '../lib/is';
import { as } from '../lib/as';
import { BackgroundMessage } from '../lib/BackgroundMessage';
import { Config } from '../lib/Config';
import { ItemException } from '../lib/ItemException';
import { ItemProperties, ItemPropertiesSet, Pid } from '../lib/ItemProperties';
import { Utils } from '../lib/Utils';
import { WeblinClientApi } from '../lib/WeblinClientApi';
import { WeblinClientIframeApi } from '../lib/WeblinClientIframeApi';
import { WeblinClientPageApi } from '../lib/WeblinClientPageApi';
import { ContentApp } from './ContentApp';
import { ItemExceptionToast, SimpleErrorToast, SimpleToast } from './Toast';

export class IframeApi
{
    private messageHandler: (ev: any) => any;

    constructor(protected app: ContentApp) 
    {
    }

    start(): IframeApi
    {
        this.messageHandler = this.getMessageHandler();
        window.addEventListener('message', this.messageHandler)

        return this;
    }

    stop(): IframeApi
    {
        try {
            window.removeEventListener('message', this.messageHandler)
        } catch (error) {
            //            
        }

        return this;
    }

    getMessageHandler()
    {
        var self = this;
        function onMessageClosure(ev: any)
        {
            return self.onMessage(ev);
        }
        return onMessageClosure;
    }

    async onMessage(ev: any): Promise<any>
    {
        let request = <WeblinClientApi.Request>ev.data;

        if (request[Config.get('iframeApi.messageMagicW2WMigration', 'hbv67u5rf_w2wMigrate')]) {
            if (Utils.logChannel('iframeApi', false)) { log.debug('IframeApi.onMessage', ev); }
            let cid = (<any>request).cid;
            if (cid) {
                let nickname = as.String((<any>request).nickname, cid);
                await this.handle_W2WMigration(cid, nickname);
            }
            return;
        }

        if (request[Config.get('iframeApi.messageMagicCreateCryptoWallet', 'tr67rftghg_CreateCryptoWallet')]) {
            if (Utils.logChannel('iframeApi', false)) { log.debug('IframeApi.onMessage', ev); }
            let address = (<any>request).address;
            let network = (<any>request).network;
            let auth = (<any>request).auth;
            if (address != null && network != null) {
                await this.handle_CreateCryptoWallet(address, network, auth);
            }
            return;
        }

        if (request[Config.get('iframeApi.messageMagic', 'a67igu67puz_iframeApi')]) {
            if (Utils.logChannel('iframeApi', false)) { log.debug('IframeApi.onMessage', ev); }
            if (request.type == WeblinClientApi.ClientNotificationRequest.type) {
                this.handle_ClientNotificationRequest(<WeblinClientApi.ClientNotificationRequest>request);
            } else if (request.type == WeblinClientApi.ClientItemExceptionRequest.type) {
                this.handle_ClientItemExceptionRequest(<WeblinClientApi.ClientItemExceptionRequest>request);
            } else if (request.type == WeblinClientApi.ClientCreateItemRequest.type) {
                this.handle_ClientCreateItemRequest(<WeblinClientApi.ClientCreateItemRequest>request);
            } else {
                await this.handle_IframeApi(<WeblinClientIframeApi.Request>request);
            }
        }

        if (request[Config.get('iframeApi.messageMagicPage', 'x7ft76zst7g_pageApi')]) {
            if (Utils.logChannel('iframeApi', false)) { log.debug('IframeApi.onMessage', ev); }
            if (request.type == WeblinClientApi.ClientCreateItemRequest.type) {
                this.handle_ClientCreateItemRequest(<WeblinClientApi.ClientCreateItemRequest>request);
            } else {
                await this.handle_PageApi(<WeblinClientPageApi.Request>request);
            }
        }
    }

    async handle_W2WMigration(cid: string, nickname: string)
    {
        try {
            let name = Utils.randomString(29);
            let nick = this.app.getRoom().getMyNick();
            let participant = this.app.getRoom().getParticipant(nick);
            let x = participant.getPosition() + 120;
            let props = await BackgroundMessage.createBackpackItem(
                Config.get('iframeApi.w2WMigrationProvider', 'n3q'),
                Config.get('iframeApi.w2WMigrationAuth', 'JVxIJIdR9ueq7sJwwPmM'),
                'ByTemplate',
                { [Pid.Template]: 'Migration', [Pid.MigrationCid]: cid }
            );
            let itemId = props[Pid.Id];
            await BackgroundMessage.rezBackpackItem(itemId, this.app.getRoom().getJid(), x, this.app.getRoom().getDestination(), {});
            await BackgroundMessage.executeBackpackItemAction(itemId, 'Migration.CreateItems', {}, [itemId]);
            await BackgroundMessage.deleteBackpackItem(itemId, {});
        } catch (ex) {
            log.info('IframeApi.handle_W2WMigration', ex);
            new ItemExceptionToast(this.app, Config.get('room.errorToastDurationSec', 8), ex).show();
        }
    }

    async handle_CreateCryptoWallet(address: string, network: string, auth: string)
    {
        try {

            let propSet = await BackgroundMessage.findBackpackItemProperties({ [Pid.Web3WalletAspect]: 'true', [Pid.Web3WalletAddress]: address, [Pid.Web3WalletNetwork]: network });
            for (let id in propSet) {
                let toast = new SimpleToast(this.app, 'backpack-duplicateWalletItem', Config.get('room.errorToastDurationSec', 8), 'warning', 'Duplicate item', this.app.translateText('Toast.This would create an identical item')).show();
                return;
            }

            let nick = this.app.getRoom().getMyNick();
            let participant = this.app.getRoom().getParticipant(nick);
            let x = participant.getPosition() + 120;
            let props = await BackgroundMessage.createBackpackItem(
                Config.get('iframeApi.createCryptoWalletProvider', 'n3q'),
                auth,
                'ByTemplate',
                { [Pid.Template]: 'CryptoWallet', [Pid.Web3WalletAddress]: address, [Pid.Web3WalletNetwork]: network, }
            );
            let itemId = props[Pid.Id];
            await BackgroundMessage.rezBackpackItem(itemId, this.app.getRoom().getJid(), x, this.app.getRoom().getDestination(), {});
            await BackgroundMessage.loadWeb3BackpackItems();
        } catch (ex) {
            new ItemExceptionToast(this.app, Config.get('room.errorToastDurationSec', 8), ex).show();
            log.info('IframeApi.handle_CreateCryptoWallet', ex);
        }
    }

    async handle_PageApi(request: WeblinClientPageApi.Request)
    {
        let response: WeblinClientApi.Response = null;

        try {

            switch (request.type) {
                case WeblinClientPageApi.ItemFindRequest.type: {
                    response = await this.handle_ItemFindRequest(<WeblinClientPageApi.ItemFindRequest>request);
                } break;

                default: {
                    response = new WeblinClientApi.ErrorResponse('Unhandled request: ' + request.type);
                } break;
            }

        } catch (ex) {
            log.info('IframeApi.handle_PageApi', ex);
        }

        if (request.id) {
            if (response == null) { response = new WeblinClientApi.SuccessResponse(); }
            response.id = request.id;
            response[Config.get('iframeApi.messageMagic2Page', 'df7d86ozgh76_2pageApi')] = true;
            window.postMessage(response, '*');
        }
    }

    async handle_ClientCreateItemRequest(request: WeblinClientApi.ClientCreateItemRequest): Promise<WeblinClientApi.Response>
    {
        try {

            let args = request.args ?? {};
            args[Pid.Template] = request.template;
            let props = await BackgroundMessage.createBackpackItem(request.provider, request.auth, 'ByTemplate', args);
            let itemId = props[Pid.Id];

            let nick = this.app.getRoom().getMyNick();
            let participant = this.app.getRoom().getParticipant(nick);
            let x = participant.getPosition() + as.Int(request.dx, 120);
            await BackgroundMessage.rezBackpackItem(itemId, this.app.getRoom().getJid(), x, this.app.getRoom().getDestination(), {});

        } catch (error) {
            return new WeblinClientApi.ErrorResponse(error);
        }
    }

    async handle_ClientCreateNftRequest(request: WeblinClientIframeApi.ClientCreateNftRequest): Promise<WeblinClientApi.Response>
    {
        try {

            let args = new ItemProperties();
            args[Pid.NftNetwork] = request.contractNetwork;
            args[Pid.NftContract] = request.contractAddress;
            args[Pid.NftTokenId] = request.tokenId;
            args[Pid.NftTokenUri] = request.tokenUri;
            let props = await BackgroundMessage.createBackpackItem(request.provider, request.auth, 'ByNft', args);
            let itemId = props[Pid.Id];

            let nick = this.app.getRoom().getMyNick();
            let participant = this.app.getRoom().getParticipant(nick);
            let x = participant.getPosition() + as.Int(request.dx, 120);
            await BackgroundMessage.rezBackpackItem(itemId, this.app.getRoom().getJid(), x, this.app.getRoom().getDestination(), {});

        } catch (error) {
            return new WeblinClientApi.ErrorResponse(error);
        }
    }

    async handle_ItemFindRequest(request: WeblinClientPageApi.ItemFindRequest): Promise<WeblinClientApi.Response>
    {
        try {

            let propSet = await BackgroundMessage.findBackpackItemProperties(request.filter);

            let items = [];
            for (let id in propSet) {
                items.push(id);
            }
            return new WeblinClientPageApi.ItemFindResponse(items);

        } catch (error) {
            return new WeblinClientApi.ErrorResponse(error);
        }
    }

    async handle_IframeApi(request: WeblinClientIframeApi.Request)
    {
        let response: WeblinClientApi.Response = null;

        try {

            switch (request.type) {
                case WeblinClientIframeApi.ItemActionRequest.legacyType:
                case WeblinClientIframeApi.ItemActionRequest.type: {
                    response = await this.handle_ItemActionRequest(<WeblinClientIframeApi.ItemActionRequest>request);
                } break;
                case WeblinClientIframeApi.ItemGetPropertiesRequest.type: {
                    response = this.handle_ItemGetPropertiesRequest(<WeblinClientIframeApi.ItemGetPropertiesRequest>request);
                } break;
                case WeblinClientIframeApi.ItemSetPropertyRequest.type: {
                    response = this.handle_ItemSetPropertyRequest(<WeblinClientIframeApi.ItemSetPropertyRequest>request);
                } break;
                case WeblinClientIframeApi.ItemSetStateRequest.type: {
                    response = this.handle_ItemSetStateRequest(<WeblinClientIframeApi.ItemSetStateRequest>request);
                } break;
                case WeblinClientIframeApi.ItemSetConditionRequest.type: {
                    response = this.handle_ItemSetConditionRequest(<WeblinClientIframeApi.ItemSetConditionRequest>request);
                } break;
                case WeblinClientIframeApi.ItemEffectRequest.type: {
                    response = this.handle_ItemEffectRequest(<WeblinClientIframeApi.ItemEffectRequest>request);
                } break;
                case WeblinClientIframeApi.ItemRangeRequest.type: {
                    response = this.handle_ItemRangeRequest(<WeblinClientIframeApi.ItemRangeRequest>request);
                } break;
                case WeblinClientPageApi.ItemFindRequest.type: {
                    response = await this.handle_ItemFindRequest(<WeblinClientIframeApi.ItemFindRequest>request);
                } break;

                case WeblinClientIframeApi.ParticipantEffectRequest.type: {
                    response = this.handle_ParticipantEffectRequest(<WeblinClientIframeApi.ParticipantEffectRequest>request);
                } break;

                case WeblinClientIframeApi.RoomGetParticipantsRequest.type: {
                    response = this.handle_RoomGetParticipantsRequest(<WeblinClientIframeApi.RoomGetParticipantsRequest>request);
                } break;
                case WeblinClientIframeApi.RoomGetItemsRequest.type: {
                    response = this.handle_RoomGetItemsRequest(<WeblinClientIframeApi.RoomGetItemsRequest>request);
                } break;
                case WeblinClientIframeApi.RoomGetInfoRequest.type: {
                    response = this.handle_RoomGetInfoRequest(<WeblinClientIframeApi.RoomGetInfoRequest>request);
                } break;

                case WeblinClientIframeApi.ScreenContentMessageRequest.type: {
                    response = this.handle_ScreenContentMessageRequest(<WeblinClientIframeApi.ScreenContentMessageRequest>request);
                } break;
                case WeblinClientIframeApi.WindowOpenDocumentUrlRequest.type: {
                    response = this.handle_WindowOpenDocumentUrlRequest(<WeblinClientIframeApi.WindowOpenDocumentUrlRequest>request);
                } break;

                case WeblinClientIframeApi.WindowCloseRequest.type: {
                    response = this.handle_CloseWindowRequest(<WeblinClientIframeApi.WindowCloseRequest>request);
                } break;
                case WeblinClientIframeApi.WindowSetVisibilityRequest.type: {
                    response = this.handle_WindowSetVisibilityRequest(<WeblinClientIframeApi.WindowSetVisibilityRequest>request);
                } break;
                case WeblinClientIframeApi.WindowSetStyleRequest.type: {
                    response = this.handle_WindowSetStyleRequest(<WeblinClientIframeApi.WindowSetStyleRequest>request);
                } break;
                case WeblinClientIframeApi.WindowPositionRequest.type: {
                    response = this.handle_WindowPositionRequest(<WeblinClientIframeApi.WindowPositionRequest>request);
                } break;
                case WeblinClientIframeApi.WindowToFrontRequest.type: {
                    response = this.handle_WindowToFrontRequest(<WeblinClientIframeApi.WindowToFrontRequest>request);
                } break;

                case WeblinClientIframeApi.BackpackSetVisibilityRequest.type: {
                    response = this.handle_BackpackSetVisibilityRequest(<WeblinClientIframeApi.BackpackSetVisibilityRequest>request);
                } break;

                case WeblinClientIframeApi.ClientNavigateRequest.type: {
                    response = this.handle_ClientNavigateRequest(<WeblinClientIframeApi.ClientNavigateRequest>request);
                } break;
                case WeblinClientIframeApi.ClientSendPresenceRequest.type: {
                    response = this.handle_ClientSendPresenceRequest(<WeblinClientIframeApi.ClientSendPresenceRequest>request);
                } break;
                case WeblinClientIframeApi.ClientLoadWeb3ItemsRequest.type: {
                    response = await this.handle_ClientLoadWeb3ItemsRequest(<WeblinClientIframeApi.ClientLoadWeb3ItemsRequest>request);
                } break;
                case WeblinClientIframeApi.ClientCreateNftRequest.type: {
                    response = await this.handle_ClientCreateNftRequest(<WeblinClientIframeApi.ClientCreateNftRequest>request);
                } break;

                case WeblinClientIframeApi.PageDomQueryRequest.type: {
                    response = this.handle_PageDomQueryRequest(<WeblinClientIframeApi.PageDomQueryRequest>request);
                } break;

                default: {
                    response = new WeblinClientApi.ErrorResponse('Unhandled request: ' + request.type);
                } break;
            }
        } catch (error) {
            response = new WeblinClientApi.ErrorResponse(error);
        }

        if (request.id) {
            let roomItem = this.app.getRoom().getItemByItemId(request.item);
            if (roomItem) {
                if (response == null) { response = new WeblinClientApi.SuccessResponse(); }
                response.id = request.id;
                roomItem.sendMessageToScriptFrame(response);
            }
        }
    }

    handle_CloseWindowRequest(request: WeblinClientIframeApi.WindowCloseRequest): WeblinClientApi.Response
    {
        let roomItem = this.app.getRoom().getItemByItemId(request.item);
        try {
            if (roomItem) {
                roomItem.closeFrame();
            }
            return new WeblinClientApi.SuccessResponse();
        } catch (ex) {
            log.info('IframeApi.handle_CloseWindowRequest', ex);
            return new WeblinClientApi.ErrorResponse(ex);
        }
    }

    handle_WindowSetVisibilityRequest(request: WeblinClientIframeApi.WindowSetVisibilityRequest): WeblinClientApi.Response
    {
        try {
            let item = this.app.getRoom().getItemByItemId(request.item);
            if (item) {
                item.setFrameVisibility(request.visible);
            }
            return new WeblinClientApi.SuccessResponse();
        } catch (ex) {
            log.info('IframeApi.handle_WindowSetVisibilityRequest', ex);
            return new WeblinClientApi.ErrorResponse(ex);
        }
    }

    handle_WindowSetStyleRequest(request: WeblinClientIframeApi.WindowSetStyleRequest): WeblinClientApi.Response
    {
        try {
            let item = this.app.getRoom().getItemByItemId(request.item);
            if (item) {
                item.setWindowStyle(request.style);
            }
            return new WeblinClientApi.SuccessResponse();
        } catch (ex) {
            log.info('IframeApi.handle_WindowSetStyleRequest', ex);
            return new WeblinClientApi.ErrorResponse(ex);
        }
    }

    handle_BackpackSetVisibilityRequest(request: WeblinClientIframeApi.BackpackSetVisibilityRequest): WeblinClientApi.Response
    {
        try {
            let nick = this.app.getRoom().getMyNick();
            let participant = this.app.getRoom().getParticipant(nick);
            if (participant) {
                this.app.showBackpackWindow(participant.getElem());
            }
            return new WeblinClientApi.SuccessResponse();
        } catch (ex) {
            log.info('IframeApi.handle_BackpackSetVisibilityRequest', ex);
            return new WeblinClientApi.ErrorResponse(ex);
        }
    }

    handle_ItemSetPropertyRequest(request: WeblinClientIframeApi.ItemSetPropertyRequest): WeblinClientApi.Response
    {
        try {
            let roomItem = this.app.getRoom().getItemByItemId(request.item);
            if (roomItem) {
                roomItem.setItemProperty(request.pid, request.value);
            }
            return new WeblinClientApi.SuccessResponse();
        } catch (ex) {
            log.info('IframeApi.handle_ItemSetPropertyRequest', ex);
            return new WeblinClientApi.ErrorResponse(ex);
        }
    }

    handle_ItemSetStateRequest(request: WeblinClientIframeApi.ItemSetStateRequest): WeblinClientApi.Response
    {
        try {
            let roomItem = this.app.getRoom().getItemByItemId(request.item);
            if (roomItem) {
                roomItem.setItemState(request.state);
            }
            return new WeblinClientApi.SuccessResponse();
        } catch (ex) {
            log.info('IframeApi.handle_ItemSetStateRequest', ex);
            return new WeblinClientApi.ErrorResponse(ex);
        }
    }

    handle_ItemSetConditionRequest(request: WeblinClientIframeApi.ItemSetConditionRequest): WeblinClientApi.Response
    {
        try {
            let roomItem = this.app.getRoom().getItemByItemId(request.item);
            if (roomItem) {
                roomItem.setItemCondition(request.condition);
            }
            return new WeblinClientApi.SuccessResponse();
        } catch (ex) {
            log.info('IframeApi.handle_ItemSetConditionRequest', ex);
            return new WeblinClientApi.ErrorResponse(ex);
        }
    }

    handle_ItemEffectRequest(request: WeblinClientIframeApi.ItemEffectRequest): WeblinClientApi.Response
    {
        try {
            let roomItem = this.app.getRoom().getItemByItemId(request.item);
            if (roomItem) {
                roomItem.showEffect(request.effect);
            }
            return new WeblinClientApi.SuccessResponse();
        } catch (ex) {
            log.info('IframeApi.handle_ItemEffectRequest', ex);
            return new WeblinClientApi.ErrorResponse(ex);
        }
    }

    handle_ClientNavigateRequest(request: WeblinClientIframeApi.ClientNavigateRequest): WeblinClientApi.Response
    {
        try {
            this.app.navigate(as.String(request.url, ''), as.String(request.target, '_top'));
            return new WeblinClientApi.SuccessResponse();
        } catch (ex) {
            log.info('IframeApi.handle_ClientNavigateRequest', ex);
            return new WeblinClientApi.ErrorResponse(ex);
        }
    }

    handle_ClientSendPresenceRequest(request: WeblinClientIframeApi.ClientSendPresenceRequest): WeblinClientApi.Response
    {
        try {
            this.app.getRoom().sendPresence();
        } catch (ex) {
            log.info('IframeApi.handle_ClientSendPresenceRequest', ex);
            return new WeblinClientApi.ErrorResponse(ex);
        }
    }

    async handle_ClientLoadWeb3ItemsRequest(request: WeblinClientIframeApi.ClientLoadWeb3ItemsRequest): Promise<WeblinClientApi.Response>
    {
        try {
            await BackgroundMessage.loadWeb3BackpackItems();
            return new WeblinClientApi.SuccessResponse();
        } catch (ex) {
            log.info('IframeApi.handle_ClientLoadWeb3ItemsRequest', ex);
            return new WeblinClientApi.ErrorResponse(ex);
        }
    }

    handle_ItemRangeRequest(request: WeblinClientIframeApi.ItemRangeRequest): WeblinClientApi.Response
    {
        try {
            let roomItem = this.app.getRoom().getItemByItemId(request.item);
            if (roomItem) {
                roomItem.showItemRange(request.visible, request.range);
            }
            return new WeblinClientApi.SuccessResponse();
        } catch (ex) {
            log.info('IframeApi.handle_ItemRangeRequest', ex);
            return new WeblinClientApi.ErrorResponse(ex);
        }
    }

    handle_ItemGetPropertiesRequest(request: WeblinClientIframeApi.ItemGetPropertiesRequest): WeblinClientApi.Response
    {
        try {
            let itemId = as.String(request.itemId, request.item);
            let roomItem = this.app.getRoom().getItemByItemId(itemId);
            if (roomItem) {
                return new WeblinClientIframeApi.ItemGetPropertiesResponse(roomItem.getProperties(request.pids));
            } else {
                return new WeblinClientApi.ErrorResponse('No such item');
            }
        } catch (ex) {
            log.info('IframeApi.handle_ItemGetPropertiesRequest', ex);
            return new WeblinClientApi.ErrorResponse(ex);
        }
    }

    handle_ParticipantEffectRequest(request: WeblinClientIframeApi.ParticipantEffectRequest): WeblinClientApi.Response
    {
        try {
            let participantId = request.participant;
            if (participantId == null) {
                participantId = this.app.getRoom().getMyNick();
            }
            let participant = this.app.getRoom().getParticipant(participantId);
            if (participant) {
                participant.showEffect(request.effect);
            }
            return new WeblinClientApi.SuccessResponse();
        } catch (ex) {
            log.info('IframeApi.handle_ParticipantEffectRequest', ex);
            return new WeblinClientApi.ErrorResponse(ex);
        }
    }

    handle_RoomGetParticipantsRequest(request: WeblinClientIframeApi.RoomGetParticipantsRequest): WeblinClientApi.Response
    {
        try {
            let data = new Array<WeblinClientIframeApi.ParticipantData>();
            let room = this.app.getRoom();
            let itemId = request.item;

            let participantIds = room.getParticipantIds();
            for (let i = 0; i < participantIds.length; i++) {
                let participant = room.getParticipant(participantIds[i]);
                let participantData = {
                    id: participant.getRoomNick(),
                    nickname: participant.getDisplayName(),
                    x: participant.getPosition(),
                    isSelf: participant.getIsSelf(),
                };
                data.push(participantData);
            }

            return new WeblinClientIframeApi.RoomGetParticipantsResponse(data);
        } catch (ex) {
            log.info('IframeApi.handle_RoomGetParticipantsRequest', ex);
            return new WeblinClientApi.ErrorResponse(ex);
        }
    }

    handle_RoomGetItemsRequest(request: WeblinClientIframeApi.RoomGetItemsRequest): WeblinClientApi.Response
    {
        try {
            let data = new Array<WeblinClientIframeApi.ItemData>();
            let room = this.app.getRoom();
            let itemId = request.item;
            let pids = request.pids;

            let itemIds = room.getItemIds();
            for (let i = 0; i < itemIds.length; i++) {
                let item = room.getItemByItemId(itemIds[i]);
                let itemData = {
                    id: item.getItemId(),
                    x: item.getPosition(),
                    isOwn: item.isMyItem(),
                    properties: item.getProperties(pids),
                };
                data.push(itemData);
            }

            return new WeblinClientIframeApi.RoomGetItemsResponse(data);
        } catch (ex) {
            log.info('IframeApi.handle_RoomGetItemsRequest', ex);
            return new WeblinClientApi.ErrorResponse(ex);
        }
    }

    handle_RoomGetInfoRequest(request: WeblinClientIframeApi.RoomGetInfoRequest): WeblinClientApi.Response
    {
        try {
            let data = new WeblinClientIframeApi.RoomInfo();
            let room = this.app.getRoom();

            data.destination = room.getDestination();
            data.jid = room.getJid();
            data.url = room.getPageUrl();

            return new WeblinClientIframeApi.RoomGetInfoResponse(data);
        } catch (ex) {
            log.info('IframeApi.handle_RoomGetParticipantsRequest', ex);
            return new WeblinClientApi.ErrorResponse(ex);
        }
    }

    handle_PageDomQueryRequest(request: WeblinClientIframeApi.PageDomQueryRequest): WeblinClientApi.Response
    {
        try {

            // Only for authorized domains
            let room = this.app.getRoom();
            let pageUrl = room.getPageUrl();
            let allowed = false;
            let allowedDomQueryPrefixes = Config.get('iframeApi.allowedDomQueryPrefixes', []);
            for (let i = 0; i < allowedDomQueryPrefixes.length; i++) {
                if (pageUrl.startsWith(allowedDomQueryPrefixes[i])) {
                    allowed = true;
                }
            }

            if (allowed) {
                let elem = $(request.cssPath);
                // let value = 'https://lh3.googleusercontent.com/tg2iTTJfzse42K84tlpf1QiEqQW2gGifFReeiWb-c6xBAlAu4bkh_7X407ge1nkw2k_OO3v9SliYloEPmZ9Cd7eq_44eKe5OVVT7PA=w600';
                let value = '';
                if (request.nodeAttr) {
                    value = elem.attr(request.nodeAttr);
                } else if (request.nodeText) {
                    value = elem.text();
                }
                return new WeblinClientIframeApi.PageDomQueryResponse(value);
            }
            throw 'forbidden';

        } catch (ex) {
            log.info('IframeApi.handle_PageDomQueryRequest', ex);
            return new WeblinClientApi.ErrorResponse(ex);
        }
    }

    handle_WindowOpenDocumentUrlRequest(request: WeblinClientIframeApi.WindowOpenDocumentUrlRequest): WeblinClientApi.Response
    {
        try {
            let roomItem = this.app.getRoom().getItemByItemId(request.item);
            if (roomItem) {
                roomItem.openDocumentUrl(roomItem.getElem());
            }
            return new WeblinClientApi.SuccessResponse();
        } catch (ex) {
            log.info('IframeApi.handle_WindowOpenDocumentUrlRequest', ex);
            return new WeblinClientApi.ErrorResponse(ex);
        }
    }

    handle_ClientNotificationRequest(request: WeblinClientApi.ClientNotificationRequest): WeblinClientApi.Response
    {
        try {
            BackgroundMessage.clientNotification(as.String(request.target, 'notCurrentTab'), request);
            return new WeblinClientApi.SuccessResponse();
        } catch (ex) {
            log.info('IframeApi.handle_ClientNotificationRequest', ex);
            return new WeblinClientApi.ErrorResponse(ex);
        }
    }

    handle_ClientItemExceptionRequest(request: WeblinClientApi.ClientItemExceptionRequest): WeblinClientApi.Response
    {
        try {
            new ItemExceptionToast(this.app, request.durationSec, request.ex).show();
            return new WeblinClientApi.SuccessResponse();
        } catch (ex) {
            log.info('IframeApi.handle_ClientItemExceptionRequest', ex);
            return new WeblinClientApi.ErrorResponse(ex);
        }
    }

    handle_WindowPositionRequest(request: WeblinClientIframeApi.WindowPositionRequest): WeblinClientApi.Response
    {
        try {
            let roomItem = this.app.getRoom().getItemByItemId(request.item);
            if (roomItem) {
                roomItem.positionFrame(request.width, request.height, request.left, request.bottom, request.options);
            }
            return new WeblinClientApi.SuccessResponse();
        } catch (ex) {
            log.info('IframeApi.handle_PositionWindowRequest', ex);
            return new WeblinClientApi.ErrorResponse(ex);
        }
    }

    handle_WindowToFrontRequest(request: WeblinClientIframeApi.WindowToFrontRequest): WeblinClientApi.Response
    {
        try {
            let roomItem = this.app.getRoom().getItemByItemId(request.item);
            if (roomItem) {
                let layer = request.layer;
                if (!is.string(layer)) {
                    layer = undefined;
                }
                roomItem.toFrontFrame(layer);
            }
            return new WeblinClientApi.SuccessResponse();
        } catch (ex) {
            log.info('IframeApi.handle_WindowToFrontRequest', ex);
            return new WeblinClientApi.ErrorResponse(ex);
        }
    }

    handle_ScreenContentMessageRequest(request: WeblinClientIframeApi.ScreenContentMessageRequest): WeblinClientApi.Response
    {
        try {
            let roomItem = this.app.getRoom().getItemByItemId(request.item);
            if (roomItem) {
                roomItem.sendMessageToScreenItemFrame(request.message);
            }
            return new WeblinClientApi.SuccessResponse();
        } catch (ex) {
            log.info('IframeApi.handle_ScreenContentMessageRequest', ex);
            return new WeblinClientApi.ErrorResponse(ex);
        }
    }

    async handle_ItemActionRequest(request: WeblinClientIframeApi.ItemActionRequest): Promise<WeblinClientApi.Response>
    {
        try {
            let itemId = request.item;
            let actionName = request.action;
            let args = request.args;
            let involvedIds = [itemId];
            if (request.items) {
                for (let i = 0; i < request.items.length; i++) {
                    let id = request.items[i];
                    involvedIds.push(id);
                    if (!involvedIds.includes(id)) {
                        involvedIds.push(id);
                    }
                }
            }
            let result = await BackgroundMessage.executeBackpackItemAction(itemId, actionName, args, involvedIds);
            await BackgroundMessage.pointsActivity(Pid.PointsChannelItemApply, 1);

            return new WeblinClientIframeApi.ItemActionResponse(result);
        } catch (error) {
            let fact = ItemException.factFrom(error.fact);
            let reason = ItemException.reasonFrom(error.reason);
            let detail = as.String(error.detail, error.message);
            let ex = new ItemException(fact, reason, detail);
            if (request.ignoreError) {
                log.info('IframeApi.handle_ItemActionRequest', error);
            } else {
                new ItemExceptionToast(this.app, Config.get('room.errorToastDurationSec', 8), ex).show();
            }
            return new WeblinClientIframeApi.ItemErrorResponse(ItemException.fact2String(fact), ItemException.reason2String(reason), detail);
        }
    }
}


