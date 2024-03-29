import { is } from '../lib/is';
import { IObserver } from '../lib/ObservableProperty';
import { ContentApp } from './ContentApp';
import { Participant } from './Participant';
import { Config } from '../lib/Config';
import { PointerEventData } from '../lib/PointerEventData';
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher';
import { DomUtils } from '../lib/DomUtils';
import * as menuClosedIconUrl from '../assets/icons/menu.svg';
import * as menuOpenIconUrl from '../assets/icons/close-circle-o.svg';

export class Nickname implements IObserver
{
    private elem: HTMLElement;
    private textElem: HTMLElement;
    private menuElem: HTMLElement;
    private nickname: string;
    private isMenuOpen: boolean = false;
    private lastLeaveEvent: PointerEventData;

    getElem() { return this.elem; }

    constructor(protected app: ContentApp, private participant: Participant, private isSelf: boolean, private display: HTMLElement)
    {
        this.elem = DomUtils.elemOfHtml('<div class="n3q-base n3q-nickname n3q-shadow-small" />');

        this.elem.addEventListener('pointerdown', (ev: PointerEvent) => {
            this.participant.select();
        }, { capture: true });
        this.elem.addEventListener('pointerenter', (ev: PointerEvent) => {
            this.participant.onMouseEnterAvatar(new PointerEventData('hoverenter', ev, this.elem));
        });
        this.elem.addEventListener('pointermove', (ev: PointerEvent) => {
            this.participant.onMouseEnterAvatar(new PointerEventData('hovermove', ev, this.elem));
        });
        this.elem.addEventListener('pointerleave', (ev: PointerEvent) => {
            this.lastLeaveEvent = new PointerEventData('hoverleave', ev, this.elem);
            if (!this.isMenuOpen) {
                this.participant.onMouseLeaveAvatar(this.lastLeaveEvent);
            }
        });

        const menuElem = document.createElement('span');
        this.menuElem = menuElem;
        menuElem.classList.add('n3q-base', 'n3q-menu-open-button');
        const menuEventdispatcher = PointerEventDispatcher.makeOpaqueDispatcher(this.app, menuElem);
        menuEventdispatcher.addListener('buttondown', DomUtils.ButtonId.first, DomUtils.ModifierKeyId.none, ev => {
            this.participant.openMenu();
        });
        this.elem.appendChild(menuElem);

        const closedIcon = this.app.makeIcon(menuClosedIconUrl);
        closedIcon.classList.add('closed');
        const openIcon = this.app.makeIcon(menuOpenIconUrl);
        openIcon.classList.add('open');
        menuElem.append(closedIcon, openIcon);

        this.textElem = DomUtils.elemOfHtml('<div class="n3q-base n3q-text" />');
        this.elem.appendChild(this.textElem);

        display.appendChild(this.elem);
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
        this.textElem.innerText = nickname;
        if (Config.get('room.showNicknameTooltip', true)) {
            this.textElem.title = nickname;
        }
        this.participant.getChatout().onNickKnown(nickname);
    }

    public getNickname(): string
    {
        return this.nickname;
    }

    public onMenuOpen(): void
    {
        this.menuElem.classList.add('open');
        this.isMenuOpen = true;
    }

    public onMenuClose(): void
    {
        this.menuElem.classList.remove('open');
        this.isMenuOpen = false;
        if (!is.nil(this.lastLeaveEvent)) {
            // Menu's pointercatcher destructed, so if pointer is hovering, a pointerenter follows after next dom update:
            this.participant.onMouseLeaveAvatar(this.lastLeaveEvent);
        }
    }

}
