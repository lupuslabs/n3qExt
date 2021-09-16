import log = require('loglevel');
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
        if (Utils.logChannel('iframeApi', false)) {
            log.debug('IframeApi.onMessage', ev);
        }

        let request = <WeblinClientApi.Request>ev.data;

        if (request[Config.get('iframeApi.messageMagicW2WMigration', 'hbv67u5rf_w2wMigrate')]) {
            let cid = (<any>request).cid;
            if (cid) {
                let nickname = as.String((<any>request).nickname, cid);
                await this.handle_W2WMigration(cid, nickname);
            }
            return;
        }

        if (request[Config.get('iframeApi.messageMagicCreateCryptoWallet', 'tr67rftghg_CreateCryptoWallet')]) {
            let address = (<any>request).address;
            let network = (<any>request).network;
            if (address != null && network != null) {
                await this.handle_CreateCryptoWallet(address, network);
            }
            return;
        }

        if (request[Config.get('iframeApi.messageMagic', 'a67igu67puz_iframeApi')]) {
            if (request.type == WeblinClientApi.ClientNotificationRequest.type) {
                this.handle_ClientNotificationRequest(<WeblinClientApi.ClientNotificationRequest>request);
            } else if (request.type == WeblinClientApi.ClientCreateItemRequest.type) {
                this.handle_ClientCreateItemRequest(<WeblinClientApi.ClientCreateItemRequest>request);
            } else {
                await this.handle_IframeApi(<WeblinClientIframeApi.Request>request);
            }
        }

        if (request[Config.get('iframeApi.messageMagicPage', 'x7ft76zst7g_pageApi')]) {
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
            let props = await BackgroundMessage.createBackpackItemFromTemplate('Migration', { [Pid.MigrationCid]: cid });
            let itemId = props[Pid.Id];
            await BackgroundMessage.rezBackpackItem(itemId, this.app.getRoom().getJid(), x, this.app.getRoom().getDestination(), {});
            await BackgroundMessage.executeBackpackItemAction(itemId, 'Migration.CreateItems', {}, [itemId]);
            await BackgroundMessage.deleteBackpackItem(itemId, {});
        } catch (ex) {
            log.info('IframeApi.handle_W2WMigration', ex);
        }
    }

    async handle_CreateCryptoWallet(address: string, network: string)
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
            let props = await BackgroundMessage.createBackpackItemFromTemplate('CryptoWallet', { [Pid.Web3WalletAddress]: address, [Pid.Web3WalletNetwork]: network });
            let itemId = props[Pid.Id];
            await BackgroundMessage.rezBackpackItem(itemId, this.app.getRoom().getJid(), x, this.app.getRoom().getDestination(), {});
            await BackgroundMessage.loadWeb3BackpackItems();
        } catch (ex) {
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

            let props = await BackgroundMessage.createBackpackItemFromTemplate(request.template, request.args ?? {});
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
                case WeblinClientIframeApi.ClientLoadWeb3ItemsRequest.type: {
                    response = await this.handle_ClientLoadWeb3ItemsRequest(<WeblinClientIframeApi.ClientLoadWeb3ItemsRequest>request);
                } break;

                default: {
                    response = new WeblinClientApi.ErrorResponse('Unhandled request: ' + request.type);
                } break;
            }
        } catch (error) {
            response = new WeblinClientApi.ErrorResponse(error);
        }

        if (request.id) {
            let roomItem = this.app.getRoom().getItem(request.item);
            if (roomItem) {
                if (response == null) { response = new WeblinClientApi.SuccessResponse(); }
                response.id = request.id;
                roomItem.sendMessageToScriptFrame(response);
            }
        }
    }

    handle_CloseWindowRequest(request: WeblinClientIframeApi.WindowCloseRequest): WeblinClientApi.Response
    {
        let roomItem = this.app.getRoom().getItem(request.item);
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
            let item = this.app.getRoom().getItem(request.item);
            if (item) {
                item.setFrameVisibility(request.visible);
            }
            return new WeblinClientApi.SuccessResponse();
        } catch (ex) {
            log.info('IframeApi.handle_WindowSetVisibilityRequest', ex);
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
            let roomItem = this.app.getRoom().getItem(request.item);
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
            let roomItem = this.app.getRoom().getItem(request.item);
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
            let roomItem = this.app.getRoom().getItem(request.item);
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
            let roomItem = this.app.getRoom().getItem(request.item);
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
            let roomItem = this.app.getRoom().getItem(request.item);
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
            let roomItem = this.app.getRoom().getItem(itemId);
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
                let item = room.getItem(itemIds[i]);
                let itemData = {
                    id: item.getRoomNick(),
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

    handle_WindowOpenDocumentUrlRequest(request: WeblinClientIframeApi.WindowOpenDocumentUrlRequest): WeblinClientApi.Response
    {
        try {
            let roomItem = this.app.getRoom().getItem(request.item);
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

    handle_WindowPositionRequest(request: WeblinClientIframeApi.WindowPositionRequest): WeblinClientApi.Response
    {
        try {
            let roomItem = this.app.getRoom().getItem(request.item);
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
            let roomItem = this.app.getRoom().getItem(request.item);
            if (roomItem) {
                roomItem.toFrontFrame();
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
            let roomItem = this.app.getRoom().getItem(request.item);
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
            await BackgroundMessage.executeBackpackItemAction(itemId, actionName, args, involvedIds);
            await BackgroundMessage.pointsActivity(Pid.PointsChannelItemApply, 1);
            return new WeblinClientApi.SuccessResponse();
        } catch (error) {
            let fact = ItemException.factFrom(error.fact);
            let reason = ItemException.reasonFrom(error.reason);
            let detail = as.String(error.detail, error.message);
            let ex = new ItemException(fact, reason, detail);
            new ItemExceptionToast(this.app, Config.get('room.errorToastDurationSec', 8), ex).show();
            return new WeblinClientIframeApi.ItemErrorResponse(ItemException.fact2String(fact), ItemException.reason2String(reason), detail);
        }
    }
}


