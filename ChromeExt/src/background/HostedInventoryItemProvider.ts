import log = require('loglevel');
import { as } from '../lib/as';
import { Config } from '../lib/Config';
import { Backpack } from './Backpack';
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
}
