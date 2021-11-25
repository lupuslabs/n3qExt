import * as $ from 'jquery';
import 'webpack-jquery-ui';
import log = require('loglevel');
import { as } from '../lib/as';
import { Utils } from '../lib/Utils';
import { ContentApp } from './ContentApp';
import { Window, WindowOptions } from './Window';
import { Pid } from '../lib/ItemProperties';
import { Config } from '../lib/Config';

export interface ItemFrameWindowOptions extends WindowOptions
{
    elem: HTMLElement;
    url: string;
    onClose: { (): void };
}

export class ItemFrameWindow extends Window
{
    protected iframeElem: HTMLIFrameElement;
    protected refElem: HTMLElement;
    private url: string;
    private title: string;
    private width = 400;
    private height = 400;

    constructor(app: ContentApp)
    {
        super(app);
    }

    getIframeElem(): HTMLIFrameElement { return this.iframeElem; }

    async show(options: ItemFrameWindowOptions)
    {
        try {
            const url: string = options.url;
            if (!url) { throw 'No url' }

            this.refElem = options.elem;

            const json = as.String(options.item.getProperties()[Pid.IframeOptions], '{}');
            const iframeOptions = JSON.parse(json);
            options.closeIsHide = as.Bool(iframeOptions.closeIsHide, false);

            if (Utils.logChannel('iframeApi', true)) { log.info('ItemFrameWindow.show', url); }
            super.show(options);

            $(this.windowElem).addClass('n3q-itemframewindow');

            this.title = options.titleText; // member for undock
            this.url = options.url; // member for undock
            this.width = options.width; // member for undock
            this.height = options.height; // member for undock

            this.iframeElem = <HTMLIFrameElement>$('<iframe class="n3q-base n3q-itemframewindow-content" src="' + this.url + ' " frameborder="0" allow="camera; microphone; fullscreen; display-capture"></iframe>').get(0);

            if (options.hidden) { this.setVisibility(false); }

            $(this.contentElem).append(this.iframeElem);
            this.app.translateElem(this.windowElem);

            this.position(options.width, options.height, options.left, options.bottom);

            this.app.toFront(this.windowElem, ContentApp.LayerWindow)

        } catch (error) {
            log.info('ItemFrameWindow', error);
            if (options.onClose) { options.onClose(); }
        }
    }

    isOpen(): boolean
    {
        return this.windowElem != null;
    }

    position(width: number, height: number, left: number, bottom: number): void
    {
        const offset = this.refElem.getBoundingClientRect();
        const absLeft = offset.left + left;
        const absBottom = bottom;
        $(this.windowElem).css({ width: width + 'px', height: height + 'px', left: absLeft + 'px', bottom: absBottom + 'px' });
    }

    toFront(): void
    {
        this.app.toFront(this.windowElem, ContentApp.LayerWindow);
    }

    undock(): void
    {
        const left = Config.get('roomItem.frameUndockedLeft', 100);
        const top = Config.get('roomItem.frameUndockedTop', 100);
        const width = this.width;
        const height = this.height;
        const params = 'scrollbars=no,resizable=yes,status=no,location=no,toolbar=no,menubar=no,width=' + width + ',height=' + height + ',left=' + left + ',top=' + top + '';

        const url = this.url;

        this.close();

        const undocked = window.open(url, Utils.randomString(10), params);
        undocked.focus();
    }
}
