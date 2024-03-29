import { expect } from 'chai';
import * as ltx from 'ltx';
import { BackgroundApp, ContentCommunicatorFactory } from '../background/BackgroundApp';
import { Backpack } from '../background/Backpack';
import { as } from '../lib/as';
import { Pid } from '../lib/ItemProperties';
import { Config } from '../lib/Config';
import { BackgroundToContentCommunicator } from '../lib/BackgroundToContentCommunicator'
import { BackgroundMessagePipe } from '../lib/BackgroundMessage'

export class TestBackpack
{
    async Backpack_stanzaOutFilter()
    {
        Config.setDevTree({
            itemProviders: {
                'nine3q': {
                    name: 'weblin.io Items (client storage)',
                    type: 'LocalStorageItemProvider',
                    description: 'Things on web pages managed by the client in a distributed fashion',
                    config: {
                        backpackApiUrl: 'https://webit.vulcan.weblin.com/backpack',
                    },
                }
            },
            items: {
                enabledProviders: ['nine3q'],
            },
        });
        const communicatorMaker: ContentCommunicatorFactory = (heartbeatHandler, tabHeartbeatHandler, requestHandler) => {
            const messagePipeProvider = {
                addOnMessagePipeConnectHandler: (onConnectHandler: (messagePipe: BackgroundMessagePipe) => void): void => { },
            }
            return new BackgroundToContentCommunicator(messagePipeProvider, heartbeatHandler, tabHeartbeatHandler, requestHandler)
        }
        let ba = new BackgroundApp(communicatorMaker);
        await ba.assertThatThereIsAUserId();
        let rep = new Backpack(ba);
        rep.maintain(true);

        await rep.addItem('item1', { 'Provider': 'nine3q', 'Test1': 'Value1', 'Test2': '41', 'Test3': 'x', 'Test4': 'y' }, { skipPersistentStorage: true });
        await rep.addItem('item2', { 'Provider': 'nine3q', 'Test1': 'Value2', 'Test2': '42' }, { skipPersistentStorage: true });
        await rep.addItem('item3', { 'Provider': 'nine3q', 'Test1': 'Value3', 'Test2': '43' }, { skipPersistentStorage: true });

        await rep.rezItem('item1', 'room1@server', 41, 'Destination1', { skipPersistentStorage: true });
        await rep.rezItem('item2', 'room1@server', 42, 'Destination2', { skipPersistentStorage: true });

        expect(rep.getItems()['item1'][Pid.IsRezzed]).to.equal('true');
        expect(rep.getItems()['item2'][Pid.IsRezzed]).to.equal('true');
        expect(as.Bool(rep.getItems()['item3'][Pid.IsRezzed], false)).to.equal(false);

        expect(rep.getItems()['item1'][Pid.RezzedX]).to.equal('41');
        expect(rep.getItems()['item2'][Pid.RezzedX]).to.equal('42');
        expect(as.Int(rep.getItems()['item3'][Pid.RezzedX], -1)).to.equal(-1);

        expect(rep.getItems()['item1'][Pid.RezzedLocation]).to.equal('room1@server');
        expect(rep.getItems()['item2'][Pid.RezzedLocation]).to.equal('room1@server');
        expect(as.String(rep.getItems()['item3'][Pid.RezzedLocation], '')).to.equal('');

        expect(rep.getItems()['item1'][Pid.RezzedDestination]).to.equal('Destination1');
        expect(rep.getItems()['item2'][Pid.RezzedDestination]).to.equal('Destination2');
        expect(as.String(rep.getItems()['item3'][Pid.RezzedDestination], '')).to.equal('');

        let stanza = new ltx.Element('presence', { 'to': 'room1@server/nick' });
        stanza = rep.stanzaOutFilter(stanza);
        expect(stanza.name).to.equal('presence');
        expect(stanza.attrs.to).to.equal('room1@server/nick');

        let vpDependent = stanza.getChildren('x').find(stanzaChild => (stanzaChild.attrs == null) ? false : stanzaChild.attrs.xmlns === 'vp:dependent');
        let dependentPresences = vpDependent.getChildren('presence');
        expect(dependentPresences.length).to.equal(2);

        let pres1 = dependentPresences[0].getChildren('x')[0];
        expect(pres1.attrs['xmlns']).to.equal('vp:props');
        expect(pres1.attrs['type']).to.equal('item');
        expect(pres1.attrs['Provider']).to.equal('nine3q');
        expect(pres1.attrs['Test1']).to.equal('Value1');
        expect(pres1.attrs['Test2']).to.equal('41');
        expect(pres1.attrs['Test3']).to.equal(undefined);
        expect(pres1.attrs['Test4']).to.equal(undefined);

        let pres2 = dependentPresences[1].getChildren('x')[0];
        expect(pres2.attrs['xmlns']).to.equal('vp:props');
        expect(pres2.attrs['type']).to.equal('item');
        expect(pres2.attrs['Provider']).to.equal('nine3q');
        expect(pres2.attrs['Test1']).to.equal('Value2');
        expect(pres2.attrs['Test2']).to.equal('42');
    }
}
