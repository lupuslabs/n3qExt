import imgDefaultItem from '../assets/DefaultItem.png';

import * as $ from 'jquery';
import { as } from '../lib/as';
import { Config } from '../lib/Config';
import { ErrorWithData, Utils } from '../lib/Utils';
import { ItemProperties, Pid } from '../lib/ItemProperties';
import { BackgroundMessage } from '../lib/BackgroundMessage';
import { ContentApp } from './ContentApp';
import { BackpackWindow } from './BackpackWindow';
import { BackpackItemInfo } from './BackpackItemInfo';
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher';
import { is } from '../lib/is';
import { DomButtonId } from '../lib/domTools';
import { Participant } from './Participant';
import { DomModifierKeyId, PointerEventData } from '../lib/PointerEventData';

export class BackpackItem
{
    private elem: HTMLDivElement;
    private imageElem: HTMLDivElement;
    private textElem: HTMLDivElement;
    private coverElem: HTMLDivElement;
    private pointerEventDispatcher: PointerEventDispatcher;
    private dragElem?: HTMLElement;
    private dragBadgeElem?: HTMLImageElement;
    private dragIsRezable: boolean = false;
    private dragIsRezzed: boolean = false;
    private x: number = 100;
    private y: number = 100;
    private imageWidth: number = 64;
    private imageHeight: number = 64;
    private info: BackpackItemInfo = null;

    getElem(): HTMLElement { return this.elem; }
    getProperties(): ItemProperties { return this.properties; }
    getItemId(): string { return this.properties[Pid.Id]; }

    constructor(protected app: ContentApp, private backpackWindow: BackpackWindow, private itemId: string, private properties: ItemProperties)
    {
        const paneElem = this.backpackWindow.getPane();

        const pos = this.backpackWindow.getFreeCoordinate();
        const x = pos.x;
        const y = pos.y;

        this.elem = <HTMLDivElement>$('<div class="n3q-base n3q-backpack-item" data-id="' + this.itemId + '" />').get(0);
        this.imageElem = <HTMLDivElement>$('<div class="n3q-base n3q-backpack-item-image" />').get(0);
        this.elem.append(this.imageElem);
        this.textElem = <HTMLDivElement>$('<div class="n3q-base n3q-backpack-item-label" />').get(0);
        this.elem.append(this.textElem);
        this.coverElem = <HTMLDivElement>$('<div class="n3q-base n3q-backpack-item-cover" />').get(0);
        this.elem.append(this.coverElem);

        this.setImage(imgDefaultItem);
        this.setSize(50, 50);
        this.setPosition(x, y);

        paneElem.append(this.elem);

        this.pointerEventDispatcher = new PointerEventDispatcher(this.app, this.elem);
        this.pointerEventDispatcher.addDropTargetTransparentClass('n3q-backpack-item', 'n3q-dropzone');

        this.pointerEventDispatcher.setEventListener('dragenter', eventData => {
            const dropTargetElem = eventData.dropTarget;
            if (this.app.getEntityByelem(dropTargetElem)?.isValidDropTargetForItem(this) === true) {
                dropTargetElem?.parentElement?.classList.add('n3q-avatar-drophilite');
            }
        });
        this.pointerEventDispatcher.setEventListener('dragleave', eventData => {
            const dropTargetElem = eventData.dropTargetLast;
            dropTargetElem?.parentElement?.classList.remove('n3q-avatar-drophilite');
        });

        this.pointerEventDispatcher.setEventListener('buttondown', eventData => {
            this.toFront();
        });
        this.pointerEventDispatcher.setEventListener('click', eventData => {
            this.onMouseClick(eventData);
        });
        this.pointerEventDispatcher.setEventListener('doubleclick', eventData => {
            this.onMouseDoubleClick(eventData);
        });

        this.pointerEventDispatcher.setEventListener('dragstart', eventData => {
            this.onDragStart(eventData);
        });
        this.pointerEventDispatcher.setEventListener('dragmove', eventData => {
            this.onDragMove(eventData);
        });
        this.pointerEventDispatcher.setEventListener('dragdrop', eventData => {
            this.onDragDrop(eventData);
        });
        this.pointerEventDispatcher.setEventListener('dragend', eventData => {
            this.onDragEnd();
        });

    }

    getX(): number { return this.x; }
    getY(): number { return this.y; }
    getSize(): number { return this.imageWidth; }

    match(pid: string, value: any)
    {
        if (this.properties[pid]) {
            if (value) {
                return as.String(this.properties[pid]) === as.String(value);
            }
        }
        return false;
    }

    setImage(url: string): void
    {
        this.app.fetchUrlAsDataUrl(url).then(dataUrl => this.setResolvedImageUrl(dataUrl));
    }

    private setResolvedImageUrl(url: string): void
    {
        $(this.imageElem).css({ 'background-image': `url("${url}")` });
    }

    setText(text: string): void
    {
        $(this.textElem).text(text);
        $(this.elem).attr('title', text);
    }

    getWidth(): number { return this.imageWidth + Config.get('backpack.itemBorderWidth', 2) * 2; }
    getHeight(): number { return this.imageHeight + Config.get('backpack.itemBorderWidth', 2) * 2 + Config.get('backpack.itemLabelHeight', 12); }

    setSize(imageWidth: number, imageHeight: number)
    {
        this.imageWidth = imageWidth;
        this.imageHeight = imageHeight;
        $(this.elem).css({ 'width': this.getWidth() + 'px', 'height': this.getHeight() + 'px' });
    }

