import { as } from '../lib/as';
import { Config } from '../lib/Config';
import { ContentApp } from './ContentApp';
import { domHtmlElemOfHtml, domOnNextRenderComplete, startDomElemTransition } from '../lib/domTools';
import { ChatMessage, chatMessageCmpFun, chatMessageIdFun, isUserChatMessageType } from '../lib/ChatMessage';
import { Utils } from '../lib/Utils';
import { OrderedSet } from '../lib/OrderedSet';
import { AnimationsDefinition } from './AnimationsXml';
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'

type BubbleStatus = 'pinned'|'fadingSlow'|'fadingFast'|'closed';
type BubbleInfo = ChatMessage & {
    bubbleElem: HTMLElement,
    bubbleStatus: BubbleStatus,
};

export class Chatout
{
    private app: ContentApp;
    private containerElem: HTMLElement;
    private isVisible: boolean = true;
    private bubbles: OrderedSet<BubbleInfo>;

    constructor(app: ContentApp, display: HTMLElement)
    {
        this.app = app;
        this.bubbles = new OrderedSet<BubbleInfo>([], chatMessageCmpFun, chatMessageIdFun);

        this.containerElem = domHtmlElemOfHtml('<div class="n3q-chatout-container"></div>');
        this.positionContainerElem(Config.get('room.chatBubblesDefaultBottom', 100));
        display.appendChild(this.containerElem);
    }

    public stop()
    {
        this.containerElem?.remove();
    }

    public onAvatarAnimationsParsed(avatarAnimations: AnimationsDefinition): void
    {
        this.positionContainerElem(avatarAnimations.params.chatBubblesBottom);
    }

    public onNickKnown(nick: string): void
    {
        // Display old chat messages that wheren't attributable before the nick became known:
        const removeIfOlder = this.getMessageTimestampRemoveIfOlder();
        const messages = this.app.getRoom()?.getChatWindow().getChatMessagesByNickSince(nick, removeIfOlder) ?? [];
        for (const message of messages) {
            this.displayChatMessage(message);
        }
    }

