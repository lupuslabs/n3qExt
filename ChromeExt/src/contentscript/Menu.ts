import { ContentApp } from './ContentApp'
import { is } from '../lib/is'
import { Utils } from '../lib/Utils'
import { Config } from '../lib/Config'
import { as } from '../lib/as'
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'
import { DomUtils } from '../lib/DomUtils'

abstract class MenuItem {
    protected readonly app: ContentApp
    protected readonly menu: Menu
    protected readonly id: string
    protected readonly extraCssClasses: string[] = []
    protected readonly text: string
    protected readonly iconUrl: string
    protected readonly iconIsMask: boolean

    protected itemElem: HTMLElement
    protected hasFocus: boolean = false

    protected constructor(app: ContentApp, menu: Menu, id: string, text: null|string, iconUrl: null|string, iconIsMask: null|boolean) {
        this.app = app
        this.menu = menu
        this.id = id
        this.text = as.String(text)
        this.iconUrl = as.String(iconUrl)
        this.iconIsMask = as.Bool(iconIsMask)
    }

    public hasIcon(): boolean {
        return is.nonEmptyString(this.iconUrl)
    }

    public isDisabled(): boolean {
        return false
    }

    public isSeparator(): boolean {
        return false
    }

    public isSubmenu(): boolean {
        return false
    }

    public isAction(): boolean {
        return false
    }

    public focus(): void {
        this.hasFocus = true
        this.itemElem?.classList.add('focus')
    }

    public blur(): void {
        this.hasFocus = false
        this.itemElem?.classList.remove('focus')
    }

    public executeAction(): void {}

    public openSubmenu(): void {}

    public closeSubmenu(): void {}

    public onMenuClose(): void {
        this.itemElem?.parentNode?.removeChild(this.itemElem)
        this.itemElem = null
    }

    public render(renderIcon: boolean): HTMLElement {
        const itemElem = document.createElement('div')
        this.itemElem = itemElem
        itemElem.classList.add('item', `item-${this.id}`, ...this.extraCssClasses)
        if (this.isDisabled()) {
            itemElem.classList.add('disabled')
        }
        this.initEventHandling()

        if (renderIcon) {
            itemElem.append(this.app.uiHelper.makeIcon(this.iconUrl, this.iconIsMask))
    }

        const textElem = document.createElement('div')
        textElem.classList.add('text')
        textElem.innerText = this.app.translateText(`Menu.${this.text}`, this.text)
        itemElem.appendChild(textElem)
        return itemElem
    }

    protected initEventHandling(): void {
        if (this.isDisabled()) {
            return
        }
        const eventDispatcher = PointerEventDispatcher.makeOpaqueDispatcher(this.app, this.itemElem)
        eventDispatcher.addUnmodifiedLeftButtonDownListener(ev => {
            if (!is.nil(this.itemElem)) {
                this.menu.onItemButtonDown(this)
            }
        })
        eventDispatcher.addUnmodifiedLeftClickListener(ev => {
            if (!is.nil(this.itemElem)) {
                this.menu.onItemClick(this)
            }
        })
        eventDispatcher.addHoverEnterListener(ev => {
            if (!is.nil(this.itemElem)) {
                this.menu.onItemPointerEnter(this)
            }
        })
        eventDispatcher.addHoverLeaveListener(ev => {
            if (!is.nil(this.itemElem)) {
                this.menu.onItemPointerLeave(this)
            }
        })
    }
}

class ActionMenuItem extends MenuItem {
    public readonly onClick: () => void

    public constructor(app: ContentApp, menu: Menu, id: string, text: null|string, iconUrl: null|string, iconIsMask: null|boolean, onClick: null|(() => void)) {
        super(app, menu, id, text, iconUrl, iconIsMask)
        this.onClick = onClick
        this.extraCssClasses.push('action-item')
    }

    public isDisabled(): boolean {
        return is.nil(this.onClick)
    }

    public isAction(): boolean {
        return true
    }

    public executeAction(): void {
        this.menu.onItemUserDone()
        try {
            (this.onClick)()
        } catch (error) {
            this.app.onError(error);
        }
    }
}

class SeparatorMenuItem extends MenuItem {
    public constructor(app: ContentApp, menu: Menu, id: string) {
        super(app, menu, id, null, null, null)
        this.extraCssClasses.push('separator-item')
    }

    public isSeparator(): boolean {
        return true
    }

    public render(renderIcon: boolean): HTMLElement {
        return DomUtils.elemOfHtml(`<div class="separator separator-${this.id}"/>`)
    }
}

class SubmenuMenuItem extends MenuItem {
    public readonly submenu: Menu
    protected openTimeoutHandle: null|number
    protected closeTimeoutHandle: null|number

    public constructor(app: ContentApp, menu: Menu, id: string, text: null|string, iconUrl: null|string, iconIsMask: null|boolean) {
        super(app, menu, id, text, iconUrl, iconIsMask)
        this.submenu = new Menu(this.app, id, this)
        this.extraCssClasses.push('submenu-item')
    }

