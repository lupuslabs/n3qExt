import * as $ from 'jquery';
import log = require('loglevel');
import { as } from '../lib/as';
import { ErrorWithData, Utils } from '../lib/Utils';
import { Config } from '../lib/Config';
import { ItemProperties, Pid } from '../lib/ItemProperties';
import { BackgroundMessage } from '../lib/BackgroundMessage';
import { ItemChangeOptions } from '../lib/ItemChangeOptions';
import { ContentApp } from './ContentApp';
import { Window, WindowOptions } from './Window';
import { BackpackItem as BackpackItem } from './BackpackItem';
import { ItemException } from '../lib/ItemException';
import { FreeSpace } from './FreeSpace';
import { DomUtils } from '../lib/DomUtils'
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'

export class BackpackWindow extends Window<WindowOptions>
{
    private paneElem: HTMLElement;
    private items: { [id: string]: BackpackItem; } = {};

    public constructor(app: ContentApp)
    {
        super(app);
        this.windowName = 'Backpack';
        this.isResizable = true;
        this.persistGeometry = true;
    }

    getPane() { return this.paneElem; }
    getHeight() { return this.getPane().offsetHeight; }
    getWidth() { return this.getPane().offsetWidth; }
    getItem(itemId: string) { return this.items[itemId]; }
    getItems(): { [id: string]: BackpackItem; } { return this.items; }

    protected prepareMakeDom(): void
    {
        super.prepareMakeDom();
        this.windowCssClasses.push('n3q-backpackwindow');
        this.titleText = this.app.translateText('BackpackWindow.Inventory', 'Local Stuff');
        this.defaultWidth = 600;
        this.defaultHeight = 400;
        this.defaultBottom = 200;
        this.defaultLeft = 50;
    }

    protected async makeContent(): Promise<void>
    {
        await super.makeContent();

        this.paneElem = DomUtils.elemOfHtml('<div class="n3q-base n3q-backpack-pane" data-translate="children"></div>');
        PointerEventDispatcher.makeOpaqueDefaultActionsDispatcher(this.app, this.paneElem);
        this.contentElem.append(this.paneElem);

        try {
            const response = await BackgroundMessage.getBackpackState();
            if (response && response.ok) {
                this.populate(response.items);
            }

            // let pos = this.getFreeCoordinate();

        } catch (ex) {
            this.app.onError(ex);
        }
    }

    protected onBeforeClose(): void
    {
        super.onBeforeClose();
        const ids = [];
        for (let id in this.items) {
            ids.push(id);
        }
        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            let backpackItem = this.items[id];
            backpackItem.destroy();
            delete this.items[id];
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

    onShowItem(itemId: string, properties: ItemProperties)
    {
        if (as.Bool(properties[Pid.IsInvisible], false) && !Config.get('backpack.showInvisibleItems', false)) {
            return;
        }

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

    rezItemSync(itemId: string, room: string, x: number, destination: string) { this.rezItem(itemId, room, x, destination); }
    async rezItem(itemId: string, room: string, x: number, destination: string)
    {
        if (Utils.logChannel('backpackWindow', true)) { log.info('BackpackWindow.rezItem', itemId, 'to', room); }
        try {
            const props = await BackgroundMessage.getBackpackItemProperties(itemId);

            if (as.Bool(props[Pid.ClaimAspect])) {
                if (await this.app.getRoom().propsClaimYieldsToExistingClaim(props)) {
                    throw new ItemException(ItemException.Fact.ClaimFailed, ItemException.Reason.ItemMustBeStronger, this.app.getRoom()?.getPageClaimItem()?.getDisplayName());
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
            this.app.onError(ErrorWithData.ofError(ex, 'Caught error!', { itemId: itemId }));
        }
    }
}
