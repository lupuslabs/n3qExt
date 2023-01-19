import { as } from '../lib/as';
import { ItemProperties, Pid } from '../lib/ItemProperties';
import { BackpackSetItemData, ContentMessage } from '../lib/ContentMessage';
import { BackgroundApp } from './BackgroundApp';
import { Backpack } from './Backpack';
import { ItemChangeOptions } from '../lib/ItemChangeOptions';

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
                this.app.sendToAllTabs({ type: ContentMessage.type_onBackpackSetItem, data: new BackpackSetItemData(this.itemId, props) });
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
            this.app.sendRoomPresence(roomJid);
        }
    }

    isRezzed(): boolean
    {
        return as.Bool(this.properties[Pid.IsRezzed], false);
    }

    isRezzedTo(roomJid: string): boolean
    {
        return as.Bool(this.properties[Pid.IsRezzed], false) && as.String(this.properties[Pid.RezzedLocation], '/-definitely-not-a-room-jid-@') === roomJid;
    }
}
