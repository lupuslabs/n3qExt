import * as imgDefaultItem from '../assets/DefaultItem.png';

import { as } from '../lib/as';
import { Config } from '../lib/Config';
import { ItemProperties, Pid } from '../lib/ItemProperties';
import { BackgroundMessage } from '../lib/BackgroundMessage';
import { ContentApp } from './ContentApp';
import { BackpackWindow } from './BackpackWindow';
import { BackpackItemInfo } from './BackpackItemInfo';
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher';
import { is } from '../lib/is';
import { DomUtils } from '../lib/DomUtils';
import { Participant } from './Participant';
import { PointerEventData } from '../lib/PointerEventData';

export class BackpackItem
{
    private elem: HTMLElement;
    private imageElem: HTMLElement;
    private textElem: HTMLElement;
    private coverElem: HTMLElement;
    private pointerEventDispatcher: PointerEventDispatcher;
    private dragElem?: HTMLElement;
    private dragBadgeElem?: HTMLImageElement;
    private dragIsRezable: boolean = false;
    private dragIsRezzed: boolean = false;
    private x: number = -1;
    private y: number = -1;
    private imageUrl: string = '';
    private imageWidth: number = -1;
    private imageHeight: number = -1;
    private info: BackpackItemInfo = null;

    public getElem(): HTMLElement { return this.elem; }
    public getProperties(): ItemProperties { return this.properties; }
    public getItemId(): string { return this.properties[Pid.Id]; }

    constructor(protected app: ContentApp, private backpackWindow: BackpackWindow, private itemId: string, private properties: ItemProperties)
    {
        this.elem = DomUtils.elemOfHtml(`<div class="n3q-base n3q-backpack-item" data-id="${this.itemId}"></div>`);
        this.imageElem = DomUtils.elemOfHtml('<img class="n3q-base n3q-backpack-item-image" src=""/>');
        this.elem.append(this.imageElem);
        this.textElem = DomUtils.elemOfHtml('<div class="n3q-base n3q-backpack-item-label"></div>');
        this.elem.append(this.textElem);
        this.coverElem = DomUtils.elemOfHtml('<div class="n3q-base n3q-backpack-item-cover"></div>');
        this.elem.append(this.coverElem);
        this.backpackWindow.getPane().append(this.elem);

        this.pointerEventDispatcher = new PointerEventDispatcher(this.app, this.elem);
        this.pointerEventDispatcher.addDropTargetTransparentClass('n3q-backpack-item', 'n3q-dropzone', 'n3q-badge');

        this.pointerEventDispatcher.addAnyButtonDownListener(ev => this.toFront());

        this.pointerEventDispatcher.addUnmodifiedLeftClickListener(ev => this.onUnmodifiedLeftClick(ev));
        this.pointerEventDispatcher.addCtrlLeftClickListener(ev => this.onCtrlLeftClick(ev));
        this.pointerEventDispatcher.addUnmodifiedLeftDoubleclickListener(ev => this.onUnmodifiedLeftDoubleclick(ev));

        this.pointerEventDispatcher.addDragStartListener(ev => this.onDragStart(ev));
        this.pointerEventDispatcher.addDragMoveListener(ev => this.onDragMove(ev));
        this.pointerEventDispatcher.addDragEnterListener(ev => {
            const dropTargetElem = ev.dropTarget;
            if (this.app.getEntityByelem(dropTargetElem)?.isValidDropTargetForItem(this) === true) {
                dropTargetElem?.parentElement?.classList.add('n3q-avatar-drophilite');
            }
        });
        this.pointerEventDispatcher.addDragLeaveListener(ev => {
            const dropTargetElem = ev.dropTargetLast;
            dropTargetElem?.parentElement?.classList.remove('n3q-avatar-drophilite');
        });
        this.pointerEventDispatcher.addDragDropListener(ev => this.onDragDrop(ev));
        this.pointerEventDispatcher.addDragEndListener(ev => this.onDragEnd());

        this.setProperties(this.properties);
    }

    private applyImage(): void
    {
        const imageUrl = this.properties[Pid.ImageUrl] ?? imgDefaultItem;
        if (imageUrl !== this.imageUrl) {
            this.imageUrl = imageUrl;
            this.app.fetchUrlAsDataUrl(imageUrl)
                .then(dataUrl => this.imageElem.setAttribute('src', dataUrl));
        }
    }

    private applyText(): void
    {
        let text = as.String(this.properties[Pid.Label]);
        const description = as.String(this.properties[Pid.Description]);
        if (description !== '') {
            text += (text !== '' ? ': ' : '') + description;
        }
        this.textElem.innerText = text;
        this.elem.setAttribute('title', text);
    }

    private getWidth(): number { return this.imageWidth + Config.get('backpack.itemBorderWidth', 2) * 2; }
    private getHeight(): number { return this.imageHeight + Config.get('backpack.itemBorderWidth', 2) * 2 + Config.get('backpack.itemLabelHeight', 12); }

