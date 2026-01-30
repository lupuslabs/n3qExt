import { is } from '../lib/is'
import { as } from '../lib/as'
import { ErrorWithData } from '../lib/Utils'
import { Config } from '../lib/Config'
import { ItemProperties } from '../lib/ItemProperties'
import { BackpackUpdateEventData } from './OwnItemRepository'
import { WeblinClientIframeApi } from '../lib/WeblinClientIframeApi'
import { ContentApp } from './ContentApp'
import { IItemFrameWindow } from './IItemFrameWindow'
import { ItemFrameWindow, ItemFrameWindowOptions } from './ItemFrameWindow'
import { ItemFramePopup, ItemFramePopupOptions } from './ItemFramePopup'
import { WeblinClientApi } from '../lib/WeblinClientApi'

export class NotAnOpenableItemFrameError extends ErrorWithData {}

export class ContentItemFrames {
    // Todo: Move most inventory item frame handling here.

    private readonly app: ContentApp
    private readonly itemFrameWindows: Map<string,IItemFrameWindow> = new Map()
    private readonly onOwnItemsChanged: (eventData: BackpackUpdateEventData) => void
    private readonly onThemesChanged: () => void

    constructor(app: ContentApp) {
        this.app = app
        this.onOwnItemsChanged = eventData => this.handleOwnItemsChanged(eventData)
        this.app.ownItems.backpackUpdateListeners.addListener(this.onOwnItemsChanged)
        this.onThemesChanged = () => this.sendThemeCssToAllFrames()
        this.app.themeManager.themesChangedListeners.addListener(this.onThemesChanged)
    }

    public stop(): void {
        this.app.themeManager.themesChangedListeners.removeListener(this.onThemesChanged)
        this.app.ownItems.backpackUpdateListeners.removeListener(this.onOwnItemsChanged)
        for (const frame of [...this.itemFrameWindows.values()]) {
            frame.close()
        }
        this.itemFrameWindows.clear()
    }

    public getItemFrameWindow(itemId: string): null|IItemFrameWindow {
        return this.itemFrameWindows.get(itemId) ?? null
    }

    public openItemFrame(
        properties: Readonly<ItemProperties>, anchor: null|DOMRect|HTMLElement, onClose?: null|(() => void),
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

        this.itemFrameWindows.get(itemId)?.close()
        const onCloseTracked = () => {
            this.itemFrameWindows.delete(itemId)
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
        this.itemFrameWindows.set(itemId, frame)
        return frame
    }

    public closeItemFrameWithNotification(itemId: string): void {
        const itemFrameWindow = this.itemFrameWindows.get(itemId)
        if (itemFrameWindow) {
            const messagePrepared = this.prepareMessageForItemFrame(new WeblinClientApi.Message('Window.Close'))
            itemFrameWindow.getIframeElem()?.contentWindow?.postMessage(messagePrepared, '*')
            window.setTimeout(() => itemFrameWindow.close(), 100)
        }
    }

    public handleOtherItemChanged(item: Readonly<ItemProperties>): void {
        this.handleItemChange(item)
    }

    private handleOwnItemsChanged(eventData: BackpackUpdateEventData): void {
        for (const item of eventData.itemsDeleted) {
            this.handleItemDeletion(item)
        }
        for (const item of eventData.itemsNewOrChanged) {
            this.handleItemChange(item)
        }
    }

    private handleItemDeletion(item: Readonly<ItemProperties>): void {
        this.itemFrameWindows.get(ItemProperties.getId(item))?.close()
    }

    private handleItemChange(item: Readonly<ItemProperties>): void {
        const itemId = ItemProperties.getId(item)
        const itemFrameWindow = this.itemFrameWindows.get(itemId)
        if (!itemFrameWindow) {
            return
        }
        itemFrameWindow.setTitleText(ItemProperties.getIframeWindowTitle(item))
        this.sendMessageToAllScriptFrames(new WeblinClientIframeApi.ItemPropertiesChangedNotification(itemId, item))
    }

    private sendThemeCssToAllFrames(): void {
        const css = this.app.themeManager.getEnabledThemesCss()
        this.sendMessageToAllScriptFrames(new WeblinClientIframeApi.ClientThemeCssNotification(css))
    }

    public sendMessageToScriptFrame(itemId: string, message: WeblinClientApi.Message): void {
        const itemFrameWindow = this.itemFrameWindows.get(itemId)
        if (itemFrameWindow) {
            const messagePrepared = this.prepareMessageForItemFrame(message)
            itemFrameWindow.getIframeElem()?.contentWindow?.postMessage(messagePrepared, '*')
        }
    }

    public sendMessageToAllScriptFrames(message: WeblinClientApi.Message): void {
        if (this.itemFrameWindows.size !== 0) {
            const messagePrepared = this.prepareMessageForItemFrame(message)
            for (const itemFrameWindow of this.itemFrameWindows.values()) {
                itemFrameWindow.getIframeElem()?.contentWindow?.postMessage(messagePrepared, '*')
            }
        }
    }

    private prepareMessageForItemFrame(message: WeblinClientApi.Message): WeblinClientApi.Message {
        const magic = Config.get('iframeApi.messageMagicRezactive', 'tr67rftghg_Rezactive')
        return {...message, [magic]: true}
    }
}
