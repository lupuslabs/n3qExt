import { ContentApp } from './ContentApp';
import { is } from '../lib/is';
import { Utils } from '../lib/Utils';
import { Config } from '../lib/Config';
import { as } from '../lib/as';
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher';
import { DomUtils } from '../lib/DomUtils';

abstract class MenuItem
{
    protected readonly app: ContentApp;
    protected readonly column: MenuColumn;
    protected readonly id: string;
    protected readonly extraCssClasses: string[] = [];
    protected readonly iconUrl: null|string;
    protected readonly text: string;

    protected itemElem: HTMLElement;

    public constructor(app: ContentApp, column: MenuColumn, id: string, iconUrl: null|string, text: string) {
        this.app = app;
        this.column = column;
        this.id = id;
        this.iconUrl = iconUrl;
        this.text = text;
    }

    public hasIcon(): boolean
    {
        return is.nonEmptyString(this.iconUrl);
    }

    public render(): HTMLElement
    {
        const itemElem = document.createElement('div');
        this.itemElem = itemElem;
        itemElem.classList.add('n3q-menu-item', `menu-item-${this.id}`, ...this.extraCssClasses);
        itemElem.setAttribute('data-translate', 'children');
        if (this.isDisabled()) {
            itemElem.classList.add('disabled');
        }
        this.initEventHandling();

        itemElem.append(this.app.makeIcon(this.iconUrl));

        const textElem = document.createElement('div');
        textElem.classList.add('text');
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
        this.column.getMenu().onUserDone();
    }

    public onMenuClose(): void
    {
        this.itemElem?.parentNode?.removeChild(this.itemElem);
        this.itemElem = null;
    }

    protected initEventHandling(): void {
        let eventDispatcher = new PointerEventDispatcher(this.app, this.itemElem);
        eventDispatcher.addAnyButtonDownListener(ev => {
            if (!is.nil(this.itemElem)) {
                this.onButtondown();
            }
        });
        eventDispatcher.addUnmodifiedLeftClickListener(ev => {
            if (!is.nil(this.itemElem)) {
                this.onUserAction();
            }
        });
        eventDispatcher.addHoverEnterListener(ev => {
            if (!is.nil(this.itemElem)) {
                this.onHoverEnter();
            }
        });
        eventDispatcher.addHoverLeaveListener(ev => {
            if (!is.nil(this.itemElem)) {
                this.onHoverLeave();
            }
        });
    }

    protected onButtondown(): void
    {
    }

    protected onUserAction(): void
    {
        this.onUserDone();
    }

    protected onHoverEnter(): void
    {
        this.onHoverSetClass();
        this.column.getMenu().onItemWantsToCloseSubmenu();
    }

