import imgDefaultItem from '../assets/DefaultItem.png';

import * as $ from 'jquery';
import { as } from '../lib/as';
import { Config } from '../lib/Config';
import { Utils } from '../lib/Utils';
import { ItemProperties, Pid } from '../lib/ItemProperties';
import { BackgroundMessage } from '../lib/BackgroundMessage';
import { ContentApp } from './ContentApp';
import { BackpackWindow } from './BackpackWindow';
import { BackpackItemInfo } from './BackpackItemInfo';

export class BackpackItem
{
    private elem: HTMLDivElement;
    private imageElem: HTMLDivElement;
    private textElem: HTMLDivElement;
    private coverElem: HTMLDivElement;
    private x: number = 100;
    private y: number = 100;
    private imageWidth: number = 64;
    private imageHeight: number = 64;
    private info: BackpackItemInfo = null;

    private mousedownX: number;
    private mousedownY: number;

    private ignoreNextDropFlag: boolean = false;

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
        $(this.elem).append(this.imageElem);
        this.textElem = <HTMLDivElement>$('<div class="n3q-base n3q-backpack-item-label" />').get(0);
        $(this.elem).append(this.textElem);
        this.coverElem = <HTMLDivElement>$('<div class="n3q-base n3q-backpack-item-cover" />').get(0);
        $(this.elem).append(this.coverElem);

        this.setImage(imgDefaultItem);
        this.setSize(50, 50);
        this.setPosition(x, y);

        $(paneElem).append(this.elem);

        $(this.elem).on({
            mousedown: this.onMouseDown.bind(this),
            click: this.onMouseClick.bind(this),
        });

