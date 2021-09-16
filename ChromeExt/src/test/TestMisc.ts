import { expect } from 'chai';
import { SimpleRpc } from '../contentscript/SimpleRpc';
// import markdown = require('markdown');
const NodeRSA = require('node-rsa');
import * as crypto from 'crypto';

export class TestMisc
{
    signAndVerify()
    {
        let privateKey = '-----BEGIN RSA PRIVATE KEY-----\n' +
            'MIIBOgIBAAJBAL8cd14UE+Fy2QV6rtvbBA3UGo8TllmXhcFcpuzkK2SpAbbNgA7I\n' +
            'ilojcAXsFsDFdCTTTWfofAEZvbGqSAQ0VJ8CAwEAAQJASUi2MVpLoVk0BVjdMquS\n' +
            'q2bZZGIjdmmXPeW0kQSR60AEYKRq9pNUHryYyhFg8yIQeCci31lU2SBWD1tqYSDx\n' +
            'eQIhAP+e96vA9az6cs0AVNaobJ1266eXXE0WMwn9dDu+bxQDAiEAv2UC3k6tKC8F\n' +
            'bMV0QldUrSLUuICMyt6/JToO+YinEDUCIQDTuszTCwVzvg8RFtEu7FrrIvGW45yk\n' +
            'jVrBT5rTUa2YGQIge8sE2O9Adm47bwgj00kTHs0Zk6Cp8Am0zopH50Ro8kUCIDYg\n' +
            'PAaSlrkLMMKw1fV3KJohxXOxM3mF2BFu5ydLtmxx\n' +
            '-----END RSA PRIVATE KEY-----\n';
        let publicKey = '-----BEGIN PUBLIC KEY-----\n' +
            'MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBAL8cd14UE+Fy2QV6rtvbBA3UGo8TllmX\n' +
            'hcFcpuzkK2SpAbbNgA7IilojcAXsFsDFdCTTTWfofAEZvbGqSAQ0VJ8CAwEAAQ==\n' +
            '-----END PUBLIC KEY-----\n';
        let message = 'ClaimStrength=123 | ClaimUrl=https://example.com/';

        let signer = new NodeRSA(privateKey);
        signer.setOptions({ signingScheme: { hash: 'sha256' } });
        let signature = signer.sign(message, 'base64');

        let winSignature = 'MJ98xzynI2rSP0NJaecpZKnOc54yPdzKmfj41T+4hi5zWviWdgaiVYmdlXospZ0CNUMHocYaGJhjVndFRS4FQA==';
        // signature = winSignature;

        let verifier = new NodeRSA(publicKey);
        expect(verifier.verify(message, signature, 'utf8', 'base64')).to.equal(true);
    }


    verifyWindowsSignature()
    {
        let publicKey = '-----BEGIN PUBLIC KEY-----\n' +
            'MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBAL8cd14UE+Fy2QV6rtvbBA3UGo8TllmX\n' +
            'hcFcpuzkK2SpAbbNgA7IilojcAXsFsDFdCTTTWfofAEZvbGqSAQ0VJ8CAwEAAQ==\n' +
            '-----END PUBLIC KEY-----\n';
        let message = 'ClaimStrength=123 | ClaimUrl=https://example.com/';

        let signature = 'MJ98xzynI2rSP0NJaecpZKnOc54yPdzKmfj41T+4hi5zWviWdgaiVYmdlXospZ0CNUMHocYaGJhjVndFRS4FQA==';

        let verifier = new NodeRSA(publicKey);
        expect(verifier.verify(message, signature, 'utf8', 'base64')).to.equal(true);
    }


    Map_delete()
    {
        let m: Map<string, number> = new Map<string, number>();
        m['a'] = 'b';
        m.delete('a');
        expect(m.size).to.equal(0);
    }

    Map_url_regex()
    {
        expect('x http://www.weblin.com y'.replace(/(https?:\/\/[^\s]+)/g, url => 'url')).to.equal('x url y');
        expect('http://www.weblin.com'.replace(/(https?:\/\/[^\s]+)/g, url => 'url')).to.equal('url');
        expect('x www.weblin.com y'.replace(/(www\.[^. ]+\.[^ ]+)/g, url => 'url')).to.equal('x url y');
        expect('www.a.b'.replace(/(www\.[^. ]+\.[^ ]+)/g, url => 'url')).to.equal('url');

        expect('x http://www.weblin.com www.weblin.com y'.replace(/(https?:\/\/[^\s]+|www\.[^. ]+\.[^ ]+)/g, url => 'url')).to.equal('x url url y');
        expect('http://www.weblin.com'.replace(/(https?:\/\/[^\s]+|www\.[^. ]+\.[^ ]+)/g, url => 'url')).to.equal('url');
        expect('www.weblin.com'.replace(/(https?:\/\/[^\s]+|www\.[^. ]+\.[^ ]+)/g, url => 'url')).to.equal('url');
        expect('weblin.com'.replace(/(https?:\/\/[^\s]+|www\.[^. ]+\.[^ ]+|[^. ]+\.(com|org|net|[a-z]{2}))/g, url => 'url')).to.equal('url');
        expect('x www.heise.de y'.replace(/(https?:\/\/[^\s]+|www\.[^. ]+\.[^ ]+|[^. ]+\.(com|org|net|[a-z]{2}))/g, url => 'url')).to.equal('x url y');
    }

    // async SimpleRpc_echo()
    // {
    //     let result: any;
    //     try {
    //         let response = await new SimpleRpc('echo')
    //             .param('aString', 'Hello World')
    //             .param('aNumber', 3.14159265358979323)
    //             .param('aBool', true)
    //             .param('aLong', 42000000000)
    //             .param('aDate', new Date(Date.now()).toISOString())
    //             .send('http://localhost:5000/rpc');
    //         if (response.ok) {
    //             result = response.data;
    //         }
    //     } catch (error) {
    //         //
    //     }

    //     expect(result.aString).to.equal('Hello World');
    //     expect(result.aNumber).to.equal(3.14159265358979323);
    // }

    // markdown()
    // {
    //     let md = markdown.markdown.toHTML('Hello **World**');
    //     expect(md).to.equal('<p>Hello <strong>World</strong></p>');
    // }
}
