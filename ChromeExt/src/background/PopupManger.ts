import * as log from 'loglevel'
import { BackgroundApp } from './BackgroundApp'
import { PopupDefinition } from '../lib/BackgroundMessage'
import { is } from '../lib/is'
import { as } from '../lib/as'
import { Config } from '../lib/Config'
import { Memory } from '../lib/Memory'

type PopupInfo = {
    readonly popupId: string
    readonly windowId: number,
    readonly tabId: number,
    readonly allowContentApp: boolean,
}

type PopupState = Readonly<{
    left?: number,
    top?: number,
    width?: number,
    height?: number,
}>

export class PopupManager
{
    private readonly app: BackgroundApp
    private isStopped: boolean = false
    private readonly pollWindowStates: boolean = false
    private lastPollWindowStatesTimeMs: number = 0
    private readonly onWindowRemovedListener: (string) => void
    private readonly onWindowBoundsChangedListener: (window: chrome.windows.Window) => void
    private readonly popupInfos: Map<string, PopupInfo> = new Map()
    private readonly popupInfosByWindowId: Map<number, PopupInfo> = new Map()

    public constructor(app: BackgroundApp)
    {
        this.app = app
        this.isStopped = (typeof chrome === 'undefined') || is.nil(chrome?.windows)
        if (this.isStopped) {
            return
        }
        this.onWindowRemovedListener = (windowId: number) => this.onWindowRemoved(windowId)
        try {
            chrome.windows.onRemoved.addListener(this.onWindowRemovedListener)
        } catch (error) {
            log.info('PopupWindowManager.constructor: chrome.windows.onRemoved.addListener failed!', error)
        }
        this.pollWindowStates = !chrome.windows.onBoundsChanged
        this.onWindowBoundsChangedListener = (window: chrome.windows.Window) => this.onWindowBoundsChanged(window)
        if (!this.pollWindowStates) {
            try {
                chrome.windows.onBoundsChanged.addListener(this.onWindowBoundsChangedListener)
            } catch (error) {
                log.info('PopupWindowManager.constructor: chrome.windows.onBoundsChanged.addListener failed!', error)
            }
        }
    }

    public stop(): void
    {
        if (this.isStopped) {
            return
        }
        this.isStopped = true
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
        this.popupInfos.clear()
        this.popupInfosByWindowId.clear()
    }

    public maintain(): void
    {
        if (this.isStopped) {
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

    public openOrFocusPopup(popupDefinition: PopupDefinition): void
    {
        if (this.isStopped) {
            return
        }
        const popupId = popupDefinition.id
        let popupInfo = this.popupInfos.get(popupId)
        if (popupInfo) {
            this.focusPopup(popupInfo)
        } else {
            this.openPopup(popupDefinition).then(() => {})
        }
    }

    public closePopup(popupId: string): void
    {
        if (this.isStopped) {
            return
        }
        const popupInfo = this.popupInfos.get(popupId)
        if (!popupInfo) {
            return
        }
        try {
            chrome.windows.remove(popupInfo.windowId, () => { })
        } catch (error) {
            log.info('PopupWindowManager.focusPopup: chrome.windows.remove failed!', error, { popupId })
        }
    }

    public isTabDisabled(tabId: number): boolean
    {
        for (const pi of this.popupInfos.values()) {
            if (pi.tabId === tabId && !pi.allowContentApp) {
                return true
            }
        }
        return false
    }

    private focusPopup(popupInfo: PopupInfo): void
    {
        try {
            chrome.windows.update(popupInfo.windowId, { focused: true }, _window => { })
        } catch (error) {
            log.info('PopupWindowManager.focusPopup: chrome.windows.update failed!', error, { popupInfo })
        }
    }

    private async openPopup(popupDefinition: PopupDefinition): Promise<void>
    {
        const popupId = popupDefinition.id
        const { url, allowContentApp } = popupDefinition
        const { left, top, width, height } = await this.loadPopupStateFromLocalStorage(popupDefinition)
        const options: chrome.windows.CreateData = {
            type: 'popup',
            state: 'normal',
            focused: true,
            url, left, top, width, height,
        }
        try {
            chrome.windows.create(options, (window) => {
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
                const popupInfo: PopupInfo = { popupId, windowId, tabId, allowContentApp: as.Bool(allowContentApp) }
                this.popupInfos.set(popupId, popupInfo)
                this.popupInfosByWindowId.set(windowId, popupInfo)
            })
        } catch (error) {
            log.info('PopupWindowManager.openOrFocusPopup: chrome.windows.create failed!', error, { popupDefinition })
        }
    }

    private onWindowRemoved(windowId: number): void
    {
        const popupInfo = this.popupInfosByWindowId.get(windowId)
        if (popupInfo) {
            this.popupInfosByWindowId.delete(windowId)
            this.popupInfos.delete(popupInfo.popupId)
        }
    }

    private onWindowBoundsChanged(window: chrome.windows.Window): void
    {
        const windowId = window.id
        if (!windowId) {
            return
        }
        const popupInfo = this.popupInfosByWindowId.get(windowId)
        if (!popupInfo) {
            return
        }
        const { left, top, width, height } = window
        if (!width || !height) {
            return
        }
        this.savePopupStateToLocalStorage(popupInfo.popupId, { left, top, width, height })
    }

    private async loadPopupStateFromLocalStorage(popupDefinition: PopupDefinition): Promise<PopupState>
    {
        const storageKey = this.getPopupLocalStorageKey(popupDefinition.id)
        const savedState = await Memory.getLocal(storageKey, {})
            .catch(error => log.info('PopupWindowManager.getPopupStateFromLocalStorage: Memory.getLocal failed!', error, { storageKey }))
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
