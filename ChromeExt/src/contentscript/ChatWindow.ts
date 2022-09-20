import KeyboardSound from '../assets/keyboard.mp3';
import { Sound } from './Sound';

import * as $ from 'jquery';
import 'webpack-jquery-ui';
import { is } from '../lib/is';
import { as } from '../lib/as';
import { Environment } from '../lib/Environment';
import { ContentApp } from './ContentApp';
import { Room } from './Room';
import { Window, WindowOptions } from './Window';
import { ChatConsole } from './ChatConsole';
import { Entity } from './Entity';
import { areChatsEqual, Chat, ChatMessage, ChatType, makeChatMessageId } from '../lib/ChatMessage';
import { Utils } from '../lib/Utils';
import { BackgroundMessage } from '../lib/BackgroundMessage';
import { Config } from '../lib/Config';

export class ChatWindow extends Window
{
    protected windowName: string;
    protected chatoutElem: HTMLElement;
    protected chatinInputElem: HTMLElement;
    protected chat: Chat;
    protected chatMessages: {[id: string]: ChatMessage} = {}; // Ordered by ChatMessage.timestamp ascending.
    protected sessionStartTs: string;
    protected historyLoading: boolean = false;
    protected historyLoadRequired: boolean = false;
    protected sndChat: Sound;
    protected soundEnabled = false;
    protected room: Room;