    public isDisabled(): boolean {
        return this.submenu.isEmpty()
    }

    public isSubmenu(): boolean {
        return true
    }

    public focus(): void {
        super.focus()
        this.cancelAutoClose()
        this.scheduleAutoOpen()
    }

    public blur(): void {
        super.blur()
        this.cancelAutoOpen()
        this.scheduleAutoClose()
    }

    public render(renderIcon: boolean): HTMLElement {
        super.render(renderIcon)
        const arrowElem = document.createElement('div')
        arrowElem.classList.add('submenu-arrow')
        this.itemElem.appendChild(arrowElem)
        return this.itemElem
    }

    public openSubmenu(): void {
        this.cancelAutoOpen()
        this.cancelAutoClose()
        if (!this.submenu.isOpen()) {
            const thisClientRect = this.itemElem.getBoundingClientRect()
            this.submenu.open(thisClientRect.right, thisClientRect.bottom)
            this.menu.onSubmenuOpen(this)
        }
    }

    public closeSubmenu(): void {
        this.cancelAutoOpen()
        this.cancelAutoClose()
        if (this.submenu.isOpen()) {
            this.submenu.close()
            this.menu.onSubmenuClose(this)
        }
    }

    public onMenuClose(): void {
        this.cancelAutoOpen()
        this.cancelAutoClose()
        this.submenu.onMenuClose()
    }

    public onSubmenuUserDone(): void {
        this.menu.onItemUserDone()
    }

    public onSubmenuUserInteraction(): void {
        this.cancelAutoClose()
        this.menu.onSubmenuUserInteraction()
    }

    protected scheduleAutoOpen(): void {
        if (this.submenu.isOpen() || !is.nil(this.openTimeoutHandle)) {
            return
        }
        const openTimeoutMs = 1000 * as.Float(Config.get('system.submenuHoverOpenDelaySec'), 1)
        this.openTimeoutHandle = window.setTimeout(() => this.openSubmenu(), openTimeoutMs)
    }

    protected cancelAutoOpen(): void {
        window.clearTimeout(this.openTimeoutHandle)
        this.openTimeoutHandle = null
    }

    protected scheduleAutoClose(): void {
        if (!this.submenu.isOpen() || !is.nil(this.closeTimeoutHandle)) {
            return
        }
        const closeTimeoutMs = 1000 * as.Float(Config.get('system.submenuCloseOnItemHoverDelaySec'), 1)
        this.closeTimeoutHandle = window.setTimeout(() => this.closeSubmenu(), closeTimeoutMs)
    }

    protected cancelAutoClose(): void {
        window.clearTimeout(this.closeTimeoutHandle)
        this.closeTimeoutHandle = null
    }
}

export class Menu {
    protected readonly app: ContentApp
    protected readonly parentItem: null|SubmenuMenuItem
    protected readonly extraCssClasses: string[] = []
    protected items: MenuItem[] = []

    protected pointerCatcherElem: null|HTMLElement
    protected menuElem: null|HTMLElement
    protected enabledItems: MenuItem[] = []

    protected focusedItem: null|MenuItem = null
    protected openMenuItem: null|SubmenuMenuItem = null

    public constructor(app: ContentApp, id: string, parentItem?: null|SubmenuMenuItem) {
        this.app = app
        this.parentItem = parentItem
        if (parentItem) {
            this.extraCssClasses.push(`submenu`)
        } else {
            this.extraCssClasses.push('rootmenu')
        }
        this.extraCssClasses.push(`menu-${id}`)
    }

    public isEmpty(): boolean {
        return this.items.length === 0
    }

    public addActionItem(id: string, text: string, iconUrl: null|string, iconIsMask: null|boolean, onClick: () => void): void {
        this.items.push(new ActionMenuItem(this.app, this, id, text, iconUrl, iconIsMask, onClick))
    }

    public addSeparatorItem(id: string): void {
        this.items.push(new SeparatorMenuItem(this.app, this, id))
    }

    public addSubmenuItem(id: string, text: string, iconUrl: null|string, iconIsMask: null|boolean): Menu {
        const item = new SubmenuMenuItem(this.app, this, id, text, iconUrl, iconIsMask)
        this.items.push(item)
        return item.submenu
    }

    public isOpen(): boolean {
        return !is.nil(this.menuElem)
    }

    public open(clientX: number, clientY: number): void {
        if (!is.nil(this.menuElem)) {
            return
        }
        this.render()
        DomUtils.execOnNextRenderComplete(() => this.applyPosition(clientX, clientY))
    }

    public close(): void {
        this.pointerCatcherElem?.parentNode?.removeChild(this.pointerCatcherElem)
        this.pointerCatcherElem = null
        this.menuElem?.parentNode?.removeChild(this.menuElem)
        this.menuElem = null
        this.focusedItem = null
        this.enabledItems = []
        for (const item of this.items) {
            item.onMenuClose()
        }
    }

    public onMenuClose(): void {
        this.close()
    }

