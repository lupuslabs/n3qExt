import { ItemProperties } from './ItemProperties';
import { ItemUpdateSubscription } from './ItemUpdateSubscription'
import { WeblinClientApi } from './WeblinClientApi';

export namespace WeblinClientIframeApi
{
    // sendMessage(message: WeblinClientApi.Message)
    // {
    //     window.parent.postMessage({ 'message': message }, '*');
    // }

    export class Request extends WeblinClientApi.Request
    {
        constructor(type: string, id: string, public item?: string)
        {
            super(type, id);
        }
    }

    export class Response extends WeblinClientApi.Response
    {
        constructor(type: string)
        {
            super(type, true);
        }
    }

    export class ItemErrorResponse extends WeblinClientApi.Response
    {
        constructor(public fact: string, public reason: string, public detail: string)
        {
            super('Message.ItemError', false);
        }
    }

    export class WindowOpenDocumentUrlRequest extends Request
    {
        static type = 'Window.OpenDocumentUrl';
        declare item: string;
    }

    export class WindowCloseRequest extends Request
    {
        static type = 'Window.Close';
        declare item: string;
    }

    export class WindowSetVisibilityRequest extends Request
    {
        static type = 'Window.SetVisibility';
        declare item: string;
        visible: boolean;
    }

    export class WindowSetStyleRequest extends Request
    {
        static type = 'Window.SetStyle';
        declare item: string;
        style: any;
    }

    export class WindowPositionRequest extends Request
    {
        static type = 'Window.Position';
        declare item: string;
        width: number;
        height: number;
        left: number;
        bottom: number;
        options: any;
    }

    export class WindowToFrontRequest extends Request
    {
        static type = 'Window.ToFront';
        declare item: string;
        layer?: number;
    }

    export class WindowSetTitleRequest extends Request
    {
        static type = 'Window.SetTitle';
        declare item: string;
        title: string;
    }

    export class BackpackSetVisibilityRequest extends Request
    {
        static type = 'Backpack.SetVisibility';
        visible: boolean;
    }

    export class ScreenContentMessageRequest extends Request
    {
        static type = 'Screen.ContentMessage';
        declare item: string;
        message: any;
    }

    export class ItemSetPropertyRequest extends Request
    {
        static type = 'Item.SetProperty';
        declare item: string;
        pid: string;
        value: any;
    }

    export class ItemSetStateRequest extends Request
    {
        static type = 'Item.SetState';
        declare item: string;
        state: string;
    }

    export class ItemSetConditionRequest extends Request
    {
        static type = 'Item.SetCondition';
        declare item: string;
        condition: string;
    }

    export class ItemEffectRequest extends Request
    {
        static type = 'Item.Effect';
        declare item: string;
        effect: any;
    }

    export class ItemRangeRequest extends Request
    {
        static type = 'Item.Range';
        declare item: string;
        visible: boolean;
        range: any;
    }
    export class ItemActionRequest extends Request
    {
        static type = 'Item.Action';
        static legacyType = 'ItemAction';
        declare item: string;
        room: string;
        action: string;
        args: any;
        items: string[];
        ignoreError: boolean;
    }
    export class ItemActionResponse extends WeblinClientApi.ContentResponse
    {
        constructor(
            public result: ItemProperties,
        ) { super('Item.Action.Response'); }
    }

    export class RoomGetItemsRequest extends Request
    {
        static type = 'Room.GetItems';
        declare item: string;
        room: string;
        pids: string[];
    }
    export class ItemData
    {
        id: string;
        x: number;
        isOwn: boolean;
        properties: ItemProperties;
    }
    export class RoomGetItemsResponse extends WeblinClientApi.ContentResponse { constructor(public items: Array<WeblinClientIframeApi.ItemData>) { super('Room.Items'); } }

    export class RoomGetParticipantsRequest extends Request
    {
        static type = 'Room.GetParticipants';
        declare item: string;
        room: string;
    }
    export class ParticipantData
    {
        id: string;
        nickname: string;
        x: number;
        isSelf: boolean;
    }
    export class RoomGetParticipantsResponse extends WeblinClientApi.ContentResponse { constructor(public participants: Array<WeblinClientIframeApi.ParticipantData>) { super('Room.Participants'); } }

