import log = require('loglevel');
import { as } from '../lib/as';
import { xml, jid } from '@xmpp/client';
import { Config } from '../lib/Config';
import { ItemProperties, Pid, Property } from '../lib/ItemProperties';
import { BackpackShowItemData, BackpackRemoveItemData, BackpackSetItemData, ContentMessage } from '../lib/ContentMessage';
import { BackgroundApp } from './BackgroundApp';
import { Backpack } from './Backpack';
import { ItemChangeOptions } from '../lib/ItemChangeOptions';
import { Utils } from '../lib/Utils';

export class Item
{
    constructor(private app: BackgroundApp, private backpack: Backpack, private itemId: string, private properties: ItemProperties)
    {
    }

    getId(): string { return this.itemId; }
    getProperties(): ItemProperties { return this.properties; }

    setProperties(props: ItemProperties, options: ItemChangeOptions)
    {
        let changed = !ItemProperties.areEqual(this.properties, props)

        this.properties = props;

        if (changed) {
            if (!options.skipContentNotification) {
                this.app.sendToAllTabs(ContentMessage.type_onBackpackSetItem, new BackpackSetItemData(this.itemId, props));
            }

            if (!options.skipPresenceUpdate) {
                this.sendPresence();
            }
        }
    }

    sendPresence()
    {
        if (this.isRezzed()) {
            let roomJid = this.properties[Pid.RezzedLocation];
            this.app.sendToTabsForRoom(roomJid, { 'type': ContentMessage.type_sendPresence });
        }
    }

    isRezzed(): boolean
    {
        return as.Bool(this.properties[Pid.IsRezzed], false);
    }

    isRezzedTo(roomJid: string): boolean
    {
        return as.Bool(this.properties[Pid.IsRezzed], false) && as.String(this.properties[Pid.RezzedLocation], '/-definitely-not-a-room-jid-@') == roomJid;
    }

    getDependentPresence(roomJid: string): xml
    {
        var presence = xml('presence', { 'from': roomJid + '/' + this.itemId });
        let attrs = { 'xmlns': 'vp:props', 'type': 'item', 'provider': 'nine3q' };
        let signed = as.String(this.properties[Pid.Signed] , '').split(' ');
        for (let pid in this.properties) {
            if (Property.inPresence(pid) || (signed.length > 0 && signed.includes(pid))) {
                attrs[pid] = this.properties[pid];
            }
        }
        // let attrs = Object.assign(protocolAttrs, this.properties);
        presence.append(xml('x', attrs));
        return presence;
    }
}
