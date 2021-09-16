import * as $ from 'jquery';
import { ContentApp } from './ContentApp';

interface MenuClickHandler { (ev: JQuery.Event): void }

export enum MenuHasIcon
{
    No,
    Yes,
}

export enum MenuHasCheckbox
{
    No,
    YesChecked,
    YesUnchecked,
}

export enum MenuOnClickClose
{
    No,
    Yes,
}

export class MenuItem
{
    elem: HTMLElement;
    iconElem: HTMLElement;

    constructor(public column: MenuColumn, public id: string, public text: string, public hasIcon: MenuHasIcon, public hasCheckbox: MenuHasCheckbox, public onClickClose: MenuOnClickClose, public onClick: MenuClickHandler)
    {
    }

    setCheckbox(hasCheckbox: MenuHasCheckbox)
    {
        switch (this.hasCheckbox) {
            case MenuHasCheckbox.No: this.removeIconClass('n3q-menu-icon-noicon'); break;
            case MenuHasCheckbox.YesUnchecked: this.removeIconClass('n3q-menu-icon-unchecked'); break;
            case MenuHasCheckbox.YesChecked: this.removeIconClass('n3q-menu-icon-checked'); break;
        }
        switch (hasCheckbox) {
            case MenuHasCheckbox.No: this.addIconClass('n3q-menu-icon-noicon'); break;
            case MenuHasCheckbox.YesUnchecked: this.addIconClass('n3q-menu-icon-unchecked'); break;
            case MenuHasCheckbox.YesChecked: this.addIconClass('n3q-menu-icon-checked'); break;
        }
        this.hasCheckbox = hasCheckbox;
    }

    removeIconClass(className: string)
    {
        $(this.iconElem).removeClass(className);
    }

    addIconClass(className: string)
    {
        $(this.iconElem).addClass(className);
    }

    render(): HTMLElement
    {
        this.elem = <HTMLElement>$('<div class="n3q-base n3q-menu-item n3q-menu-column-' + this.column.id + ' n3q-menuitem-' + this.id + ' n3q-shadow-small" data-translate="attr:title:Menu children" title="' + this.text + '" />').get(0);
        if (this.onClick == undefined || this.onClick == null) {
            $(this.elem).addClass('n3q-menu-item-disabled');
        }
        this.iconElem = <HTMLElement>$('<div class="n3q-base n3q-menu-icon"></div>').get(0);
        if (this.hasIcon == MenuHasIcon.No) {
            this.addIconClass('n3q-menu-icon-noicon');
        }
        if (this.hasCheckbox == MenuHasCheckbox.No) {
            //
        } else if (this.hasCheckbox == MenuHasCheckbox.YesUnchecked) {
            this.addIconClass('n3q-menu-icon-unchecked');
        } else if (this.hasCheckbox == MenuHasCheckbox.YesChecked) {
            this.addIconClass('n3q-menu-icon-checked');
        }
        $(this.elem).append(this.iconElem);
        let text = <HTMLElement>$('<div class="n3q-base n3q-text" data-translate="text:Menu">' + this.text + '</div>').get(0);
        $(this.elem).append(text);
        $(this.elem).on('click', ev =>
        {
            if (typeof this.onClick == 'function') {
                this.onClick(ev);
            }
            if (this.onClickClose == MenuOnClickClose.Yes) {
                this.column.menu.close();
            }
        });
        return this.elem;
    }
}

export class MenuColumn
{
    items: Record<string, MenuItem> = {};

    constructor(public menu: Menu, public id: string)
    {
    }

    addItem(id: string, text: string, hasIcon: MenuHasIcon, hasCheckbox: MenuHasCheckbox, onClickClose: MenuOnClickClose, onClick: MenuClickHandler)
    {
        this.items[id] = new MenuItem(this, id, text, hasIcon, hasCheckbox, onClickClose, onClick);
    }

    setCheckbox(id: string, hasCheckbox: MenuHasCheckbox)
    {
        if (this.items[id] != undefined) {
            this.items[id].setCheckbox(hasCheckbox);
        }
    }
}

export class Menu
{
    columns: Record<string, MenuColumn> = {};
    checkboxElem: HTMLElement;

    constructor(public app: ContentApp, public id: string) { }

    addColumn(column: MenuColumn)
    {
        this.columns[column.id] = column;
    }

    setCheckbox(column: string, item: string, hasCheckbox: MenuHasCheckbox)
    {
        if (this.columns[column] != undefined) {
            this.columns[column].setCheckbox(item, hasCheckbox);
        }
    }

    render(): HTMLElement
    {
        let menu = <HTMLElement>$('<div class="n3q-base n3q-menu n3q-menu-avatar" data-translate="attr:title:Menu children" title="Menu">').get(0);
        this.checkboxElem = <HTMLElement>$('<input type="checkbox" href="#" class="n3q-base n3q-menu-open" name="n3q-id-menu-open-avatarmenu-' + this.id + '" id="n3q-id-menu-open-avatarmenu-' + this.id + '" />').get(0);

        $(menu).append(this.checkboxElem);
        let label = <HTMLElement>$('<label for="n3q-id-menu-open-avatarmenu-' + this.id + '" class="n3q-base n3q-menu-open-button"></label>').get(0);
        $(menu).append(label);

        for (let columnId in this.columns) {
            let column = this.columns[columnId];
            for (let itemId in column.items) {
                let item = column.items[itemId];
                let itemElem = item.render();
                $(menu).append(itemElem);
            };
        };

        this.app.translateElem(menu);

        return menu;
    }

    close()
    {
        $(this.checkboxElem).prop('checked', false);
    }
}