    export class RoomGetInfoRequest extends Request
    {
        static type = 'Room.GetInfo';
        declare item: string;
        room: string;
    }
    export class RoomInfo
    {
        jid: string;
        url: string;
        destination: string;
        userAvatarPosX: number;
    }
    export class RoomGetInfoResponse extends WeblinClientApi.ContentResponse { constructor(public info: RoomInfo) { super('Room.Info'); } }

    export class ItemSubscribeToUpdatesRequest extends Request
    {
        static type = 'Item.SubscribeToUpdates';
        declare item: string;
        subscriptions: Partial<ItemUpdateSubscription>[];
    }

    export class ItemGetPropertiesRequest extends Request
    {
        static type = 'Item.GetProperties';
        itemId: string;
        pids: string[];
    }
    export class ItemGetPropertiesResponse extends WeblinClientApi.ContentResponse { constructor(public properties: ItemProperties) { super('Item.Properties'); } }

    export class ParticipantEffectRequest extends Request
    {
        static type = 'Participant.Effect';
        participant?: string;
        effect: any;
    }

    export class ParticipantMovedNotification extends WeblinClientApi.Message { constructor(public participant: ParticipantData) { super('Participant.Moved'); } }

    export class ParticipantChatNotification extends WeblinClientApi.Message { constructor(public participant: ParticipantData, public text: string) { super('Participant.Chat'); } }

    export class ParticipantEventNotification extends WeblinClientApi.Message { constructor(public participant: ParticipantData, public data: any) { super('Participant.Event'); } }

    export class ItemMovedNotification extends WeblinClientApi.Message { constructor(public item: ItemData, public x: number) { super('Item.Moved'); } }

    export class ItemEventNotification extends WeblinClientApi.Message { constructor(public item: ItemData, public data: any) { super('Item.Event'); } }

    export class ItemPropertiesChangedNotification extends WeblinClientApi.Message { constructor(public itemId: string, public properties: ItemProperties) { super('Item.Properties'); } }

    export class ItemGoneNotification extends WeblinClientApi.Message { constructor(public itemId: string) { super('Item.Gone'); } }

    export class ClientNavigateRequest extends Request
    {
        static type = 'Client.Navigate';

        url: string;
        target: string;
    }

    export class ClientSendPresenceRequest extends Request
    {
        static type = 'Client.SendPresence';
    }

    export class ClientLoadWeb3ItemsRequest extends Request
    {
        static type = 'Client.LoadWeb3Items';
    }

    export class ClientCreateNftRequest extends Request
    {
        static type = 'Client.CreateNft';
        provider: string;
        auth: string;
        contractNetwork: string;
        contractAddress: string;
        tokenId: string;
        tokenUri: string;
        dx: number;
    }

    export class ClientOpenPrivateChatRequest extends Request
    {
        static type = 'Client.OpenPrivateChatRequest';
        userId: string;
    }

    export class ClientOpenPrivateVidconfRequest extends Request
    {
        static type = 'Client.OpenPrivateVidconfRequest';
        userId: string;
    }

    export class PageDomQueryRequest extends Request
    {
        static type = 'Page.DomQuery';
        cssPath: string;
        nodeAttr?: string;
        nodeText?: boolean;
    }
    export class PageDomQueryResponse extends WeblinClientApi.ContentResponse { constructor(public value: string) { super('Page.DomQuery.Response'); } }

    export const PersonItemApiRequestTypePrefix = 'PersonItemApi.'
    export class PersonItemApiShowProposeFriendshipToastRequest extends Request
    {
        static type = `${PersonItemApiRequestTypePrefix}ShowProposeFriendshipToast`
        constructor(id: string, public userId: string) {
            super(PersonItemApiShowProposeFriendshipToastRequest.type, id)
        }
    }
    export class PersonItemApiShowCancelFriendshipToastRequest extends Request
    {
        static type = `${PersonItemApiRequestTypePrefix}ShowCancelFriendshipToast`
        constructor(id: string, public userId: string) {
            super(PersonItemApiShowCancelFriendshipToastRequest.type, id)
        }
    }

    export class ClientBaseCssRequest extends Request
    {
        static type = 'Client.GetBaseCss'
    }
    export class ClientBaseCssResponse extends WeblinClientApi.ContentResponse
    {
        public css: string
        constructor(css: string) {
            super('Client.GetBaseCss.Response')
            this.css = css
        }
    }
    export class ClientThemeCssNotification extends WeblinClientApi.Message
    {
        public css: string
        constructor(css: string) {
            super('Client.ThemeCssNotification')
            this.css = css
        }
    }

}
