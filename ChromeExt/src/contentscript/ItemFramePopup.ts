import log = require('loglevel');
import { as } from '../lib/as';
import { ContentApp } from './ContentApp';
import { DomUtils } from '../lib/DomUtils';
import { Utils } from '../lib/Utils'
import { PopupWindow, PopupWindowOptions } from './PopupWindow'
import { IItemFrameWindow } from './IItemFrameWindow'
import { LeftPositionAnchorMode } from './WindowBase'

export type ItemFramePopupOptions = PopupWindowOptions & {
    closeButton?: boolean,
    url: string,
}

export class ItemFramePopup extends PopupWindow<ItemFramePopupOptions> implements IItemFrameWindow
{
    private iframeElem: null|HTMLIFrameElement = null;

    public constructor(app: ContentApp)
    {
        super(app);
        this.guiLayer = ContentApp.LayerPopup;
        this.windowCssClasses.push('roomitemframepopup');
        this.isMovable = false;
        this.geometryInitstrategy = 'beforeContent';
        this.minWidth = 0;
        this.minHeight = 0;
    }

    public getIframeElem(): null|HTMLIFrameElement
    {
        return this.iframeElem;
    }

    protected prepareMakeDom(): void
    {
        super.prepareMakeDom();
        this.withCloseButton = as.Bool(this.givenOptions.closeButton ?? this.withCloseButton);
    }

    protected async makeContent(): Promise<void>
    {
        await super.makeContent();

        const url = as.String(this.givenOptions.url);
        if (!url.length) {
            throw new Error('ItemFramePopup.show: No url given!');
        }

        if (Utils.logChannel('iframeApi', false)) {
            log.debug('ItemFramePopup', {url, options: this.givenOptions});
        }

        const urlWrapped = this.app.uiHelper.getWrappedIframeUrl(url);
        this.iframeElem = <HTMLIFrameElement> DomUtils.elemOfHtml(`<iframe src="${urlWrapped}"></iframe>`);
        this.contentElem.append(this.iframeElem);
    }

    protected position(width: null|number, height: null|number, left: null|number, leftMode: null|LeftPositionAnchorMode, bottom: null|number, options: any = {}): void
    {
        // Todo: Move resitze animation support to WindowBase and use setGeometry instead of doing our own positioning.
        if (this.isClosing || !this.windowElem) {
            return;
        }

        width ??= as.Int(this.givenOptions.width)
        height ??= as.Int(this.givenOptions.height)
        left ??= this.givenOptions.left
        leftMode ??= this.givenOptions.leftMode
        bottom ??= this.givenOptions.bottom
        this.givenOptions.width = width;
        this.givenOptions.height = height;
        this.givenOptions.left = left;
        this.givenOptions.leftMode = leftMode;
        this.givenOptions.top = null;
        this.givenOptions.bottom = bottom;

        const anchor = this.givenOptions.anchor;
        const newGeometry = { anchor, width, height, left, leftMode, bottom };
        this.desiredGeometry = newGeometry;
        const mangledGeometry = this.mangleGeometry(newGeometry);
        this.geometry = mangledGeometry;

        const delay = as.Bool(options?.animate, false) ? '200ms' : '0ms';

        this.windowElem.style.width = `${mangledGeometry.width}px`;
        const heightTrans = { property: 'height', duration: delay };
        DomUtils.startElemTransition(this.windowElem, null, heightTrans, `${mangledGeometry.height}px`);
        this.windowElem.style.left = `${mangledGeometry.left}px`;
        this.windowElem.style.bottom = `${mangledGeometry.bottom}px`;
    }

    public moveToAnchor(): void
    {
        const opts = this.givenOptions;
        if (!this.windowElem || !(opts.leftMode === 'anchorLeft' || opts.leftMode === 'anchorCenter')) {
            return;
        }
        this.containerMarginsEnebled = true;
        this.position(null, null, null, null, null);
    }

    public toFrontFrame(layer?: undefined | number | string): void
    {
        this.toFront(layer);
        this.app.windows.onIframePointerDown(this.iframeElem);
    }

    public positionFrame(width: number, height: number, left: number, bottom: number, options: any = null): void
    {
        this.containerMarginsEnebled = true;
        this.position(width, height, left, 'anchorLeft', bottom, options);
    }

    public setWindowStyle(style: string): void // Deprecated
    {
        if (this.windowElem) {
            this.windowElem.style.cssText += style;
            DomUtils.execOnNextRenderComplete(() => {
                const rect = this.windowElem?.getBoundingClientRect()
                if (rect && rect.width > 0) {
                    let {bottom, left, width, height} = rect
                    bottom = this.containerElem.getBoundingClientRect().height - bottom
                    this.containerMarginsEnebled = false;
                    this.desiredGeometry = {bottom, left, width, height}
                }
            })
        }
    }

    protected onViewportResize(): void {
        super.onViewportResize();
        this.moveToAnchor();
    }

    protected onBeforeClose(): void
    {
        this.iframeElem = null;
        super.onBeforeClose();
    }
}
