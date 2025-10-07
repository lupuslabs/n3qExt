import { is } from '../lib/is';
import { IObserver } from '../lib/ObservableProperty';
import { ContentApp } from './ContentApp';
import { Participant } from './Participant';
import { Config } from '../lib/Config';
import { PointerEventData } from '../lib/PointerEventData';
import { DomUtils } from '../lib/DomUtils';
import * as menuClosedIconUrl from '../assets/icons/menu.svg';
import * as menuOpenIconUrl from '../assets/icons/close-circle-o.svg';
import { Menu } from './Menu'

export class Nickname implements IObserver
{
    private elem: HTMLElement;
    private textElem: HTMLElement;
    private menuBtnElem: HTMLElement;
    private nickname: string;
    private isMenuOpen: boolean = false;
    private lastLeaveEvent: PointerEventData;

    getElem() { return this.elem; }

    constructor(protected app: ContentApp, private participant: Participant, private isSelf: boolean, private display: HTMLElement)
    {
        this.elem = DomUtils.elemOfHtml('<div class="participant-nickname" />');

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

        const [menuElem, menuEventDispatcher] = this.app.uiHelper.makeButton({
            style: 'undecorated',
            extraCssClass: 'main-menu-button',
            onKeyboardClick: () => this.participant.toggleMenu(),
        });
        const closedIcon = this.app.uiHelper.makeIcon(menuClosedIconUrl, true);
        closedIcon.classList.add('closed');
        menuElem.append(closedIcon);
        const openIcon = this.app.uiHelper.makeIcon(menuOpenIconUrl, true);
        openIcon.classList.add('open');
        menuElem.append(openIcon);
        menuElem.classList.add('main-menu-button');
        menuEventDispatcher.addUnmodifiedLeftButtonDownListener(ev => this.participant.toggleMenu());
        this.menuBtnElem = menuElem;
        this.elem.appendChild(this.menuBtnElem);

        this.textElem = DomUtils.elemOfHtml('<div class="text" />');
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

    public onMenuOpen(menu: Menu): void
    {
        this.menuBtnElem.classList.add('open');
        this.isMenuOpen = true;
        this.app.windows.registerIgnoredRootElement(menu.getWindowId(), this.menuBtnElem);
    }

    public onMenuClose(): void
    {
        this.menuBtnElem.classList.remove('open');
        this.isMenuOpen = false;
        if (!is.nil(this.lastLeaveEvent)) {
            // Menu's pointercatcher destructed, so if pointer is hovering, a pointerenter follows after next dom update:
            this.participant.onMouseLeaveAvatar(this.lastLeaveEvent);
        }
    }

}
