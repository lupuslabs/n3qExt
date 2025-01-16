import log = require('loglevel')
import { is } from '../lib/is'
import { iter, Iter } from '../lib/Iter'
import { BackgroundApp } from './BackgroundApp'
import { TabStats, makeZeroTabStats } from '../lib/BackgroundMessage'
import { Utils } from '../lib/Utils'
import { ContentMessage } from '../lib/ContentMessage'
import { BrowserActionGui, BrowserActionGuiTabState } from './BrowserActionGui'
import { CallableEventListeners, EventListeners } from '../lib/EventListeners'

type TabData = {
    readonly tabId: number
    windowId: number
    isActive: boolean
    isActiveChangeDate: Date
    isFocused: boolean
    isFocusedChangeDate: Date
    isContentConnected: boolean
    isContentReady: boolean
    isGuiEnabled: boolean
    stats: TabStats
    browserActionGuiState: BrowserActionGuiTabState
    contentData: Map<string,unknown>
}

export class BackgroundBrowserTab
{
    private readonly tabs: BackgroundBrowserTabs
    public readonly tabData: TabData

    constructor(tabs: BackgroundBrowserTabs, tabData: TabData)
    {
        this.tabs = tabs
        this.tabData = tabData
    }

    public getTabId(): number
    {
        return this.tabData.tabId
    }

    public getWindowId(): number
    {
        return this.tabData.windowId
    }

    public getIsActive(): boolean
    {
        return this.tabData.isActive
    }

    public getIsActiveChangeDate(): Date
    {
        return this.tabData.isActiveChangeDate
    }

    public getIsFocused(): boolean
    {
        return this.tabData.isFocused
    }

    public getIsFocusedChangeDate(): Date
    {
        return this.tabData.isFocusedChangeDate
    }

    public getIsContentConnected(): boolean
    {
        return this.tabData.isContentConnected
    }

    public getIsContentReady(): boolean
    {
        return this.tabData.isContentReady
    }

    public getStats(): Readonly<TabStats>
    {
        return this.tabData.stats
    }

    public getIsGuiEnabled(): boolean
    {
        return this.tabData.isGuiEnabled
    }

    public toggleIsGuiEnabled(): void
    {
        this.tabs.toggleTabIsGuiEnabledFlag(this.tabData.tabId)
    }

    public setBrowserActionGuiState(state: BrowserActionGuiTabState): void
    {
        this.tabs.setTabBrowserActionGuiState(this.tabData.tabId, state)
    }

    public getBrowserActionGuiState(): BrowserActionGuiTabState
    {
        return this.tabData.browserActionGuiState
    }

    public getContentData(): ReadonlyMap<string,unknown>
    {
        return this.tabData.contentData
    }

    public sendMessage(message: { type: string, [p: string]: any }): void
    {
        if (!this.tabData.isContentConnected) {
            return
        }
        this.tabs.sendMessageToTab(this.tabData.tabId, message)
    }

}

class CallableTabEventListeners extends CallableEventListeners<BackgroundBrowserTab> { constructor(ebentName: string) { super(ebentName) } }
type TabEventListeners = EventListeners<BackgroundBrowserTab>

export class BackgroundBrowserTabs
{
    private readonly app: BackgroundApp
    private readonly tabs: Map<number,BackgroundBrowserTab> = new Map()
    private readonly tabDatas: Map<number,TabData> = new Map()
    private readonly browserTabsSupported: boolean
    private readonly activeTabIdByWindowId: Map<number,number> = new Map()
    private focusedWindowId: null|number = 0
    private focusedTabId: null|number = null
    private readonly callableTabCreatedListeners: CallableTabEventListeners = new CallableTabEventListeners('tabCreated')
    private readonly callableTabActivatedListeners: CallableTabEventListeners = new CallableTabEventListeners('tabActivated')
    private readonly callableTabDeactivatedListeners: CallableTabEventListeners = new CallableTabEventListeners('tabDeactivated')
    private readonly callableTabFocusedListeners: CallableTabEventListeners = new CallableTabEventListeners('tabFocused')
    private readonly callableTabUnfocusedListeners: CallableTabEventListeners = new CallableTabEventListeners('tabUnfocused')
    private readonly callableTabRemovedListeners: CallableTabEventListeners = new CallableTabEventListeners('tabRemoved')
    private readonly callableTabContentReadyListeners: CallableTabEventListeners = new CallableTabEventListeners('tabContentReady')
    private readonly callableTabContentStopListeners: CallableTabEventListeners = new CallableTabEventListeners('tabContentStop')
    private readonly callableTabStatsChangedListeners: CallableTabEventListeners = new CallableTabEventListeners('tabStatsChanged')

