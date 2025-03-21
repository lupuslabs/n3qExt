import * as KeyboardSound from '../assets/keyboard.mp3';
import { Sound } from './Sound';

import { is } from '../lib/is';
import { as } from '../lib/as';
import { iter } from '../lib/Iter'
import { Environment } from '../lib/Environment';
import { ContentApp } from './ContentApp';
import { FullWindow, FullWindowOptions } from './FullWindow';
import { ChatUtils } from '../lib/ChatUtils';
import { Utils } from '../lib/Utils';
import { BackgroundMessage } from '../lib/BackgroundMessage';
import { OrderedSet } from '../lib/OrderedSet';
import { DomUtils } from '../lib/DomUtils';
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'

export type ChatWindowOptions = FullWindowOptions & {
    soundEnabled?: boolean,
};

export abstract class ChatWindow extends FullWindow<ChatWindowOptions>
{
    protected chatlogElem: HTMLElement;
    protected chatoutAutoScroll: boolean = true;
    protected chatInputFieldElem: HTMLTextAreaElement;
    protected chatChannel: ChatUtils.ChatChannel;
    protected chatMessages: OrderedSet<ChatUtils.ChatMessage>;
    protected unreadUserChatMessages: OrderedSet<ChatUtils.ChatMessage>;
    protected lastIncommingChatMessageTimeMs: number = 0;
    protected sessionStartTs: string;
    protected historyLoading: boolean = false;
    protected historyLoadRequired: boolean = false;
    protected sndChat: Sound;
    protected soundEnabled = false;
    protected sendingChat: boolean = false;

