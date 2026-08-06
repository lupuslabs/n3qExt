import { is } from '../lib/is'
import { Utils } from '../lib/Utils';
import { DomUtils } from '../lib/DomUtils'
import { PointerEventDispatcher, PointerEventDispatcherOptions } from '../lib/PointerEventDispatcher'
import { WindowStyle } from './WindowBase'
import { ContentApp } from './ContentApp'

import windowCloseIconDataUrl from '../assets/icons/carbon_close-outline.svg'
import popupCloseIconDataUrl from '../assets/icons/ci-close-small.svg'
import windowPinOpenIconDataUrl from '../assets/icons/pin-open-small.svg'
import windowPinOpenPinnedIconDataUrl from '../assets/icons/pin-open-pinned-small.svg'
import popupPinOpenIconDataUrl from '../assets/icons/pin-open-small.svg'
import popupPinOpenPinnedIconDataUrl from '../assets/icons/pin-open-pinned-small.svg'

export type ButtonStyle = 'default' | 'undecorated' | 'merged' | 'big' | WindowStyle
export type ButtonStyles = ButtonStyle|ButtonStyles[]

type ButtonDef = {
    style?: ButtonStyles,
    extraCssClass?: DomUtils.CssClasses,
    textId?: null|string,
    text?: null|string,
    titleId?: null|string,
    title?: null|string,
    iconUrl?: null|string,
    iconAsCssMask?: boolean,
    iconDummy?: boolean,
    onClick?: () => void,
    onKeyboardClick?: () => void,
    pointerEventDispatcherOptions?: PointerEventDispatcherOptions,
    buttonTag?: string,
}

export class ContentUiHelper {

    private readonly app: ContentApp

    constructor(app: ContentApp) {
        this.app = app
    }

    public fetchImage(iconUrl: null|string): [HTMLImageElement, Promise<boolean>] {
        const image = new Image()
        const loadedPromise = new Promise<boolean>((resolve) => {
            image.addEventListener('error', (ev) => {
                resolve(false)
            })
            image.addEventListener('load', (ev) => {
                resolve(true)
            })
            this.app.fetchUrlAsDataUrl(iconUrl).then(dataUrl => {
                image.crossOrigin = 'anonymous'
                image.src = dataUrl
            })
        })
        return [image, loadedPromise]
    }

    public makeIcon(iconUrl: null|string, asCssMask?: boolean): HTMLElement {
        const iconWrapElem = DomUtils.elemOfHtml('<span class="icon-wrap"></span>')
        const [iconElem, isLoadedPromise] = this.fetchImage(iconUrl)
        isLoadedPromise.then(ok => {
            if (!ok) {
                return
            }
            iconElem.classList.add('icon')
            if (asCssMask) {
                iconWrapElem.style.maskImage = 'url(' + iconElem.src + ')'
                iconElem.classList.add('hidden')
                iconWrapElem.classList.add('mask')
            }
            iconWrapElem.append(iconElem)
        }).catch(error => this.app.onError(error))
        return iconWrapElem
    }

    public makeScaledAndClippedIcon(iconUrl: null|string, opacityMin: number = 10, availableWidth: number, availableHeight: number): [HTMLElement, Promise<boolean>] {
        const iconWrapElem = DomUtils.elemOfHtml('<span class="icon-wrap"></span>')
        const [iconElem, isLoadedPromise] = this.fetchImage(iconUrl)
        const readyPromise = isLoadedPromise.then(ok => {
            if (ok) {
                ok = DomUtils.clipImageElemByOpacityAndFitDimensions(iconElem, opacityMin, availableWidth, availableHeight)
            }
            if (ok) {
                iconElem.classList.add('icon')
                iconWrapElem.append(iconElem)
            }
            return ok
        })
        return [iconWrapElem, readyPromise]
    }

    public makeDefaultTextButton(extraCssClass: null|string, textId: null|string, text: null|string, onClick: () => void): HTMLElement {
        return this.makeButton({style: 'default', extraCssClass, textId, text, onClick})[0]
    }

