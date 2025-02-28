import log = require('loglevel');
import { as } from '../lib/as';
import { Utils } from '../lib/Utils';
import { ContentApp } from './ContentApp';
import { Window, WindowOptions } from './Window';
import { Pid } from '../lib/ItemProperties';
import { Config } from '../lib/Config';
import { DomUtils } from '../lib/DomUtils'
import { RoomItem } from './RoomItem'
import { PopupDefinition } from '../lib/BackgroundMessage'

export type ItemFrameWindowOptions = WindowOptions & {
    above: HTMLElement,
    url: string,
    resizable?: boolean,
    transparent?: boolean, // Not implemented on ItemFrameWindow.
    titleText: string,
}

export class ItemFrameWindow extends Window<ItemFrameWindowOptions>
{
    protected readonly item: RoomItem;
    protected iframeElem: HTMLIFrameElement;
    private url: string;
    private width = 400;
    private height = 400;

    public constructor(app: ContentApp, item: RoomItem)
    {
        super(app);
        this.item = item;
    }

    public getIframeElem(): null|HTMLIFrameElement {
        return this.iframeElem;
    }

    protected prepareMakeDom(): void
    {
        super.prepareMakeDom();
        this.windowCssClasses.push('n3q-itemframewindow');
        this.titleText = this.givenOptions.titleText;
        this.isResizable = as.Bool(this.givenOptions.resizable);
        this.minWidth = 180;
        this.minHeight = 100;

        const url: string = as.String(this.givenOptions.url);
        if (!url.length) {
            throw new Error('ItemFrameWindow.show: No url given!');
        }
        this.url = url; // member for undock
        this.width = as.Int(this.givenOptions.width, this.width); // member for undock
        this.height = as.Int(this.givenOptions.height, this.height); // member for undock

        const json = as.String(this.item.getProperties()[Pid.IframeOptions], '{}');
        const iframeOptions = JSON.parse(json);
        this.closeIsHide = as.Bool(iframeOptions.closeIsHide, false);
    }

    protected async makeContent(): Promise<void>
    {
        await super.makeContent();

        if (Utils.logChannel('iframeApi', true)) {
            log.info('ItemFrameWindow.makeContent', this.url);
        }

        const urlWrapped = this.app.getWrappedIframeUrl(this.url);
        this.iframeElem = <HTMLIFrameElement> DomUtils.elemOfHtml(`<iframe class="n3q-base n3q-itemframewindow-content" src="${urlWrapped}" frameborder="0" allow="camera; microphone; fullscreen; display-capture; autoplay"></iframe>`);

        this.contentElem.append(this.iframeElem);
    }

    public position(width: number, height: number, left: number, bottom: number): void
    {

        const offset = this.givenOptions.above.getBoundingClientRect();
        left += offset.left;
        this.setGeometry({ left, bottom, width, height });
    }

    protected makeUndockPopupDefinition(): PopupDefinition
    {
        const popupDefinition: PopupDefinition = {
            id: `roomItem.frameUndocked:${this.item.getItemId()}`,
            url: this.url,
            top: Config.get('roomItem.frameUndockedTop', 100),
            left: Config.get('roomItem.frameUndockedLeft', 100),
            height: this.height,
            width: this.width,
            allowContentApp: true,
        }
        return popupDefinition
    }

}
