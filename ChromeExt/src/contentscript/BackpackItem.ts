import { is } from '../lib/is'
import { as } from '../lib/as'
import { ItemProperties, Pid } from '../lib/ItemProperties'
import { ContentApp } from './ContentApp'
import { BackpackWindow } from './BackpackWindow'
import { BackpackItemInfo } from './BackpackItemInfo'
import { DomUtils } from '../lib/DomUtils'
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'
import { WeblinClientIframeApi } from '../lib/WeblinClientIframeApi'

export class BackpackItem
{
    static nonImageWidth: number = 0
    static nonImageHeight: number = 0

    private static updateNonImageSize(item: BackpackItem)
    {
        if (BackpackItem.nonImageHeight > 0) {
            return
        }
        const { width, height } = item.elem.getBoundingClientRect()
        BackpackItem.nonImageWidth = width - item.imageWidth
        BackpackItem.nonImageHeight = height - item.imageHeight
    }

    private readonly app: ContentApp
    private readonly backpackWindow: BackpackWindow
    private readonly itemId: string

    private readonly elem: HTMLElement
    private readonly imageElem: HTMLElement
    private readonly textElem: HTMLElement
    private readonly pointerEventDispatcher: PointerEventDispatcher

    private properties: ItemProperties
    private x: number = 0
    private y: number = 0
    private imageUrl: string = ''
    private imageWidth: number = 0
    private imageHeight: number = 0

    private info: BackpackItemInfo = null

    constructor(app: ContentApp, backpackWindow: BackpackWindow, properties: ItemProperties)
    {
        const itemId = properties[Pid.Id]
        this.app = app
        this.backpackWindow = backpackWindow
        this.properties = properties
        this.itemId = itemId

        this.elem = DomUtils.elemOfHtml(`<div class="n3q-backpack-item" data-id="${this.itemId}"></div>`)
        this.imageElem = DomUtils.elemOfHtml('<div class="n3q-backpack-item-image"></div>')
        this.elem.append(this.imageElem)
        this.textElem = DomUtils.elemOfHtml('<div class="n3q-backpack-item-label"></div>')
        this.elem.append(this.textElem)
        this.backpackWindow.getPane().append(this.elem)

        this.pointerEventDispatcher = new PointerEventDispatcher(this.app, this.elem)
        this.pointerEventDispatcher.addDropTargetTransparentClass('n3q-backpack-item', 'n3q-badge')
        this.pointerEventDispatcher.addAnyLeftButtonDownListener(ev => backpackWindow.onItemLeftButtonDown(itemId, ev))
        this.pointerEventDispatcher.addAnyLeftClickListener(ev => backpackWindow.onItemLeftClick(itemId, ev))
        this.pointerEventDispatcher.addDragStartListener(ev => backpackWindow.onItemDragStart(this.pointerEventDispatcher, ev))
        this.pointerEventDispatcher.addDragMoveListener(ev => backpackWindow.onItemDragMove(ev))
        this.pointerEventDispatcher.addDragEnterListener(ev => backpackWindow.onItemDragEnter(ev))
        this.pointerEventDispatcher.addDragLeaveListener(ev => backpackWindow.onItemDragLeave(ev))
        this.pointerEventDispatcher.addDragDropListener(ev => backpackWindow.onItemDragDrop(ev))
        this.pointerEventDispatcher.addDragEndListener(() => backpackWindow.onItemDragEnd())

        this.setProperties(this.properties)
    }

    public getElem(): HTMLElement
    {
        return this.elem
    }

    public getProperties(): Readonly<ItemProperties>
    {
        return this.properties
    }

    public getItemId(): string
    {
        return this.itemId
    }

    public handleItemInventoryiframeApiRequest(request: WeblinClientIframeApi.Request): void
    {
        this.info?.handleItemInventoryiframeApiRequest(request)
    }

    private applyImage(): void
    {
        const imageUrl = ItemProperties.getImageUrl(this.properties)
        if (imageUrl !== this.imageUrl) {
            this.imageUrl = imageUrl
            const [wrapperElem, donePromise] = this.app.makeScaledAndClippedIcon(this.imageUrl, 10, this.imageWidth, this.imageHeight)
            donePromise.then(() => {
                this.imageElem.firstElementChild?.remove()
                this.imageElem.append(wrapperElem)
            })
        }
    }

    private applyText(): void
    {
        let text = as.String(this.properties[Pid.Label])
        const description = as.String(this.properties[Pid.Description])
        if (description !== '') {
            text += (text !== '' ? ': ' : '') + description
        }
        this.textElem.innerText = text
        this.elem.setAttribute('title', text)
    }

    private getSize(): [number, number] {
        BackpackItem.updateNonImageSize(this)
        return [this.imageWidth + BackpackItem.nonImageWidth, this.imageHeight + BackpackItem.nonImageHeight]
    }

    /**
     * Coordinate system origin is the top left corner of the backpack area and values increase to the bottom right.
     */
    public getItemBackpackBoundingBox(): DOMRectReadOnly
    {
        const [width, height] = this.getSize()
        const y = this.y - height / 2
        const x = this.x - width / 2
        return new DOMRectReadOnly(x, y, width, height)
    }

    private applySize(): void
    {
        let imageWidth = as.Int(this.properties[Pid.Width], -1)
        if (imageWidth < 1) {
            imageWidth = 50
        }
        let imageHeight = as.Int(this.properties[Pid.Height], -1)
        if (imageHeight < 1) {
            imageHeight = 50
        }
        if (imageWidth === this.imageWidth && imageHeight === this.imageHeight) {
            return
        }
        this.imageWidth = imageWidth
        this.imageHeight = imageHeight
        this.imageElem.style.width = `${this.imageWidth}px`
        this.textElem.style.width = `${this.imageWidth}px`
        this.imageElem.style.height = `${this.imageHeight}px`
    }

    private applyPosition(): void
    {
        let x = as.Int(this.properties[Pid.InventoryX])
        let y = as.Int(this.properties[Pid.InventoryY])
        this.x = x
        this.y = y
        const [width, height] = this.getSize()
        this.elem.style.left = `${x - width / 2}px`
        this.elem.style.top = `${y - height / 2}px`
    }

    public toFront(): void
    {
        this.app.toFront(this.getElem(), ContentApp.LayerWindowContent)
    }

    public setCssClass(cssClass: string, isSet: boolean): void
    {
        DomUtils.setElemClassPresent(this.elem, cssClass, isSet)
    }

    public toggleInfo(clientX: number, clientY: number): void
    {
        if (is.nil(this.info)) {
            this.openInfo(clientX, clientY)
        } else {
            this.closeInfo()
        }
    }

    public openInfo(clientX: number, clientY: number): void
    {
        if (is.nil(this.info)) {
            const onClose = () => { this.info = null }
            this.info = new BackpackItemInfo(this.app, this, onClose)
            this.info.show({ left: clientX, top: clientY })
        }
    }

    public closeInfo(): void
    {
        this.info?.close()
    }

    // events

    public setProperties(properties: ItemProperties): void
    {
        this.properties = properties

        this.applyText()
        this.applySize()
        this.applyPosition()
        this.applyImage()

        if (as.Bool(properties[Pid.IsRezzed])) {
            this.elem.classList.add('n3q-backpack-item-rezzed')
        } else {
            this.elem.classList.remove('n3q-backpack-item-rezzed')
        }

        this.info?.update()
    }

    public destroy(): void
    {
        this.info?.close()
        this.elem.remove()
    }
}
