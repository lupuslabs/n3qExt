import * as $ from 'jquery';
import 'webpack-jquery-ui';
import log = require('loglevel');
import { ContentApp } from './ContentApp';

export interface ItemFrameOverlayOptions
{
    url: string;
    hidden: boolean;
    onClose: { (): void };
}

export class ItemFrameOverlay
{
    private elem: HTMLIFrameElement;
    private onClose: { (): void };

    constructor(protected app: ContentApp)
    {
    }

    getIframeElem(): HTMLIFrameElement { return this.elem; }

    async show(options: ItemFrameOverlayOptions)
    {
        this.onClose = options.onClose;

        try {
            let url: string = options.url;
            if (!url) { throw 'No url' }

            this.elem = <HTMLIFrameElement>$('<iframe class="n3q-base n3q-itemframeoverlay" style="position: fixed; width:100%; height: 100%;" src="' + url + ' " frameborder="0"></iframe>').get(0);

            if (options.hidden) { this.setVisibility(false); }
            this.toFront()

            $(this.app.getDisplay()).append(this.elem);

        } catch (error) {
            log.info('ItemFrameOverlay', error);
            if (options.onClose) { options.onClose(); }
        }
    }

    isOpen(): boolean
    {
        return this.elem != null;
    }

    toFront(): void
    {
        this.app.toFront(this.elem, ContentApp.LayerPageOverlay);
    }

    private isClosing: boolean;
    close(): void
    {
        if (!this.isClosing) {
            this.isClosing = true;

            $(this.elem).remove();
            if (this.onClose) { this.onClose(); }
        }
    }

    getVisibility(): boolean
    {
        return !$(this.elem).hasClass('n3q-hidden');
    }
    setVisibility(visible: boolean): void
    {
        if (visible != this.getVisibility()) {
            if (visible) {
                $(this.elem).removeClass('n3q-hidden');
            } else {
                $(this.elem).addClass('n3q-hidden');
            }
        }
    }
}
