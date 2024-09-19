import * as log from 'loglevel'
import { BackgroundApp } from './BackgroundApp'
import { PopupDefinition } from '../lib/BackgroundMessage'
import { is } from '../lib/is'
import { as } from '../lib/as'
import { iter } from '../lib/Iter'
import { Config } from '../lib/Config'
import { Memory } from '../lib/Memory'

type PopupState = Readonly<{
    left?: number
    top?: number
    width?: number
    height?: number
}>

interface PopupManagerWindowBackend
{
    getPopupDefinitionByTabId(tabId: number): null|PopupDefinition
    stop(): void
    maintain(): void
    openOrFocusPopup(popupDefinition: PopupDefinition, initialState: PopupState): void
    closePopup(popupId: string): void
}

type PopupStateChangedHandler = (popupId: string, popupState: PopupState) => void

export class PopupManager
{
    private readonly broserApi: PopupManagerWindowBackend
    private isStopped: boolean = false

    public constructor(_app: BackgroundApp)
    {
        const popupStateChangedHandler: PopupStateChangedHandler = (popupId: string, popupState: PopupState) => this.onPopupStateChanged(popupId, popupState)
        if ((typeof chrome !== 'undefined') && !is.nil(chrome?.windows)) {
            this.broserApi = new ExtensionPopupManagerWindowBackend(popupStateChangedHandler)
        } else if ((typeof window !== 'undefined') && !is.nil(window?.open)) {
            this.broserApi = new PagePopupManagerWindowBackend(popupStateChangedHandler)
        } else {
            this.isStopped = true
            return
        }
    }

    public stop(): void
    {
        if (this.isStopped) {
            return
        }
        this.isStopped = true
        this.broserApi.stop()
    }

    public maintain(): void
    {
        if (this.isStopped) {
            return
        }
        this.broserApi.maintain()
    }

    public openOrFocusPopup(popupDefinition: PopupDefinition): void
    {
        if (this.isStopped) {
            return
        }
        this.loadPopupStateFromLocalStorage(popupDefinition)
            .then(initialState => this.broserApi.openOrFocusPopup(popupDefinition, initialState))
    }

    public closePopup(popupId: string): void
    {
        if (this.isStopped) {
            return
        }
        this.broserApi.closePopup(popupId)
    }

    public isTabDisabled(tabId: number): boolean
    {
        const maybePopupDefinition = this.broserApi.getPopupDefinitionByTabId(tabId) ?? null
        return !(maybePopupDefinition?.allowContentApp ?? true)
    }

    private onPopupStateChanged(popupId: string, popupState: PopupState): void
    {
        this.savePopupStateToLocalStorage(popupId, popupState)
    }

    private async loadPopupStateFromLocalStorage(popupDefinition: PopupDefinition): Promise<PopupState>
    {
        const storageKey = this.getPopupLocalStorageKey(popupDefinition.id)
        const savedState = await Memory.getLocal(storageKey, {})
            .catch(error => {
                log.info('PopupWindowManager.getPopupStateFromLocalStorage: Memory.getLocal failed!', error, { storageKey })
                return {}
            })
        const state: PopupState = {
            left: savedState.left ?? popupDefinition.left,
            top: savedState.top ?? popupDefinition.top,
            width: savedState.width ?? popupDefinition.width,
            height: savedState.height ?? popupDefinition.height,
        }
        return state
    }

    private savePopupStateToLocalStorage(popupId: string, state: PopupState): void
    {
        const storageKey = this.getPopupLocalStorageKey(popupId)
        Memory.setLocal(storageKey, state)
            .catch(error => log.info('PopupWindowManager.getPopupStateFromLocalStorage: Memory.getLocal failed!', error, { storageKey }))
    }

    private getPopupLocalStorageKey(popupId: string): string
    {
        return 'popup.state.' + popupId
    }

}

type ExtensionPopupInfo = {
    popupId: string
    windowId: number
    tabId: number
    popupDefinition: PopupDefinition
}

export class ExtensionPopupManagerWindowBackend implements PopupManagerWindowBackend
{
    private readonly popups: Map<string, ExtensionPopupInfo> = new Map()
    private readonly pollWindowStates: boolean
    private lastPollWindowStatesTimeMs: number = 0

    private readonly onWindowRemovedListener: (string) => void
    private readonly onWindowBoundsChangedListener: (window: chrome.windows.Window) => void

