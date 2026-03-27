import { expect } from 'chai';
import { ContentApp } from '../contentscript/ContentApp';

export class TestContentApp
{
    getRoomJidFromLocationUrl()
    {
        const jid = ContentApp.getRoomJidFromLocationUrl('xmpp:d954c536629c2d729c65630963af57c119e24836@muc4.virtual-presence.org');
        expect(jid).to.equal('d954c536629c2d729c65630963af57c119e24836@muc4.virtual-presence.org');
    }
}