    public readonly tabCreatedListeners: TabEventListeners
    public readonly tabActivatedListeners: TabEventListeners
    public readonly tabDeactivatedListeners: TabEventListeners
    public readonly tabFocusedListeners: TabEventListeners
    public readonly tabUnfocusedListeners: TabEventListeners
    public readonly tabRemovedListeners: TabEventListeners
    public readonly tabContentReadyListeners: TabEventListeners
    public readonly tabContentStopListeners: TabEventListeners
    public readonly tabStatsChangedListeners: TabEventListeners

    constructor(app: BackgroundApp)
    {
        this.app = app
        this.browserTabsSupported = (typeof chrome !== 'undefined') && !!(chrome?.tabs)

        this.tabCreatedListeners = this.callableTabCreatedListeners
        this.tabActivatedListeners = this.callableTabActivatedListeners
        this.tabDeactivatedListeners = this.callableTabDeactivatedListeners
        this.tabFocusedListeners = this.callableTabFocusedListeners
        this.tabUnfocusedListeners = this.callableTabUnfocusedListeners
        this.tabRemovedListeners = this.callableTabRemovedListeners
        this.tabContentReadyListeners = this.callableTabContentReadyListeners
        this.tabContentStopListeners = this.callableTabContentStopListeners
        this.tabStatsChangedListeners = this.callableTabStatsChangedListeners

        if (this.browserTabsSupported) {
            chrome.tabs.onCreated?.addListener(browserTab => {
                if (browserTab.active) {
                    this.handleTabActivated(browserTab.id, browserTab.windowId)
                } else {
                    this.handleTabDeactivated(browserTab.id, browserTab.windowId)
                }
            })
            chrome.tabs.onActivated?.addListener(activeInfo => this.handleTabActivated(activeInfo.tabId, activeInfo.windowId))
            chrome.tabs.onRemoved?.addListener((tabId, _activeInfo) => this.forgetTab(tabId))
            chrome.windows.onFocusChanged?.addListener(windowId => this.handleWindowFocus(windowId))
        }
    }

    public getAllTabIds(): Iter<number>
    {
        return iter(this.tabs.keys())
    }

    public getAllTabs(): Iter<BackgroundBrowserTab>
    {
        return iter(this.tabs.values())
    }

    public getAllConnectedTabIds(): Iter<number>
    {
        return this.getAllConnectedTabs().map(tab => tab.getTabId())
    }

    public getAllConnectedTabs(): Iter<BackgroundBrowserTab>
    {
        return iter(this.tabs.values()).filter(tab => tab.getIsContentConnected())
    }

    public getTab(tabId: number): BackgroundBrowserTab
    {
        const tabExisting: null|BackgroundBrowserTab = this.tabs.get(tabId) ?? null
        if (tabExisting) {
            return tabExisting
        }
        this.getOrCreateTabData(tabId)
        return this.tabs.get(tabId)
    }

    // Tab actions

    public clearTabStats(tabId: number): void
    {
        const tabData = this.tabDatas.get(tabId) ?? null
        if (!tabData) {
            return
        }
        tabData.stats = makeZeroTabStats()
        this.callOnTabStatsChangedHandlers(tabId)
    }

