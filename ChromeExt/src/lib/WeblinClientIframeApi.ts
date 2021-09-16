import { ItemProperties } from './ItemProperties';
import { WeblinClientApi } from './WeblinClientApi';

export namespace WeblinClientIframeApi
{
    // sendMessage(message: WeblinClientApi.Message)
    // {
    //     window.parent.postMessage({ 'message': message }, '*');
    // }

    export class Request extends WeblinClientApi.Request
    {
        constructor(type: string, id: string, public item: string)
        {
            super(type, id);
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
        item: string;
    }

    export class WindowCloseRequest extends Request
    {
        static type = 'Window.Close';
        item: string;
    }

    export class WindowSetVisibilityRequest extends Request
    {
        static type = 'Window.SetVisibility';
        item: string;
        visible: boolean;
    }

    export class WindowPositionRequest extends Request
    {
        static type = 'Window.Position';
        item: string;
        width: number;
        height: number;
        left: number;
        bottom: number;
        options: any;
    }

    export class WindowToFrontRequest extends Request
    {
        static type = 'Window.ToFront';
        item: string;
    }

    export class BackpackSetVisibilityRequest extends Request
    {
        static type = 'Backpack.SetVisibility';
        visible: boolean;
    }

    export class ScreenContentMessageRequest extends Request
    {
        static type = 'Screen.ContentMessage';
        item: string;
        message: any;
    }

    export class ItemSetPropertyRequest extends Request
    {
        static type = 'Item.SetProperty';
        item: string;
        pid: string;
        value: any;
    }

    export class ItemSetStateRequest extends Request
    {
        static type = 'Item.SetState';
        item: string;
        state: string;
    }

    export class ItemSetConditionRequest extends Request
    {
        static type = 'Item.SetCondition';
        item: string;
        condition: string;
    }

    export class ItemEffectRequest extends Request
    {
        static type = 'Item.Effect';
        item: string;
        effect: any;
    }

    export class ItemRangeRequest extends Request
    {
        static type = 'Item.Range';
        item: string;
        visible: boolean;
        range: any;
    }

    export class ItemFindRequest extends Request
    {
        static type = 'Item.Find';
        filter: ItemProperties;
    }
    export class ItemFindResponse extends WeblinClientApi.ContentResponse { constructor(public items: string[]) { super('Item.Find.Response'); } }

    export class ItemActionRequest extends Request
    {
        static type = 'Item.Action';
        static legacyType = 'ItemAction';
        item: string;
        room: string;
        action: string;
        args: any;
        items: string[];
    }

    export class ItemActionResponse extends Response
    {
        created: { [id: string]: { [pid: string]: string } };
        changed: { [id: string]: { [pid: string]: string } };
        deleted: string[];
    }

    export class RoomGetItemsRequest extends Request
    {
        static type = 'Room.GetItems';
        item: string;
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
        item: string;
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
        item: string;
        room: string;
    }
    export class RoomInfo 
    {
        jid: string;
        url: string;
        destination: string;
    }
    export class RoomGetInfoResponse extends WeblinClientApi.ContentResponse { constructor(public info: RoomInfo) { super('Room.Info'); } }

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

    export class ClientNavigateRequest extends Request
    {
        static type = 'Client.Navigate';

        url: string;
        target: string;
    }

    export class ClientLoadWeb3ItemsRequest extends Request
    {
        static type = 'Client.LoadWeb3Items';
    }
}
