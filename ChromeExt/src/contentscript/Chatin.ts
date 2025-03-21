import { ContentApp } from './ContentApp';
import { Participant } from './Participant';
import { DomUtils } from '../lib/DomUtils';
import { AnimationsDefinition } from './AnimationsXml';
import { Config } from '../lib/Config';

export class Chatin
{
    private elem: HTMLElement;
    private chatinInputElem: HTMLInputElement;
    private sendElem: HTMLElement;
    private closeElem: HTMLElement;

    constructor(protected app: ContentApp, private participant: Participant, private display: HTMLElement)
    {
        this.elem = DomUtils.elemOfHtml('<div class="participant-chat-to-server" data-translate="children" />');
        this.setVisibility(false);
        const contentElem = DomUtils.elemOfHtml('<div class="content" data-translate="children" />');
        this.elem.append(contentElem);

        this.chatinInputElem = <HTMLInputElement> DomUtils.elemOfHtml('<textarea placeholder="Enter chat here..." data-translate="attr:placeholder:Chatin"></textarea>');
        this.chatinInputElem.addEventListener('keydown', ev => this.onKeydown(ev));
        contentElem.appendChild(this.chatinInputElem);

        this.sendElem = this.app.uiHelper.makeButton({
            style: 'undecorated',
            extraCssClass: 'send-chat-button',
            title: 'Send',
            titleId: 'Chatin.Send',
            iconAsCssMask: true,
            iconDummy: true,
            onClick: () => this.sendChat(),
        })[0];
        contentElem.appendChild(this.sendElem);

        this.closeElem = this.app.uiHelper.makeWindowCloseButton(() => this.setVisibility(false), 'overlay');
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
            this.elem.classList.remove('hidden');
            this.setFocus();
        } else {
            this.elem.classList.add('hidden');
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
