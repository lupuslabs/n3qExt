import { ItemProperties } from './ItemProperties';

export namespace WeblinClientApi
{
    export class Message { constructor(public type: string) { } }
    export class Request extends Message { constructor(type: string, public id: string) { super(type); } }
    export class Response extends Message { id: string; constructor(type: string, public ok: boolean) { super(type); } }
    export class ContentResponse extends Response { ok = true; constructor(type: string) { super(type, true); } }
    export class SuccessResponse extends Response { constructor() { super('Message.Success', true); } }
    export class ErrorResponse extends Response { constructor(public error: any) { super('Message.Error', false); } }

    export class ClientNotificationRequest extends Request
    {
        static type = 'Client.Notification';

        title: string;
        text: string;

        target?: string; // ['currentTab'|'notCurrentTab'|'activeTab'|'allTabs']
        static defaultTarget = 'currentTab';

        static iconType_warning = 'warning';
        static iconType_notice = 'notice';
        static iconType_question = 'question';
        iconType?: string;
        static defaultIcon = 'notice';

        links?: Array<any>;
        detail?: any;
    }

    export class ClientCreateItemRequest extends Request
    {
        static type = 'Client.CreateItem';
        template: string;
        dx: number;
        args: ItemProperties;        
    }
}
