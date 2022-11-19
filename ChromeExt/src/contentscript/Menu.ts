import { ContentApp } from './ContentApp';
import { is } from '../lib/is';
import { Utils } from '../lib/Utils';
import { Config } from '../lib/Config';
import { as } from '../lib/as';
import { DomOpacityAwarePointerEventDispatcher } from '../lib/DomOpacityAwarePointerEventDispatcher';
import { DomModifierKeyId, PointerEventType } from '../lib/PointerEventData';
import { DomButtonId } from '../lib/domTools';

abstract class MenuItem
{
    protected app: ContentApp;
    protected column: MenuColumn;
    protected extraCssClasses: string[] = [];
    protected iconId: string;
    protected text: string;

    protected itemElem: HTMLElement;

    public constructor(app: ContentApp, column: MenuColumn, iconId: null|string, text: string) {
        this.app = app;
        this.column = column;
        this.iconId = iconId;
        this.text = text;
    }

    public hasIcon(): boolean
    {
        return !is.nil(this.iconId);
    }

    public render(renderIcon: boolean): HTMLElement
    {
        const itemElem = document.createElement('div');
        this.itemElem = itemElem;
        itemElem.classList.add('n3q-base', 'n3q-menu-item', 'n3q-shadow-small', ...this.extraCssClasses);
        itemElem.setAttribute('data-translate', 'attr:title:Menu children');
        itemElem.setAttribute('title', this.text);
        if (this.isDisabled()) {
            itemElem.classList.add('n3q-menu-item-disabled');
        }
        this.initEventHandling();

        if (renderIcon) {
            const iconElem = document.createElement('div');
            iconElem.classList.add('n3q-base', 'n3q-menu-icon');
            if (!is.nil(this.iconId)) {
                iconElem.classList.add(`n3q-menu-icon-${this.iconId}`);
            }
            itemElem.appendChild(iconElem);
        }

        const textElem = document.createElement('div');
        textElem.classList.add('n3q-base', 'n3q-text');
        textElem.setAttribute('data-translate', 'text:Menu');
        textElem.innerText = this.text;
        itemElem.appendChild(textElem);
        return itemElem;
    }

    protected isDisabled(): boolean
    {
        return false;
    }

    public closeSubmenu(): boolean
    {
        return false;
    }

    public onUserDone(): void
    {
        this.column.onUserDone();
    }

    public onMenuClose(): void
    {
        this.itemElem?.parentNode?.removeChild(this.itemElem);
        this.itemElem = null;
    }

    protected initEventHandling(): void {
        let eventDispatcher = new DomOpacityAwarePointerEventDispatcher(this.app, this.itemElem);
        eventDispatcher.setEventListener(PointerEventType.click, ev => {
            if (!is.nil(this.itemElem)) {
                if (ev.buttons === DomButtonId.first && ev.modifierKeys === DomModifierKeyId.none) {
                    this.onUserAction();
                } else {
                    this.onUserDone();
                }
            }
        });
        eventDispatcher.setEventListener(PointerEventType.doubleclick, ev => {
            if (!is.nil(this.itemElem)) {
                this.onUserDone();
            }
        });
        eventDispatcher.setEventListener(PointerEventType.hoverenter, ev => {
            if (!is.nil(this.itemElem)) {
                this.onHoverEnter();
            }
        });
        eventDispatcher.setEventListener(PointerEventType.hoverleave, ev => {
            if (!is.nil(this.itemElem)) {
                this.onHoverLeave();
            }
        });
    }

    protected onUserAction(): void
    {
        this.onUserDone();
    }

    protected onHoverEnter(): void
    {
        this.onHoverSetClass();
        this.onHoverEnterCloseSubmenu();
    }

    protected onHoverSetClass(): void
    {
        if (!this.isDisabled()) {
            this.itemElem.classList.add('n3q-menu-item-hover');
        }
    }

    protected onHoverEnterCloseSubmenu(): boolean
    {
        return this.column.onItemWantsToCloseSubmenu();
    }

    protected onHoverLeave(): void
    {
        this.onHoverLeaveSetClass();
    }

    protected onHoverLeaveSetClass(): void
    {
        this.itemElem.classList.remove('n3q-menu-item-hover');
    }

}

class ActionMenuItem extends MenuItem
{
    protected onClick: () => void;

    public constructor(app: ContentApp, column: MenuColumn, iconId: null|string, text: string, onClick: null|(() => void))
    {
        super(app, column, iconId, text);
        this.onClick = onClick;
        this.extraCssClasses.push('n3q-action-menu-item');
    }

    protected isDisabled(): boolean
    {
        return is.nil(this.onClick);
    }

    protected onUserAction(): void {
        this.onClick?.();
        super.onUserAction();
    }

}

