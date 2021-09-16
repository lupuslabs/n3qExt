import { ItemProperties } from './ItemProperties';

export class VpProtocol
{
}

export namespace VpProtocol
{
    export class Response
    {
        static xmlns = 'vp:response';
        static key_to = 'to';
    }

    export class PrivateVideoconfRequest
    {
        static xmlns = 'vp:vidconf';
        static key_url = 'url';
    }

    export class PrivateVideoconfResponse
    {
        static key_type = 'type';
        static type_decline = 'decline';
        static key_comment = 'comment';
    }
}
