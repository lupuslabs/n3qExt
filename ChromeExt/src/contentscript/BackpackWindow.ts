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
import { Window, WindowOptions } from './Window';
import { BackpackItem as BackpackItem } from './BackpackItem';
import { Environment } from '../lib/Environment';
import { ItemException } from '../lib/ItemException';
import { ItemExceptionToast } from './Toast';
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
    getHeight() { return this.getPane().offsetHeight; }
    getWidth() { return this.getPane().offsetWidth; }
    getItem(itemId: string) { return this.items[itemId]; }
    getItems(): { [id: string]: BackpackItem; } { return this.items; }

    async show(options: WindowOptions)
    {
        options = await this.getSavedOptions('Backpack', options);

        options.titleText = this.app.translateText('BackpackWindow.Inventory', 'Local Stuff');
        options.resizable = true;

        super.show(options);

        const aboveElem: HTMLElement = options.above;
        const bottom = as.Int(options.bottom, 200);
        const width = as.Int(options.width, 600);
        let height = as.Int(options.height, 400);

        const windowElem = this.windowElem;
        const contentElem = this.contentElem;
        $(windowElem).addClass('n3q-backpackwindow');

        let left = as.Int(options.left, 50);
        if (options.left == null) {
            if (aboveElem) {
                left = Math.max(aboveElem.offsetLeft - 120, left);
            }
        }
        let top = this.app.getDisplay().offsetHeight - height - bottom;
        {
            const minTop = 10;
            if (top < minTop) {
                height -= minTop - top;
                top = minTop;
            }
        }

        const paneElem = <HTMLElement>$('<div class="n3q-base n3q-backpack-pane" data-translate="children" />').get(0);
        $(contentElem).append(paneElem);

        const dumpElem = <HTMLElement>$('<div class="n3q-base n3q-backpack-dump" title="Shredder" data-translate="attr:title:Backpack"/>').get(0);
        $(contentElem).append(dumpElem);
        $(dumpElem).droppable({
            tolerance: 'pointer',
            drop: (ev: JQueryEventObject, ui: JQueryUI.DroppableEventUIParam) =>
            {
                const droppedElem = ui.draggable.get(0);
                if (droppedElem) {
                    const droppedId: string = $(droppedElem).data('id');
                    if (droppedId) {
                        this.app.deleteItemAsk(droppedId, undefined, () => this.itemVisibility(droppedId, true));
                        window.setTimeout(() => this.itemVisibility(droppedId, false), 1);
                        ev.stopPropagation();
                    }
                }
            }
        });

        if (Environment.isDevelopment()) {
            const inElem = <HTMLElement>$('<textarea class="n3q-base n3q-backpack-in n3q-input n3q-text" />').get(0);
            $(inElem).hide();
            $(contentElem).append(inElem);

            const toggleElem = <HTMLElement>$('<div class="n3q-base n3q-absolutebutton n3q-backpack-toggle">Input</div>').get(0);
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

            const addElem = <HTMLElement>$('<div class="n3q-base n3q-absolutebutton n3q-backpack-add">Add</div>').get(0);
            $(contentElem).append(addElem);
            $(addElem).on('click', () =>
            {
                let text = as.String($(inElem).val());
                text = text.replace(/'/g, '"');
                if (text !== '') {
                    const json = JSON.parse(text);
                    const itemId = Utils.randomString(30);
                    json.Id = itemId;
                    this.createItem(itemId, json, {});
                }
            });
        }

        this.app.translateElem(windowElem);

        $(windowElem).css({ 'width': width + 'px', 'height': height + 'px', 'left': left + 'px', 'top': top + 'px' });

        this.onResizeStop = (ev: JQueryEventObject, ui: JQueryUI.ResizableUIParams) =>
        {
            const left = ui.position.left;
            const bottom = this.app.getDisplay().offsetHeight - (ui.position.top + ui.size.height);
            this.saveCoordinates(left, bottom, ui.size.width, ui.size.height);
        };

        this.onDragStop = (ev: JQueryEventObject, ui: JQueryUI.DraggableEventUIParams) =>
        {
            const size = { width: $(this.windowElem).width(), height: $(this.windowElem).height() };
            const left = ui.position.left;
            const bottom = this.app.getDisplay().offsetHeight - (ui.position.top + size.height);
            this.saveCoordinates(left, bottom, size.width, size.height);
        };

        $(paneElem).droppable({
            drop: async (ev: JQueryEventObject, ui: JQueryUI.DroppableEventUIParam) =>
            {
                const droppedElem = ui.draggable.get(0);
                if (droppedElem) {
                    const droppedId = Avatar.getEntityIdByAvatarElem(droppedElem);
                    if (droppedId) {
                        const roomItem = this.app.getRoom().getItem(droppedId);
                        if (roomItem) {
                            const x = Math.round(ui.offset.left - $(paneElem).offset().left + ui.draggable.width() / 2);
                            const y = Math.round(ui.offset.top - $(paneElem).offset().top + ui.draggable.height() / 2);
                            const itemId = roomItem.getProperties()[Pid.Id];
                            this.app.derezItem(itemId, x, y);
                        }
                    }
                }
            }
        });

        this.paneElem = paneElem;

        try {
            const response = await BackgroundMessage.getBackpackState();
            if (response && response.ok) {
                this.populate(response.items);
            }

            // let pos = this.getFreeCoordinate();

        } catch (ex) {
            // Ignored.
        }
    }

    getFreeCoordinate(): { x: number, y: number }
    {
        const width = $(this.paneElem).width();
        const height = $(this.paneElem).height();

        const rects: Array<{ left: number, top: number, right: number, bottom: number }> = [];
        for (const id in this.items) {
            const itemElem = this.items[id].getElem();
            rects.push({ left: $(itemElem).position().left, top: $(itemElem).position().top, right: $(itemElem).position().left + $(itemElem).width(), bottom: $(itemElem).position().top + $(itemElem).height() });
        }

        rects.push({ left: width - 50, top: 0, right: width, bottom: 50 });

        const f = new FreeSpace(Math.max(10, Math.floor((width + height) / 2 / 64)), width, height, rects);
        return f.getFreeCoordinate(null);
        // return f.getFreeCoordinate(this.paneElem);
    }

    populate(items: { [id: string]: ItemProperties; })
    {
        for (const id in items) {
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

    rezItemSync(itemId: string, room: string, x: number, destination: string) { this.rezItem(itemId, room, x, destination); }
    async rezItem(itemId: string, room: string, x: number, destination: string)
    {
        if (Utils.logChannel('backpackWindow', true)) { log.info('BackpackWindow.rezItem', itemId, 'to', room); }
        try {
            const props = await BackgroundMessage.getBackpackItemProperties(itemId);

            if (as.Bool(props[Pid.ClaimAspect])) {
                if (await this.app.getRoom().propsClaimYieldsToExistingClaim(props)) {
                    throw new ItemException(ItemException.Fact.ClaimFailed, ItemException.Reason.ItemMustBeStronger, this.app.getRoom().getPageClaimItem()?.getDisplayName());
                }
            }

            if (as.Bool(props[Pid.AutorezAspect])) {
                await BackgroundMessage.modifyBackpackItemProperties(itemId, { [Pid.AutorezIsActive]: 'true' }, [], { skipPresenceUpdate: true });
            }

            const moveInsteadOfRez = as.Bool(props[Pid.IsRezzed]) && props[Pid.RezzedLocation] === room;
            if (moveInsteadOfRez) {
                await this.app.moveRezzedItemAsync(itemId, x);
            } else {
                if (as.Bool(props[Pid.IsRezzed])) {
                    await this.app.derezItemAsync(itemId);
                }
                await BackgroundMessage.rezBackpackItem(itemId, room, x, destination, {});
            }

        } catch (ex) {
            this.app.onItemError('BackpackWindow:rezItem', 'Caught error!', ex, 'itemId', itemId);
        }
    }

    itemVisibility(itemId: string, state: boolean)
    {
        if (Utils.logChannel('backpackWindow', true)) { log.info('BackpackWindow.itemVisibility', itemId, state); }
        const item = this.items[itemId];
        if (item) {
            item.setVisibility(state);
        }
    }
}
