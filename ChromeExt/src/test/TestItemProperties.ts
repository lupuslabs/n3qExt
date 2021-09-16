import { expect } from 'chai';
import { ItemProperties, Pid } from '../lib/ItemProperties';
const NodeRSA = require('node-rsa');

export class TestItemProperties
{
    verifySignature()
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

        expect(ItemProperties.verifySignature({
            [Pid.Signed]: '' + Pid.ClaimStrength + ' ' + Pid.ClaimUrl,
            [Pid.ClaimStrength]: '123',
            [Pid.ClaimUrl]: 'https://example.com/',
            [Pid.SignatureRsa]: signature
        }, publicKey)).to.equal(true);
    }
}
