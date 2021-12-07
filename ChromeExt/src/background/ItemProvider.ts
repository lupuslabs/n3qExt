import log = require('loglevel');
import { as } from '../lib/as';
import { Config } from '../lib/Config';

export interface IItemProvider
{
    loadItems(): Promise<void>
}
