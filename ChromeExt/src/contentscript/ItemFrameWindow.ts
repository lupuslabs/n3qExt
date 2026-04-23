import log = require('loglevel');
import { as } from '../lib/as';
import { Utils } from '../lib/Utils';
import { ContentApp } from './ContentApp';
import { FullWindow, FullWindowOptions } from './FullWindow';
import { Config } from '../lib/Config';
import { DomUtils } from '../lib/DomUtils'
import { PopupDefinition } from '../lib/BackgroundMessage'
import { IItemFrameWindow } from './IItemFrameWindow'

export type ItemFrameWindowOptions = FullWindowOptions & {
    url: string,
    resizable?: boolean,
    titleText: string,
}

export class ItemFrameWindow extends FullWindow<ItemFrameWindowOptions> implements IItemFrameWindow
{
    protected readonly itemId: string;
    protected iframeElem: null|HTMLIFrameElement = null;
    private url: string;

    public constructor(app: ContentApp, itemId: string)
    {
        super(app);
        this.itemId = itemId;
    }

    public getIframeElem(): null|HTMLIFrameElement {
        return this.iframeElem;
    }

    protected prepareMakeDom(): void
    {
        super.prepareMakeDom();
        this.windowCssClasses.push('itemframewindow');
        this.titleText = this.givenOptions.titleText;
        this.isResizable = as.Bool(this.givenOptions.resizable);
        this.minWidth = 180;
        this.minHeight = 100;

        const url: string = as.String(this.givenOptions.url);
        if (!url.length) {
            throw new Error('ItemFrameWindow.show: No url given!');
        }
        this.url = url; // member for undock
    }

    protected async makeContent(): Promise<void>
    {
        await super.makeContent();

        if (Utils.logChannel('iframeApi', true)) {
            log.info('ItemFrameWindow.makeContent', this.url);
        }

        const urlWrapped = this.app.uiHelper.getWrappedIframeUrl(this.url);
        this.iframeElem = <HTMLIFrameElement> DomUtils.elemOfHtml(`<iframe src="${urlWrapped}" allow="camera; microphone; fullscreen; display-capture; autoplay"></iframe>`);

        this.contentElem.append(this.iframeElem);
    }

    public positionFrame(width: number, height: number, left: number, bottom: number): void
    {
        this.setGeometry({ left, bottom, width, height });
    }

    public toFrontFrame(layer?: undefined | number | string): void
    {
        this.toFront(layer);
        this.app.windows.onIframePointerDown(this.iframeElem);
    }

    public moveToAnchor(): void
    {
        // No-op: windows are not anchored to the avatar.
    }

    public setWindowStyle(style: string): void
    {
        // No-op: windows don't support style setting.
    }

    protected makeUndockPopupDefinition(): PopupDefinition
    {
        const popupDefinition: PopupDefinition = {
            id: `roomItem.frameUndocked:${this.itemId}`,
            url: this.url,
            ...this.makeUndockPopupDefaultGeometry('roomItem.frame'),
            allowContentApp: true,
        }
        return popupDefinition
    }

}
