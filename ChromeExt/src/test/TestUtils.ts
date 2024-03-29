import { expect } from 'chai';
import { Utils } from '../lib/Utils';
import * as ltx from 'ltx';

export class TestUtils
{
    jsObject2xmlObject_simple_presence()
    {
        const x = Utils.jsObject2xmlObject(new ltx.Element('presence'));
        expect(x.name).to.equal('presence');
    }

    jsObject2xmlObject_room_presence()
    {
        const x = Utils.jsObject2xmlObject(JSON.parse('{"name":"presence","attrs":{"to":"roomJid/nick"},"children":[{"name":"x","attrs":{"xmlns":"firebat:user:identity","id":"id:n3q:test","jid":"userJid","src":"https://storage.zweitgeist.com/index.php/12344151","digest":"bf167285ccfec3cd3f0141e6de77fed1418fcbae"},"children":[]},{"name":"x","attrs":{"xmlns":"firebat:avatar:state","jid":"userJid"},"children":[{"name":"position","attrs":{"x":"42"},"children":[]}]},{"name":"x","attrs":{"xmlns":"http://jabber.org/protocol/muc"},"children":[{"name":"history","attrs":{"seconds":"60","maxchars":"1000","maxstanzas":"1"},"children":[]}]}]}'));
        expect(x.name).to.equal('presence');
        expect(x.attrs.to).to.equal('roomJid/nick');
        expect(x.getChildElements()[0].name).to.equal('x');
        expect(x.getChildElements()[0].attrs.xmlns).to.equal('firebat:user:identity');
        expect(x.getChildElements()[1].name).to.equal('x');
        expect(x.getChildElements()[1].attrs.xmlns).to.equal('firebat:avatar:state');
        expect(x.getChildElements()[1].getChildElements()[0].name).to.equal('position');
        expect(x.getChildElements()[1].getChildElements()[0].attrs.x).to.equal('42');
        expect(x.getXmlns).to.not.be.undefined;
    }

    jsObject2xmlObject_message_with_string_child_as_body_text()
    {
        const x = Utils.jsObject2xmlObject(JSON.parse('{"name":"message","attrs":{"type":"groupchat","to":"d954c536629c2d729c65630963af57c119e24836@muc4.virtual-presence.org","from":"d954c536629c2d729c65630963af57c119e24836@muc4.virtual-presence.org/nick_"},"children":[{"name":"body","attrs":{},"children":["sdfsf"]}]}'));
        expect(x.name).to.equal('message');
        expect(x.attrs.to).to.equal('d954c536629c2d729c65630963af57c119e24836@muc4.virtual-presence.org');
        expect(x.getChildElements()[0].name).to.equal('body');
        expect(x.getChildElements()[0].children[0]).to.equal('sdfsf');
    }

    prepareValForMessage_makesLtxElementAcceptableforStricterJsonStringify()
    {
        const ltxElement = Utils.jsObject2xmlObject(JSON.parse('{"name":"presence","attrs":{"to":"roomJid/nick"},"children":[{"name":"x","attrs":{"xmlns":"firebat:user:identity","id":"id:n3q:test","jid":"userJid","src":"https://storage.zweitgeist.com/index.php/12344151","digest":"bf167285ccfec3cd3f0141e6de77fed1418fcbae"},"children":[]},{"name":"x","attrs":{"xmlns":"firebat:avatar:state","jid":"userJid"},"children":[{"name":"position","attrs":{"x":"42"},"children":[]}]},{"name":"x","attrs":{"xmlns":"http://jabber.org/protocol/muc"},"children":[{"name":"history","attrs":{"seconds":"60","maxchars":"1000","maxstanzas":"1"},"children":[]}]}]}'));
        const jsObject = Utils.prepareValForMessage(ltxElement);
        const json = JSON.stringify(jsObject);
        const x = Utils.jsObject2xmlObject(JSON.parse(json));
        expect(x.name).to.equal('presence');
        expect(x.attrs.to).to.equal('roomJid/nick');
        expect(x.getChildElements()[0].name).to.equal('x');
        expect(x.getChildElements()[0].attrs.xmlns).to.equal('firebat:user:identity');
        expect(x.getChildElements()[1].name).to.equal('x');
        expect(x.getChildElements()[1].attrs.xmlns).to.equal('firebat:avatar:state');
        expect(x.getChildElements()[1].getChildElements()[0].name).to.equal('position');
        expect(x.getChildElements()[1].getChildElements()[0].attrs.x).to.equal('42');
        expect(x.getXmlns).to.not.be.undefined;
    }

    hashString()
    {
        expect(Utils.hashString('a')).not.to.equal(Utils.hashString('b'));
        expect(Utils.hashString('https://www.galactic-developments.de/')).not.to.equal(Utils.hashString('https://www.galactic-developments.de/X'));
        expect(Utils.hashString('https://www.galactic-developments.de/')).to.equal(Utils.hashString('https://www.galactic-developments.de/'));
    }

    hashNumber()
    {
        expect(Utils.hashNumber('')).to.equal(0);
        expect(Utils.hashNumber('a')).not.to.be.null;
        expect(Utils.hashNumber('a')).not.to.equal(0);
        expect(Utils.hashNumber('a')).not.to.equal('');
        expect(Utils.hashNumber('a')).to.equal(Utils.hashNumber('a'));
        expect(Utils.hashNumber('a')).not.to.equal(Utils.hashNumber('b'));
        expect(Utils.hashNumber('nicknamehttps://avatar.weblin.sui.li/identity/?nickname=nickname&avatarUrl=avatarUrl')).not.to.equal(0);
        expect(Utils.hashNumber('nicknamehttps://avatar.weblin.sui.li/identity/?nickname=nickname&avatarUrl=avatarUrl')).not.to.be.null;
        expect(Utils.hashNumber('nicknamehttps://avatar.weblin.sui.li/identity/?nickname=nickname&avatarUrl=avatarUrl')).not.to.equal('');

        // console.log(Utils.hash('a'));
        // console.log(Utils.hash('ab'));
        // console.log(Utils.hash('abc'));
        // console.log(Utils.hash('abcd'));
        // console.log(Utils.hash('abcde'));
        // console.log(Utils.hash('abcdef'));
        // console.log(Utils.hash('abcdefg'));
        // console.log(Utils.hash('abcdefgh'));
        // console.log(Utils.hash('abcdefghi'));
        // console.log(Utils.hash('abcdefghij'));
        // console.log(Utils.hash('abcdefghijk'));
        // console.log(Utils.hash('abcdefghijkl'));
        // console.log(Utils.hash('abcdefghijklm'));
        // console.log(Utils.hash('aaaaaaaaaaaaa'));
        // console.log(Utils.hash('aaaaaaaaaaaa'));
        // console.log(Utils.hash('aaaaaaaaaaa'));
        // console.log(Utils.hash('aaaaaaaaaa'));
        // console.log(Utils.hash('aaaaaaaaa'));
        // console.log(Utils.hash('aaaaaaaa'));
        // console.log(Utils.hash('aaaaaaa'));
        // console.log(Utils.hash('aaaaaa'));
        // console.log(Utils.hash('aaaaa'));
        // console.log(Utils.hash('aaaa'));
        // console.log(Utils.hash('aaa'));
        // console.log(Utils.hash('aa'));
        // console.log(Utils.hash('a'));
    }

}
