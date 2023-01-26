import KeyboardSound from '../assets/keyboard.mp3';
import { Sound } from './Sound';

import { is } from '../lib/is';
import { as } from '../lib/as';
import { Environment } from '../lib/Environment';
import { ContentApp } from './ContentApp';
import { Room } from './Room';
import { Window, WindowOptions } from './Window';
import { Entity } from './Entity';
import {
    Chat, areChatsEqual,
    ChatMessage, makeChatMessageId, chatMessageCmpFun, chatMessageIdFun, ChatMessageType, isUserChatMessageType,
} from '../lib/ChatMessage';
import { Utils } from '../lib/Utils';
import { BackgroundMessage } from '../lib/BackgroundMessage';
import { Config } from '../lib/Config';
import { OrderedSet } from '../lib/OrderedSet';
import { domHtmlElemOfHtml } from '../lib/domTools';

export type ChatWindowOptions = WindowOptions & {
    soundEnabled?: boolean,
};

export class ChatWindow extends Window<ChatWindowOptions>
{
    protected chatoutElem: HTMLElement;
    protected chatoutAutoScroll: boolean = true;
    protected chatinInputElem: HTMLTextAreaElement;
    protected chat: Chat;
    protected chatMessages: OrderedSet<ChatMessage>;
    protected sessionStartTs: string;
    protected historyLoading: boolean = false;
    protected historyLoadRequired: boolean = false;
    protected sndChat: Sound;
    protected soundEnabled = false;
    protected room: Room;

