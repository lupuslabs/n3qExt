import devModeDeleteImage from '../assets/Blackhole.png';

import * as $ from 'jquery';
import 'webpack-jquery-ui';
import log = require('loglevel');
import { as } from '../lib/as';
import { Utils } from '../lib/Utils';
import { Config } from '../lib/Config';
import { ItemProperties, Pid } from '../lib/ItemProperties';
import { BackgroundMessage } from '../lib/BackgroundMessage';
import { ItemChangeOptions } from '../lib/ItemChangeOptions';
import { ContentApp } from './ContentApp';
import { Window } from './Window';
import { BackpackItem as BackpackItem } from './BackpackItem';
import { Environment } from '../lib/Environment';
import { ItemException } from '../lib/ItemException';
import { ItemExceptionToast, SimpleErrorToast, SimpleToast } from './Toast';
import { RoomItem } from './RoomItem';
import { Avatar } from './Avatar';
import { FreeSpace } from './FreeSpace';

export class BackpackWindow extends Window
{
    private paneElem: HTMLElement;
    private items: { [id: string]: BackpackItem; } = {};

    constructor(app: ContentApp)
    {
        super(app);
    }

    getPane() { return this.paneElem; }
    getItem(itemId: string) { return this.items[itemId]; }
    getItems(): { [id: string]: BackpackItem; } { return this.items; }

