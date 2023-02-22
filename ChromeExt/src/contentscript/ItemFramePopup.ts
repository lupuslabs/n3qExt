import log = require('loglevel');
import { as } from '../lib/as';
import { RoomItem } from './RoomItem'
import { ContentApp } from './ContentApp';
import { domHtmlElemOfHtml, startDomElemTransition } from '../lib/domTools';
import { Utils } from '../lib/Utils'

export type ItemFramePopupOptions = {
    onClose?: () => void,
    closeIsHide: boolean,
    transparent: boolean,
    closeButton: boolean,
    item: RoomItem,
    elem: HTMLElement,
    url: string,
    width: number,
    height: number,
    left: number,
    bottom: number,
    hidden: boolean,
}

export class ItemFramePopup
{
    protected app: ContentApp;
    protected onClose: null|(() => void);

    protected containerElem: null|HTMLElement = null;
    protected windowElem: null|HTMLElement = null;
    protected closeIsHide = false;

    private isClosing: boolean;

    private iframeElem: HTMLIFrameElement;
    private options: ItemFramePopupOptions;

    public constructor(app: ContentApp)
    {
        this.app = app;
    }

    public getIframeElem(): HTMLIFrameElement
    {
        return this.iframeElem;
    }

    public show(options: ItemFramePopupOptions): void
    {
        try {
            this.containerElem = this.app.getDisplay();
            if (!this.containerElem) {
                throw new Error('ItemFramePopup.show: Display not ready!');
            }
            let url: string = as.String(options.url);
            if (!url.length) {
                throw new Error('ItemFramePopup.show: No url given!');
            }

            this.options = options;

            log.debug('ItemFramePopup', url);
            this.onClose = options.onClose;
            this.closeIsHide = options.closeIsHide;

            let windowId = Utils.randomString(15);

            const opacityClass = options.transparent ? 'n3q-transparent' : 'n3q-shadow-medium';
            this.windowElem = domHtmlElemOfHtml(`<div id="${windowId}" class="n3q-window n3q-popupwindow ${opacityClass}" data-translate="children"></div>`);

            if (as.Bool(options.closeButton, true)) {
                this.isClosing = false;
                const onClose = () => {
                    if (this.closeIsHide) {
                        this.setVisibility(false);
                    } else {
                        this.close();
                    }
                };
                this.windowElem.append(this.app.makeWindowCloseButton(onClose, 'popup'));
            }

            this.containerElem.append(this.windowElem);

            this.windowElem.addEventListener('pointerdown', ev => {
                this.app.toFront(this.windowElem, ContentApp.LayerWindow);
            }, { capture: true });

            this.windowElem.classList.add('n3q-itemframepopup');

            this.iframeElem = <HTMLIFrameElement>domHtmlElemOfHtml(`<iframe class="n3q-base n3q-itemframepopup-content" src="${url}" frameborder="0"></iframe>`);

            if (options.hidden) {
                this.setVisibility(false);
            }

            this.windowElem.append(this.iframeElem);
            this.app.translateElem(this.windowElem);

            this.position(options.width, options.height, options.left, options.bottom);

            this.app.toFront(this.windowElem, ContentApp.LayerPopup)

        } catch (error) {
            this.app.onError(error);
            this.close();
        }
    }

    public position(width: number, height: number, left: number, bottom: number, options: any = null): void
    {
        if (this.isClosing || !this.windowElem) {
            return;
        }
        this.options.width = width;
        this.options.height = height;
        this.options.left = left;
        this.options.bottom = bottom;

        const containerBox = this.containerElem.getBoundingClientRect();
        const anchorBox = this.options.elem.getBoundingClientRect();

        const absLeft = anchorBox.left + left;
        const mangledGeometry = Utils.fitLeftBottomRect(
            { left: absLeft, bottom, width, height },
            containerBox.width, containerBox.height, 1, 1,
            0, 0, 0, 0,
        );

        const delay = as.Bool(options?.animate, false) ? '200ms' : '0ms';

        this.windowElem.style.width = `${mangledGeometry.width}px`;
        const heightTrans = { property: 'height', duration: delay };
        startDomElemTransition(this.windowElem, null, heightTrans, `${mangledGeometry.height}px`);
        this.windowElem.style.left = `${mangledGeometry.left}px`;
        this.windowElem.style.bottom = `${mangledGeometry.bottom}px`;
    }

    public move(): void
    {
        this.position(this.options.width, this.options.height, this.options.left, this.options.bottom);
    }

    public toFront(layer?: undefined | number | string): void
    {
        if (this.isClosing || !this.windowElem) {
            return;
        }
        this.app.toFront(this.windowElem, layer ?? ContentApp.LayerPopup);
    }

    public getWindowElem(): null|HTMLElement
    {
        return this.windowElem ?? null;
    }

    public close(): void
    {
        if (!this.isClosing) {
            this.isClosing = true;

            this.windowElem?.remove();
            this.onClose?.();
        }
    }

    public getVisibility(): boolean
    {
        if (this.isClosing || !this.windowElem) {
            return false;
        }
        return !this.windowElem.classList.contains('n3q-hidden');
    }

    public setVisibility(visible: boolean): void
    {
        if (visible) {
            this.windowElem?.classList.remove('n3q-hidden');
        } else {
            this.windowElem?.classList.add('n3q-hidden');
        }
    }
}
