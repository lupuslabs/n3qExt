import { as } from '../lib/as'
import { ItemProperties, Pid } from '../lib/ItemProperties'
import { ContentApp } from './ContentApp'
import { BackgroundMessage } from '../lib/BackgroundMessage'
import { Window, WindowOptions } from './Window'
import { BackpackItem } from './BackpackItem'
import { FreeSpace } from './FreeSpace'
import { DomUtils } from '../lib/DomUtils'
import ModifierKeyId = DomUtils.ModifierKeyId
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'
import { BackpackWindowItemFilters } from './BackpackWindowItemFilters'
import { PointerEventData } from '../lib/PointerEventData'
import { BackpackSelectedItems } from './BackpackSelectedItems'
import { BackpackUserSelectionRect } from './BackpackUserSelectionRect'
import { WeblinClientIframeApi } from '../lib/WeblinClientIframeApi'
import { WeblinClientApi } from '../lib/WeblinClientApi'

export class BackpackWindow extends Window<WindowOptions>
{
    private readonly filters: BackpackWindowItemFilters
    private paneElem: null|HTMLElement
    private panePointerEventDispatcher: null|PointerEventDispatcher
    private readonly backpackItems: Map<string, BackpackItem> = new Map()
    private readonly selectedItems: BackpackSelectedItems
    private selectionRect: null|BackpackUserSelectionRect = null
    private isReady: boolean = false

    public constructor(app: ContentApp)
    {
        super(app)
        this.windowName = 'Backpack'
        this.isResizable = true
        this.persistGeometry = true
        const guiVisibilityHandler = (isFilterGuiVisible: boolean) => this.setButtonBarVisibleState(isFilterGuiVisible)
        const itemVisibilityHandler = (itemId: string, isFilterVisible: boolean) => this.itemFilterVisibilityHandler(itemId, isFilterVisible)
        this.filters = new BackpackWindowItemFilters(this.app, this.windowName, guiVisibilityHandler, itemVisibilityHandler)
        this.selectedItems = new BackpackSelectedItems(this.app, this)
    }

    public getPane() {
        return this.paneElem
    }

    public getClientBox(): DOMRectReadOnly
    {
        return this.paneElem?.getBoundingClientRect() ?? new DOMRectReadOnly()
    }

    public getItem(itemId: string): null|BackpackItem
    {
        return this.backpackItems.get(itemId) ?? null
    }

    public getAllItems(): ReadonlyMap<string,BackpackItem>
    {
        return this.backpackItems
    }

    public getVisibleItemIds(): ReadonlySet<string>
    {
        return this.filters.getVisibleItemIdsView()
    }

    public getSelectedItemIds(): ReadonlySet<string>
    {
        return this.selectedItems.getSelectedItemIds()
    }

    private getFreeCoordinate(): { x: number, y: number }
    {
        const { width, height } = this.paneElem.getBoundingClientRect()

        const rects: Array<{ left: number, top: number, right: number, bottom: number }> = []
        for (const item of this.backpackItems.values()) {
            rects.push(item.getElem().getBoundingClientRect())
        }
        rects.push({ left: width - 50, top: 0, right: width, bottom: 50 });

        const f = new FreeSpace(Math.max(10, Math.floor((width + height) / 2 / 64)), width, height, rects)
        return f.getFreeCoordinate(null)
        // return f.getFreeCoordinate(this.paneElem)
    }

    public setIsDropTargetStyle(isADropTarget: boolean, highlight: boolean = false): void
    {
        DomUtils.setElemClassPresent(this.paneElem, 'drop-target', isADropTarget)
        DomUtils.setElemClassPresent(this.paneElem, 'highlight', isADropTarget && highlight)
    }

    public getIsDropTargetInBackpack(ev: PointerEventData): boolean
    {
        return ev.dropTarget?.classList.contains('n3q-backpack-pane') ?? false
    }

    public translateClientPosToBackpackPos(clientX: number, clientY: number): [number, number]
    {
        const backpackClientBox = this.paneElem.getBoundingClientRect()
        const backpackX = clientX - backpackClientBox.left + this.paneElem.scrollLeft
        const backpackY = clientY - backpackClientBox.top + this.paneElem.scrollTop
        return [backpackX, backpackY]
    }

    public translateClientBoxToBackpackBox(clientBox: DOMRectReadOnly): DOMRectReadOnly
    {
        const [left, top] = this.translateClientPosToBackpackPos(clientBox.left, clientBox.top)
        return new DOMRectReadOnly(left, top, clientBox.width, clientBox.height)
    }

    public handleItemInventoryiframeApiRequest(request: WeblinClientIframeApi.Request): null|Promise<WeblinClientApi.Response>
    {
        return this.backpackItems.get(request.item)?.handleItemInventoryiframeApiRequest(request) ?? null
    }

