import { iter, Iter } from './Iter'
import { ItemProperties, ItemStatBoost } from './ItemProperties'
import { CallableEventListeners, EventListeners } from './EventListeners';

type ItemStatBoostRecord = Readonly<{
    itemId: string,
    item: Readonly<ItemProperties>,
}> & ItemStatBoost

export class ItemStatBoostsRepository
{
    private statBoostItemVersions: Map<string,number> = new Map()
    private statBoosts: ItemStatBoostRecord[] = []

    private readonly callableStatBoostsUpdateListeners: CallableEventListeners<void> = new CallableEventListeners('statBoosts')
    public readonly statBoostsUpdateListeners: EventListeners<void>

    public constructor()
    {
        this.statBoostsUpdateListeners = this.callableStatBoostsUpdateListeners
    }

    public getAllStatBoosts(): Iter<ItemStatBoost> {
        return iter(this.statBoosts)
    }

    public getStatBoostsByStat(stat: string): Iter<ItemStatBoost> {
        return this.getAllStatBoosts().filter(statBoost => statBoost.statBoostStat === stat)
    }

    public getStatBoostItemsByStat(stat: string): Iter<Readonly<ItemProperties>> {
        return iter(this.statBoosts)
            .filter(record => record.statBoostStat === stat)
            .removeDuplicates((recordA, recordB) => recordA.itemId === recordB.itemId)
            .map(record => record.item)
    }

    public applyStatBoosts(stat: string, startValue: number): number {
        let value = startValue
        const relevantBosts = [...this.getStatBoostsByStat(stat)]
        relevantBosts.sort((a, b) => a.statBoostMax - b.statBoostMax)
        for (const {statBoostMax, statBoostValue} of relevantBosts) {
            if (value < statBoostMax) {
                value = Math.min(statBoostMax, value + statBoostValue)
            }
        }
        return value
    }

    public removeAllStatBoosts(): void {
        if (this.statBoosts.length === 0) {
            return
        }
        this.statBoosts = []
        this.statBoostItemVersions.clear()
        this.callableStatBoostsUpdateListeners.callListeners()
    }

    public ProcessItemsUpdate(itemsDeleted: ReadonlyArray<Readonly<ItemProperties>>, itemsNewOrChanged: ReadonlyArray<Readonly<ItemProperties>>) {
        let boostsTouched = false
        for (const item of itemsDeleted) {
            boostsTouched = this.setItemStatBoosts(item, []) || boostsTouched
        }
        for (const item of itemsNewOrChanged) {
            const boosts = ItemProperties.getStatBoosts(item)
            boostsTouched = this.setItemStatBoosts(item, boosts) || boostsTouched
        }
        if (boostsTouched) {
            this.callableStatBoostsUpdateListeners.callListeners()
        }
    }

    private setItemStatBoosts(item: Readonly<ItemProperties>, statBoosts: ReadonlyArray<ItemStatBoost>): boolean {
        const itemId = ItemProperties.getId(item)
        if (statBoosts.length === 0) {
            if (!this.statBoostItemVersions.delete(itemId)) {
                return false
            }
            this.statBoosts = this.statBoosts.filter(record => record.itemId !== itemId)
            return true
        }
        const itemVersion = ItemProperties.getVersion(item)
        if (this.statBoostItemVersions.get(itemId) === itemVersion) {
            return false
        }
        this.statBoosts = this.statBoosts.filter(record => record.itemId !== itemId)
        this.statBoosts.push(...statBoosts.map(statBoost => ({itemId, item, ...statBoost})))
        this.statBoostItemVersions.set(itemId, itemVersion)
        return true
    }
}
