import * as $ from 'jquery';
import { as } from '../lib/as';
import { ItemException } from '../lib/ItemException';
import { Utils } from '../lib/Utils';
import { ContentApp } from './ContentApp';
import { is } from '../lib/is';

export class Toast
{
    protected wrapperElem: HTMLElement = null;
    protected paneElem: HTMLElement = null;
    protected dontShow = true;
    protected isModal = false;
    protected onClose: () => void;

    constructor(protected app: ContentApp, protected messageType: string, protected durationSec: number, protected iconType: string, protected bodyElem: HTMLElement)
    {
    }

    show(onClose: () => void = null): void { this.showAsync(onClose); }
    private async showAsync(onClose: () => void): Promise<void>
    {
        this.onClose = onClose;

        const skip = await this.app.isDontShowNoticeType(this.messageType);
        if (skip) {
            this.close();
            return;
        }

        const checkboxId = Utils.randomString(10);

        this.wrapperElem = <HTMLDivElement>$('<div class="n3q-base n3q-toast" />').get(0);
        this.setVisibility(false);
        if (this.isModal) {
            this.wrapperElem.classList.add('n3q-toast-modal');
        }

        this.paneElem = <HTMLDivElement>$('<div class="n3q-base n3q-toast-pane n3q-shadow-small" data-translate="children" />').get(0);
        this.wrapperElem.append(this.paneElem);

        const iconElem = <HTMLDivElement>$('<div class="n3q-base n3q-toast-icon n3q-toast-icon-' + this.iconType + '" />').get(0);
        $(this.paneElem).append(iconElem);

        const bodyContainerElem = <HTMLDivElement>$('<div class="n3q-base toast-body-container" data-translate="children" />').get(0);
        $(bodyContainerElem).append(this.bodyElem);
        $(this.paneElem).append(bodyContainerElem);

        const closeElem = <HTMLElement>$('<div class="n3q-base n3q-overlay-button n3q-shadow-small" title="Close" data-translate="attr:title:Common"><div class="n3q-base n3q-button-symbol n3q-button-close-small" />').get(0);
        $(closeElem).click(ev =>
        {
            $(this.paneElem).stop(true);
            this.close();
        });
        $(this.paneElem).append(closeElem);

        const footerElem = <HTMLDivElement>$('<div class="n3q-base n3q-toast-footer" data-translate="children" />').get(0);

        if (this.dontShow) {
            const dontShowElem = <HTMLElement>$('<input class="n3q-base" type="checkbox" name="checkbox" id="' + checkboxId + '" />').get(0);
            const dontShowLabelElem = <HTMLElement>$('<label class="n3q-base" for="' + checkboxId + '" data-translate="text:Toast">Do not show this message again</label>').get(0);
            $(dontShowElem).on('change', (ev) =>
            {
                const checkbox: HTMLInputElement = <HTMLInputElement>ev.target;
                this.app.setDontShowNoticeType(this.messageType, checkbox.checked);
            });
            $(footerElem).append(dontShowElem);
            $(footerElem).append(dontShowLabelElem);
        }

        $(this.paneElem).append(footerElem);

        // let resizeElem = <HTMLElement>$('<div class="n3q-base n3q-window-resize n3q-window-resize-se"/>').get(0);
        // $(this.elem).append(resizeElem);

        $(this.wrapperElem).click(() =>
        {
            $(this.paneElem).stop().stop().stop();
            $(this.wrapperElem).stop().stop().stop().draggable({
                distance: 4,
                containment: 'document',
                start: (ev: JQueryMouseEventObject, ui) => { },
                stop: (ev: JQueryMouseEventObject, ui) => { }
            });
        });

        $(this.app.getDisplay()).append(this.wrapperElem);
        this.setVisibility(true);
        this.app.translateElem(this.paneElem);
        this.app.toFront(this.wrapperElem, ContentApp.LayerToast);

        if (this.isModal) {
            $(this.paneElem)
                .css({ 'opacity': '0.0' })
                .animate({ 'opacity': '1.0' }, 'fast', 'linear')
                .delay(this.durationSec * 1000)
                .animate({ 'opacity': '0.0' }, 'slow', () => this.close())
                ;
        } else {
            $(this.wrapperElem)
                .css({ 'opacity': '0.0', 'bottom': '-20px' })
                .animate({ 'opacity': '1.0', 'bottom': '10px' }, 'fast', 'linear')
                .delay(this.durationSec * 1000)
                .animate({ 'opacity': '0.0', 'bottom': '-20px' }, 'slow', () => this.close())
                ;
        }
    }

    close(): void
    {
        const elem = this.wrapperElem;
        if (!is.nil(elem)) {
            this.wrapperElem = null;
            if (this.onClose) {
                this.onClose();
            }
            $(elem).stop();
            this.app.getDisplay().removeChild(elem);
            this.app.onToastInvisible(this);
        }
    }

    setDontShow(state: boolean): void
    {
        this.dontShow = state;
    }

    setIsModal(state: boolean): void
    {
        this.isModal = state;
    }

    // Visibility

    setVisibility(visible: boolean): void
    {
        if (visible) {
            $(this.wrapperElem).removeClass('n3q-hidden');
            this.app.onToastVisible(this);
        } else {
            $(this.wrapperElem).addClass('n3q-hidden');
            this.app.onToastInvisible(this);
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

        const buttonElem = <HTMLElement>$('<div class="n3q-base n3q-button n3q-toast-button n3q-toast-button-action" data-translate="text:Toast">' + as.Html(text) + '</div>').get(0);
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

        const chatlogName = this.app.translateText('Chatwindow.Toast.' + this.iconType, this.iconType);
        let chatlogText = this.title + ': ' + this.text;
        this.buttonTexts.forEach(buttonText => {
            chatlogText += ' [' + buttonText + ']';
        });
        this.app.getRoom()?.showChatMessage(null, 'info', chatlogName, chatlogText);
    }
}

export class SimpleErrorToast extends Toast
{
    constructor(app: ContentApp, type: string, durationSec: number, iconType: string, fact: string, reason: string, detail: string)
    {
        const bodyElem = $(''
            + '<div class="n3q-base n3q-toast-body" data-translate="children">'
            + '<div class="n3q-base n3q-title" data-translate="text:ErrorFact">' + as.Html(fact) + '</div>'
            + '<div class="n3q-base n3q-text" data-translate="children">'
            + (reason != null && reason !== '' ? '<span class="n3q-base" data-translate="text:ErrorReason">' + as.Html(reason) + '</span> ' : '')
            + (detail != null && detail !== '' ? '<span class="n3q-base" data-translate="text:ErrorDetail">' + as.Html(detail) + '</span> ' : '')
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
        const fact = ItemException.fact2String(ex.fact);
        const reason = ItemException.reason2String(ex.reason);
        const type = 'Warning-' + fact + '-' + reason;
        const detail = ex.detail;
        const iconType = 'warning';

        super(app, type, durationSec, iconType, fact, reason, detail);
    }
}
