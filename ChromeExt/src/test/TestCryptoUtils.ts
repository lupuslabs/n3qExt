import { expect } from 'chai';
import { CryptoUtils } from '../lib/CryptoUtils';

export class TestCryptoUtils {

    hashString() {
        expect(CryptoUtils.hashStringSha1('a')).not.to.equal(CryptoUtils.hashStringSha1('b'));
        expect(CryptoUtils.hashStringSha1('https://www.galactic-developments.de/')).not.to.equal(CryptoUtils.hashStringSha1('https://www.galactic-developments.de/X'));
        expect(CryptoUtils.hashStringSha1('https://www.galactic-developments.de/')).to.equal(CryptoUtils.hashStringSha1('https://www.galactic-developments.de/'));
    }

    hashNumber() {
        expect(CryptoUtils.hashNumber('')).to.equal(0);
        expect(CryptoUtils.hashNumber('a')).not.to.be.null;
        expect(CryptoUtils.hashNumber('a')).not.to.equal(0);
        expect(CryptoUtils.hashNumber('a')).not.to.equal('');
        expect(CryptoUtils.hashNumber('a')).to.equal(CryptoUtils.hashNumber('a'));
        expect(CryptoUtils.hashNumber('a')).not.to.equal(CryptoUtils.hashNumber('b'));
        expect(CryptoUtils.hashNumber('nicknamehttps://avatar.weblin.sui.li/identity/?nickname=nickname&avatarUrl=avatarUrl')).not.to.equal(0);
        expect(CryptoUtils.hashNumber('nicknamehttps://avatar.weblin.sui.li/identity/?nickname=nickname&avatarUrl=avatarUrl')).not.to.be.null;
        expect(CryptoUtils.hashNumber('nicknamehttps://avatar.weblin.sui.li/identity/?nickname=nickname&avatarUrl=avatarUrl')).not.to.equal('');
    }
}