class LabelMenuItem extends MenuItem
{

    public constructor(app: ContentApp, column: MenuColumn, iconId: null|string, text: string) {
        super(app, column, iconId, text);
        this.extraCssClasses.push('n3q-label-menu-item');
    }

}

class SubmenuMenuItem extends MenuItem
{
    protected menu: Submenu;
    protected openTimeoutHandle: null|number;

    public constructor(app: ContentApp, column: MenuColumn, iconId: null|string, text: string) {
        super(app, column, iconId, text);
        this.menu = new Submenu(this.app, this);
        this.extraCssClasses.push('n3q-submenu-menu-item');
    }
    
    public getMenu(): Submenu
    {
        return this.menu;
    }

    public render(renderIcon: boolean): HTMLElement
    {
        super.render(renderIcon);
        const arrowElem = document.createElement('div');
        arrowElem.classList.add('n3q-base', 'n3q-submenu-arrow');
        this.itemElem.appendChild(arrowElem);
        return this.itemElem;
    }

    protected openSubmenu()
    {
        if (!this.menu.isOpen()) {
            const thisClientRect = this.itemElem.getBoundingClientRect();
            this.menu.open(thisClientRect.right, thisClientRect.bottom);
        }
    }

    public closeSubmenu(): boolean
    {
        if (this.menu.isOpen()) {
            this.menu.close();
            return true;
        }
        return false;
    }

    public onMenuClose(): void
    {
        this.cancelHoverOpen();
        this.menu.onMenuClose();
    }

    protected onUserAction(): void {
        if (this.menu.isOpen()) {
            this.menu.close();
        } else {
            this.openSubmenu();
        }
        this.cancelHoverOpen();
    }

    protected onHoverEnter(): void
    {
        this.cancelHoverOpen();
        this.onHoverSetClass();
        if (this.isDisabled() || this.menu.isOpen()) {
            return;
        }
        const otherMenuWasOpen = this.onHoverEnterCloseSubmenu();
        if (otherMenuWasOpen) {
            this.openSubmenu();
            return;
        }
        const openTimeoutMs = 1000 * as.Float(Config.get('system.submenuHoverOpenDelaySec'), 1);
        this.openTimeoutHandle = window.setTimeout(() => this.openSubmenu(), openTimeoutMs);
    }

    protected onHoverLeave(): void
    {
        this.cancelHoverOpen();
        this.onHoverLeaveSetClass();
    }

    protected cancelHoverOpen(): void
    {
        if (!is.nil(this.openTimeoutHandle)) {
            window.clearTimeout(this.openTimeoutHandle);
            this.openTimeoutHandle = null;
        }
    }

    protected isDisabled(): boolean
    {
        return this.menu.isEmpty();
    }

}

export class MenuColumn
{
    protected app: ContentApp;
    protected menu: Menu;
    protected id: string;
    protected items: MenuItem[] = [];

    public constructor(app: ContentApp, menu: Menu, id: string)
    {
        this.app = app;
        this.menu = menu;
        this.id = id;
    }

    public isEmpty(): boolean
    {
        return this.items.length === 0;
    }

    public addActionItem(iconId: null|string, text: string, onClick: null|(() => void)): void
    {
        this.items.push(new ActionMenuItem(this.app, this, iconId, text, onClick));
    }

    public addLabelItem(iconId: null|string, text: string): void
    {
        this.items.push(new LabelMenuItem(this.app, this, iconId, text));
    }

    public addSubmenuItem(iconId: null|string, text: string): Submenu
    {
        const item = new SubmenuMenuItem(this.app, this, iconId, text);
        this.items.push(item);
        return item.getMenu();
    }

    public render(): HTMLElement
    {
        const columnElem = document.createElement('div');
        columnElem.classList.add('n3q-base', 'n3q-menu-column', `n3q-menu-column-${this.id}`);
        columnElem.setAttribute('data-translate', 'children');
        const renderIcons = this.items.some(item => item.hasIcon());
        for (let item of this.items) {
            columnElem.appendChild(item.render(renderIcons));
        }
        return columnElem;
    }

    public onItemWantsToCloseSubmenu(): boolean
    {
        return this.menu.onItemWantsToCloseSubmenu();
    }

    public closeSubmenu(): boolean
    {
        return this.items.some(item => item.closeSubmenu());
    }

    public onUserDone(): void {
        this.menu.onUserDone();
    }

    public onMenuClose(): void {
        for (const item of this.items) {
            item.onMenuClose();
        }
    }

}

abstract class Menu
{
    protected app: ContentApp;
    protected extraCssClasses: string[] = [];
    protected columns: MenuColumn[] = [];

    protected menuElem: null|HTMLElement;

    public constructor(app: ContentApp)
    {
        this.app = app;
    }

