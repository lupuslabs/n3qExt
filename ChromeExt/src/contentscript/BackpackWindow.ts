import { ItemProperties } from '../lib/ItemProperties'
import { ContentApp } from './ContentApp'
import { BackpackUpdateEventData } from './OwnItemRepository'
import { FullWindow, FullWindowOptions } from './FullWindow'
import { BackpackItem } from './BackpackItem'
import { DomUtils } from '../lib/DomUtils'
import ModifierKeyId = DomUtils.ModifierKeyId
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'
import { BackpackWindowItemFilters, ItemVisibility } from './BackpackWindowItemFilters'
import { PointerEventData } from '../lib/PointerEventData'
import { BackpackSelectedItems } from './BackpackSelectedItems'
import { BackpackUserSelectionRect } from './BackpackUserSelectionRect'

export class BackpackWindow extends FullWindow<FullWindowOptions>
{
    private readonly backPackUpdateListener: (data: BackpackUpdateEventData) => void
    protected singleFilterId: null|string = null
    protected hideFilterTags: string[] = ['notInBackpack']
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
        this.initWindowSettings()

        this.backPackUpdateListener = ({itemsDeleted, itemsNewOrChanged}) => this.onBackpackUpdate(itemsDeleted, itemsNewOrChanged)
        const guiVisibilityHandler = (isFilterGuiVisible: boolean) => this.setActionBarVisibleState(isFilterGuiVisible)
        const itemVisibilityHandler = (itemId: string, isFilterVisible: ItemVisibility) => this.itemFilterVisibilityHandler(itemId, isFilterVisible)
        this.filters = new BackpackWindowItemFilters(this.app, this.singleFilterId, this.hideFilterTags, this.windowSettingsId, guiVisibilityHandler, itemVisibilityHandler)
        this.selectedItems = new BackpackSelectedItems(this.app, this)
    }

    protected initWindowSettings(): void {
        this.windowSettingsId = 'Backpack'
        this.persistGeometry = true
        this.windowCssClasses.push('backpackwindow')
        this.titleText = 'Local Stuff';
        this.titleTextId = 'BackpackWindow.Inventory';
        this.defaultWidth = 600
        this.defaultHeight = 400
        this.defaultBottom = 200
        this.defaultAboveBottomOffset = 50
        this.withActionbar = true
    }

    public getPane() {
        return this.paneElem
    }

    public getClientBox(): DOMRectReadOnly
    {
        return this.paneElem?.getBoundingClientRect() ?? new DOMRectReadOnly()
    }

    public itemToFront(itemId: string): void
    {
        this.backpackItems.get(itemId)?.toFront();
    }

    public getAllItems(): ReadonlyMap<string,BackpackItem>
    {
        return this.backpackItems
    }

    public getVisibleItemIds(): ReadonlySet<string>
    {
        return this.filters.getFullVisibilityItemIds()
    }

    public getSelectedItemIds(): ReadonlySet<string>
    {
        return this.selectedItems.getSelectedItemIds()
    }

    public setIsDropTargetStyle(isADropTarget: boolean, highlight: boolean = false): void
    {
        DomUtils.setElemClassPresent(this.paneElem, 'drop-target', isADropTarget)
        DomUtils.setElemClassPresent(this.paneElem, 'highlight', isADropTarget && highlight)
    }

    public getIsDropTargetInBackpack(ev: PointerEventData): boolean
    {
        return ev.dropTarget?.classList.contains('backpack-pane') ?? false
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

    public showFilter(filterId: string): void
    {
        this.filters.showFilter(filterId)
    }

    protected async makeContent(): Promise<void>
    {
        await super.makeContent()
        this.actionbarElem.append(this.filters.getGuiElem())

        this.paneElem = DomUtils.elemOfHtml('<div class="backpack-pane" data-translate="children"></div>')

        this.panePointerEventDispatcher = PointerEventDispatcher.makeOpaqueDispatcher(this.app, this.paneElem)
        this.panePointerEventDispatcher.addAnyLeftButtonDownListener(ev => this.onPaneLeftButtonDown(ev))
        this.panePointerEventDispatcher.addAnyLeftClickListener(ev => this.onPaneLeftClick(ev))
        this.panePointerEventDispatcher.addDragStartListener(ev => this.onPaneDragStart(this.panePointerEventDispatcher, ev))
        this.panePointerEventDispatcher.addDragMoveListener(ev => this.onPaneDragMove(ev))
        this.panePointerEventDispatcher.addDragDropListener(ev => this.onPaneDragDrop(ev))
        this.panePointerEventDispatcher.addDragEndListener(() => this.onPaneDragEnd())

        this.contentElem.append(this.paneElem)

        this.isReady = true
        this.onBackpackUpdate([], [...this.app.ownItems.getAllItems().values()])
        this.app.ownItems.backpackUpdateListeners.addListener(this.backPackUpdateListener)
    }

    protected onBeforeClose(): void
    {
        super.onBeforeClose()
        this.app.ownItems.backpackUpdateListeners.removeListener(this.backPackUpdateListener)
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

    private onPaneDragStart(evDispatcher: PointerEventDispatcher, ev: PointerEventData): void
    {
        this.onPaneDragEnd()
        this.selectionRect = new BackpackUserSelectionRect(this.app, this, evDispatcher, ev)
    }

    private onPaneDragMove(ev: PointerEventData): void
    {
        this.selectionRect?.onDragMove(ev)
    }

    private onPaneDragDrop(ev: PointerEventData): void
    {
        this.selectedItems.itemDeselectAll()
        const items = this.selectionRect?.getResultingItemSelection() ?? []
        items.forEach(item => this.selectedItems.itemSelect(item))

    }

    private onPaneDragEnd(): void
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
                backpackItem.toggleInfo(ev.clientX, ev.clientY, null)
            } break
            case ModifierKeyId.alt: {
                backpackItem.toFront()
                this.selectedItems.itemSelectExclusively(backpackItem)
                backpackItem.toggleInfo(ev.clientX, ev.clientY, true)
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

    // Item updates:

    private itemFilterVisibilityHandler(itemId: string, itemVisibility: ItemVisibility): void
    {
        if (itemVisibility === 'none') {
            this.selectedItems.itemDeselect(itemId)
            this.backpackItems.get(itemId)?.destroy()
            this.backpackItems.delete(itemId)
            return
        }
        let item = this.backpackItems.get(itemId) ?? null
        if (!item) {
            const properties = this.app.ownItems.getItemById(itemId)
            if (!properties) {
                return
            }
            item = new BackpackItem(this.app, this, properties)
            this.backpackItems.set(itemId, item)
            item.toFront()
        }
        const isFaded = itemVisibility === 'faded'
        if (isFaded) {
            item.closeInfo()
            this.selectedItems.itemDeselect(itemId)
        }
        item?.setCssClass('filter-hide', isFaded)
    }

    private onBackpackUpdate(itemsHide: ReadonlyArray<ItemProperties>, itemsShowOrSet: ReadonlyArray<ItemProperties>): void
    {
        if (!this.isReady) {
            return;
        }
        for (const item of itemsShowOrSet) {
            this.backpackItems.get(ItemProperties.getId(item))?.setProperties(item)
        }

        this.filters.onBackpackUpdate(itemsHide, itemsShowOrSet)
        this.selectedItems.onAfterBackpackUpdate(itemsHide, itemsShowOrSet)

        if (document.visibilityState === 'visible') {
            const paneRect = this.paneElem?.getBoundingClientRect() ?? null
            if (paneRect) {
                this.app.ownItems.fixItemInventoryPositions(paneRect.width, paneRect.height, [...this.getVisibleItemIds()])
            }
        }
    }

}
