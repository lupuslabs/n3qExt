import * as $ from 'jquery';
import 'webpack-jquery-ui';
import log = require('loglevel');
import { as } from '../lib/as';
import { ContentApp } from './ContentApp';
import { Popup, PopupOptions } from './Popup';
import { Pid } from '../lib/ItemProperties';

interface ItemFramePopupOptions extends PopupOptions
{
    elem: HTMLElement;
    url: string;
    onClose: { (): void };
}

export class ItemFramePopup extends Popup
{
    private iframeElem: HTMLIFrameElement;
    private options: ItemFramePopupOptions;

    constructor(app: ContentApp)
    {
        super(app);
    }

    getIframeElem(): HTMLIFrameElement { return this.iframeElem; }

    async show(options: ItemFramePopupOptions)
    {
        try {
            let url: string = options.url;
            if (!url) { throw 'No url' }

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

            $(this.windowElem).addClass('n3q-itemframepopup');

            this.iframeElem = <HTMLIFrameElement>$('<iframe class="n3q-base n3q-itemframepopup-content" src="' + url + ' " frameborder="0"></iframe>').get(0);

            if (options.hidden) { this.setVisibility(false); }

            $(this.windowElem).append(this.iframeElem);
            this.app.translateElem(this.windowElem);

            this.position(options.width, options.height, options.left, options.bottom);

            this.app.toFront(this.windowElem, ContentApp.LayerPopup)

        } catch (error) {
            log.info('ItemFramePopup', error);
            if (options.onClose) { options.onClose(); }
        }
    }

    isOpen(): boolean
    {
        return this.windowElem != null;
    }

    position(width: number, height: number, left: number, bottom: number, options: any = null): void
    {
        const offset = this.options.elem.getBoundingClientRect();
        const absLeft = offset.left + left;
        const absBottom = bottom;
        if (options != null && as.Bool(options.animate, false)) {
            $(this.windowElem).animate({ width: width + 'px', height: height + 'px', left: absLeft + 'px', bottom: absBottom + 'px' }, as.Int(options.duration, 200));
        } else {
            $(this.windowElem).css({ width: width + 'px', height: height + 'px', left: absLeft + 'px', bottom: absBottom + 'px' });
        }
    }

    move(): void
    {
        const offset = this.options.elem.getBoundingClientRect();
        const absLeft = offset.left + this.options.left;
        $(this.windowElem).css({ left: absLeft + 'px' });
    }

    toFront(layer?: undefined | number | string): void
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
