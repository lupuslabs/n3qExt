import log = require('loglevel');
import { Utils } from './Utils';
import { SimpleRpc } from '../contentscript/SimpleRpc';

export class Payload
{
    static async getContextToken(user: string, itemId: string, lang: string, ttlSec: number, payloadOptions: any, tokenOptions: any): Promise<string>
    {
        const payload = {
            'user': user,
            'item': itemId,
            'lang': lang,
            'entropy': Utils.randomString(20),
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
}
