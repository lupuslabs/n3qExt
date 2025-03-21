import { is } from '../lib/is';
import { as } from '../lib/as';
import { Utils } from '../lib/Utils';
import { ContentApp } from './ContentApp';
import { ItemException } from '../lib/ItemException';
import { DomUtils } from '../lib/DomUtils'
import { WindowBase, WindowBaseOptions } from './WindowBase';
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'

type ToastOptions = WindowBaseOptions;

type ToastStatus = 'pinned'|'fadingIn'|'fadingOut'|'closed';

type ToastButtonInfo = { label: string, action: () => void };

export class Toast extends WindowBase<ToastOptions>
{
    protected messageType: string;
    protected durationSec: number;

    protected toastType: string;
    protected title: string;
    protected text: string;
    protected chatTitle: string;
    protected chatText: string;

    protected iconUrl: string = '';
    protected iconOpacityMin: number = 10;
    protected iconWidthMax: number = 16;
    protected iconHeightMax: number = 16;

    protected modalBackgroundElem: null|HTMLElement = null;
    protected bodyElem: HTMLElement;
    protected buttons: ToastButtonInfo[] = [];
    protected defaultAction: () => void = () => {};
    protected inButtonHandler: boolean = false;
    private delayedTransitionTimeoutHandle: null|ReturnType<typeof setTimeout> = null;

    protected hasDontShowAgainOption = true;
    protected isModal = false;

    protected status: ToastStatus = 'closed';

    public constructor(app: ContentApp, messageType: string, durationSec: number, toastType: string, title: string, text: string, chatTitle: string, chatText: string)
    {
        super(app);
        this.withCloseButton = true;
        this.messageType = messageType;
        this.durationSec = durationSec;
        this.toastType = toastType;
        this.title = title.trim();
        this.text = text.trim();
        this.chatTitle = chatTitle.trim();
        this.chatText = chatText.trim();
        this.bodyElem = DomUtils.elemOfHtml('<div class="toast-body" data-translate="children"/>');
    }

    public setDontShow(state: boolean): void
    {
        this.hasDontShowAgainOption = state;
    }

    public setIsModal(state: boolean): void
    {
        this.isModal = state;
    }

    public setIcon(iconUrl: string, iconOpacityMin: number, iconWidthMax: number, iconHeightMax: number): void
    {
        this.iconUrl = iconUrl;
        this.iconOpacityMin = iconOpacityMin;
        this.iconWidthMax = iconWidthMax;
        this.iconHeightMax = iconHeightMax;
    }

    public actionButton(label: string, action?: () => void): void
    {
        const wrappedAction = () => {
            this.inButtonHandler = true;
            try {
                action?.();
            } catch (error) {
                this.app.onError(error);
            }
            this.inButtonHandler = false;
        };
        this.buttons.push({ label, action: wrappedAction });
    }

    public addClosingActionButton(label: string, action: () => void): void
    {
        this.actionButton(label, () => { action(); this.close() });
    }

