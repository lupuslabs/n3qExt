import { is } from '../lib/is'
import { as } from '../lib/as'
import { iter } from '../lib/Iter';
import { ErrorWithData } from '../lib/Utils'
import { Config } from '../lib/Config'
import { ItemProperties, Pid } from '../lib/ItemProperties'
import { ItemUpdateSubscription } from '../lib/ItemUpdateSubscription'
import { BackpackUpdateEventData } from './OwnItemRepository'
import { WeblinClientIframeApi } from '../lib/WeblinClientIframeApi'
import { ContentApp } from './ContentApp'
import { IItemFrameWindow } from './IItemFrameWindow'
import { ItemFrameWindow, ItemFrameWindowOptions } from './ItemFrameWindow'
import { ItemFramePopup, ItemFramePopupOptions } from './ItemFramePopup'
import { WeblinClientApi } from '../lib/WeblinClientApi'

export class NotAnOpenableItemFrameError extends ErrorWithData {}

type ItemFrameInfo = {
    readonly itemId: string,
    readonly window: IItemFrameWindow,
    titleOverridden: boolean,
    readonly itemUpdateSubscriptions: ItemUpdateSubscription[],
    readonly sentItemIds: Set<string>,
}

export type ThoughtsFrameTarget = {
    readonly clientRoomId: string,
    readonly postId: string,
    readonly noteId: string,
};

export class ContentItemFrames {
    // Todo: Move most inventory item frame handling here.

