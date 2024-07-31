import { BackgroundApp } from './BackgroundApp';
import log = require('loglevel');
import { as } from '../lib/as';
import { makeZeroTabStats, TabStats } from '../lib/BackgroundMessage';
import { Config } from '../lib/Config';
import { BackgroundBrowserTab } from './BackgroundBrowserTabs'

type AttentionLevel = 0 | 1 | 2; // normal | highlight | blinking.

export class BrowserActionGuiTabState {

    public readonly lastStats: TabStats;
    public readonly attentionLevel: AttentionLevel;
    public readonly animationStart: number;
    public readonly timeoutHandle: null|ReturnType<typeof setTimeout>;

    constructor(lastStats: TabStats, attentionLevel: AttentionLevel, animationStart: number, timeoutHandle: null|ReturnType<typeof setTimeout>) {
        this.lastStats = lastStats;
        this.attentionLevel = attentionLevel;
        this.animationStart = animationStart;
        this.timeoutHandle = timeoutHandle;
    }

}

export class BrowserActionGui
{
    static readonly dummyTabState: BrowserActionGuiTabState = new BrowserActionGuiTabState(makeZeroTabStats(), 0, 0, null);

    protected readonly app: BackgroundApp;
    protected readonly hasBrowserActionFeature: boolean;

    protected listenerRegistered: boolean = false;

    constructor(app: BackgroundApp) {
        this.app = app;
        this.hasBrowserActionFeature = (typeof chrome !== 'undefined') && !!(chrome.action ?? chrome.browserAction);
    }

    public onConfigUpdated(): void
    {
        if (!this.hasBrowserActionFeature || this.listenerRegistered) {
            return;
        }
        this.listenerRegistered = true;
        (chrome.action ?? chrome.browserAction).onClicked.addListener(tab => this.onBrowserActionClicked(tab.id));

        const tabs = this.app.getBrowserTabs();
        tabs.tabActivatedListeners.addListener(tab => this.updateBrowserActionGui(tab))
        tabs.tabDeactivatedListeners.addListener(tab => this.updateBrowserActionGui(tab))
        tabs.tabStatsChangedListeners.addListener(tab => this.updateBrowserActionGui(tab))
    }

    protected onBrowserActionClicked(tabId: number): void
    {
        // Show / hide web page GUI overlay:
        const tab = this.app.getBrowserTabs().getTab(tabId);
        tab.toggleIsGuiEnabled();
        this.updateBrowserActionGui(tab);
    }

    public updateBrowserActionGui(tab: BackgroundBrowserTab): void
    {
        if (!this.hasBrowserActionFeature) {
            return;
        }
        if (!tab.getIsActive()) {
            clearTimeout(tab.getBrowserActionGuiState().timeoutHandle);
            return;
        }
        const tabId = tab.getTabId();
        const lastTabState = tab.getBrowserActionGuiState();
        let {lastStats, attentionLevel, animationStart, timeoutHandle} = lastTabState;
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
        const isGuiEnabled = tab.getIsGuiEnabled();
        const stats = tab.getStats();

        if (isGuiEnabled) {
            attentionLevel = 0;
        } else {
            if (attentionLevel < 1 && stats.hasNewGroupChat) {
                attentionLevel = 1;
            }
            if (attentionLevel < 2 && (false
                || stats.hasNewPrivateChat
                || stats.toastCount - lastStats.toastCount > 0
            )) {
                attentionLevel = 2;
                animationStart = Date.now();
            }
        }

        let path = '/assets/icon.png';
        let titleKey = 'Extension.Hide';
        let color = as.String(Config.get('browserAction.normalBadgeColor'), '#FFFFFF');
        let text = '';
        if (!tab.getIsContentReady()) {
            path = '/assets/iconDisabled.png';
            titleKey = 'Extension.ContentNotReady';
            text = '';
        } else if (!isGuiEnabled) {
            path = '/assets/iconDisabled.png';
            titleKey = 'Extension.Show';
            text = as.String(stats.participantCount);
        }
        if (attentionLevel > 0) {
            color = as.String(Config.get('browserAction.attentionBadgeColor'), '#000000');
            if (attentionLevel > 1) {
                const blinkCount = as.Int(Config.get('browserAction.attentionBlinkCount'), 3);
                const blinkDurationSecs = as.Float(Config.get('browserAction.attentionBlinkDurationSec'), 1);
                const blinkPhaseCount = 2 * Math.max(0, blinkCount);
                const blinkPhaseDurationMsecs = Math.max(1, 1000 * blinkDurationSecs / 2);
                const nowMsecs = Date.now();
                const msecsPassed = nowMsecs - animationStart;
                const blinkPhase = as.Int(msecsPassed / blinkPhaseDurationMsecs);
                if (blinkPhase < blinkPhaseCount) {
                    if (blinkPhase % 2 === 1) {
                        color = as.String(Config.get('browserAction.attentionBlinkBadgeColor'), '#FFFFFF');
                    }
                    const nextPhaseAlreadyPassedMsecs = msecsPassed % blinkPhaseDurationMsecs;
                    const nextPhaseDelayMsecs = blinkPhaseDurationMsecs - nextPhaseAlreadyPassedMsecs + 1;
                    const nextAnimStepFun = () => this.updateBrowserActionGui(this.app.getBrowserTabs().getTab(tabId));
                    timeoutHandle = setTimeout(nextAnimStepFun, nextPhaseDelayMsecs);
                } else {
                    attentionLevel = 1;
                }
            }
        }
        const title = this.app.translateText(titleKey);

        const errorHandler = () => {
            if (chrome.runtime.lastError) {
                if (chrome.runtime.lastError.message.startsWith('No tab with ')) {
                    this.app.getBrowserTabs().checkBrowserTabState(tabId);
                } else {
                    log.info('BrowserActionGui.updateBrowserActionGui', chrome.runtime.lastError.message, {error: chrome.runtime.lastError});
                }
            }
        }
        (chrome.action ?? chrome.browserAction).setIcon({ tabId, path }, errorHandler);
        (chrome.action ?? chrome.browserAction).setTitle({ tabId, title }, errorHandler);
        (chrome.action ?? chrome.browserAction).setBadgeBackgroundColor({ tabId, color }, errorHandler);
        (chrome.action ?? chrome.browserAction).setBadgeText({ tabId, text }, errorHandler);

        lastStats = {...stats};
        tab.setBrowserActionGuiState({ lastStats, attentionLevel, animationStart, timeoutHandle });
    }

}
