import { ItemProperties } from './ItemProperties';
import { WeblinClientApi } from './WeblinClientApi';

export namespace WeblinClientPageApi
{
    export class Request extends WeblinClientApi.Request
    {
        constructor(type: string, id: string)
        {
            super(type, id);
        }
    }

    export class ItemFindRequest extends Request
    {
        static type = 'Item.Find';
        filter: ItemProperties;
    }
    export class ItemFindResponse extends WeblinClientApi.ContentResponse { constructor(public items: string[]) { super('Item.Find.Response'); } }
}
