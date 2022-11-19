import * as $ from 'jquery';
import { as } from '../lib/as';
import { IObserver } from '../lib/ObservableProperty';
import { ContentApp } from './ContentApp';
import { Participant } from './Participant';
import { Config } from '../lib/Config';
import { DomModifierKeyId, getDataFromPointerEvent, PointerEventType } from '../lib/PointerEventData';
import { DomOpacityAwarePointerEventDispatcher } from '../lib/DomOpacityAwarePointerEventDispatcher';
import { DomButtonId } from '../lib/domTools';

export class Nickname implements IObserver
{
    private elem: HTMLDivElement;
    private textElem: HTMLElement;
    private nickname: string;

    getElem() { return this.elem; }

    constructor(protected app: ContentApp, private participant: Participant, private isSelf: boolean, private display: HTMLElement)
    {
        this.elem = <HTMLDivElement>$('<div class="n3q-base n3q-nickname n3q-shadow-small" />').get(0);

        this.elem.addEventListener('pointerdown', (ev: PointerEvent) => {
            this.participant.select();
        });
        this.elem.addEventListener('pointermove', (ev: PointerEvent) => {
            this.participant.onMouseEnterAvatar(getDataFromPointerEvent(PointerEventType.hovermove, ev, this.elem));
        });
        this.elem.addEventListener('pointerleave', (ev: PointerEvent) => {
            this.participant.onMouseLeaveAvatar(getDataFromPointerEvent(PointerEventType.hoverleave, ev, this.elem));
        });

        let menuElem = document.createElement('span');
        menuElem.classList.add('n3q-base', 'n3q-menu-open-button');
        let menuEventdispatcher = new DomOpacityAwarePointerEventDispatcher(this.app, menuElem);
        menuEventdispatcher.setEventListener(PointerEventType.click, ev => {
            if (ev.buttons === DomButtonId.first && ev.modifierKeys === DomModifierKeyId.none) {
                this.participant.openMenu();
            }
        });
        this.elem.appendChild(menuElem);

        this.textElem = <HTMLElement>$('<div class="n3q-base n3q-text" />').get(0);
        $(this.elem).append(this.textElem);

        $(display).append(this.elem);
    }

    public stop(): void
    {
        // Nothing to do
    }

    public updateObservableProperty(name: string, value: string): void
    {
        if (name === 'Nickname') {
            this.setNickname(value);
        }
    }

    public setNickname(nickname: string): void
    {
        this.nickname = nickname;
        $(this.textElem).html(as.Html(nickname));
        if (Config.get('room.showNicknameTooltip', true)) {
            $(this.textElem).prop('title', nickname);;
        }
    }

    public getNickname(): string
    {
        return this.nickname;
    }

}
