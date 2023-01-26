import log = require('loglevel');
import { as } from '../lib/as';
import { Pid } from '../lib/ItemProperties';
import { RoomItem } from './RoomItem'
import { ContentApp } from './ContentApp';
import { Popup, PopupOptions } from './Popup';
import { domHtmlElemOfHtml, startDomElemTransition } from '../lib/domTools';

export type ItemFramePopupOptions = PopupOptions & {
    item: RoomItem,
    elem: HTMLElement,
    url: string,
    width?: number,
    height?: number,
    left?: number,
    bottom?: number,
    hidden?: boolean,
}

export class ItemFramePopup extends Popup
{
    private iframeElem: HTMLIFrameElement;
    private options: ItemFramePopupOptions;

    public constructor(app: ContentApp)
    {
        super(app);
    }

    public getIframeElem(): HTMLIFrameElement
    {
        return this.iframeElem;
    }

    public show(options: ItemFramePopupOptions): void
    {
        try {
            let url: string = as.String(options.url);
            if (!url.length) {
                throw new Error('ItemFramePopup.show: No url given!');
            }

            let json = as.String(options.item.getProperties()[Pid.IframeOptions], '{}');
            let iframeOptions = JSON.parse(json);
            options.width = as.Int(iframeOptions.width, 100);
            options.height = as.Int(iframeOptions.height, 100);
            options.left = as.Int(iframeOptions.left, -options.width / 2);
            options.bottom = as.Int(iframeOptions.bottom, 50);
            options.closeButton = as.Bool(iframeOptions.closeButton, true);
            options.transparent = as.Bool(iframeOptions.transparent, false);
            options.closeIsHide = as.Bool(iframeOptions.closeIsHide, false);

            this.options = options;

            log.debug('ItemFramePopup', url);
            super.show(options);

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
            log.info('ItemFramePopup', error);
            options.onClose?.();
        }
    }

    public position(width: number, height: number, left: number, bottom: number, options: any = null): void
    {
        const offset = this.options.elem.getBoundingClientRect();
        const absLeft = offset.left + left;
        const delay = as.Bool(options?.animate, false) ? '200ms' : '0ms';

        this.windowElem.style.width = `${width}px`;
        const heightTrans = { property: 'height', duration: delay };
        startDomElemTransition(this.windowElem, null, heightTrans, `${height}px`);
        this.windowElem.style.left = `${absLeft}px`;
        this.windowElem.style.bottom = `${bottom}px`;
    }

    public move(): void
    {
        const offset = this.options.elem.getBoundingClientRect();
        const absLeft = offset.left + this.options.left;
        this.windowElem.style.left = `${absLeft}px`;
    }

    public toFront(layer?: undefined | number | string): void
    {
        this.app.toFront(this.windowElem, layer ?? ContentApp.LayerPopup);
    }

    update(): void
    {
        if (this.iframeElem) {
            let src = this.iframeElem.src;
        }
    }
}
