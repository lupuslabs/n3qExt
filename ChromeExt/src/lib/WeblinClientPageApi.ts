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
}