    public toggleTabIsGuiEnabledFlag(tabId: number): void
    {
        const tabData = this.getOrCreateTabData(tabId)
        tabData.isGuiEnabled = !tabData.isGuiEnabled
        this.sendIsGuiEnabledStateToTab(tabId)
    }

    public setTabBrowserActionGuiState(tabId: number, state: BrowserActionGuiTabState): void
    {
        const tabData = this.getOrCreateTabData(tabId)
        tabData.browserActionGuiState = state
    }

    public sendIsGuiEnabledStateToTab(tabId: number): void
    {
        const tabData = this.tabDatas.get(tabId) ?? null
        if (!tabData?.isContentReady) {
            return
        }
        const isGuiEnabled = tabData.isGuiEnabled
        this.app.sendToTab(tabId, { 'type': ContentMessage.type_extensionIsGuiEnabledChanged, 'data': { isGuiEnabled } })
    }

    public forgetTab(tabId: number): void
    {
        const tab = this.tabs.get(tabId) ?? null
        if (!tab) {
            return
        }
        this.onTabContentStop(tabId)
        this.handleTabDeactivated(tabId, tab.getWindowId())
        this.callableTabRemovedListeners.callListeners(tab)
        this.tabDatas.delete(tabId)
        this.tabs.delete(tabId)
    }

    public checkBrowserTabState(tabId: number): void
    {
        if (!this.browserTabsSupported) {
            return
        }
        chrome.tabs.get(tabId, tabData => {
            try {
                if (tabData.active) {
                    this.handleTabActivated(tabId, tabData.windowId)
                } else {
                    this.handleTabDeactivated(tabId, tabData.windowId)
                }
            } catch(error) {
                this.forgetTab(tabId)
            }
        })
    }

    public sendMessageToTab(tabId: number, message: { type: string, [p: string]: any }): void
    {
        this.app.sendToTab(tabId, message)
    }

    // Tab events

    public onTabContentConnected(tabId: number): void
    {
        const tabData = this.getOrCreateTabData(tabId)
        if (tabData.isContentConnected) {
            return
        }
        tabData.isContentConnected = true

        // Backround worker might have died and content might be ready, so send a state request just in case:
        this.app.sendToTab(tabId, { 'type': ContentMessage.type_sendStateToBackground })
    }

    public onTabHeartbeat(tabId: number): void
    {
        if (!this.app.getIsReady()) {
            if (Utils.logChannel('pingBackground', true)) {
                log.info('BackgroundBrowserTabs.onTabHeartbeat: Ignored because background app not ready yet.', { tabId })
            }
            return
        }
        if (Utils.logChannel('pingBackground', true)) {
            log.info('BackgroundBrowserTabs.onTabHeartbeat', { tabId })
        }
        this.onTabContentConnected(tabId)
    }

    public onTabContentStop(tabId: number): void
    {
        const tabData = this.tabDatas.get(tabId) ?? null
        if (!tabData?.isContentReady) {
            return
        }
        tabData.isContentConnected = false
        tabData.isContentReady = false
        this.clearTabStats(tabId)
        this.callableTabContentStopListeners.callListeners(this.tabs.get(tabId))
    }

    public onStatsFromTab(tabId: number, stats: TabStats, contentData: Iterable<[string,unknown]>): void
    {
        const tabData = this.getOrCreateTabData(tabId)
        tabData.stats = stats
        const contentDataMap = new Map(contentData)
        tabData.contentData = contentDataMap
        if (!tabData.isContentReady) {
            tabData.isContentReady = true
            this.sendIsGuiEnabledStateToTab(tabId)
            this.callableTabContentReadyListeners.callListeners(this.tabs.get(tabId))
        }
        this.callOnTabStatsChangedHandlers(tabId)
    }

    // Private helpers

