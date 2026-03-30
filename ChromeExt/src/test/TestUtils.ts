import { expect } from 'chai';
import { ErrorWithData, Utils } from '../lib/Utils';
import XmlElement from 'ltx/lib/Element.js';

export class TestUtils
{
    jsObject2xmlObject_simple_presence()
    {
        const x = Utils.jsObject2xmlObject(new XmlElement('presence'));
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

    prepareValForMessage()
    {
        const testError = new ErrorWithData('Error message!', {debugString1: 'debug string 1'});
        const result = Utils.prepareValForMessage(testError);
        expect(result.message).to.equal('Error message!');
        expect(result.debugString1).to.equal('debug string 1');
    }
}