    public constructor(app: ContentApp, chatChannel: ChatUtils.ChatChannel)
    {
        super(app);
        this.chatChannel = chatChannel;
        this.chatMessages = new OrderedSet<ChatUtils.ChatMessage>([], ChatUtils.chatMessageCmpFun, ChatUtils.areChatMessagesIdentical);
        this.unreadUserChatMessages = new OrderedSet<ChatUtils.ChatMessage>([], ChatUtils.chatMessageCmpFun, ChatUtils.areChatMessagesIdentical);
        this.sessionStartTs = Utils.utcStringOfDate(new Date());

        this.windowSettingsId = `Chat${this.chatChannel.type}`;
        this.persistGeometry = true;
        this.windowCssClasses.push('chatwindow')
        this.titleText = 'Chat';
        this.titleTextId = 'Chatwindow.Chat History';
        this.minWidth = 300;
        this.minHeight = 150;
        this.defaultWidth = 400;
        this.defaultHeight = 300;
        this.defaultBottom = 200;
        this.defaultLeft = 50;

        this.sndChat = new Sound(this.app, KeyboardSound);

        if (Environment.isDevelopment()) {
            this.addLine(null, 'debug', '', 'Nickname', '', 'Lorem');
            this.addLine(null, 'debug', '', 'ThisIsALongerNickname', '', 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.');
            this.addLine(null, 'debug', '', 'Long name with intmediate spaces', '', 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum');
            this.addLine(null, 'debug', '', 'Long text no spaces', '', 'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm');
        }

        this.loadHistory();
    }

    public isSoundEnabled(): boolean { return this.soundEnabled; }

    public getUnreadUserMessageCount(maxAgeSecs: number): number
    {
        let messageCount = 0;
        const maxAgeTimestamp = Utils.utcStringOfDate(new Date(Date.now() - 1000 * maxAgeSecs));
        for (const message of this.unreadUserChatMessages) {
            if (message.timestamp >= maxAgeTimestamp && ChatUtils.isUserChatMessageType(message.type)) {
                messageCount++;
            }
        }
        return messageCount;
    }

    protected async makeContent(): Promise<void>
    {
        await super.makeContent();
        const options = await this.getSavedOptions(this.givenOptions);
        this.soundEnabled = as.Bool(options.soundEnabled, false);

        this.makeHeaderElems();
        this.makeChatLogElems();
        this.makeChatInput();

        this.drawChatMessages();
    }

    protected makeHeaderElems(): void
    {
        const lineElem = DomUtils.elemOfHtml('<div class="chat-header-line" data-translate="children" />');
        this.contentElem.appendChild(lineElem);

        const clearButton = this.app.uiHelper.makeDefaultTextButton('chatlog-clear-button', 'Chatwindow.Clear', 'Clear', () => this.clear());
        lineElem.appendChild(clearButton);

        const checkboxId = DomUtils.makeUniqueElemId();
        const soundOptionWrapper = DomUtils.elemOfHtml('<div class="chat-sound-option" data-translate="children" />');
        const soundLabel = DomUtils.elemOfHtml(`<label class="label" for="${checkboxId}" title="Enable Sound" data-translate="attr:title:Chatwindow text:Chatwindow">Sound</label>`);
        soundOptionWrapper.appendChild(soundLabel);
        const soundCheckbox = <HTMLInputElement>DomUtils.elemOfHtml(`<input id="${checkboxId}" type="checkbox" class="chat-sound-option-checkbox" />`);
        soundCheckbox.checked = this.soundEnabled;
        PointerEventDispatcher.makeOpaqueDefaultActionsDispatcher(this.app, soundCheckbox);
        soundCheckbox.addEventListener('change', ev => this.onChatSoundCheckboxChange(soundCheckbox.checked));
        soundOptionWrapper.appendChild(soundCheckbox);
        lineElem.appendChild(soundOptionWrapper);

        // const retentionInfoElem = domHtmlElemOfHtml(`<div class="retentioninfo" data-translate="attr:title:Chatwindow children"></div>`);
        // {
        //     const seconds = as.Float(Config.get(`chatHistory.${this.chat.type}MaxAgeSec`), Number.MAX_VALUE);
        //     let [text, unitCount, unit] = Utils.formatApproximateDurationForHuman(
        //         seconds, this.app.getLanguage(), {maximumFractionDigits: 0, unitDisplay: 'long'},
        //     );
        //     if (unitCount >= 1000) {
        //         text = this.app.translateText('Chatwindow.RetentionDurationForever', 'forever');
        //     } else {
        //         const tpl = this.app.translateText('Chatwindow.RetentionDuration', 'Stored for {duration}');
        //         text = tpl.replace('{duration}', text);
        //     }
        //     retentionInfoElem.innerText = text;
        // }
        // lineElem.appendChild(retentionInfoElem);
    }

    protected makeChatLogElems(): void
    {
        this.chatoutAutoScroll = true;
        const chatlogElem = DomUtils.elemOfHtml('<div class="chatlog" data-translate="children" />');
        PointerEventDispatcher.makeOpaqueDefaultActionsDispatcher(this.app, chatlogElem);
        chatlogElem.onscroll = (ev) => {
            const maxScrollTop = chatlogElem.scrollHeight - chatlogElem.clientHeight;
            // Chrome's maximum scrollTop can be slightly less than actual scrollable area when logical pixels don't match device pixels:
            const maxScrollTopCorrected = maxScrollTop - 1;
            this.chatoutAutoScroll = chatlogElem.scrollTop >= maxScrollTopCorrected;
        };
        this.chatlogElem = chatlogElem;
        this.contentElem.appendChild(chatlogElem);
    }

    protected makeChatInput(): void
    {
        const lineElem = DomUtils.elemOfHtml('<div class="chat-input-line" data-translate="children" />');
        this.contentElem.appendChild(lineElem);

        this.chatInputFieldElem = <HTMLTextAreaElement> DomUtils.elemOfHtml('<textarea class="chat-input-field" rows="1" placeholder="Enter chat here..." data-translate="attr:placeholder:Chatin"></textarea>');
        PointerEventDispatcher.makeOpaqueDefaultActionsDispatcher(this.app, this.chatInputFieldElem);
        this.chatInputFieldElem.addEventListener('keydown', ev => this.onChatinKeydown(ev));
        lineElem.appendChild(this.chatInputFieldElem);

        const sendButton = this.app.uiHelper.makeDefaultTextButton('send-chat-button', 'Chatin.Send', 'Send', () => this.onSendChatUserAction());
        lineElem.appendChild(sendButton);
    }

    protected onVisible() {
        super.onVisible();
        this.chatInputFieldElem.focus();
    }

    protected onViewportVisible(): void
    {
        super.onViewportVisible();
        this.markAllMessagesAsRead();
    }

    protected onBeforeClose(): void
    {
        super.onBeforeClose();
        this.soundEnabled = false;
        this.chatlogElem = null;
        this.chatInputFieldElem = null;
    }

    public addLine(id: string|null, type: ChatUtils.ChatMessageType, authorUserId: string, authorName: string, authorImageUrl: string, text: string): void
    {
        // Strictly increasing time to ensure correct order of locally generated messages comming in at the same millisecond:
        let timeMs = Date.now();
        if (timeMs <= this.lastIncommingChatMessageTimeMs) {
            timeMs = this.lastIncommingChatMessageTimeMs + 1;
        }
        this.lastIncommingChatMessageTimeMs = timeMs;
        const time = new Date(timeMs);

        let generateId = is.nil(id);
        if (generateId) {
            id = ChatUtils.makeChatMessageId(time, authorName);
        }
        if (ChatUtils.isUserChatMessageType(type)) {
            if (type === 'emote') {
                text = this.app.translateText(text, text);
            }
        } else {
            text = this.app.translateText('Chatwindow.' + text, text);
        }
        const timestamp = Utils.utcStringOfDate(time);
        const isUnread = authorUserId !== this.app.getUserId();
        const message: ChatUtils.ChatMessage = { timestamp, isUnread, id, type, authorUserId, authorName, authorImageUrl, text };
        if (this.chatMessages.has(message)) {
            return;
        }

        // Either display the message immediately or send to background and let onChatMessagePersisted display it:
        if (type === 'debug') {
            this.storeChatMessage(message);
        } else {
            BackgroundMessage.handleNewChatMessage(this.chatChannel, message, generateId)
                .catch(error => this.app.onError(error));
        }
    }

    private loadHistory(): void
    {
        (async () => {
            if (this.historyLoading) {
                // Already loading - so request another load after that:
                this.historyLoadRequired = true;
                return;
            }
            this.historyLoading = true;
            for (this.historyLoadRequired = true; this.historyLoadRequired;) { // Until we really are up to date.
                this.historyLoadRequired = false;

                // Get and process recorded history:
                const history = await BackgroundMessage.getChatHistory(this.chatChannel);
                history.forEach(message => this.storeChatMessage(message));
            }
            this.historyLoading = false;
        })().catch((error) => {
            this.app.onError(error);
            this.historyLoading = false;
        });
    }

    private markAllMessagesAsRead(): void
    {
        iter(this.unreadUserChatMessages).forEach(msg => this.markMessageAsRead(msg));
    }

    private markMessageAsRead(message: ChatUtils.ChatMessage): void
    {
        const messageRead: ChatUtils.ChatMessage = { ...message, isUnread: false };
        BackgroundMessage.handleNewChatMessage(this.chatChannel, messageRead, false)
            .catch(error => this.app.onError(error));
    }

    private drawChatMessages()
    {
        if (this.chatlogElem) {
            this.chatlogElem.innerHTML = '';
            for (let index = 0; index < this.chatMessages.length(); index++) {
                this.drawChatMessage(index, false);
            }
        }
    }

    private drawChatMessage(index: number, replaceExisting: boolean)
    {
        if (!this.chatlogElem) {
            return;
        }
        const message: null|ChatUtils.ChatMessage = this.chatMessages.at(index);
        if (!message) {
            return;
        }
        const isOwnMessage = message.authorUserId === this.app.getUserId();
        const previousMessage: null|ChatUtils.ChatMessage = this.chatMessages.at(index - 1);
        const isFirstMessage = !previousMessage;
        const isContinuation = !isFirstMessage && ChatUtils.areChatMessagesOfSameUser(message, previousMessage);

        const typeClass = `type-${message.type}`;
        const isNew = message.timestamp >= this.sessionStartTs;
        const ageClass = isNew ? 'new' : 'old';
        const sourceClass = isOwnMessage ? 'own' : 'other';
        let continuationClass: string;
        if (isContinuation) {
            continuationClass = 'continued';
        } else if (isFirstMessage) {
            continuationClass = 'first';
        } else {
            continuationClass = 'differentOwner';
        }
        const messageElem = DomUtils.elemOfHtml(`<div class="chat-message"></div>`)
        messageElem.classList.add(sourceClass, continuationClass, typeClass, ageClass);

        const contentElem = DomUtils.elemOfHtml(`<div class="content"></div>`)
        messageElem.appendChild(contentElem);
        let authorName: string = message.authorName;
        if (authorName.length !== 0) {
            const authorHtml = as.Html(authorName)
            contentElem.appendChild(DomUtils.elemOfHtml(`<span class="nick">${authorHtml}</span>`));
        }

        const textElem = DomUtils.elemOfHtml(`<span class="text"></span>`);
        const mentionNameToHighlight = isNew && !isOwnMessage ? this.app.getUserNickname() : null;
        const {textNodes, ownNameMentionFound} = ChatUtils.prepareTextHtml(message.text, mentionNameToHighlight);
        if (ownNameMentionFound) {
            messageElem.classList.add('own-name-mention');
        }
        textNodes.forEach(node => textElem.appendChild(node));
        contentElem.appendChild(textElem);
        const timeHtml = as.Html(Utils.dateOfUtcString(message.timestamp).toLocaleTimeString());
        contentElem.appendChild(DomUtils.elemOfHtml(`<span class="time">${timeHtml}</span>`));

        PointerEventDispatcher.protectElementsWithDefaultActions(this.app, messageElem);

        const oldElem = this.chatlogElem.children.item(index);
        this.chatlogElem.insertBefore(messageElem, oldElem);
        if (replaceExisting) {
            oldElem?.remove();
        }

        if (this.chatoutAutoScroll) {
            this.chatlogElem.scrollTop = this.chatlogElem.scrollHeight;
        }

        if (message.isUnread && this.getViewportVisibility()) {
            this.markMessageAsRead(message);
        }
    }

    private removeChatMessageFromDisplay(index: number): void
    {
        this.chatlogElem?.children.item(index)?.remove();
    }

    public clear()
    {
        this.chatoutAutoScroll = true;
        BackgroundMessage.deleteChatHistory(this.chatChannel, Utils.utcStringOfDate(new Date()))
            .catch(error => this.app.onError(error));
    }

    public onChatMessagePersisted(chatChannel: ChatUtils.ChatChannel, chatMessage: ChatUtils.ChatMessage): void
    {
        if (ChatUtils.areChatsEqual(chatChannel, this.chatChannel)) {
            this.storeChatMessage(chatMessage);
        }
    }

    protected storeChatMessage(chatMessage: ChatUtils.ChatMessage): void
    {
        const {index, replacedExisting} = this.chatMessages.add(chatMessage);
        if (chatMessage.isUnread && ChatUtils.isUserChatMessageType(chatMessage.type) && chatMessage.authorUserId !== this.app.getUserId()) {
            this.unreadUserChatMessages.add(chatMessage);
            this.playSound();
        } else {
            this.unreadUserChatMessages.remove(chatMessage);
        }
        this.drawChatMessage(index, replacedExisting);
        this.giveMessageToChatOut(chatMessage);
    }

    protected giveMessageToChatOut(chatMessage: ChatUtils.ChatMessage): void
    {
        if (this.chatChannel.type === 'roompublic') {
            this.app.getRoom()?.getParticipantByDisplayName(chatMessage.authorName)?.getChatout()?.displayChatMessage(chatMessage);
        }
    }

    public getChatMessagesByNickSince(authorName: string, timestampStart: string): ChatUtils.ChatMessage[]
    {
        return this.chatMessages.toArray().filter(m => m.timestamp >= timestampStart && m.authorName === authorName);
    }

    public onChatHistoryDeleted(deletions: {chatChannel: ChatUtils.ChatChannel, olderThanTime: string}[]): void
    {
        deletions
            .filter(({chatChannel}) => ChatUtils.areChatsEqual(chatChannel, this.chatChannel))
            .forEach(({olderThanTime}) => {
                for (let index = this.chatMessages.length() - 1; index >= 0; index--) {
                    const message = this.chatMessages.at(index);
                    if (message.timestamp < olderThanTime) {
                        this.chatMessages.removeAt(index);
                        this.unreadUserChatMessages.remove(message);
                        this.removeChatMessageFromDisplay(index);
                    }
                }
            });
    }

    private onChatSoundCheckboxChange(soundEneabled: boolean): void
    {
        (async () => {
            this.soundEnabled = soundEneabled;
            const options = await this.getSavedOptions();
            options['soundEnabled'] = this.soundEnabled;
            await this.saveOptions(options);
        })().catch(error => this.app.onError(error));
    }

    private playSound(): void
    {
        if (this.isSoundEnabled()) {
            this.sndChat.play();
        }
    }

    private onChatinKeydown(ev: KeyboardEvent): void
    {
        let isHandled = false;
        switch (ev.key) {
            case 'Enter': {
                if (!ev.shiftKey && !ev.ctrlKey && !ev.altKey && !ev.metaKey) {
                    this.onSendChatUserAction();
                    isHandled = true;
                }
            } break;
            case 'Escape': {
                this.close();
                isHandled = true;
            } break;
        }
        if (isHandled) {
            ev.preventDefault();
        }
    }

    protected onSendChatUserAction(): void
    {
        if (this.sendingChat) {
            return;
        }
        const text: string = this.chatInputFieldElem.value;
        if (text.length === 0) {
            return;
        }
        this.sendingChat = true;
        this.sendChat(text)
            .then(() => {
                this.chatInputFieldElem.value = '';
                this.chatInputFieldElem.focus();
            }).catch(error => {
                this.app.onError(error)
            }).finally(() => {
                this.sendingChat = false;
            });
    }

    protected abstract sendChat(text: string): Promise<void>;

}