    protected prepareMakeDom(): void
    {
        super.prepareMakeDom()
        this.windowCssClasses.push('n3q-backpackwindow')
        this.titleText = this.app.translateText('BackpackWindow.Inventory', 'Local Stuff')
        this.withButtonbar = true
        this.defaultWidth = 600
        this.defaultHeight = 400
        this.defaultBottom = 200
        this.defaultLeft = 50
    }

    protected async makeContent(): Promise<void>
    {
        await super.makeContent()
        this.buttonbarElem.append(this.filters.getGuiElem())

        this.paneElem = DomUtils.elemOfHtml('<div class="n3q-base n3q-backpack-pane" data-translate="children"></div>')

        this.panePointerEventDispatcher = new PointerEventDispatcher(this.app, this.paneElem)
        this.panePointerEventDispatcher.addAnyLeftButtonDownListener(ev => this.onPaneLeftButtonDown(ev))
        this.panePointerEventDispatcher.addAnyLeftClickListener(ev => this.onPaneLeftClick(ev))
        this.panePointerEventDispatcher.addDragStartListener(ev => this.onPaneDragStart(this.panePointerEventDispatcher, ev))
        this.panePointerEventDispatcher.addDragMoveListener(ev => this.onPaneDragMove(ev))
        this.panePointerEventDispatcher.addDragDropListener(ev => this.onPaneDragDrop(ev))
        this.panePointerEventDispatcher.addDragEndListener(() => this.onPaneDragEnd())

        this.contentElem.append(this.paneElem)

        this.isReady = true
        this.onBackpackUpdate([], [...this.app.getOwnItems().values()])
    }

    protected onBeforeClose(): void
    {
        super.onBeforeClose()
        this.isReady = false
        this.filters.getGuiElem().remove()
        this.selectedItems.itemDeselectAll()
        for (const item of this.backpackItems.values()) {
            item.destroy()
        }
        this.backpackItems.clear()
    }

    // Content area event handling:

    private onPaneLeftButtonDown(ev: PointerEventData): void
    {
    }

    private onPaneLeftClick(ev: PointerEventData): void
    {
        this.selectedItems.itemDeselectAll()
    }

    public onPaneDragStart(evDispatcher: PointerEventDispatcher, ev: PointerEventData): void
    {
        this.onPaneDragEnd()
        this.selectionRect = new BackpackUserSelectionRect(this.app, this, evDispatcher, ev)
    }

    public onPaneDragMove(ev: PointerEventData): void
    {
        this.selectionRect?.onDragMove(ev)
    }

    public onPaneDragDrop(ev: PointerEventData): void
    {
        this.selectedItems.itemDeselectAll()
        const items = this.selectionRect?.getResultingItemSelection() ?? []
        items.forEach(item => this.selectedItems.itemSelect(item))

    }

    public onPaneDragEnd(): void
    {
        this.selectionRect?.stop()
        this.selectionRect = null
    }

    // Item event handling to be called by BackpackItem only:

    public onItemLeftButtonDown(itemId: string, ev: PointerEventData): void
    {
        const backpackItem = this.backpackItems.get(itemId)
        if (!backpackItem) {
            return
        }
        switch (ev.modifierKeys) {
            case ModifierKeyId.none: {
                if (!this.selectedItems?.itemGetIsSelected(backpackItem.getItemId())) {
                    backpackItem.toFront()
                    this.selectedItems.itemSelectExclusively(backpackItem)
                }
            } break
            case ModifierKeyId.shift: {
                // Might be selection box start.
            } break
            case ModifierKeyId.control: {
                // Might be selection box start.
            } break
        }
    }

    public onItemLeftClick(itemId: string, ev: PointerEventData): void
    {
        const backpackItem = this.backpackItems.get(itemId)
        if (!backpackItem) {
            return
        }
        switch (ev.modifierKeys) {
            case ModifierKeyId.none: {
                backpackItem.toFront()
                this.selectedItems.itemSelectExclusively(backpackItem)
                backpackItem.toggleInfo(ev.clientX, ev.clientY)
            } break
            case ModifierKeyId.shift: {
                this.selectedItems.itemToggleSelect(backpackItem)
            } break
            case ModifierKeyId.control: {
                backpackItem.toFront()
                this.selectedItems.itemSelectExclusively(backpackItem)
                backpackItem.closeInfo()
                const item = backpackItem.getProperties()
                if (ItemProperties.getIsRezzed(item)) {
                    this.app.derezItem(itemId)
                } else {
                    this.app.rezItemInCurrentRoom(itemId, ItemProperties.getRezzedX(item) ?? ev.clientX)
                }
            } break
        }
    }

    public onItemDragStart(evDispatcher: PointerEventDispatcher, ev: PointerEventData): void
    {
        if (ev.modifierKeys !== ModifierKeyId.none) {
            this.onPaneDragStart(evDispatcher, ev)
        } else {
            this.selectedItems.onDragStart(evDispatcher, ev)
        }
    }

