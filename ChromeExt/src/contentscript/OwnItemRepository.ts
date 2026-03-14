import { Iter } from '../lib/Iter'
import { ItemProperties, ItemStatBoost } from '../lib/ItemProperties'
import { ContentApp } from './ContentApp'
import {
    CallableEventListeners, EventListeners,
    CallableEventListeners1D, EventListeners1D,
} from '../lib/EventListeners'
import { FreeSpace } from './FreeSpace'
import { ItemStatBoostsRepository } from '../lib/ItemStatBoostsRepository'

export type BackpackUpdateEventData = {itemsDeleted: ReadonlyArray<Readonly<ItemProperties>>, itemsNewOrChanged: ReadonlyArray<Readonly<ItemProperties>>}

export class OwnItemRepository
{
    private readonly app: ContentApp
    private readonly ownItems: Map<string,ItemProperties> = new Map();
    private readonly positionFixedItemIds: Set<string> = new Set();
    private readonly statBoosts: ItemStatBoostsRepository = new ItemStatBoostsRepository();

    private readonly callableBackpackUpdateListeners: CallableEventListeners<BackpackUpdateEventData> = new CallableEventListeners('backpackUpdate')
    private readonly callableItemUpdateListeners: CallableEventListeners1D<string,null|ItemProperties> = new CallableEventListeners1D('itemUpdate')

    public readonly backpackUpdateListeners: EventListeners<BackpackUpdateEventData>
    public readonly itemUpdateListeners: EventListeners1D<string,null|ItemProperties>
    public readonly statBoostsUpdateListeners: EventListeners<void>

    public constructor(app: ContentApp)
    {
        this.app = app
        this.backpackUpdateListeners = this.callableBackpackUpdateListeners
        this.itemUpdateListeners = this.callableItemUpdateListeners
        this.statBoostsUpdateListeners = this.statBoosts.statBoostsUpdateListeners
    }

    public getAllItems(): ReadonlyMap<string,Readonly<ItemProperties>> { return this.ownItems }

    public getItemById(itemId: string): null|Readonly<ItemProperties> { return this.ownItems.get(itemId) ?? null }

    public getStatBoostItemsByStat(stat: string): Iter<Readonly<ItemProperties>> {
        return this.statBoosts.getStatBoostItemsByStat(stat)
    }

    public getAllStatBoosts(): Iter<ItemStatBoost> {
        return this.statBoosts.getAllStatBoosts()
    }

    public getStatBoostsByStat(stat: string): Iter<ItemStatBoost> {
        return this.statBoosts.getStatBoostsByStat(stat)
    }

    public applyItemStatBoosts(stat: string, startValue: number): number {
        return this.statBoosts.applyStatBoosts(stat, startValue)
    }

    public onBackpackUpdate(itemsDeleted: ReadonlyArray<Readonly<ItemProperties>>, itemsNewOrChanged: ReadonlyArray<Readonly<ItemProperties>>): void
    {
        for (const item of itemsDeleted) {
            const itemId = ItemProperties.getId(item)
            this.ownItems.delete(itemId)
        }
        for (const item of itemsNewOrChanged) {
            const itemId = ItemProperties.getId(item)
            this.ownItems.set(itemId, item)
        }
        this.statBoosts.ProcessItemsUpdate(itemsDeleted, itemsNewOrChanged)
        itemsDeleted.forEach(item => this.callableItemUpdateListeners.callListeners(ItemProperties.getId(item), null))
        itemsNewOrChanged.forEach(item => this.callableItemUpdateListeners.callListeners(ItemProperties.getId(item), item))
        this.callableBackpackUpdateListeners.callListeners({itemsDeleted, itemsNewOrChanged})
    }

    public fixItemInventoryPositions(paneWidth: number, paneHeight: number, itemIds: ReadonlyArray<string>): void
    {
        const itemsToConsider: Readonly<ItemProperties>[] = []
        const itemsToFix: [string, Readonly<ItemProperties>][] = []
        for (const itemId of itemIds) {
            const item = this.getItemById(itemId)
            if (item && ItemProperties.getIsVisibleInBackpack(item)) {
                const itemPosValid = ItemProperties.getHasValidBackpackPosition(item)
                if (itemPosValid) {
                    itemsToConsider.push(item)
                } else if (!this.positionFixedItemIds.has(itemId)) {
                    itemsToFix.push([itemId, item])
                }
                this.positionFixedItemIds.add(itemId)
            }
        }
        if (itemsToFix.length === 0) {
            return
        }

        const itemWidthPadding = 10
        const itemHeightPadding = 20
        const rects: Array<{left: number, top: number, right: number, bottom: number}> = []
        const getItemDimensions = (item: Readonly<ItemProperties>) => {
            let {width, height} = ItemProperties.getImageData(item)
            width += itemWidthPadding
            height += itemHeightPadding
            return {width, height}
        }
        const makeItemRect = (x: number, y: number, width: number, height: number) => {
            const widthOffset = 0.5 * width
            const heightOffset = 0.5 * height
            const left = Math.max(0, x - widthOffset)
            const top = Math.max(0, y - heightOffset)
            return {left, top, right: left + width, bottom: top + height}
        }
        itemsToConsider.forEach(item => {
            const {x, y} = ItemProperties.getBackpackPosition(item)
            const {width, height} = getItemDimensions(item)
            rects.push(makeItemRect(x, y, width, height))
        })

        const freeSpaceN = Math.max(10, Math.floor(Math.max(paneWidth, paneHeight) / 20))
        for (const [itemId, item] of itemsToFix) {
            const {width, height} = getItemDimensions(item)
            const f = new FreeSpace(freeSpaceN, paneWidth, paneHeight, rects)
            let {x, y} = f.getFreeCoordinate(width, height)

            // Ensure, that item actually fits the pane:
            let {left, top} = makeItemRect(x, y, width, height)
            left = Math.max(0, Math.min(left, paneWidth - width))
            top = Math.max(0, Math.min(top, paneHeight - height))
            x = left + 0.5 * width
            y = top + 0.5 * height

            this.app.setItemBackpackPosition(itemId, x, y)
            rects.push(makeItemRect(x, y, width, height))
        }
    }

}
