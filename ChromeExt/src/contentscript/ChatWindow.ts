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

class ChatLine
{
    constructor(public nick: string, public text: string)
    {
    }
}

export class ChatWindow extends Window
{
    protected chatoutElem: HTMLElement;
    protected chatinInputElem: HTMLElement;
    protected lines: Record<string, ChatLine> = {};
    protected sndChat: Sound;
    protected soundEnabled = false;

    constructor(app: ContentApp, protected room: Room)
    {
        super(app);

        this.sndChat = new Sound(this.app, KeyboardSound);

        if (Environment.isDevelopment()) {
            this.addLine('1', 'Nickname', 'Lorem');
            this.addLine('2', 'ThisIsALongerNickname', 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.');
            this.addLine('3', 'Long name with intmediate spaces', 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum');
            this.addLine('4', 'Long text no spaces', 'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm');
        }
    }

    isSoundEnabled(): boolean { return this.soundEnabled; }

    async show(options: WindowOptions)
    {
        options = await this.getSavedOptions('Chat', options);

        if (options.titleText == null) { options.titleText = this.app.translateText('Chatwindow.Chat History', 'Chat'); }
        options.resizable = true;

        super.show(options);

        const aboveElem: HTMLElement = options.above;
        const bottom = as.Int(options.bottom, 200);
        const width = as.Int(options.width, 400);
        let height = as.Int(options.height, 300);
        const onClose = options.onClose;
        this.soundEnabled = as.Bool(options.soundEnabled, false);

        if (this.windowElem) {
            const windowElem = this.windowElem;
            const contentElem = this.contentElem;
            $(windowElem).addClass('n3q-chatwindow');

            let left = as.Int(options.left, 50);
            if (options.left == null) {
                if (aboveElem) {
                    left = Math.max(aboveElem.offsetLeft - 180, left);
                }
            }
            let top = this.app.getDisplay().offsetHeight - height - bottom;
            {
                const minTop = 10;
                if (top < minTop) {
                    height -= minTop - top;
                    top = minTop;
                }
            }

            const chatoutElem = <HTMLElement>$('<div class="n3q-base n3q-chatwindow-chatout" data-translate="children" />').get(0);
            const chatinElem = <HTMLElement>$('<div class="n3q-base n3q-chatwindow-chatin" data-translate="children" />').get(0);
            const chatinTextElem = <HTMLElement>$('<input type="text" class="n3q-base n3q-chatwindow-chatin-input n3q-input n3q-text" rows="1" placeholder="Enter chat here..." data-translate="attr:placeholder:Chatin" />').get(0);
            const chatinSendElem = <HTMLElement>$('<div class="n3q-base n3q-button-inline" title="SendChat" data-translate="attr:title:Chatin"><div class="n3q-base n3q-button-symbol n3q-button-sendchat" /></div>').get(0);

            const clearElem = <HTMLElement>$('<div class="n3q-base n3q-button n3q-chatwindow-clear" title="Clear" data-translate="attr:title:Chatwindow text:Chatwindow">Clear</div>').get(0);
            const soundCheckboxElem = <HTMLElement>$('<input type="checkbox" class="n3q-base n3q-chatwindow-soundcheckbox" />').get(0);
            const soundcheckElem = <HTMLElement>$('<div class="n3q-base n3q-chatwindow-soundcheck" title="Enable Sound" data-translate="attr:title:Chatwindow children"><span class="n3q-base n3q-chatwindow-soundlabel" data-translate="text:Chatwindow">Sound</span>:</div>').get(0);

            $(soundcheckElem).append(soundCheckboxElem);

            $(chatinElem).append(chatinTextElem);
            $(chatinElem).append(chatinSendElem);

            $(contentElem).append(chatoutElem);
            $(contentElem).append(chatinElem);
            $(contentElem).append(clearElem);
            $(contentElem).append(soundcheckElem);

            this.app.translateElem(windowElem);

            this.chatinInputElem = chatinTextElem;
            this.chatoutElem = chatoutElem;

            $(windowElem).css({ 'width': width + 'px', 'height': height + 'px', 'left': left + 'px', 'top': top + 'px' });

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

            this.fixChatInTextWidth(chatinTextElem, chatinElem);

            this.onResize = (ev: JQueryEventObject) =>
            {
                this.fixChatInTextWidth(chatinTextElem, chatinElem);
                // $(chatinText).focus();
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
                const options = await this.getSavedOptions('Chat', {});
                options['soundEnabled'] = this.soundEnabled;
                await this.saveOptions('Chat', options);
            });

            this.onClose = () =>
            {
                this.chatoutElem = null;
                this.chatinInputElem = null;
                if (onClose) { onClose(); }
            };

            for (const id in this.lines) {
                const line = this.lines[id];
                this.showLine(line.nick, line.text);
            }

            $(chatinTextElem).focus();
        }
    }

    async saveCoordinates(left: number, bottom: number, width: number, height: number)
    {
        const options = this.getSavedOptions('Chat', {});
        options['left'] = left;
        options['bottom'] = bottom;
        options['width'] = width;
        options['height'] = height;
        await this.saveOptions('Chat', options);
    }

    isOpen(): boolean
    {
        return this.windowElem != null;
    }

    fixChatInTextWidth(chatinText: HTMLElement, chatin: HTMLElement)
    {
        const delta = 14;
        const parentWidth = chatin.offsetWidth;
        const width = parentWidth - delta;
        $(chatinText).css({ 'width': width });
    }

    addLine(id: string, nick: string, text: string)
    {
        const translated = this.app.translateText('Chatwindow.' + text, text);

        // // Beware: without markdown in showLine: as.Html(text)
        // let markdowned = markdown.markdown.toHTML(translated);
        // let line = new ChatLine(nick, markdowned);

        const line = new ChatLine(nick, translated);
        if (is.nil(this.lines[id])) {
            this.lines[id] = line;
            this.showLine(line.nick, line.text);
        }
    }

    private showLine(nick: string, text: string)
    {
        const time = new Date().toLocaleTimeString();
        const lineElem = <HTMLElement>$(
            '<div class="n3q-base n3q-chatwindow-line">'
            + (as.String(nick) !== '' ? ''
                + '<span class="n3q-base n3q-text n3q-time">' + as.Html(time) + '</span>'
                + '<span class="n3q-base n3q-text n3q-nick">' + as.Html(nick) + '</span>'
                + '<span class="n3q-base n3q-text n3q-colon">' + this.app.translateText('Chatwindow.:') + '</span>'
                : '')
            + '<span class="n3q-base n3q-text n3q-chat">' + as.HtmlWithClickableLinks(text) + '</span>'
            + '</div>'
        ).get(0);

        if (this.chatoutElem) {
            $(this.chatoutElem).append(lineElem).scrollTop($(this.chatoutElem).get(0).scrollHeight);
        }
    }

    clear()
    {
        if (this.chatoutElem) {
            $(this.chatoutElem).empty();
        }
    }

    public playSound(): void
    {
        this.sndChat.play();
    }

    private onChatinKeydown(ev: JQuery.KeyDownEvent): boolean
    {
        const keycode = (ev.keyCode ? ev.keyCode : (ev.which ? ev.which : ev.charCode));
        switch (keycode) {
            case 13: // Enter
                this.sendChat();
                return false;
            break;
            case 27: // Esc
                this.close();
                ev.stopPropagation();
                return false;
            break;
            default:
                return true;
            break;
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
                            this.showLine('', data);
                        } else if (Array.isArray(data)) {
                            if (Array.isArray(data[0])) {
                                data.forEach(line =>
                                {
                                    this.showLine(line[0], line[1]);
                                });
                            } else {
                                this.showLine(data[0], data[1]);
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
