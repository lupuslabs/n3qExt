import log = require('loglevel');
import { Config } from './Config';
import { RpcProtocol } from './RpcProtocol';
import { Utils } from './Utils';

export class RpcClient
{
    call(url: string, request: RpcProtocol.BackpackRequest): Promise<RpcProtocol.Response>
    {
        // log.debug('RpcClient.call', url, request);
        return new Promise((resolve, reject) =>
        {
            try {
                fetch(url, {
                    method: 'POST',
                    cache: 'reload',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(request),
                    redirect: 'error'
                })
                    .then(httpResponse =>
                    {
                        if (Utils.logChannel('rpcClient', false)) {
                            log.debug('RpcClient.call', 'httpResponse', url, request, httpResponse);
                        }
                        if (httpResponse.ok) {
                            return httpResponse.text();
                        } else {
                            reject(httpResponse);
                        }
                    })
                    .then(text =>
                    {
                        let response = JSON.parse(text);
                        // log.debug('RpcClient.call', 'response', url, response);
                        if (response.status == RpcProtocol.Response.status_ok) {
                            resolve(response);
                        } else {
                            reject(response);
                        }
                    })
                    .catch(ex =>
                    {
                        log.debug('RpcClient.call', 'catch', url, ex, request);
                        reject(ex);
                    });
            } catch (ex) {
                reject(ex);
            }
        });
    }
}
