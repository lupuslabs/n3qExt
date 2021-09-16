import * as $ from 'jquery';
import 'webpack-jquery-ui';
import log = require('loglevel');
import { as } from '../lib/as';
import { Utils } from '../lib/Utils';
import { Config } from '../lib/Config';
import { ContentApp } from './ContentApp';

type PopupOptions = any;

export class Popup
{
    onClose: { (): void };

    protected windowElem: HTMLElement;

    constructor(protected app: ContentApp) { }

    show(options: PopupOptions)
    {
        this.onClose = options.onClose;

        if (!this.windowElem) {
            let windowId = Utils.randomString(15);

            let windowElem = <HTMLElement>$('<div id="' + windowId + '" class="n3q-base n3q-window n3q-popupwindow '
                + (options.transparent ? 'n3q-transparent' : 'n3q-shadow-medium')
                + '" data-translate="children" />')
                .get(0);

            if (as.Bool(options.closeButton, true)) {
                let closeElem = <HTMLElement>$('<div class="n3q-base n3q-overlay-button n3q-shadow-small" title="Close" data-translate="attr:title:Common"><div class="n3q-base n3q-button-symbol n3q-button-close-small" />').get(0);
                this.isClosing = false;
                $(closeElem).click(ev =>
                {
                    this.close();
                    ev.stopPropagation();
                });
                $(windowElem).append(closeElem);
            }

            this.windowElem = windowElem;

            $(options.elem).append(windowElem);

            $(windowElem).click(ev =>
            {
                this.app.toFront(windowElem, ContentApp.LayerWindow);
            });
        }
    }

    isOpen(): boolean
    {
        return this.windowElem != null;
    }

    private isClosing: boolean;
    close(): void
    {
        if (!this.isClosing) {
            this.isClosing = true;

            $(this.windowElem).remove();
            if (this.onClose) { this.onClose(); }
        }
    }

    getVisibility(): boolean
    {
        return !$(this.windowElem).hasClass('n3q-hidden');
    }
    setVisibility(visible: boolean): void
    {
        if (visible != this.getVisibility()) {
            if (visible) {
                $(this.windowElem).removeClass('n3q-hidden');
            } else {
                $(this.windowElem).addClass('n3q-hidden');
            }
        }
    }
}
