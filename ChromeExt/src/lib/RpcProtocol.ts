import { ItemProperties } from './ItemProperties';

export class RpcProtocol
{
}

export namespace RpcProtocol
{
    export class Request
    {
        method: string;
    }

    export class Response
    {
        status: string;
        static status_ok = 'ok';
        static status_error = 'error';
        result: string;
        message: string;
    }

    export class BackpackRequest extends Request
    {
    }

    export class BackpackResponse extends Response
    {
    }

    export class BackpackActionRequest extends BackpackRequest
    {
        static method = 'ItemAction';
        user: string;
        item: string;
        room: string;
        action: string;
        args: any;
        items: { [id: string]: ItemProperties };
    }

    export class BackpackActionResponse extends BackpackResponse
    {
        created: { [id: string]: ItemProperties };
        changed: { [id: string]: ItemProperties };
        deleted: string[];
    }

    export class BackpackCreateRequest extends BackpackRequest
    {
        static method = 'CreateItem';
        user: string;
        template: string;
        args: ItemProperties;
    }

    export class BackpackCreateResponse extends BackpackResponse
    {
        properties: ItemProperties;
    }
}
