import log = require('loglevel');
import { Item } from './Item';

export interface IItemProvider
{
    loadItems(): Promise<void>
    saveItem(itemId: string, item: Item): Promise<void>
    deleteItem(itemId: string): Promise<void>
    executeItemAction(itemId: string, item: Item, action: string, args: any, involvedIds: string[], allowUnrezzed: boolean): Promise<void>
}