    private applySize()
    {
        let imageWidth = as.Int(this.properties[Pid.Width], -1);
        if (imageWidth < 1) {
            imageWidth = 50;
        }
        let imageHeight = as.Int(this.properties[Pid.Height], -1);
        if (imageHeight < 1) {
            imageHeight = 50;
        }
        if (imageWidth === this.imageWidth && imageHeight === this.imageHeight) {
            return;
        }
        this.imageWidth = imageWidth;
        this.imageHeight = imageHeight;
        this.imageElem.style.width = `${this.imageWidth}px`;
        this.imageElem.style.height = `${this.imageHeight}px`;
        this.elem.style.width = `${this.getWidth()}px`;
        this.elem.style.height = `${this.getHeight()}px`;
    }

    private applyPosition()
    {
        let x = as.Int(this.properties[Pid.InventoryX], -1);
        let y = as.Int(this.properties[Pid.InventoryY], -1);
        if (x < 0 || y < 0) {
            const pos = this.backpackWindow.getFreeCoordinate();
            x = pos.x;
            y = pos.y;
        }

        // fix position
        // const bounds = {
        //     left: this.getWidth() / 2,
        //     top: this.getHeight() / 2,
        //     right: this.backpackWindow.getWidth() - this.getWidth() / 2,
        //     bottom: this.backpackWindow.getHeight() - this.getHeight() / 2
        // };
        // if (x < bounds.left) { x = bounds.left; }
        // if (x > bounds.right) { x = bounds.right; }
        // if (y < bounds.top) { y = bounds.top; }
        // if (y > bounds.bottom) { y = bounds.bottom; }

        if (x !== this.x || y !== this.y) {
            this.x = x;
            this.y = y;

            this.elem.style.left = `${x - this.getWidth() / 2}px`;
            this.elem.style.top = `${y - this.getHeight() / 2}px`;
        }
    }

    private getScrolledItemPos(x: number, y: number): { x: number, y: number }
    {
        const scrollX = this.backpackWindow.getPane().scrollLeft;
        const scrollY = this.backpackWindow.getPane().scrollTop;
        return { x: x + scrollX, y: y + scrollY };
    }

    public toFront(): void
    {
        this.app.toFront(this.getElem(), ContentApp.LayerWindowContent);
    }

    private onUnmodifiedLeftClick(ev: PointerEventData): void
    {
        this.toFront();
        const infoOpen = !is.nil(this.info);
        this.info?.close();
        if (!infoOpen) {
            const onClose = () => { this.info = null; };
            this.info = new BackpackItemInfo(this.app, this, onClose);
            this.info.show({ left: ev.clientX, top: ev.clientY });
        }
    }

    private onCtrlLeftClick(ev: PointerEventData): void
    {
        this.toFront();
        this.info?.close();
        if (as.Bool(this.properties[Pid.IsRezzed], false)) {
            this.app.derezItem(this.getItemId());
        } else {
            const rezzedX = as.Int(this.properties[Pid.RezzedX], -1);
            this.rezItem(as.Int(rezzedX, ev.clientX));
        }
    }

    private onUnmodifiedLeftDoubleclick(ev: PointerEventData): void
    {
        this.toFront();
        this.info?.close();
    }

    private onDragStart(ev: PointerEventData): void
    {
        const dragElem: HTMLElement = <HTMLElement>this.elem.cloneNode(true);

        // Work around wrongly applied CSP in Firefox on pages limiting img-src after cloning by unsetting and setting img src:
        const dragImgElem = dragElem.querySelector('img');
        dragImgElem.setAttribute('src', '');
        dragImgElem.setAttribute('src', this.imageElem.getAttribute('src'));

        dragElem.classList.add('n3q-dragging');
        this.dragElem = dragElem;
        this.app.getDisplay()?.append(dragElem);
        this.app.toFront(dragElem, ContentApp.LayerDrag);
        this.elem.classList.add('n3q-hidden');

        const badges = this.app.getRoom()?.getMyParticipant()?.getBadgesDisplay();
        this.dragBadgeElem = badges?.makeDraggedBadgeIcon(this.properties);

        this.dragIsRezable = as.Bool(this.properties[Pid.IsRezable], true);
        this.dragIsRezzed = as.Bool(this.properties[Pid.IsRezzed]);
        if (this.dragIsRezable && !this.dragIsRezzed) {
            this.app.showDropzone();
        }
        this.toFront();
        this.info?.close();
    }

    private onDragMove(ev: PointerEventData): void
    {
        if (ev.buttons !== DomUtils.ButtonId.first || ev.modifierKeys !== DomUtils.ModifierKeyId.none) {
            this.pointerEventDispatcher.cancelDrag();
            return;
        }

        const badges = this.app.getRoom()?.getMyParticipant()?.getBadgesDisplay();
        let targetIsBadges = badges?.isValidEditModeBadgeDrop(ev, this.properties);
        if (targetIsBadges) {
            badges?.showDraggedBadgeIconInside(this.properties, ev, this.dragBadgeElem);
        } else {
            badges?.hideDraggedBadgeIcon(this.dragBadgeElem);
        }

        if (!this.dragIsRezzed) {
            if (!targetIsBadges && this.isDraggablePositionInDropzone(ev)) {
                this.app.hiliteDropzone(true);
            } else {
                this.app.hiliteDropzone(false);
            }
        }

        if (targetIsBadges) {
            this.dragElem.classList.add('n3q-hidden');
        } else {
            this.dragElem.style.left = `${ev.clientX - ev.startDomElementOffsetX}px`;
            this.dragElem.style.top = `${ev.clientY - ev.startDomElementOffsetY}px`;
            this.dragElem.classList.remove('n3q-hidden');
        }
    }

