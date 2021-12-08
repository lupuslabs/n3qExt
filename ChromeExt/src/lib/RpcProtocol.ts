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

    export class InventoryRequest extends Request
    {
    }

    export class InventoryResponse extends Response
    {
    }

    export class UserGetItemIdsRequest extends InventoryRequest
    {
        public readonly method = 'User.GetItemIds';
        constructor(
            public user: string,
            public token: string,
        ) { super(); }
    }
    export class UserGetItemIdsResponse extends InventoryResponse
    {
        itemIds: string[];
    }

    export class UserGetItemPropertiesRequest extends InventoryRequest
    {
        public readonly method = 'User.GetItemProperties';
        constructor(
            public user: string,
            public token: string,
            public itemIds: string[],
        ) { super(); }
    }
    export class UserGetItemPropertiesResponse extends InventoryResponse
    {
        itemPropertySet: string[];
    }

    export class UserItemActionRequest extends InventoryRequest
    {
        public readonly method = 'User.ItemAction';
        constructor(
            public user: string,
            public token: string,
            public itemId: string,
            public action: string,
            public args: any,
            public itemIds: string[],
        ) { super(); }
    }
    export class UserItemActionResponse extends InventoryResponse
    {
        createdIds: string[];
        changedIds: string[];
        deletedIds: string[];
    }

}
