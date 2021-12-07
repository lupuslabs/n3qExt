import log = require('loglevel');
import { as } from '../lib/as';
import { Config } from '../lib/Config';
import { Pid } from '../lib/ItemProperties';
import { Memory } from '../lib/Memory';
import { Utils } from '../lib/Utils';
import { Backpack } from './Backpack';
import { IItemProvider } from './ItemProvider';

export class LocalStorageItemProvider implements IItemProvider
{
    static type = 'LocalStorage';

    constructor(private backpack: Backpack)
    {
    }

    async loadItems(): Promise<void>
    {
        await this.loadLocalItems();
    }

    private static BackpackIdsKey = 'BackpackIds';
    private static BackpackPropsPrefix = 'BackpackItem-';

    private getBackpackIdsKey(): string
    {
        if (Config.get('config.clusterName', 'prod') == 'dev') {
            return LocalStorageItemProvider.BackpackIdsKey + '-dev';
        }
        return LocalStorageItemProvider.BackpackIdsKey;
    }

    private async createInitialItems(): Promise<void>
    {
        await this.createInitialItemsPhase1();
    }

    private async createInitialItemsPhase1(): Promise<void>
    {
        let nextPhase = 1;
        let currentPhase = as.Int(await Memory.getLocal(Utils.localStorageKey_BackpackPhase(), 0));
        if (currentPhase < nextPhase) {
            if (true
                && await this.createInitialItem('BlueprintLibrary', 68, 58)
                && await this.createInitialItem('Maker', 167, 54)
                && await this.createInitialItem('Recycler', 238, 54)
                && await this.createInitialItem('MiningDrill', 310, 54)
                && await this.createInitialItem('WaterPump', 78, 188)
                && await this.createInitialItem('SolarPanel', 250, 188)
                && await this.createInitialItem('CoffeeBeans', 382, 143)
                && await this.createInitialItem('PirateFlag', 371, 45)
            ) {
                await Memory.setLocal(Utils.localStorageKey_BackpackPhase(), nextPhase);
            }
        }
    }

    private async createInitialItem(template: string, x: number = -1, y: number = -1): Promise<boolean>
    {
        try {
            let item = await this.backpack.createItemByTemplate(template, { [Pid.InventoryX]: as.String(x), [Pid.InventoryY]: as.String(y), });
            return true;
        } catch (error) {
            log.info('Backpack.createInitialItem', 'failed to create starter item', template, error);
            return false;
        }
    }

    private async loadLocalItems()
    {
        let itemIds = await Memory.getLocal(this.getBackpackIdsKey(), []);
        if (itemIds == null || !Array.isArray(itemIds)) {
            log.warn('Backpack.loadLocalItems', this.getBackpackIdsKey(), 'not an array');
            return;
        }

        for (let i = 0; i < itemIds.length; i++) {
            let itemId = itemIds[i];

            let props = await Memory.getLocal(LocalStorageItemProvider.BackpackPropsPrefix + itemId, null);
            if (props == null || typeof props != 'object') {
                log.info('Backpack.loadLocalItems', LocalStorageItemProvider.BackpackPropsPrefix + itemId, 'not an object, skipping');
                continue;
            }

            let item = await this.backpack.createRepositoryItem(itemId, props);
            if (item.isRezzed()) {
                let roomJid = item.getProperties()[Pid.RezzedLocation];
                if (roomJid) {
                    this.backpack.addToRoom(itemId, roomJid);
                }
            }
        }

        this.createInitialItems();
    }

}
