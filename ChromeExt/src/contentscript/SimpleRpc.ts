import { BackgroundMessage } from '../lib/BackgroundMessage';
import { as } from '../lib/as';
import { is } from '../lib/is'

export class SimpleRpcResponse
{
    constructor(public ok: boolean, public data: any, public message: string = null) { }

    get(key: string, defaultValue: any): any
    {
        if (this.data[key]) {
            return this.data[key];
        }
        return defaultValue;
    }
}

export class SimpleRpc
{
    constructor(public rpcMethod: string, public params: any = {})    { }

    method(method: string): SimpleRpc { this.rpcMethod = method; return this; }
    param(key: string, value: any): SimpleRpc { this.params[key] = value; return this; }

    async send(url: string): Promise<SimpleRpcResponse>
    {
        this.params['method'] = this.rpcMethod;
        let dataJson: string;
        try {
            dataJson = await BackgroundMessage.jsonRpc(url, this.params);
        } catch (errorResponse) {
            return new SimpleRpcResponse(false, {}, as.String(errorResponse.status, 'no-status') + ': ' + as.String(errorResponse.statusText, 'no-status-text'));
        }
        let dataParsed: unknown;
        try {
            dataParsed = JSON.parse(dataJson);
        } catch (parseError) {
            return new SimpleRpcResponse(false, {}, JSON.stringify(parseError));
        }
        if (!is.object(dataParsed)) {
            return new SimpleRpcResponse(false, {}, 'Result isn\'t an object!');
        }
        if (dataParsed.status !== 'ok') {
            const message = is.string(dataParsed.message) ? dataParsed.message : 'ok isn\'t true and message isn\'t a string!';
            return new SimpleRpcResponse(false, {}, message);
        }
        return new SimpleRpcResponse(true, dataParsed);
    }
}