    public constructor(app: ContentApp, roomOrEntity: Room|Entity)
    {
        super(app);
        if (roomOrEntity instanceof Room) {
            this.room = roomOrEntity;
            this.chat = {
                type:     'roompublic',
                roomJid:  this.room.getJid(),
                roomNick: '',
            };
        } else {
            this.room = roomOrEntity.getRoom();
            this.chat = {
                type:     'roomprivate',
                roomJid:  this.room.getJid(),
                roomNick: roomOrEntity.getRoomNick(),
            };
        }
        this.chatMessages = new OrderedSet<ChatMessage>([], chatMessageCmpFun, chatMessageIdFun);
        this.sessionStartTs = Utils.utcStringOfDate(new Date());
        this.windowName = `Chat${this.chat.type}`;
        this.isResizable = true;
        this.persistGeometry = true;

        this.sndChat = new Sound(this.app, KeyboardSound);

        if (Environment.isDevelopment()) {
            this.addLine(null, 'debug', 'Nickname', 'Lorem');
            this.addLine(null, 'debug', 'ThisIsALongerNickname', 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.');
            this.addLine(null, 'debug', 'Long name with intmediate spaces', 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum');
            this.addLine(null, 'debug', 'Long text no spaces', 'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm');
        }

        this.loadHistory();
    }

    public isSoundEnabled(): boolean { return this.soundEnabled; }

    public getRecentMessageCount(maxAgeSecs: number, types: readonly ChatMessageType[]): number
    {
        let messageCount = 0;
        const maxAgeTimestamp = Utils.utcStringOfDate(new Date(Date.now() - 1000 * maxAgeSecs));
        for (const message of this.chatMessages) {
            if (message.timestamp >= maxAgeTimestamp && types.includes(message.type)) {
                messageCount++;
            }
        }
        return messageCount;
    }

    protected prepareMakeDom(): void
    {
        super.prepareMakeDom();
        this.titleText = this.app.translateText('Chatwindow.Chat History', 'Chat');
        this.minWidth = 300;
        this.minHeight = 150;
        this.defaultWidth = 400;
        this.defaultHeight = 300;
        this.defaultBottom = 200;
        this.defaultLeft = 50;
    }

    protected async makeContent(): Promise<void>
    {
        await super.makeContent();
        const options = await this.getSavedOptions(this.givenOptions);
        this.soundEnabled = as.Bool(options.soundEnabled, false);

        this.windowElem.classList.add('n3q-chatwindow');
        const contentElem = this.contentElem;

        const chatoutElem = domHtmlElemOfHtml('<div class="n3q-base n3q-chatwindow-chatout" data-translate="children" />');
        const chatinElem = domHtmlElemOfHtml('<div class="n3q-base n3q-chatwindow-chatin" data-translate="children" />');
        const chatinTextElem = <HTMLTextAreaElement> domHtmlElemOfHtml('<textarea class="n3q-base n3q-chatwindow-chatin-input n3q-input n3q-text" rows="1" placeholder="Enter chat here..." data-translate="attr:placeholder:Chatin"></textarea>');
        const chatinSendElem = domHtmlElemOfHtml('<div class="n3q-base n3q-button-inline" title="SendChat" data-translate="attr:title:Chatin"><div class="n3q-base n3q-button-symbol n3q-button-sendchat" /></div>');

        const clearElem = domHtmlElemOfHtml('<div class="n3q-base n3q-button n3q-chatwindow-clear" title="Clear" data-translate="attr:title:Chatwindow text:Chatwindow">Clear</div>');
        const soundCheckboxElem = <HTMLInputElement>domHtmlElemOfHtml('<input type="checkbox" class="n3q-base n3q-chatwindow-soundcheckbox" />');
        const soundcheckElem = domHtmlElemOfHtml('<div class="n3q-base n3q-chatwindow-soundcheck" title="Enable Sound" data-translate="attr:title:Chatwindow children"><span class="n3q-base n3q-chatwindow-soundlabel" data-translate="text:Chatwindow">Sound</span>:</div>');
        soundcheckElem.appendChild(soundCheckboxElem);

        // const retentionInfoElem = domHtmlElemOfHtml(`<div class="n3q-base n3q-chatwindow-retentioninfo" data-translate="attr:title:Chatwindow children"></div>`);
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

        chatinElem.appendChild(chatinTextElem);
        chatinElem.appendChild(chatinSendElem);

        contentElem.appendChild(chatoutElem);
        contentElem.appendChild(chatinElem);
        // contentElem.appendChild(retentionInfoElem);
        contentElem.appendChild(clearElem);
        contentElem.appendChild(soundcheckElem);

        this.chatinInputElem = chatinTextElem;
        this.chatoutElem = chatoutElem;

        this.chatoutAutoScroll = true;
        chatoutElem.onscroll = (ev) => {
            this.chatoutAutoScroll = chatoutElem.scrollTop >= chatoutElem.scrollHeight - chatoutElem.clientHeight;
        };

        chatinTextElem.addEventListener('keydown',ev => this.onChatinKeydown(ev));

        chatinSendElem.addEventListener('click', ev =>
        {
            this.sendChat();
            ev.stopPropagation();
        });

        clearElem.addEventListener('click', ev =>
        {
            this.clear();
            // this.playSound();
        });

        soundCheckboxElem.checked = this.soundEnabled;
        soundCheckboxElem.addEventListener('change', ev => { (async () => {
            this.soundEnabled = soundCheckboxElem.checked;
            const options = await this.getSavedOptions();
            options['soundEnabled'] = this.soundEnabled;
            await this.saveOptions(options);
        })().catch(error => this.app.onError(error)); });

        this.drawChatMessages();

        chatinTextElem.focus();
    }

    protected onBeforeClose(): void
    {
        super.onBeforeClose();
        this.chatoutElem = null;
        this.chatinInputElem = null;
    }

    public addLine(id: string|null, type: ChatMessageType, nick: string, text: string): void
    {
        const time = new Date();
        let generateId = is.nil(id);
        if (generateId) {
            id = makeChatMessageId(time, nick);
        }
        if (isUserChatMessageType(type)) {
            if (type === 'emote') {
                text = this.app.translateText(text, text);
            }
        } else {
            text = this.app.translateText('Chatwindow.' + text, text);
        }
        const timestamp = Utils.utcStringOfDate(time);
        const message: ChatMessage = { timestamp, id, type, nick, text };
        if (this.chatMessages.has(message)) {
            return;
        }

        this.storeChatMessage(message);
        if (type !== 'debug') {
            BackgroundMessage.handleNewChatMessage(this.chat, message, generateId)
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
                const history = await BackgroundMessage.getChatHistory(this.chat);
                history.forEach(message => this.storeChatMessage(message));
            }
            this.historyLoading = false;
        })().catch((error) => {
            this.app.onError(error);
            this.historyLoading = false;
        });
    }

    private drawChatMessages()
    {
        if (this.chatoutElem) {
            this.chatoutElem.innerHTML = '';
            for (let index = 0; index < this.chatMessages.length(); index++) {
                this.drawChatMessage(this.chatMessages.at(index), index, false);
            }
        }
    }

