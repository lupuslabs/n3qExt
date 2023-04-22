import { is } from '../lib/is';
import { as } from '../lib/as';
import { Utils } from '../lib/Utils';
import { ContentApp } from './ContentApp';
import { ItemException } from '../lib/ItemException';
import { domHtmlElemOfHtml, startDomElemTransition, stopDomElemTransition } from '../lib/domTools'
import { Window, WindowOptions } from './Window';
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'

type ToastOptions = WindowOptions;

type ToastStatus = 'pinned'|'fadingIn'|'fadingOut'|'closed';

export class Toast extends Window<ToastOptions>
{
    protected messageType: string;
    protected durationSec: number;
    protected iconType: string;
    protected bodyElem: HTMLElement;

    protected hasDontShowAgainOption = true;
    protected isModal = false;
    protected onClose: () => void;

    protected status: ToastStatus = 'closed';

    public constructor(app: ContentApp, messageType: string, durationSec: number, iconType: string, bodyElem: HTMLElement)
    {
        super(app);
        this.messageType = messageType;
        this.durationSec = durationSec;
        this.iconType = iconType;
        this.bodyElem = bodyElem;
    }

    public setDontShow(state: boolean): void
    {
        this.hasDontShowAgainOption = state;
    }

    public setIsModal(state: boolean): void
    {
        this.isModal = state;
    }

    public show(onCloseOrOptions?: ToastOptions|(() => void)): void
    {
        let options: ToastOptions;
        if (is.nil(onCloseOrOptions)) {
            options = {};
        } else if (is.fun(onCloseOrOptions)) {
            options = { onClose: onCloseOrOptions };
        } else {
            options = onCloseOrOptions;
        }
        super.show(options);
    }

    public close(): void
    {
        this.status = 'closed';
        const elem = this.windowElem;
        if (!is.nil(elem)) {
            this.windowElem = null;
            this.onClose?.();
            elem.remove();
            this.app.onToastInvisible(this);
        }
    }

    public setVisibility(visible: boolean): void
    {
        super.setVisibility(visible);
        if (visible) {
            this.app.onToastVisible(this);
        } else {
            this.app.onToastInvisible(this);
        }
    }

    protected prepareMakeDom(): void
    {
        super.prepareMakeDom();
        this.style = 'overlay';
        this.guiLayer = ContentApp.LayerToast;
        this.windowCssClasses = ['n3q-base', 'n3q-toast']; // Todo: Rebase own style on window base classes.
        this.contentCssClasses = ['n3q-base', 'n3q-toast-pane', 'n3q-shadow-small'];
        this.showHidden = true;
        if (this.isModal) {
            this.windowCssClasses.push('n3q-toast-modal');
        }
        this.withTitlebar = false;
        this.isMovable = !this.isModal;
        this.geometryInitstrategy = 'none'; // CSS decides.
        this.minWidth  = 1; // CSS decides.
        this.minHeight = 1; // CSS decides.
    }

    protected async makeContent(): Promise<void>
    {
        const skip = await this.app.isDontShowNoticeType(this.messageType);
        if (skip) {
            this.close();
            return;
        }
        await super.makeContent();

        const iconElem = domHtmlElemOfHtml(`<div class="n3q-base n3q-toast-icon n3q-toast-icon-${this.iconType}"></div>`);
        this.contentElem.append(iconElem);

        const bodyContainerElem = domHtmlElemOfHtml('<div class="n3q-base toast-body-container" data-translate="children"></div>');
        bodyContainerElem.append(this.bodyElem);
        this.contentElem.append(bodyContainerElem);

        if (this.hasDontShowAgainOption) {
            const footerElem = domHtmlElemOfHtml('<div class="n3q-base n3q-toast-footer" data-translate="children"></div>');
            const checkboxId = Utils.randomString(10);
            const dontShowElem = <HTMLInputElement>domHtmlElemOfHtml(`<input class="n3q-base" type="checkbox" name="checkbox" id="${checkboxId}" />`);
            const dontShowLabelElem = domHtmlElemOfHtml(`<label class="n3q-base" for="${checkboxId}" data-translate="text:Toast">Do not show this message again</label>`);
            dontShowElem.addEventListener('change', ev => {
                this.app.setDontShowNoticeType(this.messageType, dontShowElem.checked);
            });
            footerElem.append(dontShowElem);
            footerElem.append(dontShowLabelElem);
            this.contentElem.append(footerElem);
            PointerEventDispatcher.protectElementsWithDefaultActions(this.app, footerElem);
        }

        const newStatus = 'fadingIn';
        this.status = newStatus;
        const guard = () => this.status === newStatus;
        const onComplete = () => this.onAnimationDone(newStatus);
        if (this.isModal) {
            this.contentElem.style.opacity = '0';
            startDomElemTransition(this.contentElem, guard, {
                property: 'opacity',
                duration: '200ms',
                timingFun: 'linear',
            }, '1', onComplete);
        } else {
            this.windowElem.style.opacity = '0';
            this.windowElem.style.bottom = '-20px';
            startDomElemTransition(this.windowElem, guard, {
                property: 'opacity',
                duration: '200ms',
                timingFun: 'linear',
            }, '1', onComplete);
            startDomElemTransition(this.windowElem, guard, {
                property: 'bottom',
                duration: '200ms',
                timingFun: 'linear',
            }, '10px', onComplete);
        }

        this.windowElem?.classList.remove('n3q-hidden');
    }