    public onItemUserDone(): void {
        if (this.parentItem) {
            this.parentItem.onSubmenuUserDone()
        } else {
            this.close()
        }
    }

    public onItemButtonDown(eventItem: MenuItem): void {
        this.parentItem?.onSubmenuUserInteraction()
        for (const item of this.enabledItems) {
            if (item !== eventItem) {
                item.blur()
                item.closeSubmenu()
            }
        }
        this.focusedItem = eventItem
        eventItem.focus()
        if (eventItem.isSubmenu()) {
            eventItem.openSubmenu()
            return
        }
    }

    public onItemClick(eventItem: MenuItem): void {
        this.parentItem?.onSubmenuUserInteraction()
        for (const item of this.enabledItems) {
            if (item !== eventItem) {
                item.blur()
                item.closeSubmenu()
            }
        }
        this.focusedItem = eventItem
        eventItem.focus()
        if (eventItem.isAction()) {
            eventItem.executeAction()
            return
        }
        if (eventItem.isSubmenu()) {
            eventItem.openSubmenu()
            return
        }
    }

    public onItemPointerEnter(eventItem: MenuItem): void {
        this.parentItem?.onSubmenuUserInteraction()
        for (const item of this.enabledItems) {
            if (item !== eventItem) {
                item.blur()
            }
        }
        this.focusedItem = eventItem
        eventItem.focus()
        if (eventItem.isSubmenu() && this.openMenuItem) {
            this.openMenuItem.closeSubmenu()
            eventItem.openSubmenu()
            return
        }
    }

    public onItemPointerLeave(eventItem: MenuItem): void {
        if (this.focusedItem === eventItem && this.openMenuItem !== eventItem) {
            this.focusedItem = null
            eventItem.blur()
        }
    }

    public onSubmenuOpen(openSubmenuItem: SubmenuMenuItem): void {
        if (this.openMenuItem) {
            if (this.openMenuItem === openSubmenuItem) {
                return
            }
            this.openMenuItem.closeSubmenu()
        }
        this.openMenuItem = openSubmenuItem
    }

    public onSubmenuClose(closedSubmenuItem: SubmenuMenuItem): void {
        if (this.openMenuItem === closedSubmenuItem) {
            this.openMenuItem = null
        }
    }

    public onSubmenuUserInteraction(): void {
        this.parentItem?.onSubmenuUserInteraction()
    }

    protected render(): void {
        if (!this.parentItem) {
            const catcherElem = document.createElement('div')
            catcherElem.classList.add('menu-pointer-catcher')
            const eventDispatcher = PointerEventDispatcher.makeOpaqueDispatcher(this.app, catcherElem)
            eventDispatcher.addAnyButtonDownListener(ev => this.onItemUserDone())
            this.pointerCatcherElem = catcherElem
        }

        const menuElem = document.createElement('div')
        menuElem.classList.add('menu', ...this.extraCssClasses, 'hidden')

        const renderIcons = this.items.some(item => item.hasIcon())
        this.focusedItem = null
        this.enabledItems = []
        let itemGroup = []
        for (const item of this.items) {
            const itemElem = item.render(renderIcons)
            if (item.isSeparator()) {
                this.renderItemGroup(menuElem, itemGroup)
                itemGroup = []
                menuElem.appendChild(itemElem)
            } else {
                itemGroup.push(itemElem)
            }
            if (!item.isDisabled()) {
                this.enabledItems.push(item)
            }
        }
        this.renderItemGroup(menuElem, itemGroup)

        const displayElem = this.app.getDisplay()
        displayElem.appendChild(menuElem)
        this.menuElem = menuElem
    }

    protected renderItemGroup(columnElem: HTMLElement, menuItemElems: HTMLElement[]): void {
        if (menuItemElems.length === 0) {
            return
        }
        const groupElem = document.createElement('div')
        groupElem.classList.add('item-group')
        menuItemElems.forEach(elem => groupElem.append(elem))
        columnElem.append(groupElem)
    }

    protected applyPosition(clientX: number, clientY: number): void {
        if (this.pointerCatcherElem) {
            this.app.getDisplay().appendChild(this.pointerCatcherElem)
            this.app.toFront(this.pointerCatcherElem, ContentApp.LayerMenu)
        }
        if (!this.menuElem) {
            return
        }
        this.app.toFront(this.menuElem, ContentApp.LayerMenu)
        const displayElemRect = this.app.getDisplay().getBoundingClientRect()
        let localX = clientX - displayElemRect.left
        let localYBottom = displayElemRect.height - clientY - displayElemRect.top
        const {width, height} = this.menuElem.getBoundingClientRect()
        const {left, bottom} = Utils.fitLeftBottomRect(
            {left: localX, bottom: localYBottom, width, height},
            displayElemRect.width, displayElemRect.height,
        )
        this.menuElem.style.left = `${left}px`
        this.menuElem.style.bottom  = `${bottom}px`
        this.menuElem.classList.remove('hidden')
    }
}