    setPosition(x: number, y: number)
    {
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

        this.x = x;
        this.y = y;

        $(this.elem).css({ 'left': (x - this.getWidth() / 2) + 'px', 'top': (y - this.getHeight() / 2) + 'px' });
    }

    getScrolledItemPos(x: number, y: number): { x: number, y: number }
    {
        const scrollX = this.backpackWindow.getPane().scrollLeft;
        const scrollY = this.backpackWindow.getPane().scrollTop;
        return { x: x + scrollX, y: y + scrollY };
    }

    setVisibility(state: boolean)
    {
        if (state) {
            $(this.elem).stop().fadeIn('fast');
        } else {
            $(this.elem).hide();
        }
    }

    toFront(): void
    {
        this.app.toFront(this.getElem(), ContentApp.LayerWindowContent);
    }

    private onMouseClick(ev: PointerEventData): void
    {
        this.toFront();
        const infoOpen = !is.nil(this.info);
        this.info?.close();
        switch (ev.buttons) {
            case DomButtonId.first: {
                switch (ev.modifierKeys) {
                    case DomModifierKeyId.none: {
                        if (!infoOpen) {
                            const onClose = () => { this.info = null; };
                            this.info = new BackpackItemInfo(this.app, this, onClose);
                            this.info.show(ev.clientX, ev.clientY);
                            this.app.toFront(this.info.getElem(), ContentApp.LayerWindowContent);
                        }
                    } break;
                    case DomModifierKeyId.control: {
                        if (as.Bool(this.properties[Pid.IsRezzed], false)) {
                            this.app.derezItem(this.getItemId());
                        } else {
                            const rezzedX = as.Int(this.properties[Pid.RezzedX], -1);
                            this.rezItem(as.Int(rezzedX, ev.clientX));
                        }
                    } break;
                }
            } break;
        }
    }

    private onMouseDoubleClick(ev: PointerEventData): void
    {
        this.toFront();
        this.info?.close();
    }

    private onDragStart(ev: PointerEventData): void
    {
        const dragElem: HTMLElement = <HTMLElement>this.elem.cloneNode(true);
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
        if (ev.buttons !== DomButtonId.first || ev.modifierKeys !== DomModifierKeyId.none) {
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
                this.setPosition(scrolledPos.x, scrolledPos.y);
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

    private scrolledElemRect(elem: HTMLElement): { left: number, top: number, width: number, height: number }
    {
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const panePosition = $(elem).offset();
        const left = panePosition.left -= scrollLeft;
        const top = panePosition.top -= scrollTop;
        const width = $(elem).width();
        const height = $(elem).height();

        return { left: left, top: top, width: width, height: height };
    }

    private isDraggablePositionInBackpack(ev: PointerEventData): boolean
    {
        return ev.dropTarget?.classList.contains('n3q-backpack-pane') === true;
    }

    private draggablePositionRelativeToPane(ev: PointerEventData): { x: number, y: number }
    {
        const pos = this.draggedItemCenter(ev);
        const rect = this.scrolledElemRect(this.backpackWindow.getPane());
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

    sendSetItemCoordinates(x: number, y: number): void
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
            this.app.onError(ErrorWithData.ofError(error, undefined, { this: this }));
        });
    }

    rezItem(x: number)
    {
        const room = this.app.getRoom();
        if (!is.nil(room)) {
            this.backpackWindow.rezItemSync(this.itemId, room.getJid(), Math.round(x), room.getDestination());
        }
    }

    getPseudoRandomCoordinate(space: number, size: number, padding: number, id: string, mod: number): number
    {
        const min = size / 2 + padding;
        const max = space - min;
        return Utils.pseudoRandomInt(min, max, id, '', mod);
    }

    // events

    create()
    {
        this.applyProperties(this.properties);
    }

    applyProperties(properties: ItemProperties)
    {
        if (properties[Pid.ImageUrl]) {
            this.setImage(properties[Pid.ImageUrl]);
        }

        let text = as.String(properties[Pid.Label]);
        const description = as.String(properties[Pid.Description]);
        if (description !== '') {
            text += (text !== '' ? ': ' : '') + description;
        }
        this.setText(text);

        if (properties[Pid.Width] && properties[Pid.Height]) {
            const imageWidth = as.Int(properties[Pid.Width], -1);
            const imageHeight = as.Int(properties[Pid.Height], -1);
            if (imageWidth > 0 && imageHeight > 0 && (imageWidth !== this.imageWidth || imageHeight !== this.imageHeight)) {
                this.setSize(imageWidth, imageHeight);
            }
        }

        if (as.Bool(properties[Pid.IsRezzed])) {
            $(this.elem).addClass('n3q-backpack-item-rezzed');
        } else {
            $(this.elem).removeClass('n3q-backpack-item-rezzed');
        }

        if (properties[Pid.InventoryX] && properties[Pid.InventoryY]) {
            let x = as.Int(properties[Pid.InventoryX], -1);
            let y = as.Int(properties[Pid.InventoryY], -1);

            if (x < 0 || y < 0) {
                const pos = this.backpackWindow.getFreeCoordinate();
                x = pos.x;
                y = pos.y;
            }

            if (x !== this.x || y !== this.y) {
                this.setPosition(x, y);
            }
        }

        this.properties = properties;

        this.info?.update();
    }

    destroy()
    {
        this.info?.close();
        this.elem.remove();
        this.onDragEnd();
    }
}
