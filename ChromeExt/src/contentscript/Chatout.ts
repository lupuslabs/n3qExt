import { as } from '../lib/as';
import { Config } from '../lib/Config';
import { ContentApp } from './ContentApp';
import { DomUtils } from '../lib/DomUtils';
import { ChatUtils } from '../lib/ChatUtils';
import { Utils } from '../lib/Utils';
import { OrderedSet } from '../lib/OrderedSet';
import { AnimationsDefinition } from './AnimationsXml';
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'

type BubbleStatus = 'pinned'|'fadingSlow'|'fadingFast'|'closed';
type BubbleInfo = ChatUtils.ChatMessage & {
    bubbleElem: HTMLElement,
    bubbleStatus: BubbleStatus,
    transitionStart: Date,
    transitionDurationSecs: number,
    transitionCancelHandler: () => void,
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
        this.bubbles = new OrderedSet<BubbleInfo>([], ChatUtils.chatMessageCmpFun, ChatUtils.chatMessageIdFun);

        this.containerElem = DomUtils.elemOfHtml('<div class="n3q-chatout-container"></div>');
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

    public displayChatMessage(chatMessage: ChatUtils.ChatMessage): void
    {
        if (!ChatUtils.isUserChatMessageType(chatMessage.type)) {
            return;
        }

        this.makeBubble(chatMessage);

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

    protected makeBubble(chatMessage: ChatUtils.ChatMessage): void
    {
        const startAgeSecs = as.Float(Config.get('room.chatBubbleFadeStartSec'), 1.0);
        const durationSecs = as.Float(Config.get('room.chatBubbleFadeDurationSec'), 1.0);
        const startTs = Utils.dateOfUtcString(chatMessage.timestamp).getTime() + 1e3 * startAgeSecs;
        const endTs = startTs + 1e3 * durationSecs;
        if (endTs - 1e3 * as.Float(Config.get('room.chatBubblesMinTimeRemSec'), 1.0) < Date.now()) {
            return;
        }

        const typeClass = 'n3q-chat-type-' + chatMessage.type;
        const bubbleElem = DomUtils.elemOfHtml(`<div class="n3q-chatout ${typeClass}" style="opacity: 1;"></div>`);
        const bubble: BubbleInfo = {
            ...chatMessage,
            bubbleElem,
            bubbleStatus: 'fadingSlow',
            transitionStart: new Date(startTs),
            transitionDurationSecs: durationSecs,
            transitionCancelHandler: () => this.fadeoutBubble(bubble),
        };
        if (this.bubbles.has(bubble)) {
            return; // Duplicate detected - keep old version.
        }

        const bubbleBubbleElem = DomUtils.elemOfHtml('<div class="n3q-speech"></div>');
        bubbleBubbleElem.onpointerdown = (ev) => this.pinBubble(bubble);
        bubbleElem.appendChild(bubbleBubbleElem);

        const textElem = DomUtils.elemOfHtml('<div class="n3q-text"></div>');
        textElem.innerHTML = as.HtmlWithClickableLinks(chatMessage.text);
        PointerEventDispatcher.protectElementsWithDefaultActions(this.app, textElem);
        bubbleBubbleElem.appendChild(textElem);

        const onCloseClick = () => this.closeBubble(bubble);
        bubbleElem.appendChild(this.app.makeWindowCloseButton(onCloseClick, 'overlay'));

        this.bubbles.add(bubble);
        this.containerElem.appendChild(bubbleElem);
        this.fadeoutBubble(bubble);
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
            bubble.bubbleStatus = 'fadingFast';
            bubble.transitionStart = new Date();
            bubble.transitionDurationSecs = durationCfgSecs;
            this.fadeoutBubble(bubble);
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

    protected fadeoutBubble(bubble: BubbleInfo): void
    {
        const bubbleElem = bubble.bubbleElem;
        bubbleElem.removeEventListener('transitioncancel', bubble.transitionCancelHandler);
        if (bubble.bubbleStatus !== 'fadingSlow' && bubble.bubbleStatus !== 'fadingFast') {
            return;
        }

        const currentStatus = bubble.bubbleStatus;
        const delaySecs = (bubble.transitionStart.getTime() - Date.now()) / 1e3;
        const durationSecs = bubble.transitionDurationSecs;
        const fullDurationSecsRem = Math.max(0.0, durationSecs + delaySecs);
        const durationSecsRem = Math.min(durationSecs, fullDurationSecsRem);
        if (fullDurationSecsRem <= 0.0) {
            this.closeBubble(bubble);
            return;
        }

        const finalVal = 0.05;
        const currentVal = finalVal + (1.0 - finalVal) / (durationSecs / durationSecsRem);
        const transition = {
            property: 'opacity',
            delay: `${Math.max(0.0, delaySecs)}s`,
            duration: `${durationSecsRem}s`,
            timingFun: 'linear',
        };
        const guard = () => bubble.bubbleStatus === currentStatus;
        const onComplete = () => this.closeBubbleWithStatus(bubble, currentStatus);
        DomUtils.stopElemTransition(bubbleElem, 'opacity', currentVal.toString());
        DomUtils.startElemTransition(bubbleElem, guard, transition, finalVal.toString(), onComplete);
        bubbleElem.addEventListener('transitioncancel', bubble.transitionCancelHandler);
    }

    protected getMessageTimestampRemoveIfOlder(): string
    {
        const nowSecs = Date.now() / 1000;
        const startAgeCfgSecs = as.Float(Config.get('room.chatBubbleFadeStartSec'), 1.0);
        const durationCfgSecs = as.Float(Config.get('room.chatBubbleFadeDurationSec'), 1.0);
        return Utils.utcStringOfTimestampSecs(nowSecs - startAgeCfgSecs - durationCfgSecs);
    }

}
