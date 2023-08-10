import * as log from 'loglevel'
import { BackgroundApp } from './BackgroundApp'
import { PopupDefinition } from '../lib/BackgroundMessage'
import { is } from '../lib/is'

type PopupInfo = {
    readonly popupId: string
    readonly windowId: number,
    readonly tabId: number,
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
        this.isStopped = is.nil(chrome?.windows);
        if (this.isStopped) {
            return;
        }
        this.onWindowRemovedListener = (windowId: number) => this.onWindowRemoved(windowId)
        chrome.windows.onRemoved.addListener(this.onWindowRemovedListener)
    }

    public stop(): void
    {
        if (this.isStopped) {
            return;
        }
        this.isStopped = true;
        chrome.windows.onRemoved.removeListener(this.onWindowRemovedListener)
        this.popupInfos.clear()
        this.popupInfosByWindowId.clear()
    }

    public openOrFocusPopup(popupDefinition: PopupDefinition): void
    {
        if (this.isStopped) {
            return;
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
            return;
        }
        let popupInfo = this.popupInfos.get(popupId)
        if (popupInfo) {
            chrome.windows.remove(popupInfo.windowId).catch(error => log.info(error))
        }
    }

    public isTabDisabled(tabId: number): boolean
    {
        let isPopupTab = false;
        this.popupInfos.forEach(pi =>
        {
            if (pi.tabId === tabId) { isPopupTab = true }
        });
        return isPopupTab;
    }

    private focusPopup(popupInfo: PopupInfo): void
    {
        chrome.windows.update(popupInfo.windowId, { focused: true }).catch(error => log.info(error))
    }

    private openPopup(popupDefinition: PopupDefinition): void
    {
        const popupId = popupDefinition.id
        const { url, left, top, width, height } = popupDefinition
        const options: chrome.windows.CreateData = {
            type: 'popup',
            state: 'normal',
            focused: true,
            url, left, top, width, height,
        }
        chrome.windows.create(options, (window) =>
        {
            if (!window) {
                log.info('PopupWindowManager.openOrFocusPopup: chrome.windows.create failed without error!', { window })
                return
            }
            try {
                const windowId = window.id
                const tabId = window.tabs[0].id;
                const popupInfo = { popupId, windowId, tabId }
                this.popupInfos.set(popupId, popupInfo)
                this.popupInfosByWindowId.set(windowId, popupInfo)
            } catch (error) {
                log.info('PopupWindowManager.openOrFocusPopup: chrome.windows.create result processing failed!', { error, window })
            }
        })
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