        $(this.elem).draggable({
            scroll: false,
            stack: '.n3q-item-icon',
            distance: 4,
            //opacity: 0.5,
            helper: (ev: JQueryMouseEventObject) =>
            {
                if (ev.target) {
                    if (!$(ev.target).hasClass('n3q-backpack-item-cover')) {
                        return null;
                    }
                }

                if (this.info) { this.info.close(); }
                const dragElem = $('<div class="n3q-base n3q-backpack-drag" />').get(0);
                const itemElem = $(this.elem).clone().get(0);
                $(itemElem).css({ 'left': '0', 'top': '0', 'width': this.getWidth() + 'px', 'height': this.getHeight() + 'px' });
                $(dragElem).append(itemElem);
                $(app.getDisplay()).append(dragElem);
                // app.toFront(itemElem);
                return dragElem;
            },
            // zIndex: 2000000000,
            containment: '#n3q',
            start: (ev: JQueryMouseEventObject, ui: JQueryUI.DraggableEventUIParams) =>
            {
                this.app.toFront(this.elem, ContentApp.LayerWindowContent);
                $(this.elem).hide();
                return this.onDragStart(ev, ui);
            },
            drag: (ev: JQueryMouseEventObject, ui: JQueryUI.DraggableEventUIParams) =>
            {
                return this.onDrag(ev, ui);
            },
            stop: (ev: JQueryMouseEventObject, ui: JQueryUI.DraggableEventUIParams) =>
            {
                $(this.elem).show(0);
                this.onDragStop(ev, ui);
                return true;
            }
        });
    }

    getX(): number { return this.x; }
    getY(): number { return this.y; }
    geSize(): number { return this.imageWidth; }

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
        $(this.imageElem).css({ 'background-image': 'url("' + url + '")' });
    }

    setText(text: string): void
    {
        $(this.textElem).text(as.Html(text));
        $(this.coverElem).attr('title', as.Html(text));
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

    setVisibility(state: boolean)
    {
        if (state) {
            $(this.elem).stop().fadeIn('fast');
        } else {
            $(this.elem).hide();
        }
    }

    public ignoreNextDrop(): void
    {
        this.ignoreNextDropFlag = true;
    }

    private onMouseDown(ev: JQuery.MouseDownEvent): void
    {
        this.mousedownX = ev.clientX;
        this.mousedownY = ev.clientY;
    }

    private onMouseClick(ev: JQuery.ClickEvent): void
    {
        if (Math.abs(this.mousedownX - ev.clientX) > 2
        || Math.abs(this.mousedownY - ev.clientY) > 2) {
            return;
        }
        this.app.toFront(this.getElem(), ContentApp.LayerWindowContent);
        const infoOpen = this.info;
        if (infoOpen) {
            this.info?.close();
        }
        if (!ev.shiftKey && !ev.ctrlKey && !ev.altKey && !ev.metaKey) {
            // Just a click.
            if (!infoOpen) {
                const onClose = () => { this.info = null; };
                this.info = new BackpackItemInfo(this.app, this, onClose);
                this.info.show(ev.offsetX, ev.offsetY);
                this.app.toFront(this.info.getElem(), ContentApp.LayerWindowContent);
            }
        } else if (!ev.shiftKey && ev.ctrlKey && !ev.altKey && !ev.metaKey) {
            // CTRL + click.
            if (as.Bool(this.properties[Pid.IsRezzed], false)) {
                this.app.derezItem(this.getItemId());
            } else {
                const rezzXProp = this.properties[Pid.RezzedX];
                this.rezItem(as.Int(rezzXProp, ev.clientX));
            }
        }
    }

    private dragIsRezable: boolean = false;
    private dragIsRezzed: boolean = false;
    private onDragStart(ev: JQueryMouseEventObject, ui: JQueryUI.DraggableEventUIParams): boolean
    {
        this.dragIsRezable = as.Bool(this.properties[Pid.IsRezable], true);
        this.dragIsRezzed = as.Bool(this.properties[Pid.IsRezzed]);

        if (this.dragIsRezable && !this.dragIsRezzed) {
            this.app.showDropzone();
        }

        this.app.toFront(ui.helper.get(0), ContentApp.LayerWindowContent);

        this.info?.close();

        return true;
    }

    private onDrag(ev: JQueryMouseEventObject, ui: JQueryUI.DraggableEventUIParams): boolean
    {
        if (!this.dragIsRezable) {
            if (!this.isPositionInBackpack(ev, ui)) {
                return false;
            }
        }

        if (!this.dragIsRezzed) {
            if (this.isPositionInDropzone(ev, ui)) {
                this.app.hiliteDropzone(true);
            } else {
                this.app.hiliteDropzone(false);
            }
        }

        return true;
    }

    private onDragStop(
        ev: JQueryMouseEventObject,
        ui: JQueryUI.DraggableEventUIParams,
    ): void {
        this.app.hideDropzone();
        if (this.ignoreNextDropFlag) {
            this.ignoreNextDropFlag = false;
            return;
        }
        if (this.isPositionInBackpack(ev, ui)) {
            const pos = this.getPositionRelativeToPane(ev, ui);
            if (pos.x !== this.x || pos.y !== this.y) {
                this.setPosition(pos.x, pos.y);
                this.sendSetItemCoordinates(pos.x, pos.y);
            }
        } else if (this.isPositionInDropzone(ev, ui)) {
            const dropX = ev.pageX - $(this.app.getDisplay()).offset().left;
            this.rezItem(dropX);
        }
    }

    private isPositionInBackpack(ev: JQueryMouseEventObject, ui: JQueryUI.DraggableEventUIParams): boolean
    {
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

        const position = $(ui.helper).position();
        const itemElem = $(ui.helper).children().get(0);
        const width = $(itemElem).width();
        const height = $(itemElem).height();
        const x = position.left + width / 2;
        const y = position.top + height / 2;

        const paneElem = this.backpackWindow.getPane();
        const panePosition = $(paneElem).offset();
        panePosition.left -= scrollLeft;
        panePosition.top -= scrollTop;
        const paneWidth = $(paneElem).width();
        const paneHeight = $(paneElem).height();

        return x > panePosition.left && x < panePosition.left + paneWidth && y < panePosition.top + paneHeight && y > panePosition.top;
    }

    private getPositionRelativeToPane(ev: JQueryMouseEventObject, ui: JQueryUI.DraggableEventUIParams): { x: number, y: number }
    {
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

        const position = $(ui.helper).position();
        const itemElem = $(ui.helper).children().get(0);
        const width = $(itemElem).width();
        const height = $(itemElem).height();
        const x = position.left + width / 2;
        const y = position.top + height / 2;

        const paneElem = this.backpackWindow.getPane();
        const panePosition = $(paneElem).offset();
        panePosition.left -= scrollLeft;
        panePosition.top -= scrollTop;

        return { 'x': x - panePosition.left, 'y': y - panePosition.top };
    }

    private isPositionInDropzone(ev: JQueryMouseEventObject, ui: JQueryUI.DraggableEventUIParams): boolean
    {
        const displayElem = this.app.getDisplay();
        const dropZoneHeight: number = Config.get('backpack.dropZoneHeight', 100);
        const dragHelperElem = ui.helper.get(0);
        const dragItemElem = dragHelperElem.children[0];

        const draggedLeft = $(dragHelperElem).position().left;
        const draggedTop = $(dragHelperElem).position().top;
        const draggedWidth = $(dragItemElem).width();
        const draggedHeight = $(dragItemElem).height();
        const dropzoneBottom = $(displayElem).height();
        const dropzoneTop = dropzoneBottom - dropZoneHeight;
        const itemBottomX = draggedLeft + draggedWidth / 2;
        const itemBottomY = draggedTop + draggedHeight;

        const mouseX = ev.clientX;
        const mouseY = ev.clientY;

        const itemBottomInDropzone = itemBottomX > 0 && itemBottomY > dropzoneTop && itemBottomY < dropzoneBottom;
        const mouseInDropzone = mouseX > 0 && mouseY > dropzoneTop && mouseY < dropzoneBottom;

        const inDropzone = itemBottomInDropzone || mouseInDropzone;
        return inDropzone;
    }

    sendSetItemCoordinates(x: number, y: number): void
    {
        (async () => {
            const itemId = this.itemId;
            if (await BackgroundMessage.isBackpackItem(itemId)) {
                const props = this.properties;
                props[Pid.InventoryX] = Math.round(x).toString();
                props[Pid.InventoryY] = Math.round(y).toString();
                const opts = { skipPresenceUpdate: true };
                this.backpackWindow.setItemProperties(itemId, props, opts);
            }
        })().catch(error => { this.app.onError(
            'BackpackItem.sendSetItemCoordinates',
            'Error caught!',
            error, 'this', this);
        });
    }

    rezItem(x: number)
    {
        this.backpackWindow.rezItemSync(this.itemId, this.app.getRoom().getJid(), Math.round(x), this.app.getRoom().getDestination());
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
        $(this.elem).remove();
    }

}
