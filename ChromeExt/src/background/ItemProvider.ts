import log = require('loglevel');
import { ItemChangeOptions } from '../lib/ItemChangeOptions';
import { ItemProperties } from '../lib/ItemProperties';
import { xml } from '@xmpp/client';

export interface IItemProvider
{
    loadItems(): Promise<void>
    addItem(itemId: string, props: ItemProperties, options: ItemChangeOptions): Promise<void>
    deleteItem(itemId: string, options: ItemChangeOptions): Promise<void>
    modifyItemProperties(itemId: string, changed: ItemProperties, deleted: Array<string>, options: ItemChangeOptions): Promise<void>
    itemAction(itemId: string, action: string, args: any, involvedIds: string[], allowUnrezzed: boolean): Promise<void>
    rezItem(itemId: string, roomJid: string, rezzedX: number, destinationUrl: string, options: ItemChangeOptions): Promise<void>
    derezItem(itemId: string, roomJid: string, inventoryX: number, inventoryY: number, changed: ItemProperties, deleted: Array<string>, options: ItemChangeOptions): Promise<void>
    getDependentPresence(itemId: string, roomJid: string): xml
}
