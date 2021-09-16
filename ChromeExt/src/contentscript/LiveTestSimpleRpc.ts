import { expect } from 'chai';
import log = require('loglevel');
import { Payload } from '../lib/Payload';
import { SimpleRpc } from './SimpleRpc';
import { Config } from '../lib/Config';

export class LiveTestSimpleRpc
{
    async SimpleRpc_echo()
    {
        let response = await new SimpleRpc('echo')
            .param('aString', 'Hello World')
            .param('aNumber', 3.14159265358979323)
            .param('aBool', true)
            .param('aLong', 42000000000)
            .param('aDate', new Date(Date.now()).toISOString())
            .send(Config.get('test.itemServiceRpcUrl', 'http://localhost:5000/rpc'));
        if (response.ok) {
            log.debug('TEST', 'SimpleRpc_echo', response.data);
        } else {
            log.debug('TEST', 'SimpleRpc_echo', response.message);
        }
        expect(response.get('aString', null)).to.equal('Hello World');
        expect(response.get('aNumber', null)).to.equal(3.14159265358979323);
        expect(response.get('aBool', null)).to.equal(true);
        expect(response.get('aLong', null)).to.equal(42000000000);
    }
}
