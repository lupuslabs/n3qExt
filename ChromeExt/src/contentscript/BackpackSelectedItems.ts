import { as } from '../lib/as'
import { iter } from '../lib/Iter'
import { ContentApp } from './ContentApp'
import { BoxEdges, dummyBoxEdges, Utils } from '../lib/Utils'
import { DomUtils } from '../lib/DomUtils'
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'
import { PointerEventData } from '../lib/PointerEventData'
import { Entity } from './Entity'
import { ItemProperties } from '../lib/ItemProperties'
import { BackpackWindow } from './BackpackWindow'
import { BackpackItem } from './BackpackItem'

export class BackpackSelectedItems
{
    private readonly app: ContentApp
    private readonly backpack: BackpackWindow
    private readonly displayElem: HTMLElement

    private readonly items: Map<string,BackpackItem> = new Map()
    private areAllRezable: boolean = false
    private areAllRezzed: boolean = false

    private inDrag: boolean = false
    private dragEvDispatcher: null|PointerEventDispatcher = null
    private dragLastMoveEvent: null|PointerEventData = null
    private dragItems: Map<string,BackpackSelectionDraggedItem> = new Map()
    private dragBackpackBoundingBox: DOMRectReadOnly = new DOMRectReadOnly(0, 0, 0, 0)
    private dragDisplayMargins: BoxEdges = dummyBoxEdges
    private dragStartOffsetFactorX: number = 0
    private dragStartOffsetFactorY: number = 0
    private dragTargetEntity: null|Entity = null

    public constructor(app: ContentApp, backpack: BackpackWindow)
    {
        this.app = app
        this.backpack = backpack
        this.displayElem = this.app.getDisplay()
    }

    public getIsEmpty(): boolean
    {
        return this.items.size === 0
    }

    public getIsSingle(): boolean
    {
        return this.items.size === 1
    }

    // Selection

    public getSelectedItemIds(): ReadonlySet<string>
    {
        return new Set(this.items.keys())
    }

    public itemGetIsSelected(itemId: string): boolean
    {
        return this.items.has(itemId)
    }

    public itemSelect(backpackItem: BackpackItem): void
    {
        const itemId = backpackItem.getItemId()
        if (this.items.has(itemId)) {
            return
        }
        this.items.set(itemId, backpackItem)
        this.setItemSelectedStyle(backpackItem, true)
        const item = backpackItem.getProperties()
        if (this.getIsSingle()) {
            this.areAllRezable = ItemProperties.getIsRezable(item)
            this.areAllRezzed = ItemProperties.getIsRezzed(item)
        } else {
            this.areAllRezable = this.areAllRezable && ItemProperties.getIsRezable(item)
            this.areAllRezzed = this.areAllRezzed && ItemProperties.getIsRezzed(item)
        }
    }

    public itemToggleSelect(backpackItem: BackpackItem): void
    {
        const itemId = backpackItem.getItemId()
        if (this.items.has(itemId)) {
            this.itemDeselect(itemId)
        } else {
            this.itemSelect(backpackItem)
        }
    }

    public itemSelectExclusively(backpackItem: BackpackItem): void
    {
        const itemId = backpackItem.getItemId()
        for (const selectedItemId of this.items.keys()) {
            if (selectedItemId !== itemId) {
                this.itemDeselect(selectedItemId)
            }
        }
        this.itemSelect(backpackItem)
    }

    public itemDeselect(itemId: string): void
    {
        const backpackItem = this.items.get(itemId)
        if (!backpackItem) {
            return
        }
        this.deleteDraggedItem(itemId)
        this.setItemSelectedStyle(backpackItem, false)
        this.items.delete(itemId)
        if (this.getIsEmpty()) {
            this.onDragEnd()
            this.areAllRezable = false
            this.areAllRezzed = false
        }
    }

    public itemDeselectAll(): void
    {
        iter(this.items.keys()).forEach(itemId => this.itemDeselect(itemId))
    }

    public onAfterBackpackUpdate(itemsHide: ReadonlyArray<ItemProperties>, itemsShowOrSet: ReadonlyArray<ItemProperties>): void
    {
        itemsHide.forEach(item => this.itemDeselect(ItemProperties.getId(item)))
        itemsShowOrSet.forEach(item => this.dragItems.get(ItemProperties.getId(item))?.onAfterBackpackUpdate())
        if (this.dragLastMoveEvent) {
            this.onDragMove(this.dragLastMoveEvent)
        }
    }