    public displayChatMessage(chatMessage: ChatMessage): void
    {
        if (!isUserChatMessageType(chatMessage.type)) {
            return;
        }

        const nowSecs = Date.now() / 1000;
        const msgCreatedSecs = Utils.dateOfUtcString(chatMessage.timestamp).getTime() / 1000;
        const startAgeCfgSecs = as.Float(Config.get('room.chatBubbleFadeStartSec'), 1.0);
        const durationCfgSecs = as.Float(Config.get('room.chatBubbleFadeDurationSec'), 1.0);
        const {delaySecs, durationSecs}
            = this.calculateBubbleFadeout(nowSecs, msgCreatedSecs, startAgeCfgSecs, durationCfgSecs);
        if (delaySecs + durationSecs > as.Float(Config.get('room.chatBubblesMinTimeRemSec'), 1.0)) {
            this.makeBubble(chatMessage, delaySecs, durationSecs);
        }

        // Remove outdated closed bubbles and trigger fast fade out of slow fading bubbles to get under the limit:
        let bubblesCountingTowardsLimit = [];
        const removeIfOlder = this.getMessageTimestampRemoveIfOlder();
        for (const bubble of this.bubbles) {
            switch (bubble.bubbleStatus) {
                case 'closed': {
                    if (bubble.timestamp < removeIfOlder) {
                        this.bubbles.remove(bubble);
                    }
                } break;
                case 'fadingSlow': {
                    bubblesCountingTowardsLimit.push(bubble);
                } break;
            }
        }
        const bubblesMax = Math.max(1, as.Int(Config.get('room.chatBubblesPerChatoutMax')));
        let bubblesToFadeout = Math.max(0, bubblesCountingTowardsLimit.length - bubblesMax);
        for (let index = 0; index < bubblesToFadeout; index++) {
            this.fadeoutFastBubble(bubblesCountingTowardsLimit[index]);
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
        if (!this.isVisible || this.bubbles.toArray().some(b => b.bubbleStatus !== 'closed')) {
            this.setVisibility(!this.isVisible);
        }
    }

    protected positionContainerElem(chatBubblesBottom: number): void
    {
        this.containerElem.style.bottom = `${chatBubblesBottom}px`;
    }

    protected makeBubble(chatMessage: ChatMessage, fadeDelayMs: number, fadeDurationMs: number): void
    {
        const typeClass = 'n3q-chat-type-' + chatMessage.type;
        const bubbleElem = domHtmlElemOfHtml(`<div class="n3q-chatout ${typeClass}" style="opacity: 1;"></div>`);
        const bubbleStatus: BubbleStatus = 'fadingSlow';
        const bubble: BubbleInfo = {...chatMessage, bubbleElem, bubbleStatus};
        if (this.bubbles.has(bubble)) {
            return; // Duplicate detected - keep old version.
        }

        const bubbleBubbleElem = domHtmlElemOfHtml('<div class="n3q-speech"></div>');
        bubbleBubbleElem.onpointerdown = (ev) => this.pinBubble(bubble);
        bubbleElem.appendChild(bubbleBubbleElem);

        const textElem = domHtmlElemOfHtml('<div class="n3q-text"></div>');
        textElem.innerHTML = as.HtmlWithClickableLinks(chatMessage.text);
        PointerEventDispatcher.protectElementsWithDefaultActions(this.app, textElem);
        bubbleBubbleElem.appendChild(textElem);

        const onCloseClick = () => this.closeBubble(bubble);
        bubbleElem.appendChild(this.app.makeWindowCloseButton(onCloseClick, 'overlay'));

        this.bubbles.add(bubble);
        this.containerElem.appendChild(bubbleElem);

        // Let element render, then start delayed fadeout:
        this.fadeoutBubble(bubble, bubbleStatus, fadeDelayMs, fadeDurationMs);

    }

    protected closeBubble(bubble: BubbleInfo): void
    {
        if (bubble.bubbleStatus !== 'closed') {
            bubble.bubbleStatus = 'closed';
            bubble.bubbleElem.remove();
        }
    }

    protected closeBubbleWithStatus(bubble: BubbleInfo, status: BubbleStatus): void
    {
        if (bubble.bubbleStatus === status) {
            this.closeBubble(bubble);
        }
    }

    protected fadeoutFastBubble(bubble: BubbleInfo): void
    {
        if (bubble.bubbleStatus !== 'closed') {
            const durationCfgSecs = as.Float(Config.get('room.chatBubbleFastFadeSec'), 1.0);
            const {delaySecs, durationSecs}
                = this.calculateBubbleFadeout(0, 0, 0.0, durationCfgSecs);
            this.fadeoutBubble(bubble, 'fadingFast', delaySecs, durationSecs);
        }
    }

    protected pinBubble(bubble: BubbleInfo): void
    {
        if (bubble.bubbleStatus !== 'closed') {
            bubble.bubbleStatus = 'pinned';
            const elem = bubble.bubbleElem;
            elem.classList.add('n3q-chatout-pinned');
            elem.style.transition = '';
            elem.style.opacity = '1';
        }
    }

    protected fadeoutBubble(bubble: BubbleInfo, newStatus: BubbleStatus, delaySecs: number, durationSecs: number): void
    {
        if (bubble.bubbleStatus !== 'closed') {
            bubble.bubbleStatus = newStatus;
            const guard = () => bubble.bubbleStatus === newStatus;
            domOnNextRenderComplete(() => {
                if (guard()) {
                    const transition = {
                        property: 'opacity',
                        delay: `${delaySecs}s`,
                        duration: `${durationSecs}s`,
                        timingFun: 'linear',
                    };
                    const onComplete = () => this.closeBubbleWithStatus(bubble, newStatus);
                    startDomElemTransition(bubble.bubbleElem, guard, transition, '0.05', onComplete);
                }
            });
        }
    }

    protected calculateBubbleFadeout(
        nowSecs: number, bubbleCreatedSecs: number, startAgeSecs: number, durationSecs: number
    ): {delaySecs: number, durationSecs: number} {
        const startSecs = bubbleCreatedSecs + Math.max(0.0, startAgeSecs);
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

    protected getMessageTimestampRemoveIfOlder(): string
    {
        const nowSecs = Date.now() / 1000;
        const startAgeCfgSecs = as.Float(Config.get('room.chatBubbleFadeStartSec'), 1.0);
        const durationCfgSecs = as.Float(Config.get('room.chatBubbleFadeDurationSec'), 1.0);
        return Utils.utcStringOfTimestampSecs(nowSecs - startAgeCfgSecs - durationCfgSecs);
    }

}
