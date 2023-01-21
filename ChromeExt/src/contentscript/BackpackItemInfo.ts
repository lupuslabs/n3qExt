import * as $ from 'jquery';
import { as } from '../lib/as';
import { BackgroundMessage } from '../lib/BackgroundMessage';
import { Config } from '../lib/Config';
import { is } from '../lib/is';
import { ItemException } from '../lib/ItemException';
import { ItemProperties, Pid } from '../lib/ItemProperties';
import { Utils } from '../lib/Utils';
import { BackpackItem } from './BackpackItem';
import { ContentApp } from './ContentApp';
import { SimpleErrorToast } from './Toast';

export class BackpackItemInfo
{
    private elem: HTMLElement = null;

    getElem(): HTMLElement { return this.elem; }

    constructor(protected app: ContentApp, protected backpackItem: BackpackItem, protected onClose: () => void)
    {
    }

    show(x: number, y: number): void
    {
        if (this.elem == null) {
            this.setup();
        }

        const offset = Config.get('backpack.itemInfoOffset', { x: 4, y: 4 });
        x = x + offset.x;
        y = y + offset.y;

        $(this.elem).css({ left: x, top: y });
        this.app.toFront(this.elem, ContentApp.LayerWindowContent);
        // $(this.elem).stop().delay(Config.get('backpack.itemInfoDelay', 300)).show();
    }

    close(): void
    {
        $(this.elem).remove();
        if (this.onClose) { this.onClose(); }
    }

    setup(): void
    {
        let windowId = Utils.randomString(15);
        this.elem = <HTMLDivElement>$('<div id=' + windowId + ' class="n3q-base n3q-itemprops n3q-backpackiteminfo n3q-shadow-small" data-translate="children" />').get(0);

        // Fix (jquery?) bug: 
        // Uncaught TypeError: Cannot read property 'ownerDocument' of undefined
        // at jQuery.fn.init.$.fn.scrollParent (scroll-parent.js:41)
        $(this.elem).on('mousemove', ev =>
        {
            ev.stopPropagation();
        });

        this.update();

        $(this.getElem()).on({
            click: (ev) => 
            {
                ev.stopPropagation();
            }
        });

        // $(this.backpackItem.getElem()).append(this.elem);
        $(this.app.getDisplay()).append(this.elem);
    }

