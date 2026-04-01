import { IObserver } from '../lib/ObservableProperty';
import { ContentApp } from './ContentApp';
import { Participant } from './Participant';
import { Config } from '../lib/Config';
import { PointerEventData } from '../lib/PointerEventData';
import { DomUtils } from '../lib/DomUtils';
import menuClosedIconUrl from '../assets/icons/menu.svg';
import menuOpenIconUrl from '../assets/icons/close-circle-o.svg';
import { Menu } from './Menu'

export class Nickname implements IObserver
{
    private readonly elem: HTMLElement;
    private readonly textElem: HTMLElement;
    private readonly menuBtnElem: HTMLElement;
    private nickname: string;

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
            this.participant.onMouseLeaveAvatar(new PointerEventData('hoverleave', ev, this.elem));
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

        // To prevent the menu from closing on pointerdown on the button, so the button doesn't reopen the menu on click but closes it:
        this.app.windows.registerRootElementIgnoredForPointerDownOutside(menu.getWindowId(), this.menuBtnElem);
    }

    public onMenuClose(): void
    {
        this.menuBtnElem.classList.remove('open');
    }

}
