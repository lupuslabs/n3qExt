import log = require('loglevel');
import { as } from '../lib/as';
import { Config } from '../lib/Config';
import { Backpack } from './Backpack';
import { Item } from './Item';
import { IItemProvider } from './ItemProvider';

export class HostedInventoryItemProvider implements IItemProvider
{
    static type = 'HostedInventory';

    constructor(private backpack: Backpack)
    {
    }

    async loadItems(): Promise<void>
    {
    }

    async saveItem(itemId: string, item: Item): Promise<void>
    {
    }

    async deleteItem(itemId: string): Promise<void>
    {
    }
}
