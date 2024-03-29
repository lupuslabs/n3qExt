import { ItemException } from './ItemException';
import { ItemProperties } from './ItemProperties';

export namespace WeblinClientApi
{
    export class Message { constructor(public type: string) { } }
    export class Request extends Message { constructor(type: string, public id: string) { super(type); } }
    export class Response extends Message { id: string; constructor(type: string, public ok: boolean) { super(type); } }
    export class ContentResponse extends Response { ok = true; constructor(type: string) { super(type, true); } }
    export class SuccessResponse extends Response { constructor() { super('Message.Success', true); } }
    export class ErrorResponse extends Response { constructor(public error: any) { super('Message.Error', false); } }

    export class ClientActiveMessage extends Message
    {
        active: boolean;
    
        constructor(active: boolean)
        { 
            super('Client.Active');
            this.active = active;
        }
    }

    export class ClientNotificationRequest extends Request
    {
        static type = 'Client.Notification';

        title: string;
        text: string;

        target?: 'currentTab' | 'notCurrentTab' | 'activeTab' | 'allTabs';
        static defaultTarget = 'currentTab';

        static iconType_warning = 'warning';
        static iconType_notice = 'notice';
        static iconType_question = 'question';
        iconType?: string;
        static defaultIcon = 'notice';

        links?: Array<any>;
        data?: any;
    }

    export class ClientItemExceptionRequest extends Request
    {
        static type = 'Client.ItemException';

        target?: 'currentTab' | 'notCurrentTab' | 'activeTab' | 'allTabs';
        static defaultTarget = 'currentTab';

        durationSec: number;
        ex: ItemException;

        links?: Array<any>;
    }

    export class ClientCreateItemRequest extends Request
    {
        static type = 'Client.CreateItem';
        provider: string;
        auth: string;
        template: string;
        rezz?: boolean;
        dx: number;
        args: ItemProperties;
    }
    export class ClientCreateItemResponse extends WeblinClientApi.ContentResponse
    {
        constructor(public itemId: string) { super('Client.CreateItem.Response'); }
    }

    export class ClientCreateAvatarRequest extends Request
    {
        static type = 'Client.CreateAvatar';
        provider: string;
        auth: string;
        label: string;
        imageUrl: string;
        width: number;
        height: number;
        avatarAnimationsUrl: string;
        useExisting?: boolean;
        activate?: boolean;
        rezz?: boolean;
        dx: number;
        args: ItemProperties;
    }
    export class ClientCreateAvatarResponse extends WeblinClientApi.ContentResponse
    {
        constructor(public itemId: string, public created: boolean, public activated: boolean) { super('Client.CreateAvatar.Response'); }
    }

    export class ClientGetApiRequest extends Request
    {
        static type = 'Client.GetApi';
        mode: 'page' | 'iframe';
    }
    export class ClientGetApiResponse extends WeblinClientApi.ContentResponse
    {
        constructor(public version: string, public api: string[]) { super('Client.GetApi.Response'); }
    }

    export class ItemFindRequest extends Request
    {
        static type = 'Item.Find';
        filter: ItemProperties;
    }
    export class ItemFindResponse extends WeblinClientApi.ContentResponse { constructor(public items: string[]) { super('Item.Find.Response'); } }
}