    async show(options: any)
    {
        options = await this.getSavedOptions('Backpack', options);

        options.titleText = this.app.translateText('BackpackWindow.Inventory', 'Local Stuff');
        options.resizable = true;

        super.show(options);

        let aboveElem: HTMLElement = options.above;
        let bottom = as.Int(options.bottom, 200);
        let width = as.Int(options.width, 600);
        let height = as.Int(options.height, 400);

        if (this.windowElem) {
            let windowElem = this.windowElem;
            let contentElem = this.contentElem;
            $(windowElem).addClass('n3q-backpackwindow');

            let left = as.Int(options.left, 50);
            if (options.left == null) {
                if (aboveElem) {
                    left = Math.max(aboveElem.offsetLeft - 120, left);
                }
            }
            let top = this.app.getDisplay().offsetHeight - height - bottom;
            {
                let minTop = 10;
                if (top < minTop) {
                    height -= minTop - top;
                    top = minTop;
                }
            }

            let paneElem = <HTMLElement>$('<div class="n3q-base n3q-backpack-pane" data-translate="children" />').get(0);
            $(contentElem).append(paneElem);

            let dumpElem = <HTMLElement>$('<div class="n3q-base n3q-backpack-dump" title="Shredder" data-translate="attr:title:Backpack"/>').get(0);
            $(contentElem).append(dumpElem);
            $(dumpElem).droppable({
                tolerance: 'pointer',
                drop: async (ev: JQueryEventObject, ui: JQueryUI.DroppableEventUIParam) =>
                {
                    let droppedElem = ui.draggable.get(0);
                    if (droppedElem) {
                        let droppedId: string = $(droppedElem).data('id');
                        if (droppedId) {

                            let props = await BackgroundMessage.getBackpackItemProperties(droppedId);
                            let itemName = props[Pid.Label] ?? props[Pid.Template];
                            let toast = new SimpleToast(this.app, 'backpack-reallyDelete', Config.get('backpack.deleteToastDurationSec', 1000), 'question', 'Really delete?', this.app.translateText('ItemLabel.' + itemName) + '\n' + droppedId);
                            toast.actionButton('Yes, delete item', () => { this.deleteItem(droppedId); toast.close(); })
                            toast.actionButton('No, keep it', () => { this.itemVisibility(droppedId, true); toast.close(); })
                            toast.setDontShow(false);
                            toast.show(() => { this.itemVisibility(droppedId, true); });
                            this.itemVisibility(droppedId, false);

                            ev.stopPropagation();
                        }
                    }
                }
            });

            if (Environment.isDevelopment()) {
                let inElem = <HTMLElement>$('<textarea class="n3q-base n3q-backpack-in n3q-input n3q-text" />').get(0);
                $(inElem).hide();
                $(contentElem).append(inElem);

                let toggleElem = <HTMLElement>$('<div class="n3q-base n3q-absolutebutton n3q-backpack-toggle">Input</div>').get(0);
                $(contentElem).append(toggleElem);
                $(toggleElem).on('click', () =>
                {
                    if ($(inElem).is(':hidden')) {
                        $(inElem).show();
                        this.app.toFront(inElem, ContentApp.LayerWindowContent);
                    } else {
                        $(inElem).hide();
                    }
                });

                let addElem = <HTMLElement>$('<div class="n3q-base n3q-absolutebutton n3q-backpack-add">Add</div>').get(0);
                $(contentElem).append(addElem);
                $(addElem).on('click', () =>
                {
                    let text = as.String($(inElem).val(), '');
                    text = text.replace(/'/g, '"',);
                    if (text != '') {
                        let json = JSON.parse(text);
                        let itemId = Utils.randomString(30);
                        json.Id = itemId;
                        this.createItem(itemId, json, {});
                    }
                });
            }

            this.app.translateElem(windowElem);

            $(windowElem).css({ 'width': width + 'px', 'height': height + 'px', 'left': left + 'px', 'top': top + 'px' });

            this.onResizeStop = (ev: JQueryEventObject, ui: JQueryUI.ResizableUIParams) =>
            {
                let left = ui.position.left;
                let bottom = this.app.getDisplay().offsetHeight - (ui.position.top + ui.size.height);
                this.saveCoordinates(left, bottom, ui.size.width, ui.size.height);
            };

            this.onDragStop = (ev: JQueryEventObject, ui: JQueryUI.DraggableEventUIParams) =>
            {
                let size = { width: $(this.windowElem).width(), height: $(this.windowElem).height() }
                let left = ui.position.left;
                let bottom = this.app.getDisplay().offsetHeight - (ui.position.top + size.height);
                this.saveCoordinates(left, bottom, size.width, size.height);
            };

            $(paneElem).droppable({
                drop: async (ev: JQueryEventObject, ui: JQueryUI.DroppableEventUIParam) =>
                {
                    let droppedElem = ui.draggable.get(0);
                    if (droppedElem) {
                        let droppedId = Avatar.getEntityIdByAvatarElem(droppedElem);
                        if (droppedId) {
                            let roomItem = this.app.getRoom().getItem(droppedId);
                            if (roomItem) {
                                let x = Math.round(ui.offset.left - $(paneElem).offset().left + ui.draggable.width() / 2);
                                let y = Math.round(ui.offset.top - $(paneElem).offset().top + ui.draggable.height() / 2)
                                roomItem.beginDerez();
                                await this.derezItem(roomItem.getRoomNick(), roomItem.getRoom().getJid(), x, y);
                                roomItem.endDerez();
                            }
                        }
                    }
                }
            });

            this.paneElem = paneElem;

            try {
                let response = await BackgroundMessage.getBackpackState();
                if (response && response.ok) {
                    this.populate(response.items);
                }

                // let pos = this.getFreeCoordinate();

            } catch (ex) {

            }
        }
    }

    getFreeCoordinate(): { x: number, y: number }
    {
        let width = $(this.paneElem).width();
        let height = $(this.paneElem).height();

        let rects: Array<{ left: number, top: number, right: number, bottom: number }> = [];
        for (let id in this.items) {
            let itemElem = this.items[id].getElem();
            rects.push({ left: $(itemElem).position().left, top: $(itemElem).position().top, right: $(itemElem).position().left + $(itemElem).width(), bottom: $(itemElem).position().top + $(itemElem).height() });
        }

        rects.push({ left: width - 50, top: 0, right: width, bottom: 50 });

        let f = new FreeSpace(Math.max(10, Math.floor((width + height) / 2 / 64)), width, height, rects);
        return f.getFreeCoordinate(null);
        // return f.getFreeCoordinate(this.paneElem);
    }

    populate(items: { [id: string]: ItemProperties; })
    {
        for (let id in items) {
            this.onShowItem(id, items[id]);
        }
    }

    async saveCoordinates(left: number, bottom: number, width: number, height: number)
    {
        await this.saveOptions('Backpack', { 'left': left, 'bottom': bottom, 'width': width, 'height': height });
    }

    isOpen(): boolean
    {
        return this.windowElem != null;
    }

    onShowItem(itemId: string, properties: ItemProperties)
    {
        let item = this.items[itemId];
        if (!item) {
            item = new BackpackItem(this.app, this, itemId, properties);
            this.items[itemId] = item;
        }
        item.create();
        this.app.toFront(item.getElem(), ContentApp.LayerWindowContent);
    }

    onSetItem(itemId: string, properties: ItemProperties)
    {
        if (this.items[itemId]) {
            this.items[itemId].applyProperties(properties);
        }
    }

    onHideItem(itemId: string)
    {
        if (this.items[itemId]) {
            this.items[itemId].destroy();
            delete this.items[itemId];
        }
    }

    createItem(itemId: string, properties: ItemProperties, options: ItemChangeOptions)
    {
        BackgroundMessage.addBackpackItem(itemId, properties, options);
    }

    setItemProperties(itemId: string, properties: ItemProperties, options: ItemChangeOptions)
    {
        BackgroundMessage.setBackpackItemProperties(itemId, properties, options);
    }

    rezItemSync(itemId: string, room: string, x: number, destination: string) { this.rezItem(itemId, room, x, destination); }
    async rezItem(itemId: string, room: string, x: number, destination: string)
    {
        if (Utils.logChannel('backpackWindow', true)) { log.info('BackpackWindow.rezItem', itemId, 'to', room); }
        try {
            let props = await BackgroundMessage.getBackpackItemProperties(itemId);

            if (as.Bool(props[Pid.ClaimAspect], false)) {
                if (await this.app.getRoom().propsClaimDefersToExistingClaim(props)) {
                    throw new ItemException(ItemException.Fact.ClaimFailed, ItemException.Reason.ItemMustBeStronger, this.app.getRoom().getPageClaimItem()?.getDisplayName());
                }
            }

            if (as.Bool(props[Pid.AutorezAspect], false)) {
                await BackgroundMessage.modifyBackpackItemProperties(itemId, { [Pid.AutorezIsActive]: 'true' }, [], { skipPresenceUpdate: true });
            }

            await BackgroundMessage.rezBackpackItem(itemId, room, x, destination, {});
        } catch (ex) {
            new ItemExceptionToast(this.app, Config.get('room.errorToastDurationSec', 8), ex).show();
        }
    }

    derezItemSync(itemId: string, room: string, x: number, y: number) { this.derezItem(itemId, room, x, y); }
    async derezItem(itemId: string, room: string, x: number, y: number)
    {
        if (Utils.logChannel('backpackWindow', true)) { log.info('BackpackWindow.derezItem', itemId, 'from', room); }
        try {
            await BackgroundMessage.derezBackpackItem(itemId, room, -1, -1, {}, [Pid.AutorezIsActive], {});

        } catch (ex) {
            new ItemExceptionToast(this.app, Config.get('room.errorToastDurationSec', 8), ex).show();
        }
    }

    async deleteItem(itemId: string)
    {
        if (Utils.logChannel('backpackWindow', true)) { log.info('BackpackWindow.deleteItem', itemId); }
        try {
            await BackgroundMessage.deleteBackpackItem(itemId, {});
        } catch (ex) {
            new ItemExceptionToast(this.app, Config.get('room.errorToastDurationSec', 8), ex).show();
        }
    }

    itemVisibility(itemId: string, state: boolean)
    {
        if (Utils.logChannel('backpackWindow', true)) { log.info('BackpackWindow.hideItem', itemId); }
        let item = this.items[itemId];
        if (item) {
            item.setVisibility(state);
        }
    }
}