    update(): void
    {
        $(this.elem).empty();

        const closeElem = <HTMLElement>$('<div class="n3q-base n3q-overlay-button n3q-shadow-small" title="Close" data-translate="attr:title:Common"><div class="n3q-base n3q-button-symbol n3q-button-close-small" />').get(0);
        $(closeElem).on('click', ev =>
        {
            this.close();
            ev.stopPropagation();
        });
        $(this.elem).append(closeElem);

        const props = this.backpackItem.getProperties();

        let label = as.String(props[Pid.Label]);
        if (label === '') {
            label = as.String(props[Pid.Template]);
        }
        if (label) {
            const labelElem = <HTMLDivElement>$('<div class="n3q-base n3q-title" data-translate="text:ItemLabel">' + label + '</div>').get(0);
            $(this.elem).append(labelElem);
        }

        const description = as.String(props[Pid.Description]);
        if (description) {
            const descriptionElem = <HTMLDivElement>$('<div class="n3q-base n3q-description">' + description + '</div>').get(0);
            $(this.elem).append(descriptionElem);
        }

        const display = ItemProperties.getDisplay(props);

        if (as.Bool(props[Pid.IsRezzed])) {
            display[Pid.IsRezzed] = props[Pid.IsRezzed];
            display[Pid.RezzedDestination] = props[Pid.RezzedDestination];
        }


        // const hasEditableAspect = as.Bool(props[Pid.EditablePropertiesAspect], false);
        // let editablePropertiesList = [];
        // if (hasEditableAspect) {
        //     editablePropertiesList = as.String(props[Pid.EditableProperties], '').split(' ').map(propertyName => Pid[propertyName]).filter(pid => !is.nil(pid));
        // }

        const listElem = <HTMLDivElement>$('<div class="n3q-base n3q-itemprops-list" data-translate="children" />').get(0);
        let hasStats = false;
        for (const pid in display) {
            let value = display[pid];
            if (!is.nil(value)) {
                hasStats = true;

                if (pid === Pid.RezzedDestination) {
                    if (value.startsWith('http://')) { value = value.substr('http://'.length); }
                    if (value.startsWith('https://')) { value = value.substr('https://'.length); }
                    if (value.startsWith('www.')) { value = value.substr('www.'.length); }
                }

                // let isEditable = hasEditableAspect && editablePropertiesList.includes(pid);

                let lineElem = null;
                // if (isEditable) {
                //     const originalValue = value;
                //     lineElem = <HTMLDivElement>$('<div class="n3q-base n3q-itemprops-line" data-translate="children" ></div>').get(0);
                //     let labelElem = <HTMLSpanElement>$('<span class="n3q-base n3q-itemprops-key" data-translate="text:ItemPid">' + pid + '</span>').get(0);
                //     let inputElem = <HTMLInputElement>$('<input type="text" class="n3q-base n3q-input n3q-text n3q-itemprops-value" data-translate="text:ItemValue" title="' + as.Html(value) + '" value="' + as.Html(value) + '" />').get(0);
                //     lineElem.append(labelElem);
                //     lineElem.append(inputElem);
                //     const saveElem = <HTMLButtonElement>$('<div class="n3q-base n3q-button n3q-itemprops-save" title="Save" data-translate="attr:title:Backpack.Itemprops text:Backpack.Itemprops">Save</div>').get(0);
                //     $(saveElem).on('click', async ev =>
                //     {
                //         let value = inputElem.value;
                //         if (value !== originalValue) {
                //             let itemId = this.backpackItem.getItemId();
                //             try {
                //                 await BackgroundMessage.executeBackpackItemAction(
                //                     itemId,
                //                     'EditableProperties.SetProperty',
                //                     {
                //                         Key: pid,
                //                         Value: value,
                //                     },
                //                     [itemId]
                //                 );
                //             } catch (ex) {
                //                 const fact = ItemException.factFrom(ex.fact);
                //                 const reason = ItemException.reasonFrom(ex.reason);
                //                 const detail = ex.detail;
                //                 new SimpleErrorToast(this.app, 'Warning-' + fact + '-' + reason, Config.get('room.applyItemErrorToastDurationSec', 5), 'warning', ItemException.fact2String(fact), ItemException.reason2String(reason), detail).show();
                //             }
                //         }
                //     });
                //     lineElem.append(saveElem);
                // } else {
                    lineElem = <HTMLDivElement>$(''
                        + '<div class="n3q-base n3q-itemprops-line" data-translate="children" > '
                        + '<span class="n3q-base n3q-itemprops-key" data-translate="text:ItemPid">' + pid + '</span>'
                        + '<span class="n3q-base n3q-itemprops-value" data-translate="text:ItemValue" title="' + as.Html(value) + '">' + as.Html(value) + '</span>'
                        + '</div>')
                        .get(0);
                // }
                $(listElem).append(lineElem);
            }
        }

        if (hasStats) {
            $(this.elem).append(listElem);
        }

        const buttonListElem = <HTMLElement>$('<div class="n3q-base n3q-button-list" data-translate="children"></div>').get(0);

        if (as.Bool(props[Pid.IsUnrezzedAction]) && as.Bool(props[Pid.ActivatableAspect])) {
            const activateGroup = <HTMLElement>$('<div class="n3q-base n3q-backpack-activate" data-translate="children" />').get(0);
            const activateLabel = <HTMLElement>$('<span class="n3q-base " data-translate="text:Backpack">Active</div>').get(0);
            const activateCheckbox = <HTMLElement>$('<input type="checkbox" class="n3q-base n3q-backpack-activate" data-translate="text:Backpack" ' + (as.Bool(props[Pid.ActivatableIsActive]) ? 'checked' : '') + '/>').get(0); // Active
            $(activateCheckbox).on('change', async (ev) =>
            {
                await BackgroundMessage.executeBackpackItemAction(this.backpackItem.getItemId(), 'Activatable.SetState', { 'Value': $(activateCheckbox).is(':checked') }, [this.backpackItem.getItemId()]);

                if (as.Bool(props[Pid.AvatarAspect]) || as.Bool(props[Pid.NicknameAspect])) {
                    this.app.getRoom()?.sendPresence();
                }

                ev.stopPropagation();
            });
            $(activateGroup).append(activateLabel);
            $(activateGroup).append(activateCheckbox);
            $(buttonListElem).append(activateGroup);
        }

        if (as.Bool(props[Pid.IsRezzed])) {
            const derezBtn = <HTMLElement>$('<div class="n3q-base n3q-button n3q-backpack-derez" data-translate="text:Backpack">Derez item</div>').get(0);
            $(derezBtn).on('click', (ev) =>
            {
                ev.stopPropagation();
                this.app.derezItem(this.backpackItem.getItemId());
                this.close();
            });
            $(buttonListElem).append(derezBtn);

            const destination = as.String(props[Pid.RezzedDestination]);
            if (destination) {
                const goBtn = <HTMLElement>$('<div class="n3q-base n3q-button n3q-backpack-go" data-translate="text:Backpack">Go to item</div>').get(0);
                $(goBtn).on('click', (ev) =>
                {
                    ev.stopPropagation();
                    window.location.assign(destination);
                });
                $(buttonListElem).append(goBtn);
            }
        } else {
            if (as.Bool(props[Pid.IsRezable], true)) {
                const rezBtn = <HTMLElement>$('<div class="n3q-base n3q-button n3q-backpack-rez" data-translate="text:Backpack">Rez item</div>').get(0);
                $(rezBtn).on('click', (ev) =>
                {
                    ev.stopPropagation();
                    const rezzedX = as.Int(props[Pid.RezzedX], -1);
                    this.backpackItem.rezItem(rezzedX);
                    this.close();
                });
                $(buttonListElem).append(rezBtn);
            }
        }

        if (as.Bool(props[Pid.DeletableAspect], true)) {
            const delBtn = <HTMLElement>$('<div class="n3q-base n3q-button n3q-backpack-delete" data-translate="text:Backpack">Delete item</div>').get(0);
            $(delBtn).on('click', (ev) =>
            {
                ev.stopPropagation();
                this.app.deleteItemAsk(this.backpackItem.getItemId());
                this.close();
            });
            $(buttonListElem).append(delBtn);
        }

        if ($(buttonListElem).children().length > 0) {
            $(this.elem).append(buttonListElem);
        }

        if (Config.get('backpack.itemInfoExtended', false)) {
            this.extend();
        }

        this.app.translateElem(this.elem);
    }

    extend(): void
    {
        const props = this.backpackItem.getProperties();

        let keys = [];
        for (const pid in props) { keys.push(pid); }
        keys = keys.sort();

        const completeListElem = <HTMLDivElement>$('<div class="n3q-base n3q-itemprops-list" data-translate="children" />').get(0);
        for (const pid of keys) {
            const value = props[pid];
            const lineElem = <HTMLDivElement>$(''
                + '<div class="n3q-base n3q-itemprops-line">'
                + '<span class="n3q-base n3q-itemprops-key">' + pid + '</span>'
                + '<span class="n3q-base n3q-itemprops-value" title="' + as.Html(value) + '">' + as.Html(value) + '</span>'
                + '</div>')
                .get(0);
            $(completeListElem).append(lineElem);
            $(this.elem).css({ maxWidth: '400px', width: '400px' });

        }
        $(this.elem).append(completeListElem);
    }
}