    private readonly popupStateChangedHandler: PopupStateChangedHandler

    constructor(popupStateChangedHandler: PopupStateChangedHandler) {
        this.pollWindowStates = !chrome.windows.onBoundsChanged
        this.popupStateChangedHandler = popupStateChangedHandler

        this.onWindowRemovedListener = (windowId: number) => this.onWindowRemoved(windowId)
        try {
            chrome.windows.onRemoved.addListener(this.onWindowRemovedListener)
        } catch (error) {
            log.info('PopupWindowManager.constructor: chrome.windows.onRemoved.addListener failed!', error)
        }

        this.onWindowBoundsChangedListener = (window: chrome.windows.Window) => this.onWindowBoundsChanged(window)
        if (!this.pollWindowStates) {
            try {
                chrome.windows.onBoundsChanged.addListener(this.onWindowBoundsChangedListener)
            } catch (error) {
                log.info('PopupWindowManager.constructor: chrome.windows.onBoundsChanged.addListener failed!', error)
            }
        }
    }

    public getPopupDefinitionByTabId(tabId: number): null|PopupDefinition
    {
        return iter(this.popups.values()).filter(popup => popup.tabId === tabId).map(popup => popup.popupDefinition).getNext()
    }

    public stop(): void
    {
        try {
            chrome.windows.onRemoved.removeListener(this.onWindowRemovedListener)
        } catch (error) {
            log.info('PopupWindowManager.stop: chrome.windows.onRemoved.removeListener failed!', error)
        }
        if (!this.pollWindowStates) {
            try {
                chrome.windows.onBoundsChanged.removeListener(this.onWindowBoundsChangedListener)
            } catch (error) {
                log.info('PopupWindowManager.stop: chrome.windows.onBoundsChanged.removeListener failed!', error)
            }
        }
        this.popups.clear()
    }

    public maintain(): void
    {
        if (!this.pollWindowStates) {
            return
        }
        const intervalSec = as.Int(Config.get('popups.windowStatePollIntervalSec', 60))
        const secsSinceUpdate = (Date.now() - this.lastPollWindowStatesTimeMs) / 1000
        if (secsSinceUpdate > intervalSec) {
            try {
                chrome.windows.getAll(windows => windows.forEach(this.onWindowBoundsChangedListener))
            } catch (error) {
                log.info('PopupWindowManager.maintain: chrome.windows.getAll failed!', error)
            }
        }
    }

    public closePopup(popupId: string): void
    {
        const windowId = this.popups.get(popupId)?.windowId ?? null
        if (!windowId) {
            return
        }
        try {
            chrome.windows.remove(windowId, () => { })
        } catch (error) {
            log.info('PopupWindowManager.focusPopup: chrome.windows.remove failed!', error, { popupId, windowId })
        }
    }

    public openOrFocusPopup(popupDefinition: PopupDefinition, initialState: PopupState): void
    {
        let popupInfo = this.popups.get(popupDefinition.id)
        if (popupInfo) {
            try {
                chrome.windows.update(popupInfo.windowId, { focused: true }, _window => { })
            } catch (error) {
                log.info('PopupWindowManager.focusPopup: chrome.windows.update failed!', error, { popupDefinition, popupInfo })
            }
        } else {
            this.openPopup(popupDefinition, initialState)
        }
    }

    private openPopup(popupDefinition: PopupDefinition, initialState: PopupState): void
    {
        const popupId = popupDefinition.id
        const { left, top, width, height } = initialState
        const options: chrome.windows.CreateData = {
            type: 'popup',
            state: 'normal',
            focused: true,
            url: popupDefinition.url,
            left, top, width, height,
        }
        const windowCreatedHandler = (window: chrome.windows.Window) => {
            if (!window) {
                log.info('PopupWindowManager.openOrFocusPopup: chrome.windows.create failed without error!', { popupDefinition })
                return
            }
            const windowId = window.id
            const tabId = window.tabs?.[0]?.id
            if (!is.number(tabId)) {
                log.info('PopupWindowManager.openOrFocusPopup: chrome.windows.create resulting window has no tabs!', { popupDefinition, window })
                return
            }
            this.popups.set(popupId, { popupId, windowId, tabId, popupDefinition })
        }
        try {
            chrome.windows.create(options, windowCreatedHandler)
        } catch (error) {
            log.info('PopupWindowManager.openOrFocusPopup: chrome.windows.create failed!', error, { popupDefinition })
        }
    }

