import * as log from 'loglevel'
import { BackgroundApp } from './BackgroundApp'
import { PopupDefinition } from '../lib/BackgroundMessage'
import { is } from '../lib/is'
import { as } from '../lib/as'

type PopupInfo = {
    readonly popupId: string
    readonly windowId: number,
    readonly tabId: number,
    readonly allowContentApp: boolean,
}

export class PopupManager
{
    private readonly app: BackgroundApp
    private isStopped: boolean = false
    private readonly onWindowRemovedListener: (string) => void
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
        chrome.windows.onRemoved.addListener(this.onWindowRemovedListener)
    }

    public stop(): void
    {
        if (this.isStopped) {
            return
        }
        this.isStopped = true
        chrome.windows.onRemoved.removeListener(this.onWindowRemovedListener)
        this.popupInfos.clear()
        this.popupInfosByWindowId.clear()
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
            this.openPopup(popupDefinition)
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

    private openPopup(popupDefinition: PopupDefinition): void
    {
        const popupId = popupDefinition.id
        const { url, left, top, width, height, allowContentApp } = popupDefinition
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
        let popupInfo = this.popupInfosByWindowId.get(windowId)
        if (popupInfo) {
            this.popupInfosByWindowId.delete(windowId)
            this.popupInfos.delete(popupInfo.popupId)
        }
    }

}
