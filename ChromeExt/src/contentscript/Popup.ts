import { as } from '../lib/as';
import { Utils } from '../lib/Utils';
import { ContentApp } from './ContentApp';
import { domHtmlElemOfHtml } from '../lib/domTools'
import { is } from '../lib/is'

export type PopupOptions = {
    onClose?: () => void,
    closeIsHide?: boolean,
    transparent?: boolean,
    closeButton?: boolean,
};

export class Popup
{
    protected onClose: null|(() => void);

    protected windowElem: HTMLElement;
    protected closeIsHide = false;

    private isClosing: boolean;

    public constructor(protected app: ContentApp) {}

    public show(options: PopupOptions): void
    {
        this.onClose = options.onClose;
        this.closeIsHide = options.closeIsHide;

        if (!this.windowElem) {
            let windowId = Utils.randomString(15);

            const opacityClass = options.transparent ? 'n3q-transparent' : 'n3q-shadow-medium';
            this.windowElem = domHtmlElemOfHtml(`<div id="${windowId}" class="n3q-base n3q-window n3q-popupwindow ${opacityClass}" data-translate="children"></div>`);

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

            this.app.getDisplay()?.append(this.windowElem);

            this.windowElem.addEventListener('pointerdown', ev => {
                this.app.toFront(this.windowElem, ContentApp.LayerWindow);
            });
        }
    }

    public getWindowElem(): null|HTMLElement
    {
        return this.windowElem ?? null;
    }

    public isOpen(): boolean
    {
        return !is.nil(this.windowElem);
    }

    public close(): void
    {
        if (!this.isClosing) {
            this.isClosing = true;

            this.windowElem.remove();
            this.onClose?.();
        }
    }

    public getVisibility(): boolean
    {
        return !this.windowElem.classList.contains('n3q-hidden');
    }

    public setVisibility(visible: boolean): void
    {
        if (visible) {
            this.windowElem.classList.remove('n3q-hidden');
        } else {
            this.windowElem.classList.add('n3q-hidden');
        }
    }
}