    public onItemDragMove(ev: PointerEventData): void
    {
        if (this.selectionRect) {
            this.onPaneDragMove(ev)
        } else {
            this.selectedItems.onDragMove(ev)
        }
    }

    public onItemDragEnter(ev: PointerEventData): void
    {
        if (!this.selectionRect) {
            this.selectedItems.onDragEnter(ev)
        }
    }

    public onItemDragLeave(ev: PointerEventData): void
    {
        if (!this.selectionRect) {
            this.selectedItems.onDragLeave(ev)
        }
    }

    public onItemDragDrop(ev: PointerEventData): void
    {
        if (this.selectionRect) {
            this.onPaneDragDrop(ev)
        } else {
            this.selectedItems.onDragDrop(ev)
        }
    }

    public onItemDragEnd(): void
    {
        if (this.selectionRect) {
            this.onPaneDragEnd()
        } else {
            this.selectedItems.onDragEnd()
        }
    }

    // Item filters:

    private itemFilterVisibilityHandler(itemId: string, isFilterVisible: boolean): void
    {
        const item = this.backpackItems.get(itemId)
        if (!isFilterVisible) {
            item.closeInfo()
            this.selectedItems.itemDeselect(itemId)
        }
        item?.setCssClass('filterHide', !isFilterVisible)
    }

    // Item show/hide, property updates:

    public onBackpackUpdate(itemsHide: ReadonlyArray<ItemProperties>, itemsShowOrSet: ReadonlyArray<ItemProperties>): void
    {
        if (!this.isReady) {
            return;
        }
        const [itemsHideFiltered, itemsShowOrSetFiltered] = this.filterBackpackUpdate(itemsHide, itemsShowOrSet)
        itemsHideFiltered.forEach(item => this.onHideItem(item));
        itemsShowOrSetFiltered.forEach(item => this.onShowOrSetItem(item));
        this.filters.onBackpackUpdate(itemsHideFiltered, itemsShowOrSetFiltered);
        this.selectedItems.onAfterBackpackUpdate(itemsHideFiltered, itemsShowOrSetFiltered)
    }

    private filterBackpackUpdate(itemsHide: ReadonlyArray<ItemProperties>, itemsShowOrSet: ReadonlyArray<ItemProperties>): [ReadonlyArray<ItemProperties>, ReadonlyArray<ItemProperties>]
    {
        const itemsHideFiltered = [...itemsHide]
        const itemsShowOrSetFiltered = []
        itemsShowOrSet.forEach(item => {
            if (ItemProperties.getIsVisibleInBackpack(item)) {
                itemsShowOrSetFiltered.push(item)
            } else {
                this.onHideItem(item)
                itemsHideFiltered.push(item)
            }
        })
        return [itemsHideFiltered, itemsShowOrSetFiltered]
    }

    private onShowOrSetItem(properties: ItemProperties): void
    {
        const itemId = properties[Pid.Id]
        let item = this.backpackItems.get(itemId)
        this.fixItemPosition(item, properties)
        if (item) {
            item.setProperties(properties)
        } else {
            item = new BackpackItem(this.app, this, properties)
            this.backpackItems.set(itemId, item)
            item.toFront()
        }
    }

    private onHideItem(properties: ItemProperties): void
    {
        const itemId = properties[Pid.Id]
        this.backpackItems.get(itemId)?.destroy()
        this.backpackItems.delete(itemId)
    }

    private fixItemPosition(itemOld: null|BackpackItem, propertiesNew: ItemProperties): void
    {
        let x = as.IntOrNull(propertiesNew[Pid.InventoryX])
        let y = as.IntOrNull(propertiesNew[Pid.InventoryY])
        if (x !== null && y !== null) {
            return
        }

        const propertiesOld = itemOld?.getProperties()
        x = as.IntOrNull(propertiesOld?.[Pid.InventoryX])
        y = as.IntOrNull(propertiesOld?.[Pid.InventoryY])
        if (x === null || y === null) {
            ({x, y} = this.getFreeCoordinate())
        }

        const xStr = as.String(x)
        const yStr = as.String(y)
        propertiesNew[Pid.InventoryX] = xStr
        propertiesNew[Pid.InventoryY] = yStr
        if (document.visibilityState === 'visible') {
            this.app.setItemBackpackPosition(ItemProperties.getId(propertiesNew), x, y)
            BackgroundMessage.modifyBackpackItemProperties(
                ItemProperties.getId(propertiesNew),
                { [Pid.InventoryX]: xStr, [Pid.InventoryY]: yStr },
                [],
                { skipPresenceUpdate: true }
            ).catch(error => this.app.onError(error))
        }
    }
}
