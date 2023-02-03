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
import { domHtmlElemOfHtml } from '../lib/domTools'

export class BackpackItemInfo
{
    private elem: HTMLElement = null;

    public getElem(): HTMLElement { return this.elem; }

    public constructor(protected app: ContentApp, protected backpackItem: BackpackItem, protected onClose: () => void)
    {
    }

    public show(x: number, y: number): void
    {
        if (this.elem == null) {
            this.setup();
        }

        const offset = Config.get('backpack.itemInfoOffset', { x: 4, y: 4 });
        x = x + offset.x;
        y = y + offset.y;

        this.elem.style.top = `${y}px`;
        this.elem.style.left = `${x}px`;
        this.app.toFront(this.elem, ContentApp.LayerWindowContent);
    }

    public close(): void
    {
        this.elem?.remove();
        this.onClose?.();
    }

    private setup(): void
    {
        let windowId = Utils.randomString(15);
        this.elem = domHtmlElemOfHtml(`<div id="${windowId}" class="n3q-base n3q-itemprops n3q-backpackiteminfo n3q-shadow-small" data-translate="children"></div>`);
        this.update();
        this.app.getDisplay()?.append(this.elem);
    }

    public update(): void
    {
        if (!this.elem) {
            return;
        }
        this.elem.innerHTML = '';

        const closeElem = this.app.makeWindowCloseButton(() => this.close(), 'overlay');
        this.elem.append(closeElem);

        const props = this.backpackItem.getProperties();

        let label = as.String(props[Pid.Label]);
        if (label === '') {
            label = as.String(props[Pid.Template]);
        }
        if (label) {
            const labelElem = domHtmlElemOfHtml(`<div class="n3q-base n3q-title" data-translate="text:ItemLabel">${as.Html(label)}</div>`);
            this.elem.append(labelElem);
        }

        const description = as.String(props[Pid.Description]);
        if (description) {
            const descriptionElem = domHtmlElemOfHtml(`<div class="n3q-base n3q-description">${as.Html(description)}</div>`);
            this.elem.append(descriptionElem);
        }

        const display = ItemProperties.getDisplay(props);

        if (as.Bool(props[Pid.IsRezzed])) {
            display[Pid.IsRezzed] = props[Pid.IsRezzed];
            display[Pid.RezzedDestination] = props[Pid.RezzedDestination];
        }


        const listElem = domHtmlElemOfHtml('<div class="n3q-base n3q-itemprops-list" data-translate="children"></div>');
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

                let lineElem = null;
                lineElem = domHtmlElemOfHtml(''
                    + '<div class="n3q-base n3q-itemprops-line" data-translate="children" > '
                    + `<span class="n3q-base n3q-itemprops-key" data-translate="text:ItemPid">${as.Html(pid)}</span>`
                    + `<span class="n3q-base n3q-itemprops-value" data-translate="text:ItemValue" title="${as.Html(value)}">${as.Html(value)}</span>`
                    + '</div>');
                listElem.append(lineElem);
            }
        }

        if (hasStats) {
            this.elem.append(listElem);
        }

        const buttonListElem = domHtmlElemOfHtml('<div class="n3q-base n3q-button-list" data-translate="children"></div>');

        if (as.Bool(props[Pid.IsUnrezzedAction]) && as.Bool(props[Pid.ActivatableAspect])) {
            const activateGroup = domHtmlElemOfHtml('<div class="n3q-base n3q-backpack-activate" data-translate="children"></div>');
            const activateLabel = domHtmlElemOfHtml('<span class="n3q-base " data-translate="text:Backpack">Active</div>');
            const activateCheckbox = <HTMLInputElement>domHtmlElemOfHtml(`<input type="checkbox" class="n3q-base n3q-backpack-activate" data-translate="text:Backpack"${as.Bool(props[Pid.ActivatableIsActive]) ? ' checked' : ''}/>`); // Active
            activateCheckbox.addEventListener('change', ev =>
            {
                ev.stopPropagation();
                (async () =>
                {
                    const isChecked = activateCheckbox.checked;
                    await BackgroundMessage.executeBackpackItemAction(this.backpackItem.getItemId(), 'Activatable.SetState', { 'Value': isChecked }, [this.backpackItem.getItemId()]);

                    if (as.Bool(props[Pid.AvatarAspect]) || as.Bool(props[Pid.NicknameAspect])) {
                        this.app.getRoom()?.sendPresence();
                    }
                })().catch(error => this.app.onError(error));
            });
            activateGroup.append(activateLabel);
            activateGroup.append(activateCheckbox);
            buttonListElem.append(activateGroup);
        }

        if (as.Bool(props[Pid.IsRezzed])) {
            const derezBtn = domHtmlElemOfHtml('<div class="n3q-base n3q-button n3q-backpack-derez" data-translate="text:Backpack">Derez item</div>');
            derezBtn.addEventListener('click', (ev) =>
            {
                ev.stopPropagation();
                this.app.derezItem(this.backpackItem.getItemId());
                this.close();
            });
            buttonListElem.append(derezBtn);

            const destination = as.String(props[Pid.RezzedDestination]);
            if (destination) {
                const goBtn = domHtmlElemOfHtml('<div class="n3q-base n3q-button n3q-backpack-go" data-translate="text:Backpack">Go to item</div>');
                goBtn.addEventListener('click', (ev) =>
                {
                    ev.stopPropagation();
                    window.location.assign(destination);
                });
                buttonListElem.append(goBtn);
            }
        } else {
            if (as.Bool(props[Pid.IsRezable], true)) {
                const rezBtn = domHtmlElemOfHtml('<div class="n3q-base n3q-button n3q-backpack-rez" data-translate="text:Backpack">Rez item</div>');
                rezBtn.addEventListener('click', (ev) =>
                {
                    ev.stopPropagation();
                    const rezzedX = as.Int(props[Pid.RezzedX], -1);
                    this.backpackItem.rezItem(rezzedX);
                    this.close();
                });
                buttonListElem.append(rezBtn);
            }
        }

        if (as.Bool(props[Pid.DeletableAspect], true)) {
            const delBtn = domHtmlElemOfHtml('<div class="n3q-base n3q-button n3q-backpack-delete" data-translate="text:Backpack">Delete item</div>');
            delBtn.addEventListener('click', (ev) =>
            {
                ev.stopPropagation();
                this.app.deleteItemAsk(this.backpackItem.getItemId());
                this.close();
            });
            buttonListElem.append(delBtn);
        }

        if (buttonListElem.children.length > 0) {
            this.elem.append(buttonListElem);
        }

        if (Config.get('backpack.itemInfoExtended', false)) {
            this.extend();
        }

        this.app.translateElem(this.elem);
    }

    private extend(): void
    {
        const props = this.backpackItem.getProperties();

        let keys = [];
        for (const pid in props) { keys.push(pid); }
        keys = keys.sort();

        const completeListElem = domHtmlElemOfHtml('<div class="n3q-base n3q-itemprops-list" data-translate="children"></div>');
        for (const pid of keys) {
            const value = props[pid];
            const lineElem = domHtmlElemOfHtml(''
                + '<div class="n3q-base n3q-itemprops-line">'
                + `<span class="n3q-base n3q-itemprops-key">${as.Html(pid)}</span>`
                + `<span class="n3q-base n3q-itemprops-value" title="${as.Html(value)}">${as.Html(value)}</span>`
                + '</div>');
            completeListElem.append(lineElem);
            this.elem.style.maxWidth = '400px';
            this.elem.style.width = '400px';
        }
        this.elem.append(completeListElem);
    }
}