    private setItemSelectedStyle(backpackItem: BackpackItem, isSelected: boolean): void
    {
        backpackItem.setCssClass('selected', isSelected)
    }

    // Dragging

    public onDragStart(evDispatcher: PointerEventDispatcher, ev: PointerEventData): void
    {
        if (this.inDrag) {
            evDispatcher.cancelDrag()
            this.dragEvDispatcher.cancelDrag()
            return
        }
        this.dragEvDispatcher = evDispatcher
        this.dragLastMoveEvent = ev
        this.orderSelectionByZindex()
        for (const [itemId, backpackItem] of this.items) {
            this.dragItems.set(itemId, new BackpackSelectionDraggedItem(this.app, backpackItem))
        }

        const [boundingBoxInBackpack, viewportMargings] = this.calcDragBoundingBox()
        this.dragBackpackBoundingBox = boundingBoxInBackpack
        this.dragDisplayMargins = viewportMargings
        const [backpackDragX, backpackDragY]
            = this.backpack.translateClientPosToBackpackPos(ev.clientX, ev.clientY)
        this.dragStartOffsetFactorX = (backpackDragX - boundingBoxInBackpack.left) / boundingBoxInBackpack.width
        this.dragStartOffsetFactorY = (backpackDragY - boundingBoxInBackpack.top) / boundingBoxInBackpack.height

        this.inDrag = true
    }

    public onDragMove(ev: PointerEventData): void
    {
        if (!this.inDrag) {
            return
        }
        if (ev.buttons !== DomUtils.ButtonId.first || ev.modifierKeys !== DomUtils.ModifierKeyId.none) {
            this.dragEvDispatcher?.cancelDrag()
            return
        }
        this.dragLastMoveEvent = ev
        const { targetIsBackpack, targetIsBadges, targetIsDropzone, selectionClientBox }
            = this.calcDragSelectionClientBox(ev)

        if (targetIsBadges) {
            iter(this.dragItems.values()).forEach(item => item.drawAsBadge(ev))
        } else {
            for (const item of this.dragItems.values()) {
                item.drawAsItem(this.dragBackpackBoundingBox, selectionClientBox)
            }
        }

        this.backpack.setIsDropTargetStyle(true, targetIsBackpack)
        this.app.setDropzoneVisibility(this.getIsSingle() && this.areAllRezable, targetIsDropzone)
    }

    public onDragEnter(ev: PointerEventData): void
    {
        if (!this.inDrag || !ev.dropTarget || !this.getIsSingle()) {
            return
        }
        const backpackItem = iter(this.items.values()).getNext()
        const dragTargetEntity = this.app.getEntityByElem(ev.dropTarget)
        if (dragTargetEntity?.isValidDropTargetForItem(backpackItem)) {
            this.dragTargetEntity = dragTargetEntity
            ev.dropTarget.parentElement?.classList.add('n3q-avatar-drophilite')
        }
        this.onDragMove(ev)
    }

    public onDragLeave(ev: PointerEventData): void
    {
        if (!this.inDrag) {
            return
        }
        this.dragTargetEntity = null
        ev.dropTargetLast?.parentElement?.classList.remove('n3q-avatar-drophilite')
        this.onDragMove(ev)
    }

    public onDragDrop(ev: PointerEventData): void
    {
        if (!this.inDrag) {
            return
        }
        const { targetIsBackpack, targetIsBadges, targetIsDropzone, selectionClientBox }
            = this.calcDragSelectionClientBox(ev)

        if (this.dragTargetEntity) {
            const backpackItem = iter(this.items.values()).getNext()
            this.dragTargetEntity.onGotItemDroppedOn(backpackItem)
            return
        }

        if (targetIsBackpack) {
            const [backpackPosOffsetX, backpackPosOffsetY]
                = this.backpack.translateClientPosToBackpackPos(0, 0)
            for (const [itemId, dragItem] of this.dragItems.entries()) {
                const [itemClientX, itemClientY]
                    = dragItem.calcItemClientPos(this.dragBackpackBoundingBox, selectionClientBox)
                const itemBackpackBox = dragItem.getItemBackpackBoundingBox()
                const itemBackpackPosX = itemClientX + backpackPosOffsetX + itemBackpackBox.width / 2
                const itemBackpackPosY = itemClientY + backpackPosOffsetY + itemBackpackBox.height / 2
                this.app.setItemBackpackPosition(itemId, itemBackpackPosX, itemBackpackPosY)
                dragItem.getBackpackItem().toFront()
            }
            return
        }

        if (targetIsBadges) {
            const badges = this.app.getRoom()?.getMyParticipant()?.getBadgesDisplay()
            iter(this.items.values()).forEach(item => badges?.onBadgeDropInside(ev, item.getProperties()))
            return
        }

        if (targetIsDropzone) {
            for (const [itemId, dragItem] of this.dragItems.entries()) {
                const [itemClientX, itemClientY]
                    = dragItem.calcItemClientPos(this.dragBackpackBoundingBox, selectionClientBox)
                const itemBackpackBox = dragItem.getItemBackpackBoundingBox()
                const rezzLeft = itemClientX + itemBackpackBox.width / 2
                this.app.rezItemInCurrentRoom(itemId, rezzLeft)
            }
            return
        }

        // Dropped outside any valid drop target.
    }