    private getPopupIdByWindowId(windowId: number): null|string
    {
        return iter(this.popups.values()).filter(popup => popup.windowId === windowId).map(popup => popup.popupId).getNext()
    }

    private onWindowRemoved(windowId: number): void
    {
        const popupId = this.getPopupIdByWindowId(windowId)
        if (!popupId) {
            return
        }
        this.popups.delete(popupId)
    }

    private onWindowBoundsChanged(window: chrome.windows.Window): void
    {
        const windowId = window.id
        if (!windowId) {
            return
        }
        const popupId = this.getPopupIdByWindowId(windowId)
        if (!popupId) {
            return
        }
        const { left, top, width, height } = window
        if (!width || !height) {
            return
        }
        this.popupStateChangedHandler(popupId, { left, top, width, height })
    }

}

type PagePopupInfo = {
    popupId: string
    popupWindow: Window
    popupDefinition: PopupDefinition
}

export class PagePopupManagerWindowBackend implements PopupManagerWindowBackend
{
    private readonly popups: Map<string, PagePopupInfo> = new Map()
    private lastPollWindowStatesTimeMs: number = 0
    private readonly popupStateChangedHandler: PopupStateChangedHandler

    constructor(popupStateChangedHandler: PopupStateChangedHandler) {
        this.popupStateChangedHandler = popupStateChangedHandler
    }

    public getPopupDefinitionByTabId(_tabId: number): null|PopupDefinition
    {
        return null
    }

    public stop(): void
    {
        this.popups.clear()
    }

    public maintain(): void
    {
        const intervalSec = as.Int(Config.get('popups.windowStatePollIntervalSec', 60))
        const secsSinceUpdate = (Date.now() - this.lastPollWindowStatesTimeMs) / 1000
        if (secsSinceUpdate <= intervalSec) {
            return
        }
        iter(this.popups.values()).forEach(popupInfo => this.maintainPopup(popupInfo))
    }

    private maintainPopup(popupInfo: PagePopupInfo): void
    {
        const { popupId, popupWindow } = popupInfo
        if (popupWindow.closed) {
            this.popups.delete(popupId)
            return
        }
        try {
            const width = popupWindow.outerWidth
            const height = popupWindow.outerHeight
            const top = popupWindow.screenTop
            const left = popupWindow.screenLeft
            this.popupStateChangedHandler(popupId, { left, top, width, height })
        } catch (error) {
            // Window property access blocked by browser because of cross domain access. Nothing to do about this.
        }
    }

    public closePopup(popupId: string): void
    {
        const popupInfo = this.popups.get(popupId)
        try {
            popupInfo?.popupWindow.close()
        } catch (error) {
            log.info('PopupWindowManager.focusPopup: window.close failed!', error, { popupInfo })
        }
        this.popups.delete(popupId)
    }

    public openOrFocusPopup(popupDefinition: PopupDefinition, initialState: PopupState): void
    {
        const popupInfo = this.popups.get(popupDefinition.id)
        if (popupInfo) {
            this.focusPopup(popupInfo)
        } else {
            this.openPopup(popupDefinition, initialState)
        }
    }

    private openPopup(popupDefinition: PopupDefinition, initialState: PopupState): void
    {
        const popupId = popupDefinition.id
        const { left, top, width, height } = initialState
        const params = `scrollbars=no,resizable=yes,status=no,location=no,toolbar=no,menubar=no,width=${width},height=${height},left=${left},top=${top}`
        let popupWindow: null|Window
        try {
            popupWindow = window.open(popupDefinition.url, '_blank', params)
        } catch (error) {
            log.info('PopupWindowManager.openOrFocusPopup: window.open failed!', error, { popupDefinition })
        }
        if (!popupWindow) {
            log.info('PopupWindowManager.openOrFocusPopup: window.open failed without error!', { popupDefinition })
            return
        }
        const popupInfo = { popupId, popupWindow, popupDefinition }
        this.popups.set(popupId, popupInfo)
        this.focusPopup(popupInfo)
    }

    private focusPopup(popupInfo: PagePopupInfo): void
    {
        try {
            popupInfo.popupWindow.focus()
        } catch (error) {
            log.info('PopupWindowManager.openOrFocusPopup: window.focus failed!', error, { popupInfo })
        }
    }

}
