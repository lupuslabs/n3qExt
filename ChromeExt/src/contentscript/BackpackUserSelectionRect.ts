import { iter } from '../lib/Iter'
import { Utils } from '../lib/Utils'
import { DomUtils } from '../lib/DomUtils'
import ButtonId = DomUtils.ButtonId
import ModifierKeyId = DomUtils.ModifierKeyId
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'
import { PointerEventData } from '../lib/PointerEventData'
import { ContentApp } from './ContentApp'
import { BackpackWindow } from './BackpackWindow'
import { BackpackItem } from './BackpackItem'

export class BackpackUserSelectionRect
{
    private readonly app: ContentApp
    private readonly backpack: BackpackWindow
    private readonly rectElem: HTMLElement
    private readonly eventDispatcher: PointerEventDispatcher
    private readonly dragStartClientPos: [number, number]
    private newSelection: BackpackItem[] = []

    public constructor(app: ContentApp, backpack: BackpackWindow, eventDispatcher: PointerEventDispatcher, dragStartEv: PointerEventData)
    {
        this.app = app
        this.backpack = backpack
        this.rectElem = DomUtils.elemOfHtml('<dev class="n3q-user-selection-rect"></dev>')
        this.app.getDisplay()?.append(this.rectElem)
        this.app.toFront(this.rectElem, ContentApp.LayerDrag)
        this.eventDispatcher = eventDispatcher
        this.dragStartClientPos = [dragStartEv.clientX, dragStartEv.clientY]
        this.onDragMove(dragStartEv)
    }

    public getResultingItemSelection(): ReadonlyArray<BackpackItem>
    {
        return this.newSelection
    }

    public onDragMove(ev: PointerEventData): void
    {
        if (ev.buttons !== ButtonId.first || (ev.modifierKeys & ~(ModifierKeyId.shift | ModifierKeyId.control)) !== 0) {
            this.eventDispatcher.cancelDrag()
            return
        }

        let selectionModeAdd = false
        let selectionModeRemove = false
        switch (ev.modifierKeys) {
            case ModifierKeyId.shift: { selectionModeAdd = true } break
            case ModifierKeyId.control: { selectionModeRemove = true } break
        }
        const selectionModeEx = !(selectionModeAdd || selectionModeRemove)

        const [dragStartX, dragStartY] = this.dragStartClientPos
        const { clientX, clientY } = ev
        const boxLeft = Math.min(dragStartX, clientX)
        const boxRight = Math.max(dragStartX, clientX)
        const boxTop = Math.min(dragStartY, clientY)
        const boxBottom = Math.max(dragStartY, clientY)
        const boxWidth = boxRight - boxLeft
        const boxHeight = boxBottom - boxTop
        const clientBoxRaw = new DOMRectReadOnly(boxLeft, boxTop, boxWidth, boxHeight)
        const clientBox = Utils.clipDomRectInDomRect(clientBoxRaw, this.backpack.getClientBox())
        DomUtils.setElemBox(this.rectElem, clientBox)

        this.newSelection = []
        const backpackBox = this.backpack.translateClientBoxToBackpackBox(clientBox)
        const visibleItemIds = this.backpack.getVisibleItemIds()
        const selectedItemIds = this.backpack.getSelectedItemIds()
        for (const [itemId, item] of this.backpack.getAllItems()) {
            if (!visibleItemIds.has(itemId)) {
                this.setItemCssClasses(item, false, false)
            }
            const isSelected = selectedItemIds.has(itemId)
            const isInRect = Utils.isDomRectOverlappingDomRect(item.getItemBackpackBoundingBox(), backpackBox)
            const willBeAdded = !selectionModeRemove && isInRect && !isSelected
            const willBeRemoved = isSelected && ((selectionModeRemove && isInRect) || (selectionModeEx && !isInRect))
            const willBeSelected = willBeAdded || (isSelected && !willBeRemoved)
            if (willBeSelected) {
                this.newSelection.push(item)
            }
            this.setItemCssClasses(item, willBeAdded, willBeRemoved)
        }
    }

    public stop(): void
    {
        this.rectElem.remove()
        const allItems = this.backpack.getAllItems()
        iter(allItems.values()).forEach(item => this.setItemCssClasses(item, false, false))
    }

    private setItemCssClasses(item: BackpackItem, isAdd: boolean, isRemove: boolean): void
    {
        item.setCssClass('selection-rect-add', isAdd)
        item.setCssClass('selection-rect-remove', isRemove)
    }

}
