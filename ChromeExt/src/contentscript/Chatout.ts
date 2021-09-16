import * as $ from 'jquery';
import { as } from '../lib/as';
import { Config } from '../lib/Config';
import { ContentApp } from './ContentApp';
import { Participant } from './Participant';

export class Chatout
{
    private elem: HTMLElement;
    private textElem: HTMLElement;
    private closeElem: HTMLElement;
    private hasText: boolean;

    constructor(protected app: ContentApp, private participant: Participant, private display: HTMLElement)
    {
        this.elem = <HTMLElement>$('<div class="n3q-base n3q-chatout" />').get(0);
        this.setVisibility(false);

        $(this.elem).click(() =>
        {
            $(this.elem).stop(true).fadeTo('fast', 1);
            this.participant?.select();
        });

        var speechBubble = <HTMLElement>$('<div class="n3q-base n3q-speech n3q-shadow-small" />').get(0);

        this.textElem = <HTMLElement>$('<span class="n3q-base n3q-text n3q-chat" />').get(0);

        $(speechBubble).append(this.textElem);
        $(this.elem).append(speechBubble);

        this.closeElem = <HTMLElement>$('<div class="n3q-base n3q-overlay-button n3q-shadow-small" title="Close" data-translate="attr:title:Common"><div class="n3q-base n3q-button-symbol n3q-button-close-small" />').get(0);
        $(this.closeElem).click(ev =>
        {
            $(this.elem).stop(true);
            this.setVisibility(false);
            ev.stopPropagation();
        });
        $(this.elem).append(this.closeElem);
        this.app.translateElem(this.closeElem);

        $(display).append(this.elem);
    }

    stop()
    {
        // Nothing to do
    }

    setText(text: string): void
    {
        if (text == null || text == '') {
            return;
        }

        this.hasText = true;

        $(this.elem).stop(true).fadeTo('fast', 1);

        $(this.textElem).html(as.HtmlWithClickableLinks(text));

        this.elem.style.display = 'block';
        $(this.elem)
            .delay(Config.get('room.chatBuubleFadeStartSec', 60.0) * 1000)
            .fadeOut(Config.get('room.chatBuubleFadeDurationSec', 60.0) * 1000)
            ;
    }

    setVisibility(visible: boolean): void
    {
        // Have to work with display:block instead of class n3q-hidden, beacusebecause JQuery-fade uses display:block
        this.elem.style.display = visible ? 'block' : 'none';
        if (visible) {
            $(this.textElem).focus();
        }
    }

    toggleVisibility(): void
    {
        var visible = this.elem.style.display == 'block';
        if (visible) {
            this.setVisibility(!visible);
        } else {
            if (this.hasText) {
                this.setVisibility(!visible);
            }
        }
    }
}