    public makeButton(buttonDef: ButtonDef): [HTMLElement, PointerEventDispatcher] {
        const buttonElem = document.createElement(buttonDef.buttonTag ?? 'button')
        buttonElem.setAttribute('tabindex', '0')
        buttonElem.classList.add(
            'button',
            ...DomUtils.prepareCssClasses(buttonDef.style, 'default').map(e => `style-${e}`),
            ...DomUtils.prepareCssClasses(buttonDef.extraCssClass),
        )

        if (is.nonEmptyString(buttonDef.iconUrl)) {
            buttonElem.append(this.makeIcon(buttonDef.iconUrl, buttonDef.iconAsCssMask ?? false))
        } else if (buttonDef.iconDummy) {
            const wrapCssClass = buttonDef.iconAsCssMask ? ' mask' : ''
            const iconCssClass = buttonDef.iconAsCssMask ? ' hidden' : ''
            buttonElem.append(DomUtils.elemOfHtml(`<span class="icon-wrap${wrapCssClass}"><span class="icon${iconCssClass}"></span></span>`))
        }

        let text = buttonDef.text ?? ''
        if (is.nonEmptyString(buttonDef.textId)) {
            text = this.app.translateText(buttonDef.textId, text)
        }
        if (is.nonEmptyString(text)) {
            const textElem = document.createElement('span')
            textElem.classList.add('text')
            textElem.textContent = text
            buttonElem.append(textElem)
        }

        let title = buttonDef.title ?? ''
        if (is.nonEmptyString(buttonDef.titleId)) {
            title = this.app.translateText(buttonDef.titleId, title)
        }
        if (is.nonEmptyString(title)) {
            buttonElem.setAttribute('title', title)
        }

        const dispatcherOpts = buttonDef.pointerEventDispatcherOptions ?? {}
        const buttonEventDispatcher = PointerEventDispatcher.makeOpaqueDispatcher(this.app, buttonElem, dispatcherOpts)
        const onClick: null|(() => void) = buttonDef.onClick ?? null
        if (onClick) {
            buttonEventDispatcher.addUnmodifiedLeftClickListener(onClick)
        }
        const onKeyboardClick: null|(() => void) = buttonDef.onKeyboardClick ?? onClick
        if (onKeyboardClick) {
            buttonElem.addEventListener('keypress', ev => {
                if(!ev.shiftKey && !ev.ctrlKey && !ev.altKey && !ev.metaKey && (ev.key === 'Enter' || ev.key === ' ')) {
                    ev.stopPropagation()
                    ev.preventDefault()
                    onKeyboardClick()
                }
            })
        }

        return [buttonElem, buttonEventDispatcher]
    }

    public makeWindowCloseButton(onClose: () => void, style: WindowStyle): HTMLElement {
        const iconUrl: string = style === 'window' ? windowCloseIconDataUrl : popupCloseIconDataUrl
        return this.makeWindowButton(onClose, style, 'close', iconUrl, 'Common.Close', 'Close')
    }

    public makeWindowPinOpenButton(onToggle: (isPinned: boolean) => void, style: WindowStyle): HTMLElement {
        const iconUrlUnpinned: string = style === 'window' ? windowPinOpenIconDataUrl : popupPinOpenIconDataUrl
        const iconUrlPinned: string = style === 'window' ? windowPinOpenPinnedIconDataUrl : popupPinOpenPinnedIconDataUrl
        const titleUnpinned: string = this.app.translateText('Common.PinOpen', 'Pin')
        const titlePinned: string = this.app.translateText('Common.PinOpenPinned', 'Unpin')
        const iconUnpinnedElem: HTMLElement = this.makeIcon(iconUrlUnpinned, true)
        const iconPinnedElem: HTMLElement = this.makeIcon(iconUrlPinned, true)
        iconPinnedElem.classList.add('removed')
        let btnElem: HTMLElement
        let isPinned: boolean = false
        const onClick = () => {
            isPinned = !isPinned
            btnElem.setAttribute('title', isPinned ? titlePinned : titleUnpinned)
            DomUtils.setElemClassPresent(iconUnpinnedElem, 'removed', isPinned)
            DomUtils.setElemClassPresent(iconPinnedElem, 'removed', !isPinned)
            onToggle(isPinned)
        }
        btnElem = this.makeButton({
            style: style === 'window' ? style : 'popup',
            extraCssClass: ['pin-open'],
            title: titleUnpinned,
            iconAsCssMask: true,
            onClick
        })[0]
        btnElem.append(iconUnpinnedElem, iconPinnedElem)
        return btnElem
    }