    protected onCapturePhasePointerDownInside(ev: PointerEvent): void
    {
        super.onCapturePhasePointerDownInside(ev);
        this.status = 'pinned';
        stopDomElemTransition(this.contentElem, 'opacity', '1');
        stopDomElemTransition(this.windowElem, 'opacity', '1');
        stopDomElemTransition(this.windowElem, 'bottom');
    }

    protected onAnimationDone(oldStatus: ToastStatus): void
    {
        if (oldStatus === this.status) {
            switch (oldStatus) {
                case 'closed': {
                    // Nothing to do.
                } break;
                case 'pinned': {
                    // Nothing to do.
                } break;
                case 'fadingIn': {
                    const newStatus = 'fadingOut';
                    this.status = newStatus;
                    const guard = () => this.status === newStatus;
                    const onComplete = () => this.onAnimationDone(newStatus);
                    if (this.isModal) {
                        startDomElemTransition(this.contentElem, guard, {
                            property: 'opacity',
                            delay: `${this.durationSec}s`,
                            duration: '600ms',
                        }, '0', onComplete);
                    } else {
                        startDomElemTransition(this.windowElem, guard, {
                            property: 'opacity',
                            delay: `${this.durationSec}s`,
                            duration: '600ms',
                        }, '0', onComplete);
                        startDomElemTransition(this.windowElem, guard, {
                            property: 'bottom',
                            delay: `${this.durationSec}s`,
                            duration: '600ms',
                        }, '-20px', onComplete);
                    }
                } break;
                case 'fadingOut': {
                    this.close();
                } break;
            }
        }
    }

}

export class SimpleToast extends Toast
{
    protected title: string;
    protected text: string;
    protected buttonTexts = new Array<string>();

    constructor(app: ContentApp, type: string, durationSec: number, iconType: string, title: string, text: string)
    {
        super(app, type, durationSec, iconType, domHtmlElemOfHtml(''
            + '<div class="n3q-base n3q-toast-body" data-translate="children">'
            + (title != null ? `<div class="n3q-base n3q-title" data-translate="text:Toast">${as.Html(title)}</div>` : '')
            + (text != null ? `<div class="n3q-base n3q-text" data-translate="text:Toast">${as.Html(text)}</div>` : '')
            + '</div>'
        ));
        this.title = title;
        this.text = text;
    }

    public actionButton(text: string, action?: () => void): void
    {
        this.buttonTexts.push(text);

        const buttonElem = domHtmlElemOfHtml(`<div class="n3q-base n3q-button n3q-toast-button n3q-toast-button-action" data-translate="text:Toast">${as.Html(text)}</div>`);
        this.bodyElem.append(buttonElem);
        this.app.translateElem(buttonElem);
        PointerEventDispatcher.makeOpaqueDispatcher(this.app, buttonElem).addUnmodifiedLeftClickListener(ev => action?.());
    }

    protected prepareMakeDom(): void
    {
        super.prepareMakeDom();
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
        const bodyElem = domHtmlElemOfHtml(''
            + '<div class="n3q-base n3q-toast-body" data-translate="children">'
            + `<div class="n3q-base n3q-title" data-translate="text:ErrorFact">${as.Html(fact)}</div>`
            + '<div class="n3q-base n3q-text" data-translate="children">'
            + (reason != null && reason !== '' ? `<span class="n3q-base" data-translate="text:ErrorReason">${as.Html(reason)}</span> ` : '')
            + (detail != null && detail !== '' ? `<span class="n3q-base" data-translate="text:ErrorDetail">${as.Html(detail)}</span> ` : '')
            + '</div>'
            + '</div>'
        );

        super(app, type, durationSec, iconType, bodyElem);
    }
}

export class ItemExceptionToast extends SimpleErrorToast
{
    constructor(app: ContentApp, durationSec: number, ex: ItemException)
    {
        const fact = ItemException.fact2String(ex.fact);
        const reason = ItemException.reason2String(ex.reason);
        const type = `Warning-${fact}-${reason}`;
        const detail = ex.detail;
        const iconType = 'warning';

        super(app, type, durationSec, iconType, fact, reason, detail);
    }
}