    private getOrCreateTabData(tabId: number): TabData
    {
        const tabDataExisting: null|TabData = this.tabDatas.get(tabId) ?? null
        if (tabDataExisting) {
            return tabDataExisting
        }

        const tabDataNew: TabData = {
            tabId,
            windowId: 0,
            isActive: false,
            isActiveChangeDate: new Date(0),
            isFocused: false,
            isFocusedChangeDate: new Date(0),
            isContentConnected: false,
            isContentReady: false,
            isGuiEnabled: true,
            stats: makeZeroTabStats(),
            browserActionGuiState: BrowserActionGui.dummyTabState,
            contentData: new Map(),
        }
        this.tabDatas.set(tabId, tabDataNew)

        const tab = new BackgroundBrowserTab(this, tabDataNew)
        this.tabs.set(tabId, tab)
        this.callableTabCreatedListeners.callListeners(tab)

        if (this.tabDatas.size === 1) {
            this.handleTabActivated(tabId, tabDataNew.windowId)
        }
        this.checkBrowserTabState(tabId)
        return tabDataNew
    }

    private handleTabActivated(tabId: number, windowId: number)
    {
        const oldActiveTabId = this.activeTabIdByWindowId.get(windowId) ?? null
        if (!is.nil(oldActiveTabId)) {
            this.handleTabDeactivated(oldActiveTabId, windowId)
        }
        const tabData = this.getOrCreateTabData(tabId)
        if (tabData.windowId !== windowId) {
            if (this.activeTabIdByWindowId.get(tabData.windowId) === tabId) {
                this.activeTabIdByWindowId.delete(tabData.windowId)
            }
            tabData.windowId = windowId
        }
        this.activeTabIdByWindowId.set(windowId, tabId)
        if (!tabData.isActive) {
            tabData.isActive = true
            tabData.isActiveChangeDate = new Date()
            this.callableTabActivatedListeners.callListeners(this.getTab(tabId))
        }
        this.updateTabFocus()
    }

    private handleTabDeactivated(tabId: number, windowId: number)
    {
        this.handleTabUnfocus(tabId)
        const tabData = this.getOrCreateTabData(tabId)
        if (this.activeTabIdByWindowId.get(tabData.windowId) === tabId) {
            this.activeTabIdByWindowId.delete(tabData.windowId)
        }
        tabData.windowId = windowId
        if (!tabData.isActive) {
            return
        }
        tabData.isActive = false
        tabData.isActiveChangeDate = new Date()
        this.callableTabDeactivatedListeners.callListeners(this.getTab(tabId))
    }

    private handleWindowFocus(windowId: number): void
    {
        if (windowId !== chrome.windows.WINDOW_ID_NONE) {
            this.focusedWindowId = windowId
        }
        this.updateTabFocus()
    }

    private updateTabFocus(): void
    {
        this.handleTabFocus(this.activeTabIdByWindowId.get(this.focusedWindowId) ?? null)
    }

    private handleTabFocus(tabId: null|number): void
    {
        if (this.focusedTabId === tabId) {
            return
        }
        this.handleTabUnfocus(this.focusedTabId)
        const tabData: null|TabData = this.tabDatas.get(tabId) ?? null
        if (!tabData) {
            return
        }
        this.focusedTabId = tabId
        tabData.isFocused = true
        tabData.isFocusedChangeDate = new Date()
        this.callableTabFocusedListeners.callListeners(this.getTab(tabId))
    }

    private handleTabUnfocus(tabId: null|number): void
    {
        if (this.focusedTabId !== tabId) {
            return
        }
        this.focusedTabId = null
        const tabData: null|TabData = this.tabDatas.get(tabId) ?? null
        if (!tabData) {
            return
        }
        tabData.isFocused = false
        tabData.isFocusedChangeDate = new Date()
        this.callableTabUnfocusedListeners.callListeners(this.getTab(tabId))
    }

    private callOnTabStatsChangedHandlers(tabId: number): void
    {
        const tab = this.tabs.get(tabId) ?? null
        if (!tab) {
            return
        }
        this.callableTabStatsChangedListeners.callListeners(tab)
    }

}
