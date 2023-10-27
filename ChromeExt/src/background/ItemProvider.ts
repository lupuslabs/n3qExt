import * as ltx from 'ltx';
import { ItemChangeOptions } from '../lib/ItemChangeOptions';
import { ItemProperties } from '../lib/ItemProperties';

export interface IItemProvider
{
    stop(): void;
    maintain(): void;

    // Each element of itemsToGet has to contain the properties Provider, InventoryId and ID.
    // It may also contain the assumed current Version, which may be used by the
    // provider to determine whether to return a cached item or request it from a server.
    // Given Version doesn't have to match the returned item's Version.
    // Elements having the wrong Provider are ignored.
    // Doesn't throw. In case of error or item not retrievable, the item is just omitted from the result.
    getItemsByInventoryItemIds(itemsToGet: ItemProperties[]): Promise<ItemProperties[]>;

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
    stanzaOutFilter(stanza: ltx.Element): ltx.Element
    getDependentPresence(itemId: string, roomJid: string): ltx.Element;
    onDependentPresence(itemId: string, roomJid: string, participantNick: string, dependentPresence: ltx.Element): void;
}