    private drawChatMessage(message: ChatMessage, index: number, replaceExisting: boolean)
    {
        if (this.chatoutElem) {
            const typeClass = `n3q-chat-type-${message.type}`;
            const ageClass = message.timestamp >= this.sessionStartTs ? 'n3q-chat-new' : 'n3q-chat-old';
            const timeStr = Utils.dateOfUtcString(message.timestamp).toLocaleTimeString();
            const lineElem = domHtmlElemOfHtml(`<div class="n3q-base n3q-chatwindow-line ${ageClass}"></div>`);
            lineElem.classList.add('n3q-base', 'n3q-chatwindow-line', typeClass, ageClass);
            const innerHtmls = [];
            if (message.nick.length !== 0) {
                innerHtmls.push(`<span class="n3q-base n3q-text n3q-time">${as.Html(timeStr)}</span>`);
                innerHtmls.push(`<span class="n3q-base n3q-text n3q-nick">${as.Html(message.nick)}</span>`);
                const colonText = this.app.translateText('Chatwindow.:');
                innerHtmls.push(`<span class="n3q-base n3q-text n3q-colon">${as.Html(colonText)}</span>`);
            }
            const textHtml = as.HtmlWithClickableLinks(message.text);
            innerHtmls.push(`<span class="n3q-base n3q-text n3q-chat">${textHtml}</span>`);
            lineElem.innerHTML = innerHtmls.join('');

            const oldElem = this.chatoutElem.children.item(index);
            this.chatoutElem.insertBefore(lineElem, oldElem);
            if (replaceExisting) {
                this.chatoutElem.children.item(index)?.remove();
            }
            if (this.chatoutAutoScroll) {
                this.chatoutElem.scrollTop = this.chatoutElem.scrollHeight;
            }
        }
    }

    private removeChatMessageFromDisplay(index: number): void
    {
        this.chatoutElem?.children.item(index)?.remove();
    }

    public clear()
    {
        this.chatoutAutoScroll = true;
        BackgroundMessage.deleteChatHistory(this.chat, Utils.utcStringOfDate(new Date()))
        .catch(error => this.app.onError(error));
    }

    public onChatMessagePersisted(chat: Chat, chatMessage: ChatMessage): void
    {
        if (areChatsEqual(chat, this.chat)) {
            if (!this.chatMessages.has(chatMessage)) {
                this.storeChatMessage(chatMessage);
            }
        }
    }

    protected storeChatMessage(chatMessage: ChatMessage): void
    {
        const {index, replacedExisting} = this.chatMessages.add(chatMessage);
        this.drawChatMessage(chatMessage, index, replacedExisting);
        this.giveMessageToChatOut(chatMessage);
    }

    protected giveMessageToChatOut(chatMessage: ChatMessage): void
    {
        this.room.getParticipantByDisplayName(chatMessage.nick)?.getChatout()?.displayChatMessage(chatMessage);
    }

    public getChatMessagesByNickSince(nick: string, timestampStart: string): ChatMessage[]
    {
        return this.chatMessages.toArray().filter(m => m.timestamp >= timestampStart && m.nick === nick);
    }

    public onChatHistoryDeleted(deletions: {chat: Chat, olderThanTime: string}[]): void
    {
        deletions
        .filter(({chat}) => areChatsEqual(chat, this.chat))
        .forEach(({olderThanTime}) => {
            for (let index = this.chatMessages.length() - 1; index >= 0; index--) {
                const message = this.chatMessages.at(index);
                if (message.timestamp < olderThanTime) {
                    this.chatMessages.removeAt(index);
                    this.removeChatMessageFromDisplay(index);
                }
            }
        });
    }

    public playSound(): void
    {
        this.sndChat.play();
    }

    private onChatinKeydown(ev: KeyboardEvent): void
    {
        let isHandled = false;
        switch (ev.key) {
            case 'Enter': {
                if (!ev.shiftKey && !ev.ctrlKey && !ev.altKey && !ev.metaKey) {
                    this.sendChat();
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
            ev.stopPropagation();
        }
    }

    protected sendChat(): void
    {
        const text = this.chatinInputElem.value;
        this.chatinInputElem.value = '';
        this.chatinInputElem.focus();
        this.room.sendGroupChat(text);
    }
}
