import log = require('loglevel');
import { xml } from '@xmpp/client';
import { ItemChangeOptions } from '../lib/ItemChangeOptions';
import { ItemProperties } from '../lib/ItemProperties';

export interface IItemProvider
{
    init(): Promise<void>;
    loadItems(): Promise<void>;
    addItem(itemId: string, props: ItemProperties, options: ItemChangeOptions): Promise<void>;
    deleteItem(itemId: string, options: ItemChangeOptions): Promise<void>;
    modifyItemProperties(itemId: string, changed: ItemProperties, deleted: Array<string>, options: ItemChangeOptions): Promise<void>;
    itemAction(itemId: string, action: string, args: any, involvedIds: string[], allowUnrezzed: boolean): Promise<ItemProperties>;
    rezItem(itemId: string, roomJid: string, rezzedX: number, destinationUrl: string, options: ItemChangeOptions): Promise<void>;
    derezItem(itemId: string, roomJid: string, inventoryX: number, inventoryY: number, changed: ItemProperties, deleted: Array<string>, options: ItemChangeOptions): Promise<void>;
    getDependentPresence(itemId: string, roomJid: string): xml;
    onDependentPresence(itemId: string, roomJid: string, participantNick: string, dependentPresence: xml): void;
    loadWeb3Items(): Promise<void>;
    createItemByTemplate(templateName: string, args: ItemProperties): Promise<string>;
    createItemByNft(contractNetwork: string, contractAddress: string, tokenId: string, tokenUri: string): Promise<string>;
}
