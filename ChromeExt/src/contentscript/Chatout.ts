import { is } from '../lib/is';
import { as } from '../lib/as';
import { Config } from '../lib/Config';
import { ContentApp } from './ContentApp';
import { domOnNextRenderComplete, startDomElemTransition } from '../lib/domTools';

type BubbleStatus = 'pinned'|'fadingSlow'|'fadingFast';
type BubbleInfo = {
    bubbleId: number,
    bubbleCreatedMs: number, // Unix timestamp [ms]
    bubbleElem: HTMLElement,
    bubbleStatus: BubbleStatus,
};

export class Chatout
{
    private app: ContentApp;
    private containerElem: HTMLElement;
    private isVisible: boolean = true;
    private bubbles: Map<number,BubbleInfo> = new Map();
    private bubbleElemIds: number[] = [];
    private lastBubbleId: number = 0;

    constructor(app: ContentApp, display: HTMLElement)
    {
        this.app = app;
        this.containerElem = document.createElement('div');
        this.containerElem.classList.add('n3q-chatout-container');
        display.appendChild(this.containerElem);
    }

    public stop()
    {
        this.containerElem?.remove();
    }

    public setText(text: string): void
    {
        if (!is.nil(text) && text.length !== 0) {
            const nowSecs = Date.now() / 1000;
            const msgAgeSecs = nowSecs;
            const startAgeSecs = as.Float(Config.get('room.chatBubbleFadeStartSec'), 1.0);
            const durationCfgSecs = as.Float(Config.get('room.chatBubbleFadeDurationSec'), 1.0);
            const {delaySecs, durationSecs}
                = this.calculateBubbleFadeout(nowSecs, msgAgeSecs, startAgeSecs, durationCfgSecs);
            if (delaySecs + durationSecs > as.Float(Config.get('room.chatBubblesMinTimeRemSec'), 1.0)) {

                const bubblesMax = Math.max(1, as.Int(Config.get('room.chatBubblesPerChatoutMax'), 1));
                let unpinnedBubbleIds = this.bubbleElemIds.filter(id => this.bubbles.get(id).bubbleStatus !== 'pinned');
                let bubblesToFadeout = Math.max(0, unpinnedBubbleIds.length + 1 - bubblesMax);
                for (let index = 0; index < bubblesToFadeout; index++) {
                    this.fadeoutFastBubble(unpinnedBubbleIds[index]);
                }

                this.makeBubble(text, msgAgeSecs, delaySecs, durationSecs);
            }
        }
    }

    public setVisibility(isVisible: boolean): void
    {
        this.isVisible = isVisible;
        if (isVisible) {
            this.containerElem.classList.remove('n3q-hidden');
        } else {
            this.containerElem.classList.add('n3q-hidden');
        }
    }

    public toggleVisibility(): void
    {
        if (!this.isVisible || this.bubbles.size !== 0) {
            this.setVisibility(!this.isVisible);
        }
    }

    protected makeBubble(text: string, createdMsecs: number, fadeDelayMs: number, fadeDurationMs: number): void
    {
        this.lastBubbleId++;
        const bubbleId = this.lastBubbleId;
        const bubbleWrapElem = document.createElement('div');
        bubbleWrapElem.classList.add('n3q-chatout');
        bubbleWrapElem.style.opacity = '1';
        
        const bubbleElem = document.createElement('div');
        bubbleElem.classList.add('n3q-speech');
        bubbleElem.onpointerdown = (ev) => this.pinBubble(bubbleId);
        bubbleWrapElem.appendChild(bubbleElem);

        const textElem = document.createElement('div');
        textElem.classList.add('n3q-text');
        textElem.innerHTML = as.HtmlWithClickableLinks(text);
        bubbleElem.appendChild(textElem);

        const onCloseClick = () => this.closeBubble(bubbleId);
        bubbleWrapElem.appendChild(this.app.makeWindowCloseButton(onCloseClick, 'overlay'));

        this.containerElem.appendChild(bubbleWrapElem);
        const bubbleStatus: BubbleStatus = 'fadingSlow';
        const bubbleInfo: BubbleInfo = {bubbleId, bubbleCreatedMs: createdMsecs, bubbleElem: bubbleWrapElem, bubbleStatus};
        this.bubbles.set(bubbleId, bubbleInfo);
        this.bubbleElemIds.push(bubbleId);

        // Let element render, then start delayed fadeout:
        domOnNextRenderComplete(() => this.fadeoutBubble(bubbleId, bubbleStatus, fadeDelayMs, fadeDurationMs));
    }

    protected closeBubble(bubbleId: number): void
    {
        const bubbleInfo = this.bubbles.get(bubbleId);
        if (!is.nil(bubbleInfo)) {
            bubbleInfo.bubbleElem.remove();
            this.bubbles.delete(bubbleId);
            this.bubbleElemIds = this.bubbleElemIds.filter(id => this.bubbles.has(id));
        }
    }

    protected closeBubbleWithStatus(bubbleId: number, status: BubbleStatus): void
    {
        if (this.bubbles.get(bubbleId)?.bubbleStatus === status) {
            this.closeBubble(bubbleId);
        }
    }

    protected fadeoutFastBubble(bubbleId: number): void
    {
        const bubbleInfo = this.bubbles.get(bubbleId);
        if (!is.nil(bubbleInfo)) {
            const durationCfgSecs = as.Float(Config.get('room.chatBubbleFastFadeSec'), 1.0);
            const {delaySecs, durationSecs}
                = this.calculateBubbleFadeout(0, 0, 0.0, durationCfgSecs);
            this.fadeoutBubble(bubbleId, 'fadingFast', delaySecs, durationSecs);
        }
    }

    protected pinBubble(bubbleId: number): void
    {
        const bubbleInfo = this.bubbles.get(bubbleId);
        if (!is.nil(bubbleInfo)) {
            bubbleInfo.bubbleStatus = 'pinned';
            const elem = bubbleInfo.bubbleElem;
            elem.classList.add('n3q-chatout-pinned');
            elem.style.transition = '';
            elem.style.opacity = '1';
        }
    }

    protected fadeoutBubble(bubbleId: number, newStatus: BubbleStatus, delaySecs: number, durationSecs: number): void
    {
        const bubbleInfo = this.bubbles.get(bubbleId);
        if (!is.nil(bubbleInfo)) {
            bubbleInfo.bubbleStatus = newStatus;
            const guard = () => this.bubbles.get(bubbleId)?.bubbleStatus === newStatus;
            const t = {property: 'opacity', delay: `${delaySecs}s`, duration: `${durationSecs}s`, timingFun: 'linear'};
            const onComplete = () => this.closeBubbleWithStatus(bubbleInfo.bubbleId, newStatus);
            startDomElemTransition(bubbleInfo.bubbleElem, guard, t, '0.05', onComplete);
        }
    }

    protected calculateBubbleFadeout(
        nowSecs: number, bubbleAgeSecs: number, startAgeSecs: number, durationSecs: number
    ): {delaySecs: number, durationSecs: number} {
        const startSecs = bubbleAgeSecs + Math.max(0.0, startAgeSecs);
        const delayRemSecs = startSecs - nowSecs;
        if (delayRemSecs < 0.0) {
            const durationRemSecs = durationSecs + delayRemSecs;
            if (durationRemSecs < 0.0) {
                return {delaySecs: 0.0, durationSecs: 0.0};
            }
            return {delaySecs: 0.0, durationSecs: durationRemSecs};
        }
        return {delaySecs: delayRemSecs, durationSecs};
    }

}
