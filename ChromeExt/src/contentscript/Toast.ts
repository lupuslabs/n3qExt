import * as $ from 'jquery';
import log = require('loglevel');
import { as } from '../lib/as';
import { Config } from '../lib/Config';
import { ItemException } from '../lib/ItemException';
import { Utils } from '../lib/Utils';
import { ContentApp } from './ContentApp';

export class Toast
{
    protected elem: HTMLElement = null;
    protected dontShow = true;
    protected onClose: () => void;

    constructor(protected app: ContentApp, protected messageType: string, protected durationSec: number, protected iconType: string, protected bodyElem: HTMLElement)
    {
    }

    show(onClose: () => void = null): void { this.showAsync(onClose); }
    private async showAsync(onClose: () => void): Promise<void>
    {
        this.onClose = onClose;

        let skip = await this.app.isDontShowNoticeType(this.messageType);
        if (skip) {
            this.close();
            return;
        }

        var checkboxId = Utils.randomString(10);

        this.elem = <HTMLDivElement>$('<div class="n3q-base n3q-toast n3q-shadow-small" data-translate="children" />').get(0);
        this.setVisibility(false);

        let iconElem = <HTMLDivElement>$('<div class="n3q-base n3q-toast-icon n3q-toast-icon-' + this.iconType + '" />').get(0);
        $(this.elem).append(iconElem);

        let bodyContainerElem = <HTMLDivElement>$('<div class="n3q-base toast-body-container" data-translate="children" />').get(0);
        $(bodyContainerElem).append(this.bodyElem);
        $(this.elem).append(bodyContainerElem);

        let closeElem = <HTMLElement>$('<div class="n3q-base n3q-overlay-button n3q-shadow-small" title="Close" data-translate="attr:title:Common"><div class="n3q-base n3q-button-symbol n3q-button-close-small" />').get(0);
        $(closeElem).click(ev =>
        {
            $(this.elem).stop(true);
            this.close();
        });
        $(this.elem).append(closeElem);

        let footerElem = <HTMLDivElement>$('<div class="n3q-base n3q-toast-footer" data-translate="children" />').get(0);

        if (this.dontShow) {
            let dontShowElem = <HTMLElement>$('<input class="n3q-base" type="checkbox" name="checkbox" id="' + checkboxId + '" />').get(0);
            let dontShowLabelElem = <HTMLElement>$('<label class="n3q-base" for="' + checkboxId + '" data-translate="text:Toast">Do not show this message again</label>').get(0);
            $(dontShowElem).on('change', (ev) =>
            {
                var checkbox: HTMLInputElement = <HTMLInputElement>ev.target;
                this.app.setDontShowNoticeType(this.messageType, checkbox.checked);
            });
            $(footerElem).append(dontShowElem);
            $(footerElem).append(dontShowLabelElem);
        }

        $(this.elem).append(footerElem);

        // let resizeElem = <HTMLElement>$('<div class="n3q-base n3q-window-resize n3q-window-resize-se"/>').get(0);
        // $(this.elem).append(resizeElem);

        $(this.elem).click(() =>
        {
            $(this.elem)
                .stop().stop().stop()
                .draggable({
                    distance: 4,
                    containment: 'document',
                    start: (ev: JQueryMouseEventObject, ui) => { },
                    stop: (ev: JQueryMouseEventObject, ui) => { }
                });
        });

        $(this.app.getDisplay()).append(this.elem);
        this.setVisibility(true);
        this.app.translateElem(this.elem);
        this.app.toFront(this.elem, ContentApp.LayerAboveEntities);

        $(this.elem)
            .css({ 'opacity': '0.0', 'bottom': '-20px' })
            .animate({ 'opacity': '1.0', 'bottom': '10px' }, 'fast', 'linear')
            .delay(this.durationSec * 1000)
            .animate({ 'opacity': '0.0', 'bottom': '-20px' }, 'slow', () => this.close())
            ;
    }

    close(): void
    {
        if (this.elem != null) {
            if (this.onClose) { this.onClose(); }
            $(this.elem).stop();
            this.app.getDisplay().removeChild(this.elem);
            this.elem = null;
        }
    }

    setDontShow(state: boolean): void
    {
        this.dontShow = state;
    }

    // Visibility

    setVisibility(visible: boolean): void
    {
        if (visible) {
            $(this.elem).removeClass('n3q-hidden');
        } else {
            $(this.elem).addClass('n3q-hidden');
        }
    }
}

export class SimpleToast extends Toast
{
    protected buttonTexts = new Array<string>();

    constructor(app: ContentApp, protected type: string, protected durationSec: number, protected iconType: string, protected title: string, protected text: string)
    {
        super(app, type, durationSec, iconType, $(''
            + '<div class="n3q-base n3q-toast-body" data-translate="children">'
            + (title != null ? '<div class="n3q-base n3q-title" data-translate="text:Toast">' + as.Html(title) + '</div>' : '')
            + (text != null ? '<div class="n3q-base n3q-text" data-translate="text:Toast">' + as.Html(text) + '</div>' : '')
            + '</div>'
        )[0]);
    }

    actionButton(text: string, action: () => void): void
    {
        this.buttonTexts.push(text);

        let buttonElem = <HTMLElement>$('<div class="n3q-base n3q-button n3q-toast-button n3q-toast-button-action" data-translate="text:Toast">' + as.Html(text) + '</div>').get(0);
        $(this.bodyElem).append(buttonElem);
        this.app.translateElem(buttonElem);
        $(buttonElem).on('click', () =>
        {
            if (action) { action(); }
        });
    }

    show(onClose: () => void = null): void
    {
        super.show(onClose);

        let chatlogName = this.app.translateText('Chatwindow.Toast.' + this.iconType, this.iconType);
        let chatlogText = this.title + ': ' + this.text;
        this.buttonTexts.forEach(buttonText => {
            chatlogText += ' [' + buttonText + ']';
        });
        this.app.getRoom()?.showChatMessage(chatlogName, chatlogText);
    }
}

export class SimpleErrorToast extends Toast
{
    constructor(app: ContentApp, type: string, durationSec: number, iconType: string, fact: string, reason: string, detail: string)
    {
        var bodyElem = $(''
            + '<div class="n3q-base n3q-toast-body" data-translate="children">'
            + '<div class="n3q-base n3q-title" data-translate="text:ErrorFact">' + as.Html(fact) + '</div>'
            + '<div class="n3q-base n3q-text" data-translate="children">'
            + (reason != null && reason != '' ? '<span class="n3q-base" data-translate="text:ErrorReason">' + as.Html(reason) + '</span> ' : '')
            + (detail != null && detail != '' ? '<span class="n3q-base" data-translate="text:ErrorDetail">' + as.Html(detail) + '</span> ' : '')
            + '</div>'
            + '</div>'
        )[0];

        super(app, type, durationSec, iconType, bodyElem);
    }
}

export class ItemExceptionToast extends SimpleErrorToast
{
    constructor(app: ContentApp, durationSec: number, ex: ItemException)
    {
        let fact = ItemException.fact2String(ex.fact);
        let reason = ItemException.reason2String(ex.reason);
        let type = 'Warning-' + fact + '-' + reason;
        let detail = ex.detail;
        let iconType = 'warning';

        super(app, type, durationSec, iconType, fact, reason, detail);
    }
}