    protected onHoverSetClass(): void
    {
        if (!this.isDisabled()) {
            this.itemElem.classList.add('n3q-menu-item-hover');
        }
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
    protected readonly onClick: () => void;

    public constructor(app: ContentApp, column: MenuColumn, id: string, iconUrl: null|string, text: string, onClick: null|(() => void))
    {
        super(app, column, id, iconUrl, text);
        this.onClick = onClick;
        this.extraCssClasses.unshift('n3q-action-menu-item');
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

    public constructor(app: ContentApp, column: MenuColumn, id: string, iconUrl: null|string, text: string) {
        super(app, column, id, iconUrl, text);
        this.extraCssClasses.unshift('n3q-label-menu-item');
    }

}

class SubmenuMenuItem extends MenuItem
{
    protected readonly menu: Submenu;
    protected openTimeoutHandle: null|number;

    public constructor(app: ContentApp, column: MenuColumn, id: string, iconUrl: null|string, text: string) {
        super(app, column, id, iconUrl, text);
        this.menu = new Submenu(this.app, this);
        this.extraCssClasses.unshift('n3q-submenu-menu-item');
    }

    public getMenu(): Submenu
    {
        return this.menu;
    }

    public render(): HTMLElement
    {
        super.render();
        const arrowElem = document.createElement('div');
        arrowElem.classList.add('submenu-arrow');
        this.itemElem.appendChild(arrowElem);
        return this.itemElem;
    }

    protected openSubmenu()
    {
        if (!this.menu.isOpen()) {
            this.column.getMenu().closeSubmenu();
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

    public clearSubmenuCloseTimeout(): void
    {
        this.column.getMenu().clearSubmenuCloseTimeout();
    }

    public onMenuClose(): void
    {
        this.cancelHoverOpen();
        this.menu.onMenuClose();
    }

    protected onButtondown(): void
    {
        this.openSubmenu();
        this.cancelHoverOpen();
    }

    protected onUserAction(): void {
    }

    protected onHoverEnter(): void
    {
        this.cancelHoverOpen();
        this.onHoverSetClass();
        if (this.isDisabled()) {
            return;
        }
        if (this.menu.isOpen()) {
            this.column.getMenu().clearSubmenuCloseTimeout();
            return;
        }
        const otherMenuWasOpen = this.column.getMenu().closeSubmenu();
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
    protected readonly app: ContentApp;
    protected readonly menu: Menu;
    protected readonly id: string;
    protected readonly items: MenuItem[] = [];

    public constructor(app: ContentApp, menu: Menu, id: string)
    {
        this.app = app;
        this.menu = menu;
        this.id = id;
    }

    public getMenu(): Menu
    {
        return this.menu;
    }

    public isEmpty(): boolean
    {
        return this.items.length === 0;
    }

    public addActionItem(id: string, iconUrl: null|string, text: string, onClick: () => void): void
    {
        this.items.push(new ActionMenuItem(this.app, this, id, iconUrl, text, onClick));
    }

    public addLabelItem(id: string, iconUrl: null|string, text: string): void
    {
        this.items.push(new LabelMenuItem(this.app, this, id, iconUrl, text));
    }

    public addSubmenuItem(id: string, iconUrl: null|string, text: string): Submenu
    {
        const item = new SubmenuMenuItem(this.app, this, id, iconUrl, text);
        this.items.push(item);
        return item.getMenu();
    }

    public render(): HTMLElement
    {
        const renderIcons = this.items.some(item => item.hasIcon());
        const columnElem = document.createElement('div');
        columnElem.classList.add('n3q-base', 'n3q-menu-column', `n3q-menu-column-${this.id}`);
        if (renderIcons) {
            columnElem.classList.add('with-icons');
        }
        columnElem.setAttribute('data-translate', 'children');
        for (let item of this.items) {
            columnElem.appendChild(item.render());
        }
        return columnElem;
    }

    public closeSubmenu(): boolean
    {
        return this.items.some(item => item.closeSubmenu());
    }

    public onMenuClose(): void {
        for (const item of this.items) {
            item.onMenuClose();
        }
    }

}

abstract class Menu
{
    protected readonly app: ContentApp;
    protected readonly extraCssClasses: string[] = [];
    protected columns: MenuColumn[] = [];

    protected menuElem: null|HTMLElement;
    protected submenuCloseTimeoutHandle: null|number;

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
        DomUtils.execOnNextRenderComplete(() => this.applyPosition(clientX, clientY))
    }

    public close(): void
    {
        this.menuElem?.parentNode?.removeChild(this.menuElem);
        this.menuElem = null;
        for (const column of this.columns) {
            column.onMenuClose();
        }
    }

    public clearSubmenuCloseTimeout(): void
    {
        if (!is.nil(this.submenuCloseTimeoutHandle)) {
            window.clearTimeout(this.submenuCloseTimeoutHandle);
            this.submenuCloseTimeoutHandle = null;
        }
    }

    public onItemWantsToCloseSubmenu(): void
    {
        if (is.nil(this.submenuCloseTimeoutHandle)) {
            const fun = () => this.closeSubmenu();
            const closeTimeoutMs = 1000 * as.Float(Config.get('system.submenuCloseOnItemHoverDelaySec'), 1);
            this.submenuCloseTimeoutHandle = window.setTimeout(fun, closeTimeoutMs);
        }
    }

    public closeSubmenu(): boolean
    {
        this.clearSubmenuCloseTimeout();
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

    protected applyPosition(clientX: number, clientY: number): void
    {
        this.app.toFront(this.menuElem, ContentApp.LayerMenu);
        const displayElemRect = this.app.getDisplay().getBoundingClientRect();
        let localX = clientX - displayElemRect.left;
        let localYBottom = displayElemRect.height - clientY - displayElemRect.top;
        const {width, height} = this.menuElem.getBoundingClientRect();
        const {left, bottom} = Utils.fitLeftBottomRect(
            {left: localX, bottom: localYBottom, width, height},
            displayElemRect.width, displayElemRect.height,
        );
        this.menuElem.style.left = `${left}px`;
        this.menuElem.style.bottom  = `${bottom}px`;
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
        let eventDispatcher = new PointerEventDispatcher(this.app, catcherElem);
        eventDispatcher.addAnyButtonDownListener(ev => this.onUserDone());
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
    protected readonly parentItem: SubmenuMenuItem;

    public constructor(app: ContentApp, parentItem: SubmenuMenuItem)
    {
        super(app);
        this.parentItem = parentItem;
        this.extraCssClasses.push(`n3q-menu-submenu`);
    }

    public clearSubmenuCloseTimeout(): void
    {
        super.clearSubmenuCloseTimeout();
        this.parentItem.clearSubmenuCloseTimeout();
    }

    public onItemWantsToCloseSubmenu(): void
    {
        super.onItemWantsToCloseSubmenu();
        this.parentItem.clearSubmenuCloseTimeout();
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
