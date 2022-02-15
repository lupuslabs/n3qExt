import log = require('loglevel');
import { xml } from '@xmpp/client';
import { ItemChangeOptions } from '../lib/ItemChangeOptions';
import { ItemProperties } from '../lib/ItemProperties';

export interface IItemProvider
{
    init(): Promise<void>;
    loadItems(): Promise<void>;
    getItemIds(): Promise<string[]>;
    addItem(itemId: string, props: ItemProperties, options: ItemChangeOptions): Promise<void>;
    deleteItem(itemId: string, options: ItemChangeOptions): Promise<void>;
    modifyItemProperties(itemId: string, changed: ItemProperties, deleted: Array<string>, options: ItemChangeOptions): Promise<void>;
    itemAction(itemId: string, action: string, args: any, involvedIds: string[], allowUnrezzed: boolean): Promise<ItemProperties>;
    rezItem(itemId: string, roomJid: string, rezzedX: number, destinationUrl: string, options: ItemChangeOptions): Promise<void>;
    derezItem(itemId: string, roomJid: string, inventoryX: number, inventoryY: number, changed: ItemProperties, deleted: Array<string>, options: ItemChangeOptions): Promise<void>;
    loadWeb3Items(): Promise<void>;
    applyItemToItem(activeId: string, passiveId: string): Promise<ItemProperties>;
    createItem(auth: string, method: string, args: ItemProperties): Promise<ItemProperties>;
    transferAuthorize(itemId: string, duration: number): Promise<string>;
    transferUnauthorize(itemId: string): Promise<void>;
    transferComplete(senderInventoryId: string, senderItemId: string, transferToken: string): Promise<string>;
    stanzaOutFilter(stanza: xml): xml
    getDependentPresence(itemId: string, roomJid: string): xml;
    onDependentPresence(itemId: string, roomJid: string, participantNick: string, dependentPresence: xml): void;
}
