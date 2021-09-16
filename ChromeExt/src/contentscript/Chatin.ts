import * as $ from 'jquery';
import { as } from '../lib/as';
import { ContentApp } from './ContentApp';
import { Participant } from './Participant';
import { ChatConsole } from './ChatConsole';
import { isArray } from 'util';

export class Chatin
{
    private elem: HTMLElement;
    private chatinInputElem: HTMLElement;
    private sendElem: HTMLElement;
    private closeElem: HTMLElement;

    constructor(protected app: ContentApp, private participant: Participant, private display: HTMLElement)
    {
        this.elem = <HTMLElement>$('<div class="n3q-base n3q-chatin n3q-shadow-small" data-translate="children" />').get(0);
        this.setVisibility(false);

        this.chatinInputElem = <HTMLElement>$('<input type="text" class="n3q-base n3q-input n3q-text" placeholder="Enter chat here..." data-translate="attr:placeholder:Chatin" />').get(0);
        $(this.chatinInputElem).on('keydown', ev => { this.onKeydown(ev); });
        $(this.elem).append(this.chatinInputElem);

        this.sendElem = <HTMLElement>$('<div class="n3q-base n3q-button n3q-button-inline" title="SendChat" data-translate="attr:title:Chatin"><div class="n3q-base n3q-button-symbol n3q-button-sendchat" />').get(0);
        $(this.sendElem).click(ev =>
        {
            this.sendChat();
        });
        $(this.elem).append(this.sendElem);

        this.closeElem = <HTMLElement>$('<div class="n3q-base n3q-overlay-button n3q-shadow-small" title="Close" data-translate="attr:title:Common"><div class="n3q-base n3q-button-symbol n3q-button-close-small" />').get(0);
        $(this.closeElem).click(ev =>
        {
            $(this.elem).stop(true);
            this.setVisibility(false);
            ev.stopPropagation();
        });
        $(this.elem).append(this.closeElem);

        // $(this.elem).draggable({
        //     scroll: false,
        //     iframeFix: true,
        //     // stack: '.n3q-entity',
        //     distance: 4,
        //     containment: 'document',
        // });

        this.app.translateElem(this.elem);
        $(display).append(this.elem);
    }

    stop()
    {
        // Nothing to do
    }

    onKeydown(ev: JQuery.Event)
    {
        var keycode = (ev.keyCode ? ev.keyCode : (ev.which ? ev.which : ev.charCode));
        switch (keycode) {
            case 13:
                this.sendChat();
                return false;
            case 27:
                this.setVisibility(false);
                ev.stopPropagation();
                return false;
            default:
                return true;
        }
    }

    sendChat(): void
    {
        var text: string = as.String($(this.chatinInputElem).val(), '');
        if (text != '') {

            let handledByChatCommand = false;
            try {
                handledByChatCommand = ChatConsole.isChatCommand(text, {
                    app: this.app,
                    room: this.participant?.getRoom(),
                    out: (data) =>
                    {
                        if (typeof data == typeof '') {
                            this.participant?.getChatout().setText(data);
                        } else if (Array.isArray(data)) {
                            if (Array.isArray(data[0])) {
                                if (this.participant) {
                                    this.participant.getRoom().showChatWindow(this.participant.getElem());
                                    data.forEach(line =>
                                    {
                                        this.participant.getRoom().showChatMessage(line[0], line[1]);
                                    });
                                }
                            } else {
                                this.participant?.getChatout().setText(data[0] + ': ' + data[1]);
                            }
                        }
                    }
                });
            } catch (error) {
                //
            }

            if (!handledByChatCommand) {
                this.participant?.sendGroupChat(text);
            }

            $(this.chatinInputElem)
                .val('')
                .focus()
                ;
        }
    }

    // Visibility

    setVisibility(visible: boolean): void
    {
        this.isVisible = visible;
        if (visible) {
            $(this.elem).removeClass('n3q-hidden');
            $(this.chatinInputElem).focus();
        } else {
            $(this.elem).addClass('n3q-hidden');
        }
    }

    private isVisible = true;
    toggleVisibility(): void
    {
        this.setVisibility(!this.isVisible);
    }
}