    private readonly app: ContentApp
    private readonly itemFrameWindows: Map<string,ItemFrameInfo> = new Map()
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
        for (const frameInfo of [...this.itemFrameWindows.values()]) {
            frameInfo.window.close()
        }
        this.itemFrameWindows.clear()
    }

    public getItemFrameWindow(itemId: string): null|IItemFrameWindow {
        return this.itemFrameWindows.get(itemId)?.window ?? null
    }

    /** Opens the room's Thoughts panel; a given target opens it on that specific thought. */
    public openThoughtsFrame(anchor: null|DOMRect|HTMLElement, target: null|ThoughtsFrameTarget = null): IItemFrameWindow {
        const systemItem = iter(this.app.ownItems.getAllItems().values())
            .filter(ItemProperties.isN3qSystemItem)
            .getNext() ?? {};
        const thoughtsProps = Config.get('thoughts.itemFrameProperties', {}) as ItemProperties;
        const combinedProps = { ...systemItem, ...thoughtsProps };
        let iframeUrlTpl: null|string = null;
        if (target) {
            iframeUrlTpl = ItemProperties.getIframeUrl(thoughtsProps);
            const separator = iframeUrlTpl.includes('?') ? '&' : '?';
            iframeUrlTpl = `${iframeUrlTpl}${separator}clientRoomId=${encodeURIComponent(target.clientRoomId)}`
                + `&postId=${encodeURIComponent(target.postId)}`
                + `&noteId=${encodeURIComponent(target.noteId)}`;
        }
        return this.openItemFrame(combinedProps, anchor, null, iframeUrlTpl);
    }

    public openItemFrame(
        properties: Readonly<ItemProperties>, anchor: null|DOMRect|HTMLElement, onClose?: null|(() => void),
        iframeUrlTpl?: null|string, iframeOptions?: null|{[p: string]: any},
    ): IItemFrameWindow {
        const itemId = ItemProperties.getId(properties)
        iframeOptions ??= ItemProperties.getParsedIframeOptions(properties)
        const isOwnItem = !!this.app.ownItems.getItemById(itemId)
        if ((iframeOptions.ownerOnly ?? false) && !isOwnItem) {
            throw new NotAnOpenableItemFrameError('Can\'t open item frame: Owner only!', {properties})
        }

        if (!is.nonEmptyString(iframeUrlTpl)) {
            iframeUrlTpl = ItemProperties.getIframeUrl(properties)
        }
        if (!is.nonEmptyString(iframeUrlTpl)) {
            throw new NotAnOpenableItemFrameError('Can\'t open item frame: No iframe URL!', {properties})
        }
        const roomJid = this.app.getRoom()?.getJid() ?? ''
        iframeUrlTpl = iframeUrlTpl
            .replace('{item}', encodeURIComponent(itemId))
            .replace('{name}', encodeURIComponent(this.app.getUserNickname()))
            .replace('{room}', encodeURIComponent(roomJid))
        const url = this.app.itemFrameContexts.makeItemIframeUrl(roomJid, properties, iframeUrlTpl)

        if (iframeOptions.anchor === 'Base') {
            anchor = null
        }

        this.itemFrameWindows.get(itemId)?.window.close()
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
        const frameInfo: ItemFrameInfo = {
            itemId,
            window: frame,
            titleOverridden: false,
            itemUpdateSubscriptions: [],
            sentItemIds: new Set(),
        }
        const itemSubscription: ItemUpdateSubscription = new ItemUpdateSubscription(isOwnItem, !isOwnItem, [[Pid.Id, itemId]], [])
        frameInfo.itemUpdateSubscriptions.push(itemSubscription)
        this.itemFrameWindows.set(itemId, frameInfo)
        return frame
    }

    public closeItemFrameWithNotification(itemId: string): void {
        const frameInfo = this.itemFrameWindows.get(itemId)
        if (frameInfo) {
            const messagePrepared = this.prepareMessageForItemFrame(new WeblinClientApi.Message('Window.Close'))
            frameInfo.window.getIframeElem()?.contentWindow?.postMessage(messagePrepared, '*')
            window.setTimeout(() => frameInfo.window.close(), 100)
        }
    }

    public handleSetTitleRequest(itemId: string, title: string): void {
        const frameInfo = this.itemFrameWindows.get(itemId)
        if (!frameInfo) {
            return
        }
        frameInfo.window.setTitleText(title)
        frameInfo.titleOverridden = true
    }

    public handleSubscribeToUpdatesRequest(itemId: string, subscriptions: ReadonlyArray<ItemUpdateSubscription>): void {
        const frameInfo = this.itemFrameWindows.get(itemId)
        frameInfo?.itemUpdateSubscriptions.push(...subscriptions)

        // Send all matching items:
        for (const item of this.app.ownItems.getAllItems().values()) {
            this.handleItemChangeForFrame(item, true, frameInfo)
        }
        const room = this.app.getRoom()
        for (const item of room?.getItemIds().map(itemId => room.getItemByItemId(itemId).getProperties()) ?? []) {
            this.handleItemChangeForFrame(item, false, frameInfo)
        }
    }

    public handleOtherItemChanged(item: Readonly<ItemProperties>): void {
        this.handleItemChange(item, false)
    }

    public handleOtherItemGone(itemId: string): void {
        for (const frameInfo of this.itemFrameWindows.values()) {
            this.handleItemGoneForFrame(itemId, frameInfo)
        }
    }

    private handleOwnItemsChanged(eventData: BackpackUpdateEventData): void {
        for (const item of eventData.itemsDeleted) {
            this.handleItemDeletion(ItemProperties.getId(item))
        }
        for (const item of eventData.itemsNewOrChanged) {
            this.handleItemChange(item, true)
        }
    }

    private handleItemDeletion(itemId: string): void {
        this.itemFrameWindows.get(itemId)?.window.close()
        for (const frameInfo of this.itemFrameWindows.values()) {
            this.handleItemGoneForFrame(itemId, frameInfo)
        }
    }

    private handleItemGoneForFrame(itemId: string, frameInfo: ItemFrameInfo): void {
        if (!frameInfo.sentItemIds.has(itemId)) {
            return
        }
        const message = new WeblinClientIframeApi.ItemGoneNotification(itemId)
        const messagePrepared = this.prepareMessageForItemFrame(message)
        frameInfo.window.getIframeElem()?.contentWindow?.postMessage(messagePrepared, '*')
    }

    private handleItemChange(item: Readonly<ItemProperties>, isOwnItem: boolean): void {
        const itemId = ItemProperties.getId(item)
        const frameInfo = this.itemFrameWindows.get(itemId)
        if (frameInfo && !frameInfo.titleOverridden) {
            frameInfo.window.setTitleText(ItemProperties.getIframeWindowTitle(item))
        }
        for (const frameInfo of this.itemFrameWindows.values()) {
            this.handleItemChangeForFrame(item, isOwnItem, frameInfo)
        }
    }

    private handleItemChangeForFrame(item: Readonly<ItemProperties>, isOwnItem: boolean, frameInfo: ItemFrameInfo): void {
        const propertiesToSend = ItemUpdateSubscription.getPropertiesToSendBySubscriptions(frameInfo.itemUpdateSubscriptions, item, isOwnItem)
        if (!propertiesToSend) {
            return
        }
        const itemId = ItemProperties.getId(item)
        frameInfo.sentItemIds.add(itemId)
        const message = new WeblinClientIframeApi.ItemPropertiesChangedNotification(itemId, propertiesToSend)
        const messagePrepared = this.prepareMessageForItemFrame(message)
        frameInfo.window.getIframeElem()?.contentWindow?.postMessage(messagePrepared, '*')
    }

    private sendThemeCssToAllFrames(): void {
        const css = this.app.themeManager.getEnabledThemesCss()
        this.sendMessageToAllScriptFrames(new WeblinClientIframeApi.ClientThemeCssNotification(css))
    }

    public sendMessageToScriptFrame(itemId: string, message: WeblinClientApi.Message): void {
        const frameInfo = this.itemFrameWindows.get(itemId)
        if (frameInfo) {
            const messagePrepared = this.prepareMessageForItemFrame(message)
            frameInfo.window.getIframeElem()?.contentWindow?.postMessage(messagePrepared, '*')
        }
    }

    public sendMessageToAllScriptFrames(message: WeblinClientApi.Message): void {
        if (this.itemFrameWindows.size !== 0) {
            const messagePrepared = this.prepareMessageForItemFrame(message)
            for (const frameInfo of this.itemFrameWindows.values()) {
                frameInfo.window.getIframeElem()?.contentWindow?.postMessage(messagePrepared, '*')
            }
        }
    }

    private prepareMessageForItemFrame(message: WeblinClientApi.Message): WeblinClientApi.Message {
        const magic = Config.get('iframeApi.messageMagicRezactive', 'tr67rftghg_Rezactive')
        return {...message, [magic]: true}
    }
}