    constructor(app: ContentApp, roomOrEntity: Room|Entity)
    {
        super(app);
        if (roomOrEntity instanceof Room) {
            this.room = roomOrEntity;
            this.chat = {
                type:     ChatType.roompublic,
                roomJid:  this.room.getJid(),
                roomNick: '',
            };
        } else {
            this.room = roomOrEntity.getRoom();
            this.chat = {
                type:     ChatType.roomprivate,
                roomJid:  this.room.getJid(),
                roomNick: roomOrEntity.getRoomNick(),
            };
        }
        this.sessionStartTs = Utils.utcStringOfDate(new Date());
        this.windowName = `Chat${this.chat.type}`;

        this.sndChat = new Sound(this.app, KeyboardSound);

        if (Environment.isDevelopment()) {
            this.addLine(null, 'Nickname', 'Lorem', true);
            this.addLine(null, 'ThisIsALongerNickname', 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.', true);
            this.addLine(null, 'Long name with intmediate spaces', 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum', true);
            this.addLine(null, 'Long text no spaces', 'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm', true);
        }

        this.loadHistory();
    }

    isSoundEnabled(): boolean { return this.soundEnabled; }

    async show(options: WindowOptions)
    {
        options = await this.getSavedOptions(this.windowName, options);

        if (options.titleText == null) { options.titleText = this.app.translateText('Chatwindow.Chat History', 'Chat'); }
        options.resizable = true;

        super.show(options);

        const aboveElem: HTMLElement = options.above;
        let bottom = as.Int(options.bottom, 200);
        let width = as.Int(options.width, 400);
        let height = as.Int(options.height, 300);
        const onClose = options.onClose;
        this.soundEnabled = as.Bool(options.soundEnabled, false);

        if (this.windowElem) {
            const windowElem = this.windowElem;
            const contentElem = this.contentElem;
            $(windowElem).addClass('n3q-chatwindow');

            let left = as.Int(options.left, 50);
            if (is.nil(options.left)) {
                if (aboveElem) {
                    left = Math.max(aboveElem.offsetLeft - 180, left);
                }
            }
            [left, bottom, width, height] = this.setPosition(left, bottom, width, height);
            this.saveCoordinates(left, bottom, width, height).catch(error => this.app.onError(error));

            const chatoutElem = <HTMLElement>$('<div class="n3q-base n3q-chatwindow-chatout" data-translate="children" />').get(0);
            const chatinElem = <HTMLElement>$('<div class="n3q-base n3q-chatwindow-chatin" data-translate="children" />').get(0);
            const chatinTextElem = <HTMLElement>$('<textarea class="n3q-base n3q-chatwindow-chatin-input n3q-input n3q-text" rows="1" placeholder="Enter chat here..." data-translate="attr:placeholder:Chatin"></textarea>').get(0);
            const chatinSendElem = <HTMLElement>$('<div class="n3q-base n3q-button-inline" title="SendChat" data-translate="attr:title:Chatin"><div class="n3q-base n3q-button-symbol n3q-button-sendchat" /></div>').get(0);

            const clearElem = <HTMLElement>$('<div class="n3q-base n3q-button n3q-chatwindow-clear" title="Clear" data-translate="attr:title:Chatwindow text:Chatwindow">Clear</div>').get(0);
            const soundCheckboxElem = <HTMLElement>$('<input type="checkbox" class="n3q-base n3q-chatwindow-soundcheckbox" />').get(0);
            const soundcheckElem = <HTMLElement>$('<div class="n3q-base n3q-chatwindow-soundcheck" title="Enable Sound" data-translate="attr:title:Chatwindow children"><span class="n3q-base n3q-chatwindow-soundlabel" data-translate="text:Chatwindow">Sound</span>:</div>').get(0);
            $(soundcheckElem).append(soundCheckboxElem);

            const retentionInfoElem = <HTMLElement>$(`<div class="n3q-base n3q-chatwindow-retentioninfo" data-translate="attr:title:Chatwindow children"></div>`).get(0);
            {
                const seconds = as.Float(Config.get(`chatHistory.${this.chat.type}MaxAgeSec`), Number.MAX_VALUE);
                let [text, unitCount, unit] = Utils.formatApproximateDurationForHuman(
                    seconds, this.app.getLanguage(), {maximumFractionDigits: 0, unitDisplay: 'long'},
                );
                if (unitCount >= 1000) {
                    text = this.app.translateText('Chatwindow.RetentionDurationForever', 'forever');
                } else {
                    const tpl = this.app.translateText('Chatwindow.RetentionDuration', 'Stored for {duration}'); 
                    text = tpl.replace('{duration}', text);
                }
                retentionInfoElem.innerText = text;
            }

            $(chatinElem).append(chatinTextElem);
            $(chatinElem).append(chatinSendElem);

            $(contentElem).append(chatoutElem);
            $(contentElem).append(chatinElem);
            $(contentElem).append(retentionInfoElem);
            $(contentElem).append(clearElem);
            $(contentElem).append(soundcheckElem);

            this.app.translateElem(windowElem);

            this.chatinInputElem = chatinTextElem;
            this.chatoutElem = chatoutElem;

            this.onResizeStop = (ev: JQueryEventObject, ui: JQueryUI.ResizableUIParams) =>
            {
                const left = ui.position.left;
                const bottom = this.app.getDisplay().offsetHeight - (ui.position.top + ui.size.height);
                this.saveCoordinates(left, bottom, ui.size.width, ui.size.height);
            };

            this.onDragStop = (ev: JQueryEventObject, ui: JQueryUI.DraggableEventUIParams) =>
            {
                const size = { width: $(this.windowElem).width(), height: $(this.windowElem).height() };
                const left = ui.position.left;
                const bottom = this.app.getDisplay().offsetHeight - (ui.position.top + size.height);
                this.saveCoordinates(left, bottom, size.width, size.height);
            };

            $(chatinTextElem).on('keydown', ev =>
            {
                return this.onChatinKeydown(ev);
            });

            $(chatinSendElem).click(ev =>
            {
                this.sendChat();
                ev.stopPropagation();
            });

            $(clearElem).on('click', ev =>
            {
                this.clear();
                // this.playSound();
            });

            $(soundCheckboxElem).prop('checked', this.soundEnabled);
            $(soundCheckboxElem).on('change', async ev =>
            {
                this.soundEnabled = $(soundCheckboxElem).is(':checked');
                const options = await this.getSavedOptions(this.windowName, {});
                options['soundEnabled'] = this.soundEnabled;
                await this.saveOptions(this.windowName, options);
            });

            this.onClose = () =>
            {
                this.chatoutElem = null;
                this.chatinInputElem = null;
                if (onClose) { onClose(); }
            };

            this.drawChatMessages();

            $(chatinTextElem).focus();
        }
    }

    async saveCoordinates(left: number, bottom: number, width: number, height: number)
    {
        const options = await this.getSavedOptions(this.windowName, {});
        options['left'] = left;
        options['bottom'] = bottom;
        options['width'] = width;
        options['height'] = height;
        await this.saveOptions(this.windowName, options);
    }

    isOpen(): boolean
    {
        return this.windowElem != null;
    }

    addLine(id: string|null, nick: string, text: string, dontPersist: boolean = false): void
    {
        const time = new Date();
        if (is.nil(id)) {
            id = makeChatMessageId(time, nick);
        }
        if (!is.nil(this.chatMessages[id])) {
            return;
        }
        const translated = this.app.translateText('Chatwindow.' + text, text);

        const message: ChatMessage = {
            timestamp: Utils.utcStringOfDate(time),
            id:        id,
            nick:      nick,
            text:      translated,
        };

        this.chatMessages[id] = message;
        this.showLine(message);

        if (!dontPersist) {
            BackgroundMessage.handleNewChatMessage(this.chat, message).catch(error => this.app.onError(error));
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

                // Get recorded history:
                const history = await BackgroundMessage.getChatHistory(this.chat);
                const chatMessages = {};
                history.forEach(message => {chatMessages[message.id] = message;});

                // Add messages that arrived while the request was underway:
                for (const messageId in this.chatMessages) {
                    if (is.nil(chatMessages[messageId])) {
                        chatMessages[messageId] = this.chatMessages[messageId];
                    }
                }

                this.chatMessages = chatMessages;
                this.drawChatMessages();
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
            $(this.chatoutElem).empty();
            for (const messageId in this.chatMessages) {
                this.showLine(this.chatMessages[messageId]);
            }
        }
    }

    private showLine(message: ChatMessage)
    {
        if (this.chatoutElem) {
            const ageClass = message.timestamp >= this.sessionStartTs ? 'n3q-chat-new' : 'n3q-chat-old';
            const timeStr = Utils.dateOfUtcString(message.timestamp).toLocaleTimeString();
            const lineElem = <HTMLElement>$(
                `<div class="n3q-base n3q-chatwindow-line ${ageClass}">`
                + (as.String(message.nick) !== '' ? ''
                    + '<span class="n3q-base n3q-text n3q-time">' + as.Html(timeStr) + '</span>'
                    + '<span class="n3q-base n3q-text n3q-nick">' + as.Html(message.nick) + '</span>'
                    + '<span class="n3q-base n3q-text n3q-colon">' + this.app.translateText('Chatwindow.:') + '</span>'
                    : '')
                + '<span class="n3q-base n3q-text n3q-chat">' + as.HtmlWithClickableLinks(message.text) + '</span>'
                + '</div>'
            ).get(0);

            $(this.chatoutElem).append(lineElem).scrollTop($(this.chatoutElem).get(0).scrollHeight);
        }
    }

    public clear()
    {
        BackgroundMessage.deleteChatHistory(this.chat, Utils.utcStringOfDate(new Date()))
        .catch(error => this.app.onError(error));
    }

    public onChatMessagePersisted(chat: Chat, chatMessage: ChatMessage): void
    {
        if (areChatsEqual(chat, this.chat)) {
            if (is.nil(this.chatMessages[chatMessage.id])) {
                this.chatMessages[chatMessage.id] = chatMessage;
                this.drawChatMessages();
            }
        }
    }

    public onChatHistoryDeleted(deletions: {chat: Chat, olderThanTime: string}[]): void
    {
        deletions
        .filter(({chat}) => areChatsEqual(chat, this.chat))
        .forEach(({olderThanTime}) => {
            for (const id in this.chatMessages) {
                if (this.chatMessages[id].timestamp < olderThanTime) {
                    delete this.chatMessages[id];
                }
            }
            this.drawChatMessages();
        });
    }

    public playSound(): void
    {
        this.sndChat.play();
    }

    private onChatinKeydown(ev: JQuery.KeyDownEvent): boolean
    {
        switch (ev.key) {
            case 'Enter':
                if (!ev.shiftKey && !ev.ctrlKey && !ev.altKey && !ev.metaKey) {
                    this.sendChat();
                    return false;
                }
                return true;
            case 'Escape':
                this.close();
                ev.stopPropagation();
                return false;
            default:
                return true;
        }
    }

    protected sendChat(): void
    {
        const text: string = as.String($(this.chatinInputElem).val());
        if (text !== '') {

            let handledByChatCommand = false;
            try {
                handledByChatCommand = ChatConsole.isChatCommand(text, {
                    app: this.app,
                    room: this.room,
                    out: (data) =>
                    {
                        if (is.string(data)) {
                            this.addLine(null, '', data);
                        } else if (Array.isArray(data)) {
                            if (Array.isArray(data[0])) {
                                data.forEach(line =>
                                {
                                    this.addLine(null, line[0], line[1]);
                                });
                            } else {
                                this.addLine(null, data[0], data[1]);
                            }
                        }
                    }
                });
            } catch (error) {
                //
            }

            if (handledByChatCommand) {
                $(this.chatinInputElem).val('');
                return;
            }

            this.room?.sendGroupChat(text);

            $(this.chatinInputElem)
                .val('')
                .focus()
                ;
        }
    }
}