    public addColumn(id: string): MenuColumn
    {
        const column = new MenuColumn(this.app, this, id);
        this.columns.push(column);
        return column;
    }

    public isEmpty(): boolean
    {
        return !this.columns.some(column => !column.isEmpty());
    }

    public isOpen(): boolean
    {
        return !is.nil(this.menuElem);
    }

    public open(clientX: number, clientY: number): void
    {
        if (!is.nil(this.menuElem)) {
            return;
        }
        this.render();
        this.applyPositionWhenReady(clientX, clientY);
    }

    public close(): void
    {
        this.menuElem?.parentNode?.removeChild(this.menuElem);
        this.menuElem = null;
        for (const column of this.columns) {
            column.onMenuClose();
        }
    }

    public onItemWantsToCloseSubmenu(): boolean
    {
        return this.closeSubmenu();
    }

    public closeSubmenu(): boolean
    {
        return this.columns.some(column => column.closeSubmenu());
    }

    public onUserDone(): void {
        this.close();
    }

    protected render()
    {
        let menuElem = document.createElement('div');
        menuElem.classList.add('n3q-base', 'n3q-menu', ...this.extraCssClasses, 'n3q-menu-hidden');
        menuElem.setAttribute('data-translate', 'attr:title:Menu children');

        const columnsElem = document.createElement('div');
        columnsElem.classList.add('n3q-base', 'n3q-menu-columns');
        columnsElem.setAttribute('data-translate', 'children');
        menuElem.appendChild(columnsElem);
        for (let column of this.columns) {
            columnsElem.appendChild(column.render());
        }
        this.app.translateElem(menuElem);

        const displayElem = this.app.getDisplay();
        displayElem.appendChild(menuElem);
        this.menuElem = menuElem;
    }

    protected applyPositionWhenReady(clientX: number, clientY: number): void
    {
        if (is.nil(this.menuElem)) {
            return;
        }
        const {width} = this.menuElem.getBoundingClientRect();
        if (is.nil(width) || width === 0) {
            const pollIntervalMs = 1000 * as.Float(Config.get('system.domUpdatePollIntervalSec'), 1);
            window.setTimeout(() => this.applyPositionWhenReady(clientX, clientY), pollIntervalMs);
        } else {
            this.applyPosition(clientX, clientY);
        }
    }

    protected applyPosition(clientX: number, clientY: number): void
    {
        this.app.toFront(this.menuElem, ContentApp.LayerMenu);
        const displayElemRect = this.app.getDisplay().getBoundingClientRect();
        const left = clientX - displayElemRect.left;
        const bottom = clientY - displayElemRect.top;
        const {width, height} = this.menuElem.getBoundingClientRect();
        const top = bottom - height;
        const [leftM, topM] = Utils.fitDimensions(
            left, top, width, height,
            displayElemRect.width, displayElemRect.height,
            width, height, 0, 0, 0, 0
        );
        this.menuElem.style.left = `${leftM}px`;
        this.menuElem.style.top  = `${topM}px`;
        this.menuElem.classList.remove('n3q-menu-hidden');
    }

}

export class RootMenu extends Menu
{
    protected pointerCatcherElem: null|HTMLElement;

    public constructor(app: ContentApp, id: string)
    {
        super(app);
        this.extraCssClasses.push('n3q-menu-root', `n3q-menu-${id}`);
    }

    public close(): void
    {
        this.pointerCatcherElem?.parentNode?.removeChild(this.pointerCatcherElem);
        this.pointerCatcherElem = null;
        super.close();
    }

    protected render(): void
    {
        super.render();
        let catcherElem = document.createElement('div');
        catcherElem.classList.add('n3q-base', 'n3q-menu-pointer-catcher');
        let eventDispatcher = new DomOpacityAwarePointerEventDispatcher(this.app, catcherElem);
        eventDispatcher.setEventListener(PointerEventType.buttondown, ev => this.close());
        this.pointerCatcherElem = catcherElem;
    }

    protected applyPosition(clientX: number, clientY: number): void
    {
        if (!is.nil(this.pointerCatcherElem)) {
            this.app.getDisplay().appendChild(this.pointerCatcherElem);
            this.app.toFront(this.pointerCatcherElem, ContentApp.LayerMenu);
        }
        super.applyPosition(clientX, clientY);
    }

}

export class Submenu extends Menu
{
    protected parentItem: MenuItem;

    public constructor(app: ContentApp, parentItem: MenuItem)
    {
        super(app);
        this.parentItem = parentItem;
        this.extraCssClasses.push(`n3q-menu-submenu`);
    }

    public onUserDone(): void
    {
        this.parentItem.onUserDone();
    }

    public onMenuClose(): void
    {
        this.close();
    }

}
