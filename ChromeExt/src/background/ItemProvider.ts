import log = require('loglevel');
import { ItemChangeOptions } from '../lib/ItemChangeOptions';
import { ItemProperties } from '../lib/ItemProperties';
import { Item } from './Item';

export interface IItemProvider
{
    loadItems(): Promise<void>
    saveItem(itemId: string): Promise<void>
    deleteItem(itemId: string): Promise<void>
    modifyItemProperties(itemId: string, changed: ItemProperties, deleted: Array<string>, options: ItemChangeOptions): Promise<void>
    itemAction(itemId: string, action: string, args: any, involvedIds: string[], allowUnrezzed: boolean): Promise<void>
    rezItem(itemId: string, roomJid: string, rezzedX: number, destinationUrl: string, options: ItemChangeOptions): Promise<void>
    derezItem(itemId: string, roomJid: string, inventoryX: number, inventoryY: number, changed: ItemProperties, deleted: Array<string>, options: ItemChangeOptions): Promise<void>
}
