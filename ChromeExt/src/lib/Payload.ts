import log = require('loglevel');
import { Utils } from './Utils';
import { SimpleRpc } from '../contentscript/SimpleRpc';

export class Payload
{
    static async getContextToken(api: string, user: string, item: string, ttlSec: number, payloadOptions: any, tokenOptions: any): Promise<string>
    {
        let expires = 10000000000 + ttlSec;
        var payload = {
            'user': user,
            'item': item,
            'entropy': Utils.randomString(20),
            'expires': expires
        };
        
        for (let key in payloadOptions) {
            payload[key] = payloadOptions[key];
        }

        // let hash = await this.getPayloadHash(api, payload);
        let hash = '_ignored';

        let token = {
            'payload': payload,
            'hash': hash
        }

        for (let key in tokenOptions) {
            token[key] = tokenOptions[key];
        }

        let tokenString = JSON.stringify(token);
        let tokenBase64Encoded = Utils.base64Encode(tokenString);
        return tokenBase64Encoded;
    }

    static async getPayloadHash(api: string, payload: any): Promise<string>
    {
        let response = await new SimpleRpc('getPayloadHash')
            .param('payload', payload)
            .send(api);
        if (response.ok) {
            return response.get('result', null);
        }
        throw response.message;
    }

}
