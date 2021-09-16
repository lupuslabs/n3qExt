import imgDefaultItem from '../assets/DefaultItem.png';

import * as $ from 'jquery';
import log = require('loglevel');
import { as } from '../lib/as';
import { Config } from '../lib/Config';
import { Utils, Point2D } from '../lib/Utils';
import { ItemProperties, Pid } from '../lib/ItemProperties';
import { ItemChangeOptions } from '../lib/ItemChangeOptions';
import { BackgroundMessage } from '../lib/BackgroundMessage';
import { ContentApp } from './ContentApp';
import { BackpackWindow } from './BackpackWindow';
import { BackpackItemInfo } from './BackpackItemInfo';

export class BackpackItem
{
    private isFirstPresence: boolean = true;
    private elem: HTMLDivElement;
    private imageElem: HTMLDivElement;
    private textElem: HTMLDivElement;
    private iconElem: HTMLImageElement;
    private x: number = 100;
    private y: number = 100;
    private imageWidth: number = 64;
    private imageHeight: number = 64;
    private info: BackpackItemInfo = null;

    private mousedownX: number;
    private mousedownY: number;

    getElem(): HTMLElement { return this.elem; }
    getProperties(): ItemProperties { return this.properties; }
    getItemId(): string { return this.properties[Pid.Id]; }