    private onDragDrop(ev: PointerEventData): void
    {
        if (this.isDraggablePositionInBackpack(ev)) {
            const pos = this.draggablePositionRelativeToPane(ev);
            if (pos.x !== this.x || pos.y !== this.y) {
                const scrolledPos = this.getScrolledItemPos(pos.x, pos.y);
                this.properties[Pid.InventoryX] = scrolledPos.x.toString();
                this.properties[Pid.InventoryY] = scrolledPos.y.toString();
                this.applyPosition();
                this.sendSetItemCoordinates(scrolledPos.x, scrolledPos.y);
            }
            return;
        }

        const badges = this.app.getRoom()?.getMyParticipant()?.getBadgesDisplay();
        if (badges?.isValidEditModeBadgeDrop(ev, this.properties)) {
            badges?.onBadgeDropInside(ev, this.properties);
            return;
        }

        const dropTargetEntity = this.app.getEntityByelem(ev.dropTarget);
        if (dropTargetEntity instanceof Participant && dropTargetEntity.isValidDropTargetForItem(this)) {
            dropTargetEntity.onGotItemDroppedOn(this);
            return;
        }
        if (this.isDraggablePositionInDropzone(ev)) {
            const dropXLeft = ev.clientX - ev.startDomElementOffsetX;
            const itemCenterOffset = this.elem.offsetWidth / 2;
            let dropX = dropXLeft + itemCenterOffset;
            dropX = Math.max(0, Math.min(document.documentElement.offsetWidth - 1, dropX));
            this.rezItem(dropX);
            return;
        }
        // No action.
    }

    private onDragEnd(): void
    {
        this.app.hideDropzone();
        this.dragElem?.parentElement?.removeChild(this.dragElem);
        const badges = this.app.getRoom()?.getMyParticipant()?.getBadgesDisplay();
        this.dragBadgeElem = badges?.disposeDraggedBadgeIcon(this.dragBadgeElem);
        this.elem.classList.remove('n3q-hidden');
    }

    private draggedItemCenter(ev: PointerEventData): { x: number, y: number }
    {
        const x = ev.clientX - ev.startDomElementOffsetX + this.dragElem.offsetWidth / 2;
        const y = ev.clientY - ev.startDomElementOffsetY + this.dragElem.offsetHeight / 2;
        return { x: x, y: y };
    }

    private isDraggablePositionInBackpack(ev: PointerEventData): boolean
    {
        return ev.dropTarget?.classList.contains('n3q-backpack-pane') === true;
    }

    private draggablePositionRelativeToPane(ev: PointerEventData): { x: number, y: number }
    {
        const pos = this.draggedItemCenter(ev);
        const rect = this.backpackWindow.getPane().getBoundingClientRect();
        return { 'x': pos.x - rect.left, 'y': pos.y - rect.top };
    }

    private isDraggablePositionInDropzone(ev: PointerEventData): boolean
    {
        const dropzoneBottom = this.app.getDisplay().offsetHeight;
        const dropZoneHeight: number = Config.get('backpack.dropZoneHeight', 100);
        const dropzoneTop = dropzoneBottom - dropZoneHeight;
        const dragElemBottom = ev.clientY - ev.startDomElementOffsetY + (<HTMLElement>ev.domElement).offsetHeight;
        return dragElemBottom > dropzoneTop;
    }

    private sendSetItemCoordinates(x: number, y: number): void
    {
        (async () =>
        {
            const itemId = this.itemId;
            if (await BackgroundMessage.isBackpackItem(itemId)) {
                await BackgroundMessage.modifyBackpackItemProperties(
                    itemId,
                    {
                        [Pid.InventoryX]: Math.round(x).toString(),
                        [Pid.InventoryY]: Math.round(y).toString()
                    },
                    [],
                    { skipPresenceUpdate: true }
                );
            }
        })().catch(error =>
        {
            this.app.onError(error);
        });
    }

    public rezItem(x: number)
    {
        const room = this.app.getRoom();
        if (!is.nil(room)) {
            this.backpackWindow.rezItemSync(this.itemId, room.getJid(), Math.round(x), room.getDestination());
        }
    }

    // events

    public setProperties(properties: ItemProperties)
    {
        this.properties = properties;

        this.applyText();
        this.applyImage();
        this.applySize();
        this.applyPosition();

        if (as.Bool(properties[Pid.IsRezzed])) {
            this.elem.classList.add('n3q-backpack-item-rezzed');
        } else {
            this.elem.classList.remove('n3q-backpack-item-rezzed');
        }

        this.info?.update();
    }

    public destroy()
    {
        this.info?.close();
        this.elem.remove();
        this.onDragEnd();
    }
}
