import { BackgroundApp } from './BackgroundApp';
import log = require('loglevel');
import { is } from '../lib/is';
import { as } from '../lib/as';
import { Utils } from '../lib/Utils';
import { Memory } from '../lib/Memory';
import { ContentMessage } from '../lib/ContentMessage';
import { MakeZeroTabStats, TabStats } from '../lib/BackgroundMessage';
import { Config } from '../lib/Config';

type AttentionLevel = 0 | 1 | 2; // normal | highlight | blinking.

class TabState {

    public readonly lastStats: TabStats;
    public readonly attentionLevel: AttentionLevel;
    public readonly animationStart: number;
    public readonly timeoutHandle: null|number;

    constructor(lastStats: TabStats, attentionLevel: AttentionLevel, animationStart: number, timeoutHandle: null|number) {
        this.lastStats = lastStats;
        this.attentionLevel = attentionLevel;
        this.animationStart = animationStart;
        this.timeoutHandle = timeoutHandle;
    }

}

export class BrowserActionGui
{
    static readonly dummyTabState: TabState = new TabState(MakeZeroTabStats(), 0, 0, null);

    protected readonly app: BackgroundApp;
    protected readonly hasBrowserActionFeature: boolean;
    protected readonly normalBadgeColor: string;
    protected readonly attentionBadgeColor: string;
    protected readonly blinkBadgeColor: string;
    protected readonly blinkPhaseCount: number;
    protected readonly blinkPhaseDurationMsecs: number;

    protected readonly lastTabStates: Map<number,TabState> = new Map();

    constructor(app: BackgroundApp) {
        this.app = app;
        this.hasBrowserActionFeature = !is.nil(chrome?.browserAction);
        this.normalBadgeColor = as.String(Config.get('browserAction.normalBadgeColor'), '#FFFFFF');
        this.attentionBadgeColor = as.String(Config.get('browserAction.attentionBadgeColor'), '#000000');
        this.blinkBadgeColor = as.String(Config.get('browserAction.attentionBlinkBadgeColor'), '#FFFFFF');
        const blinkCount = as.Int(Config.get('browserAction.attentionBlinkCount'), 3);
        const blinkDurationSecs = as.Float(Config.get('browserAction.attentionBlinkDurationSec'), 1);
        this.blinkPhaseCount = 2 * Math.max(0, blinkCount);
        this.blinkPhaseDurationMsecs = Math.max(1, 1000 * blinkDurationSecs / 2);
        if (this.hasBrowserActionFeature) {
            chrome.browserAction.onClicked.addListener(tab => this.onBrowserActionClicked(tab.id));
        }
    }

    public forgetTab(tabId: number): void
    {
        this.lastTabStates.delete(tabId);
    }

    protected onBrowserActionClicked(tabId: number): void
    {
        // Activate if inactive (old functionality):
        // Todo: Remove after all clients updated.
        (async () => {
            let state = as.Bool(await Memory.getLocal(Utils.localStorageKey_Active(), false));
            if (!state) {
                state = true;
                await Memory.setLocal(Utils.localStorageKey_Active(), state);
                const message = { 'type': ContentMessage.type_extensionActiveChanged, 'data': { state } };
                ContentMessage.sendMessage(tabId, message);
            }
        })().catch(error => log.info('BrowserActionGui.onBrowserActionClicked', error));

        // Show / hide web page GUI overlay:
        const tabData = this.app.getTabData(tabId);
        tabData.isGuiEnabled = !tabData.isGuiEnabled;
        this.updateBrowserActionGui(tabId);
        this.app.sendIsGuiEnabledStateToTab(tabId);
    }

    public updateBrowserActionGui(tabId: number): void
    {
        if (!this.hasBrowserActionFeature) {
            return;
        }
        const lastTabState = this.lastTabStates.get(tabId) ?? BrowserActionGui.dummyTabState;
        let {lastStats, attentionLevel, animationStart, timeoutHandle} = lastTabState;
        window.clearTimeout(timeoutHandle);
        timeoutHandle = null;
        const {isGuiEnabled, stats} = this.app.getTabData(tabId);

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
        let color = this.normalBadgeColor;
        let text = '';
        if (!isGuiEnabled) {
            path = '/assets/iconDisabled.png';
            titleKey = 'Extension.Show';
            text = as.String(stats.participantCount);
        }
        if (attentionLevel > 0) {
            color = this.attentionBadgeColor;
            if (attentionLevel > 1) {
                const nowMsecs = Date.now();
                const msecsPassed = nowMsecs - animationStart;
                const blinkPhase = as.Int(msecsPassed / this.blinkPhaseDurationMsecs);
                if (blinkPhase < this.blinkPhaseCount) {
                    if (blinkPhase % 2 === 1) {
                        color = this.blinkBadgeColor;
                    }
                    const nextPhaseAlreadyPassedMsecs = msecsPassed % this.blinkPhaseDurationMsecs;
                    const nextPhaseDelayMsecs = this.blinkPhaseDurationMsecs - nextPhaseAlreadyPassedMsecs + 1;
                    const nextAnimStepFun = () => this.updateBrowserActionGui(tabId);
                    timeoutHandle = window.setTimeout(nextAnimStepFun, nextPhaseDelayMsecs);
                } else {
                    attentionLevel = 1;
                }
            }
        }
        const title = this.app.translateText(titleKey);

        chrome.browserAction.setIcon({ tabId, path });
        chrome.browserAction.setTitle({ tabId, title });
        chrome.browserAction.setBadgeBackgroundColor({ tabId, color });
        chrome.browserAction.setBadgeText({ tabId, text });

        lastStats = {...stats};
        this.lastTabStates.set(tabId, { lastStats, attentionLevel, animationStart, timeoutHandle });
    }

}