    constructor(protected app: ContentApp, private backpackWindow: BackpackWindow, private itemId: string, private properties: ItemProperties)
    {
        let paneElem = this.backpackWindow.getPane();
        let padding: number = Config.get('backpack.borderPadding', 4);

        let size = Config.get('inventory.itemSize', 64);

        let pos = this.backpackWindow.getFreeCoordinate();
        let x = pos.x;
        let y = pos.y;

        this.elem = <HTMLDivElement>$('<div class="n3q-base n3q-backpack-item" data-id="' + this.itemId + '" />').get(0);
        this.imageElem = <HTMLDivElement>$('<div class="n3q-base n3q-backpack-item-image" />').get(0);
        $(this.elem).append(this.imageElem);
        this.textElem = <HTMLDivElement>$('<div class="n3q-base n3q-backpack-item-label" />').get(0);
        $(this.elem).append(this.textElem);
        let coverElem = <HTMLDivElement>$('<div class="n3q-base n3q-backpack-item-cover" />').get(0);
        $(this.elem).append(coverElem);

        this.setImage(imgDefaultItem);
        this.setSize(50, 50);
        this.setPosition(x, y);

        $(paneElem).append(this.elem);

        $(this.elem).on({
            mousedown: (ev) =>
            {
                this.mousedownX = ev.clientX;
                this.mousedownY = ev.clientY;
            },
            click: (ev) => 
            {
                if (Math.abs(this.mousedownX - ev.clientX) > 2 || Math.abs(this.mousedownY - ev.clientY) > 2) {
                    return;
                }

                this.app.toFront(this.getElem(), ContentApp.LayerWindowContent);
                if (this.info) {
                    this.info?.close();
                } else {
                    this.info = new BackpackItemInfo(this.app, this, () => { this.info = null; });
                    this.info.show(ev.offsetX, ev.offsetY);
                    this.app.toFront(this.info.getElem(), ContentApp.LayerWindowContent);
                }
            }
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
                let dragElem = $('<div class="n3q-base n3q-backpack-drag" />').get(0);
                let itemElem = $(this.elem).clone().get(0);
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
                var itemUnchanged = this.onDragStop(ev, ui);
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
                return as.String(this.properties[pid], null) == as.String(value, null);
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

    onMouseClick(ev: JQuery.Event): void
    {
        this.app.toFront(this.elem, ContentApp.LayerWindowContent);
    }

    private dragIsRezable: boolean = false;
    private dragIsRezzed: boolean = false;
    private onDragStart(ev: JQueryMouseEventObject, ui: JQueryUI.DraggableEventUIParams): boolean
    {
        this.dragIsRezable = as.Bool(this.properties[Pid.IsRezable], true);
        this.dragIsRezzed = as.Bool(this.properties[Pid.IsRezzed], false);

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

    private async onDragStop(ev: JQueryMouseEventObject, ui: JQueryUI.DraggableEventUIParams): Promise<boolean>
    {
        this.app.hideDropzone();
        if (this.isPositionInBackpack(ev, ui)) {
            let pos = this.getPositionRelativeToPane(ev, ui);
            if (pos.x != this.x || pos.y != this.y) {
                this.setPosition(pos.x, pos.y);
                await this.sendSetItemCoordinates(pos.x, pos.y);
            }
        } else if (this.isPositionInDropzone(ev, ui)) {
            let dropX = ev.pageX - $(this.app.getDisplay()).offset().left;
            this.rezItem(dropX);
            return false;
        }
        return true;
    }

    private isPositionInBackpack(ev: JQueryMouseEventObject, ui: JQueryUI.DraggableEventUIParams): boolean
    {
        let scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        let scrollTop = window.pageYOffset || document.documentElement.scrollTop;

        let position = $(ui.helper).position();
        let itemElem = $(ui.helper).children().get(0);
        let width = $(itemElem).width();
        let height = $(itemElem).height();
        let x = position.left + width / 2;
        let y = position.top + height / 2;

        let paneElem = this.backpackWindow.getPane();
        let panePosition = $(paneElem).offset();
        panePosition.left -= scrollLeft;
        panePosition.top -= scrollTop;
        let paneWidth = $(paneElem).width();
        let paneHeight = $(paneElem).height();

        return x > panePosition.left && x < panePosition.left + paneWidth && y < panePosition.top + paneHeight && y > panePosition.top;
    }

    private getPositionRelativeToPane(ev: JQueryMouseEventObject, ui: JQueryUI.DraggableEventUIParams): { x: number, y: number }
    {
        let scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        let scrollTop = window.pageYOffset || document.documentElement.scrollTop;

        let position = $(ui.helper).position();
        let itemElem = $(ui.helper).children().get(0);
        let width = $(itemElem).width();
        let height = $(itemElem).height();
        let x = position.left + width / 2;
        let y = position.top + height / 2;

        let paneElem = this.backpackWindow.getPane();
        let panePosition = $(paneElem).offset();
        panePosition.left -= scrollLeft;
        panePosition.top -= scrollTop;

        return { 'x': x - panePosition.left, 'y': y - panePosition.top };
    }

    private isPositionInDropzone(ev: JQueryMouseEventObject, ui: JQueryUI.DraggableEventUIParams): boolean
    {
        let displayElem = this.app.getDisplay();
        let dropZoneHeight: number = Config.get('backpack.dropZoneHeight', 100);
        let dragHelperElem = ui.helper.get(0);
        let dragItemElem = dragHelperElem.children[0];

        let draggedLeft = $(dragHelperElem).position().left;
        let draggedTop = $(dragHelperElem).position().top;
        let draggedWidth = $(dragItemElem).width();
        let draggedHeight = $(dragItemElem).height();
        let dropzoneBottom = $(displayElem).height();
        let dropzoneTop = dropzoneBottom - dropZoneHeight;
        let itemBottomX = draggedLeft + draggedWidth / 2;
        let itemBottomY = draggedTop + draggedHeight;

        let mouseX = ev.clientX;
        let mouseY = ev.clientY;

        let itemBottomInDropzone = itemBottomX > 0 && itemBottomY > dropzoneTop && itemBottomY < dropzoneBottom;
        let mouseInDropzone = mouseX > 0 && mouseY > dropzoneTop && mouseY < dropzoneBottom;

        let inDropzone = itemBottomInDropzone || mouseInDropzone;
        return inDropzone;
    }

    async sendSetItemCoordinates(x: number, y: number)
    {
        if (await BackgroundMessage.isBackpackItem(this.itemId)) {
            this.properties[Pid.InventoryX] = '' + Math.round(x);
            this.properties[Pid.InventoryY] = '' + Math.round(y);
            this.backpackWindow.setItemProperties(this.itemId, this.properties, { skipPresenceUpdate: true });
        }
    }

    rezItem(x: number)
    {
        this.backpackWindow.rezItemSync(this.itemId, this.app.getRoom().getJid(), Math.round(x), this.app.getRoom().getDestination());
    }

    derezItem()
    {
        this.backpackWindow.derezItem(this.itemId, this.properties[Pid.RezzedLocation], -1, -1);
    }

    getPseudoRandomCoordinate(space: number, size: number, padding: number, id: string, mod: number): number
    {
        let min = size / 2 + padding;
        let max = space - min;
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

        let text = as.String(properties[Pid.Label], '');
        let description = as.String(properties[Pid.Description], '');
        if (description != '') {
            text += (text != '' ? ': ' : '') + description;
        }
        this.setText(text);

        if (properties[Pid.Width] && properties[Pid.Height]) {
            var imageWidth = as.Int(properties[Pid.Width], -1);
            var imageHeight = as.Int(properties[Pid.Height], -1);
            if (imageWidth > 0 && imageHeight > 0 && (imageWidth != this.imageWidth || imageHeight != this.imageHeight)) {
                this.setSize(imageWidth, imageHeight);
            }
        }

        if (as.Bool(properties[Pid.IsRezzed], false)) {
            $(this.elem).addClass('n3q-backpack-item-rezzed');
        } else {
            $(this.elem).removeClass('n3q-backpack-item-rezzed');
        }

        if (properties[Pid.InventoryX] && properties[Pid.InventoryY]) {
            var x = as.Int(properties[Pid.InventoryX], -1);
            var y = as.Int(properties[Pid.InventoryY], -1);

            if (x < 0 || y < 0) {
                let pos = this.backpackWindow.getFreeCoordinate();
                x = pos.x;
                y = pos.y;
            }

            if (x != this.x || y != this.y) {
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