    /**
     * action is executed when toast is closed without any button
     */
    public setDefaultAction(action: () => void): void
    {
        this.defaultAction = action;
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
        super.close();
        if (this.status === 'closed') {
            return;
        }
        this.status = 'closed';
        if (!this.inButtonHandler) {
            try {
                (this.defaultAction)();
            } catch (error) {
                this.app.onError(error);
            }
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

    public toFront(layer?: number|string): void
    {
        super.toFront(layer)
        if (this.modalBackgroundElem) {
            this.app.toFront(this.modalBackgroundElem, this.guiLayer)
        }
        super.toFront()
    }

    protected prepareMakeDom(): void
    {
        super.prepareMakeDom();
        this.style = 'overlay';
        this.guiLayer = ContentApp.LayerToast;
        this.windowCssClasses.push('toast');
        if (this.isModal) {
            this.windowCssClasses.push('toast-modal');
            this.guiLayer = ContentApp.LayerMenu;
        }
        this.isMovable = !this.isModal;
        this.geometryInitstrategy = 'afterContent'; // CSS decides.
        this.defaultWidth = 'content'; // CSS decides.
        this.defaultHeight = 'content'; // CSS decides.
        this.minWidth  = 1; // CSS decides.
        this.minHeight = 1; // CSS decides.

        this.showInfoInChatLog();
    }

    protected showInfoInChatLog(): void
    {
        const chatlogName = this.app.translateText('Chatwindow.Toast.' + this.toastType, this.toastType);
        let chatlogText = this.chatTitle + ': ' + this.chatText;
        this.buttons.forEach(({ label }) => {
            chatlogText += ' [' + label + ']';
        });
        this.app.getRoom()?.showChatMessage(null, 'info', '', chatlogName, chatlogText);
    }

    protected async makeContent(): Promise<void>
    {
        const skip = await this.app.isDontShowNoticeType(this.messageType);
        if (skip) {
            this.close();
            return;
        }
        await super.makeContent();

        const iconElem = await this.makeIconElem();
        if (iconElem) {
            this.contentElem.append(iconElem);
        }

        const bodyContainerElem = DomUtils.elemOfHtml('<div class="toast-body-container" data-translate="children"></div>');
        bodyContainerElem.append(this.bodyElem);
        this.contentElem.append(bodyContainerElem);

        this.makeTitleElem()
        this.makeTextElem()
        this.makeDontShowElem()
        this.makeButtonsElem()
    }

    protected onBeforeShowDone(): void
    {
        super.onBeforeShowDone();

        const newStatus = 'fadingIn';
        this.status = newStatus;
        const guard = () => this.status === newStatus;
        const onComplete = () => this.onAnimationDone(newStatus);
        if (this.isModal) {
            this.windowElem.style.opacity = '0';
            DomUtils.startElemTransition(this.windowElem, guard, {
                property: 'opacity',
                duration: '200ms',
                timingFun: 'linear',
            }, '1', onComplete);
            this.modalBackgroundElem = DomUtils.elemOfHtml('<div class="toast-modal-background"/>');
            this.app.getDisplay()?.append(this.modalBackgroundElem);
            this.toFront();
        } else {
            const finalBottom = window.getComputedStyle(this.windowElem).getPropertyValue('bottom');
            this.windowElem.style.opacity = '0';
            this.windowElem.style.bottom = '-20px';
            DomUtils.startElemTransition(this.windowElem, guard, {
                property: 'opacity',
                duration: '200ms',
                timingFun: 'linear',
            }, '1', onComplete);
            DomUtils.startElemTransition(this.windowElem, guard, {
                property: 'bottom',
                duration: '200ms',
                timingFun: 'linear',
            }, finalBottom, onComplete);
        }
    }

    protected onViewportResize(): void
    {
        if (this.isModal && this.isOpen()) {
            this.windowElem.style.top = '0'
            this.windowElem.style.right = '0'
            this.windowElem.style.bottom = '0'
            this.windowElem.style.left = '0'
            this.windowElem.style.margin = 'auto'
            return
        }
        super.onViewportResize();
    }

    protected onBeforeClose(): void
    {
        this.modalBackgroundElem?.remove()
        this.modalBackgroundElem = null
    }

    protected async makeIconElem(): Promise<null|HTMLElement>
    {
        if (this.iconUrl.length === 0) {
            return DomUtils.elemOfHtml(`<div class="toast-icon toast-icon-${this.toastType}"></div>`);
        }
        const [iconElem, iconElemReadyPromise]
            = this.app.uiHelper.makeScaledAndClippedIcon(this.iconUrl, this.iconOpacityMin, this.iconWidthMax, this.iconHeightMax);
        iconElem.classList.add('toast-image-icon')
        return (await iconElemReadyPromise) ? iconElem : null;
    }

    protected makeTitleElem(): void
    {
        if (!is.nonEmptyString(this.title)) {
            return
        }
        const title = this.app.translateText(`Toast.${this.title}`, this.title)
        if (title.length === 0) {
            return
        }
        const titleElem = DomUtils.elemOfHtml('<div class="toast-title title"/>')
        titleElem.innerText = title;
        this.bodyElem.append(titleElem);
    }

    protected makeTextElem(): void
    {
        if (!is.nonEmptyString(this.text)) {
            return
        }
        const text = this.app.translateText(`Toast.${this.text}`, this.text)
        if (text.length === 0) {
            return
        }
        const textElem = DomUtils.elemOfHtml('<div class="toast-text"/>')
        textElem.append(...DomUtils.paragraphNodesOfText(text))
        this.bodyElem.append(textElem)
    }

    protected makeDontShowElem(): void
    {
        if (!this.hasDontShowAgainOption) {
            return
        }
        const footerElem = DomUtils.elemOfHtml('<div class="toast-footer" data-translate="children"></div>');
        const checkboxId = Utils.randomString(10);
        const dontShowElem = <HTMLInputElement> DomUtils.elemOfHtml(`<input type="checkbox" name="checkbox" id="${checkboxId}" />`);
        const dontShowLabelElem = DomUtils.elemOfHtml(`<label for="${checkboxId}" data-translate="text:Toast">Do not show this message again</label>`);
        dontShowElem.addEventListener('change', ev => {
            this.app.setDontShowNoticeType(this.messageType, dontShowElem.checked)
                .catch(error => this.app.onError(error));
        });
        footerElem.append(dontShowElem);
        footerElem.append(dontShowLabelElem);
        PointerEventDispatcher.protectElementsWithDefaultActions(this.app, footerElem);
        this.bodyElem.append(footerElem);
    }

    protected makeButtonsElem(): void
    {
        if (this.buttons.length === 0) {
            return
        }
        const buttonsElem = DomUtils.elemOfHtml('<div class="toast-buttons"/>');
        for (const { label, action } of this.buttons) {
            const buttonElem = this.app.uiHelper.makeDefaultTextButton('toast-button', `Toast.${label}`, label, action)
            buttonsElem.append(buttonElem);
        }
        this.bodyElem.append(buttonsElem);
    }

    protected onCapturePhasePointerDownInside(ev: PointerEvent): void
    {
        super.onCapturePhasePointerDownInside(ev);
        this.status = 'pinned';
        clearTimeout(this.delayedTransitionTimeoutHandle);
        DomUtils.stopElemTransition(this.windowElem, 'opacity', '1');
        DomUtils.stopElemTransition(this.windowElem, 'bottom');
    }

    protected onAnimationDone(oldStatus: ToastStatus): void
    {
        if (oldStatus !== this.status) {
            return;
        }
        clearTimeout(this.delayedTransitionTimeoutHandle);
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
                if (this.durationSec === 0) {
                    break;
                }
                const guard = () => this.status === newStatus;
                const onComplete = () => this.onAnimationDone(newStatus);
                if (this.isModal) {
                    const playTransitionFun = () => DomUtils.startElemTransition(this.windowElem, guard, {
                        property: 'opacity',
                        duration: '600ms',
                    }, '0', onComplete);
                    this.delayedTransitionTimeoutHandle = setTimeout(playTransitionFun, 1e3 * this.durationSec);
                } else {
                    const playTransitionFun = () => {
                        DomUtils.startElemTransition(this.windowElem, guard, {
                            property: 'opacity',
                            duration: '600ms',
                        }, '0', onComplete);
                        DomUtils.startElemTransition(this.windowElem, guard, {
                            property: 'bottom',
                            duration: '600ms',
                        }, '-20px', onComplete);
                    };
                    this.delayedTransitionTimeoutHandle = setTimeout(playTransitionFun, 1e3 * this.durationSec);
                }
            } break;
            case 'fadingOut': {
                this.close();
            } break;
        }
    }

}

export class SimpleToast extends Toast
{
    constructor(app: ContentApp, messageType: string, durationSec: number, toastType: string, title: string, text: string)
    {
        super(app, messageType, durationSec, toastType, title, text, title, text);
    }
}

export class SimpleErrorToast extends Toast
{
    constructor(app: ContentApp, messageType: string, durationSec: number, toastType: string, fact: string, reason: string, detail: string)
    {
        const title = app.translateText(`ErrorFact.${fact}`, fact)
        const reasonTranslated = app.translateText(`ErrorReason.${reason}`, reason)
        const detailTranslated = app.translateText(`ErrorDetail.${detail}`, detail)
        const text = `${reasonTranslated} ${detailTranslated}`
        super(app, messageType, durationSec, toastType, title, text, title, text);
    }
}

export class ItemExceptionToast extends SimpleErrorToast
{
    constructor(app: ContentApp, durationSec: number, ex: ItemException)
    {
        const fact = ItemException.fact2String(ex.fact);
        const reason = ItemException.reason2String(ex.reason);
        const messageType = `Warning-${fact}-${reason}`;
        const detail = ex.detail;
        const toastType = 'warning';
        super(app, messageType, durationSec, toastType, fact, reason, detail);
    }
}