    public onDragEnd(): void
    {
        if (!this.inDrag) {
            return
        }
        this.dragEvDispatcher?.cancelDrag()
        this.dragEvDispatcher = null
        this.dragLastMoveEvent = null
        this.backpack.setIsDropTargetStyle(false)
        this.app.setDropzoneVisibility(false)
        iter(this.dragItems.keys()).forEach(itemId => this.deleteDraggedItem(itemId))
        this.dragItems.clear()
        this.inDrag = false
    }

    private calcDragSelectionClientBox(ev: PointerEventData): {
        targetIsBackpack: boolean,
        targetIsBadges: boolean,
        targetIsDropzone: boolean,
        selectionClientBox: DOMRectReadOnly,
    }{
        const targetIsBackpack = this.backpack.getIsDropTargetInBackpack(ev)
        const targetIsBadges = this.getDragTargetIsValidEditModeBadgeDrop(ev)
        const targetIsDropzone = this.getIsSingle() && this.areAllRezable && !this.areAllRezzed
            && this.app.getIsDropTargetInDropzone(ev)

        const selectionClientX = ev.clientX - this.dragStartOffsetFactorX * this.dragBackpackBoundingBox.width
        const selectionClientY = ev.clientY - this.dragStartOffsetFactorY * this.dragBackpackBoundingBox.height
        const { width, height } = this.dragBackpackBoundingBox
        let selectionClientBox = new DOMRectReadOnly(selectionClientX, selectionClientY, width, height)
        if (targetIsBackpack) {
            const backpackClientBox = this.backpack.getClientBox()
            selectionClientBox = Utils.fitDomRectInDomRectNoResizeHonorTopLeft(selectionClientBox, backpackClientBox)
        } else {
            let displayClientBox = this.displayElem.getBoundingClientRect()
            displayClientBox = Utils.addMarginsToDomRect(displayClientBox, this.dragDisplayMargins)
            selectionClientBox = Utils.fitDomRectInDomRectNoResizeHonorTopLeft(selectionClientBox, displayClientBox)
        }

        return { targetIsBackpack, targetIsBadges, targetIsDropzone, selectionClientBox }
    }

    private calcDragBoundingBox(): [DOMRectReadOnly, BoxEdges]
    {
        let top = Infinity
        let right = -Infinity
        let bottom = -Infinity
        let left = Infinity
        let leftMostCenter = +Infinity
        let rightMostCenter = -Infinity
        for (const item of this.dragItems.values()) {
            const itemBox = item.getItemBackpackBoundingBox()
            top = Math.min(top, itemBox.top)
            right = Math.max(right, itemBox.right)
            bottom = Math.max(bottom, itemBox.bottom)
            left = Math.min(left, itemBox.left)
            const itemHalfWidth = itemBox.width / 2
            leftMostCenter = Math.min(leftMostCenter, itemBox.left + itemHalfWidth)
            rightMostCenter = Math.max(rightMostCenter, itemBox.right - itemHalfWidth)
        }
        const boundingBox = new DOMRectReadOnly(left, top, right - left, bottom - top)
        const rightMargin = right - rightMostCenter // > 0
        const leftMargin = leftMostCenter - left // > 0
        const viewportMargins = { top: 0, right: rightMargin, bottom: 0, left: leftMargin }
        return [boundingBox, viewportMargins]
    }

    private getDragTargetIsValidEditModeBadgeDrop(ev: PointerEventData): boolean
    {
        if (!this.getIsSingle()) {
            return false
        }
        const badges = this.app.getRoom()?.getMyParticipant()?.getBadgesDisplay()
        const item = iter(this.items.values()).getNext().getProperties()
        return badges?.isValidEditModeBadgeDrop(ev, item) ?? false
    }

