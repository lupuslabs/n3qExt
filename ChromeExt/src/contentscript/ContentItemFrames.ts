import { is } from '../lib/is'
import { as } from '../lib/as'
import { ErrorWithData } from '../lib/Utils'
import { Config } from '../lib/Config'
import { ItemProperties } from '../lib/ItemProperties'
import { WeblinClientIframeApi } from '../lib/WeblinClientIframeApi'
import { ContentApp } from './ContentApp'
import { IItemFrameWindow } from './IItemFrameWindow'
import { ItemFrameWindow, ItemFrameWindowOptions } from './ItemFrameWindow'
import { ItemFramePopup, ItemFramePopupOptions } from './ItemFramePopup'

export class NotAnOpenableItemFrameError extends ErrorWithData {}

export class ContentItemFrames {

    private readonly app: ContentApp
    private readonly openFrames: Set<IItemFrameWindow> = new Set()
    private readonly onThemesChanged: () => void

    constructor(app: ContentApp) {
        this.app = app
        this.onThemesChanged = () => this.sendThemeCssToAllFrames()
        this.app.themeManager.themesChangedListeners.addListener(this.onThemesChanged)
    }

    public stop(): void {
        this.app.themeManager.themesChangedListeners.removeListener(this.onThemesChanged)
        for (const frame of this.openFrames) {
            frame.close()
        }
        this.openFrames.clear()
    }

    public openItemFrame(
        properties: ItemProperties, anchor: null|DOMRect|HTMLElement, onClose?: null|(() => void),
        iframeUrlTpl?: null|string, iframeOptions?: null|{[p: string]: any},
    ): IItemFrameWindow {
        const itemId = ItemProperties.getId(properties)
        iframeOptions ??= ItemProperties.getParsedIframeOptions(properties)
        if ((iframeOptions.ownerOnly ?? false) && !this.app.ownItems.getItemById(itemId)) {
            throw new NotAnOpenableItemFrameError('Can\tt open item frame: Owner only!', {properties})
        }

        if (!is.nonEmptyString(iframeUrlTpl)) {
            iframeUrlTpl = ItemProperties.getIframeUrl(properties)
        }
        if (!is.nonEmptyString(iframeUrlTpl)) {
            throw new NotAnOpenableItemFrameError('Can\tt open item frame: No iframe URL!', {properties})
        }
        const roomJid = this.app.getRoom()?.getJid() ?? ''
        const url = this.app.itemFrameContexts.makeItemIframeUrl(roomJid, properties, iframeUrlTpl)

        if (iframeOptions.anchor === 'Base') {
            anchor = null
        }

        const onCloseTracked = () => {
            this.openFrames.delete(frame)
            if (this.openFrames.size === 0) {
                this.app.themeManager.themesChangedListeners.removeListener(this.onThemesChanged)
            }
            onClose?.()
        }

        const leftMode = anchor ? 'anchorCenter' : 'containerLeft'
        const left = as.IntOrNull(iframeOptions.left)
        const bottom = as.Int(iframeOptions.bottom, 50)
        const width = as.Int(iframeOptions.width, 100)
        const height = as.Int(iframeOptions.height, 100)
        const closeIsHide = as.Bool(iframeOptions.closeIsHide)
        const hidden = as.Bool(iframeOptions.hidden)
        const transparent = as.Bool(iframeOptions.transparent)
        let frame: IItemFrameWindow
        switch (as.String(iframeOptions.frame ?? 'Window')) {
            default:
            case 'Window': {
                const resizable = as.Bool(iframeOptions.rezizable, true)
                const titleText = ItemProperties.getIframeWindowTitle(properties)
                const undockable = as.Bool(iframeOptions.undockable)
                const undocked = as.Bool(iframeOptions.undocked)
                const winOpts: ItemFrameWindowOptions = {
                    url, anchor, left, leftMode, bottom, width, height, resizable, transparent, titleText,
                    onClose: onCloseTracked, closeIsHide, hidden, undockable, undocked,
                }
                const window = new ItemFrameWindow(this.app, itemId)
                window.show(winOpts)
                frame = window
                break
            }
            case 'Popup': {
                const closeButton = as.Bool(iframeOptions.closeButton, true)
                const popupOpts: ItemFramePopupOptions = {
                    url, anchor, leftMode, left, bottom, width, height, transparent,
                    closeButton, onClose: onCloseTracked, closeIsHide, hidden,
                }
                const popup = new ItemFramePopup(this.app)
                popup.show(popupOpts)
                frame = popup
                break
            }
        }
        this.openFrames.add(frame)
        return frame
    }

    private sendThemeCssToAllFrames(): void {
        const themeCss = this.app.themeManager.getEnabledThemesCss()
        const magicKey = Config.get('iframeApi.messageMagicRezactive', 'tr67rftghg_Rezactive')
        const message = new WeblinClientIframeApi.ClientThemeCssNotification(themeCss)
        message[magicKey] = true
        for (const frame of this.openFrames) {
            frame.getIframeElem()?.contentWindow?.postMessage(message, '*')
        }
    }
}
