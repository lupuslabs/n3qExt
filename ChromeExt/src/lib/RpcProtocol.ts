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
        result: ItemProperties;
    }

    export class BackpackCreateRequest extends BackpackRequest
    {
        static method = 'CreateItem';
        user: string;
        template: string;
        args: ItemProperties;
    }

    export class BackpackCreateNftRequest extends BackpackRequest
    {
        static method = 'CreateNft';
        user: string;
        contractNetwork: string;
        contractAddress: string;
        tokenId: string;
        tokenUri: string;
    }

    export class BackpackCreateResponse extends BackpackResponse
    {
        properties: ItemProperties;
    }

    // --------------------------------------

    export class ItemApiRequest extends Request
    {
    }

    export class ItemApiResponse extends Response
    {
    }

    export class UserItemApiRequest extends ItemApiRequest
    {
        constructor(
            public user: string,
            public token: string,
        ) { super(); }
    }

    export class UserGetItemIdsRequest extends UserItemApiRequest
    {
        public readonly method = 'User.GetItemIds';
        constructor(
            user: string,
            token: string,
            public inventory: string,
        ) { super(user, token); }
    }
    export class UserGetItemIdsResponse extends ItemApiResponse
    {
        items: string[];
    }

    export class UserGetItemPropertiesRequest extends UserItemApiRequest
    {
        public readonly method = 'User.GetItemProperties';
        constructor(
            user: string,
            token: string,
            public inventory: string,
            public items: string[],
            ) { super(user, token); }
        }
    export class UserGetItemPropertiesResponse extends ItemApiResponse
    {
        multiItemProperties: { [id: string]: ItemProperties; };
    }

    export class UserItemActionRequest extends UserItemApiRequest
    {
        public readonly method = 'User.ItemAction';
        constructor(
            user: string,
            token: string,
            public item: string,
            public inventory: string,
            public action: string,
            public args: any,
            public involvedItems: string[],
            ) { super(user, token); }
    }
    export class UserItemActionResponse extends ItemApiResponse
    {
        created: string[];
        changed: string[];
        deleted: string[];
        result: ItemProperties;
    }

}