    public makeWindowButton(onClick: () => void, style: WindowStyle, extraCssClass: string, iconUrl: string, titleId: string, title: string): HTMLElement {
        style = style === 'window' ? style : 'popup'
        const iconAsCssMask = true
        return this.makeButton({style, extraCssClass, title, titleId, iconUrl, iconAsCssMask, onClick})[0]
    }

    /**
     * Returned URL points at our own iframe page wrapping the given page.
     * Our iframe page is treated as not setting any CORS/CSP restrictions.
     * This allows it to load any content no matter whether the content page set any CORS/CSP restrictions.
     *
     * Known issues:
     * - X-Frame-Options response header from wrapped page still applies and prevents framing.
     * - frame-ancestors option in content-security-policy header from wrapped page still applies and prevents framing.
     */
    public getWrappedIframeUrl(url: string): string {
        const iframeUrl: string = chrome.runtime.getURL("assets/iframe.html")
        const urlArg: string = encodeURIComponent(url)
        return `${iframeUrl}?url=${urlArg}`
    }

    public makeVerticalSplitPaneResizeBottom(topElem: HTMLElement, splitterElem: HTMLElement, bottomElem: HTMLElement): void {
        const pevDispatcher = PointerEventDispatcher.makeOpaqueDispatcher(this.app, splitterElem)
        splitterElem.classList.add('splitter', 'vertical')
        splitterElem.append(DomUtils.elemOfHtml('<div class="text"/>'))
        let paneInfo = null
        pevDispatcher.addDragStartListener(ev => {
            paneInfo = null
        })
        pevDispatcher.addDragMoveListener(ev => {
            paneInfo ??= DomUtils.getVerticalSplitPaneMoveInfo(topElem, bottomElem)
            DomUtils.updateVerticalSplitPaneElemHeights(null, bottomElem, paneInfo, ev.distanceY)
        })
    }

    public formatDatetimeForHuman(date: Nil|Date|string, options?: null|Intl.DateTimeFormatOptions): string {
        return Utils.formatDatetimeForHuman(date, this.app.getLanguage(), options);
    }

    public formatDateForHuman(date: Nil|Date|string, options?: null|Intl.DateTimeFormatOptions): string {
        return Utils.formatDateForHuman(date, this.app.getLanguage(), options);
    }

    public formatTimeForHuman(date: Nil|Date|string, options?: null|Intl.DateTimeFormatOptions): string {
        return Utils.formatTimeForHuman(date, this.app.getLanguage(), options);
    }

    public formatTimeOrDatetimeForHuman(date: Nil|Date|string, maybeSameDayDate?: Nil|Date|string|boolean, options?: null|Intl.DateTimeFormatOptions): string {
        return Utils.formatTimeOrDatetimeForHuman(date, maybeSameDayDate, this.app.getLanguage(), options);
    }

    public isDateSameDayForHuman(date: Nil|Date|string, maybeSameDayDate: Nil|Date|string|boolean, options?: null|Intl.DateTimeFormatOptions): boolean {
        return Utils.isDateSameDayForHuman(date, maybeSameDayDate, this.app.getLanguage(), options);
    }
}