    private deleteDraggedItem(itemId: string): void
    {
        if (!this.inDrag) {
            return
        }
        this.dragItems.get(itemId)?.stop()
        this.dragItems.delete(itemId)
    }

    private orderSelectionByZindex(): void
    {
        const cmpFun = (itemA: BackpackItem, itemB: BackpackItem) => as.Int(itemA.getElem().style.zIndex) - as.Int(itemB.getElem().style.zIndex)
        const sorted = [...this.items.values()].sort(cmpFun)
        this.items.clear()
        sorted.forEach(item => this.items.set(item.getItemId(), item))
    }

}

class BackpackSelectionDraggedItem
{
    private readonly app: ContentApp
    private readonly backpackItem: BackpackItem
    private itemBackpackBox: DOMRectReadOnly
    private dragElem: HTMLElement
    private dragBadgeElem?: HTMLImageElement

    public constructor(app: ContentApp, backpackItem: BackpackItem)
    {
        this.app = app
        this.backpackItem = backpackItem
        this.backpackItem.closeInfo()
        this.setDraggedStyle(true)
        this.onAfterBackpackUpdate()
    }

    private makeElems(): void
    {
        const badges = this.app.getMyBadgesDisplay()
        this.dragElem?.remove()
        badges?.hideDraggedBadgeIcon(this.dragBadgeElem)

        const backpackItemElem = this.backpackItem.getElem()
        const dragElem: HTMLElement = <HTMLElement>backpackItemElem.cloneNode(true)

        // Work around wrongly applied CSP in Firefox on pages limiting img-src after cloning by unsetting and setting img src:
        const originalImgElem = backpackItemElem.querySelector('.n3q-backpack-item-image')
        const dragImgElem = dragElem.querySelector('.n3q-backpack-item-image')
        if (originalImgElem && dragImgElem) {
            dragImgElem.setAttribute('src', '')
            dragImgElem.setAttribute('src', originalImgElem.getAttribute('src'))
        }

        dragElem.classList.add('n3q-dragging')
        this.dragElem = dragElem
        this.app.getDisplay()?.append(dragElem)
        this.app.toFront(dragElem, ContentApp.LayerDrag)

        this.dragBadgeElem = badges?.makeDraggedBadgeIcon(this.backpackItem.getProperties())
    }

    public getBackpackItem(): BackpackItem
    {
        return this.backpackItem
    }

    public getItemBackpackBoundingBox(): DOMRectReadOnly
    {
        return this.itemBackpackBox
    }

    public calcItemClientPos(selectionBackpackBox: DOMRectReadOnly, selectionClientBox: DOMRectReadOnly): [number, number]
    {
        const itemClientX = selectionClientBox.left + this.itemBackpackBox.left - selectionBackpackBox.left
        const itemClientY = selectionClientBox.top + this.itemBackpackBox.top - selectionBackpackBox.top
        return [itemClientX, itemClientY]
    }

    public drawAsItem(selectionBackpackBox: DOMRectReadOnly, selectionClientBox: DOMRectReadOnly): void
    {
        const [itemClientX, itemClientY] = this.calcItemClientPos(selectionBackpackBox, selectionClientBox)
        this.dragElem.style.left = `${itemClientX}px`
        this.dragElem.style.top = `${itemClientY}px`
        this.dragElem.classList.remove('n3q-hidden')
        this.app.getMyBadgesDisplay()?.hideDraggedBadgeIcon(this.dragBadgeElem)
    }

    public drawAsBadge(ev: PointerEventData): void
    {
        this.dragElem.classList.add('n3q-hidden')
        this.app.getMyBadgesDisplay()?.showDraggedBadgeIconInside(this.backpackItem.getProperties(), ev, this.dragBadgeElem)
    }

    public onAfterBackpackUpdate(): void
    {
        this.itemBackpackBox = this.backpackItem.getItemBackpackBoundingBox()
        this.makeElems()
    }

    public stop(): void
    {
        this.dragElem.remove()
        const badges = this.app.getMyBadgesDisplay()
        badges?.disposeDraggedBadgeIcon(this.dragBadgeElem)
        this.setDraggedStyle(false)
    }

    public setDraggedStyle(isDragging: boolean): void
    {
        this.backpackItem.setCssClass('n3q-hidden', isDragging)
    }

}
