import { ContentApp } from './ContentApp';
import { Participant } from './Participant';
import { DomUtils } from '../lib/DomUtils';
import { AnimationsDefinition } from './AnimationsXml';
import { Config } from '../lib/Config';
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'

export class Chatin
{
    private elem: HTMLElement;
    private chatinInputElem: HTMLInputElement;
    private sendElem: HTMLElement;
    private closeElem: HTMLElement;

    constructor(protected app: ContentApp, private participant: Participant, private display: HTMLElement)
    {
        this.elem = DomUtils.elemOfHtml('<div class="n3q-base n3q-chatin n3q-shadow-small" data-translate="children" />');
        this.setVisibility(false);

        this.chatinInputElem = <HTMLInputElement> DomUtils.elemOfHtml('<textarea class="n3q-base n3q-input n3q-text" placeholder="Enter chat here..." data-translate="attr:placeholder:Chatin"></textarea>');
        this.chatinInputElem.addEventListener('keydown', ev => this.onKeydown(ev));
        this.elem.appendChild(this.chatinInputElem);

        this.sendElem = DomUtils.elemOfHtml('<div class="n3q-base n3q-button n3q-button-inline" title="SendChat" data-translate="attr:title:Chatin"><div class="n3q-base n3q-button-symbol n3q-button-sendchat" /></div>');
        PointerEventDispatcher.makeOpaqueDispatcher(this.app, this.sendElem).addUnmodifiedLeftClickListener(ev => {
            this.sendChat();
        });
        this.elem.appendChild(this.sendElem);

        this.closeElem = this.app.makeWindowCloseButton(() => this.setVisibility(false), 'overlay');
        this.elem.appendChild(this.closeElem);

        this.app.translateElem(this.elem);
        this.positionContainerElem(Config.get('room.chatinDefaultBottom', 30));
        display.appendChild(this.elem);
    }

    stop()
    {
        this.elem.remove();
    }

    public onAvatarAnimationsParsed(avatarAnimations: AnimationsDefinition): void
    {
        this.positionContainerElem(avatarAnimations.params.chatinBottom);
    }

    onKeydown(ev: KeyboardEvent): void
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
                this.setVisibility(false);
                isHandled = true;
            } break;
        }
        if (isHandled) {
            ev.preventDefault();
        }
    }

    setText(text: string): void
    {
        this.chatinInputElem.value = text;
    }

    setFocus(): void
    {
        this.chatinInputElem.focus();
    }

    sendChat(): void
    {
        this.participant.sendGroupChat(this.chatinInputElem.value);
        this.setText('');
        this.setFocus();
    }

    // Visibility

    setVisibility(visible: boolean): void
    {
        this.isVisible = visible;
        if (visible) {
            this.elem.classList.remove('n3q-hidden');
            this.setFocus();
        } else {
            this.elem.classList.add('n3q-hidden');
        }
    }

    private isVisible = true;
    toggleVisibility(): void
    {
        this.setVisibility(!this.isVisible);
    }

    protected positionContainerElem(chatinBottom: number): void
    {
        this.elem.style.bottom = `${chatinBottom}px`;
    }

}
