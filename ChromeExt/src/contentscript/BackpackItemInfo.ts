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
import { Window, WindowOptions } from './Window'
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'

export type BackpackItemInfoOptions = WindowOptions & {
    top: number,
    left: number,
}

export class BackpackItemInfo extends Window<BackpackItemInfoOptions>
{
    protected backpackItem: BackpackItem;

    public getElem(): HTMLElement { return this.contentElem; }

    public constructor(app: ContentApp, backpackItem: BackpackItem, onClose: () => void)
    {
        super(app);
        this.backpackItem = backpackItem;
        this.onClose = onClose;
    }

    protected prepareMakeDom(): void
    {
        super.prepareMakeDom();
        this.style = 'overlay';
        this.guiLayer = ContentApp.LayerWindowContent;
        this.windowCssClasses.push('n3q-backpackiteminfo');
        this.contentCssClasses.push('n3q-itemprops');
        this.withTitlebar = false;
        this.geometryInitstrategy = 'afterContent';

        const offset = Config.get('backpack.itemInfoOffset', { x: 4, y: 4 });
        this.givenOptions.left += offset.x;
        this.givenOptions.top += offset.y;
        this.givenOptions.width = 'content';
        this.givenOptions.height = 'content';
    }

    protected async makeContent(): Promise<void>
    {
        await super.makeContent();
        this.update();
    }

    protected onBeforeClose(): void
    {
        super.onBeforeClose();
        this.contentElem?.remove();
        this.contentElem = null;
    }

    public update(): void
    {
        if (!this.isOpen()) {
            return;
        }
        this.contentElem.innerHTML = '';

        const props = this.backpackItem.getProperties();

        let label = as.String(props[Pid.Label]);
        if (label === '') {
            label = as.String(props[Pid.Template]);
        }
        if (label) {
            const labelElem = domHtmlElemOfHtml(`<div class="n3q-base n3q-title" data-translate="text:ItemLabel">${as.Html(label)}</div>`);
            this.contentElem.append(labelElem);
        }

        const description = as.String(props[Pid.Description]);
        if (description) {
            const descriptionElem = domHtmlElemOfHtml(`<div class="n3q-base n3q-description">${as.Html(description)}</div>`);
            this.contentElem.append(descriptionElem);
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
            this.contentElem.append(listElem);
        }

        const buttonListElem = domHtmlElemOfHtml('<div class="n3q-base n3q-button-list" data-translate="children"></div>');

        if (as.Bool(props[Pid.IsUnrezzedAction]) && as.Bool(props[Pid.ActivatableAspect])) {
            const activateGroup = domHtmlElemOfHtml('<div class="n3q-base n3q-backpack-activate" data-translate="children"></div>');
            const activateLabel = domHtmlElemOfHtml('<span class="n3q-base " data-translate="text:Backpack">Active</div>');
            const activateCheckbox = <HTMLInputElement>domHtmlElemOfHtml(`<input type="checkbox" class="n3q-base n3q-backpack-activate" data-translate="text:Backpack"${as.Bool(props[Pid.ActivatableIsActive]) ? ' checked' : ''}/>`); // Active
            PointerEventDispatcher.makeOpaqueDefaultActionsDispatcher(this.app, activateCheckbox);
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
            PointerEventDispatcher.makeOpaqueDispatcher(this.app, derezBtn).addUnmodifiedLeftclickListener(ev => {
                this.app.derezItem(this.backpackItem.getItemId());
                this.close();
            });
            buttonListElem.append(derezBtn);

            const destination = as.String(props[Pid.RezzedDestination]);
            if (destination) {
                const goBtn = domHtmlElemOfHtml('<div class="n3q-base n3q-button n3q-backpack-go" data-translate="text:Backpack">Go to item</div>');
                PointerEventDispatcher.makeOpaqueDispatcher(this.app, goBtn).addUnmodifiedLeftclickListener(ev => {
                    window.location.assign(destination);
                });
                buttonListElem.append(goBtn);
            }
        } else {
            if (as.Bool(props[Pid.IsRezable], true)) {
                const rezBtn = domHtmlElemOfHtml('<div class="n3q-base n3q-button n3q-backpack-rez" data-translate="text:Backpack">Rez item</div>');
                PointerEventDispatcher.makeOpaqueDispatcher(this.app, rezBtn).addUnmodifiedLeftclickListener(ev => {
                    const rezzedX = as.Int(props[Pid.RezzedX], -1);
                    this.backpackItem.rezItem(rezzedX);
                    this.close();
                });
                buttonListElem.append(rezBtn);
            }
        }

        if (as.Bool(props[Pid.DeletableAspect], true)) {
            const delBtn = domHtmlElemOfHtml('<div class="n3q-base n3q-button n3q-backpack-delete" data-translate="text:Backpack">Delete item</div>');
            PointerEventDispatcher.makeOpaqueDispatcher(this.app, delBtn).addUnmodifiedLeftclickListener(ev => {
                this.app.deleteItemAsk(this.backpackItem.getItemId());
                this.close();
            });
            buttonListElem.append(delBtn);
        }

        if (buttonListElem.children.length > 0) {
            this.contentElem.append(buttonListElem);
        }

        if (Config.get('backpack.itemInfoExtended', false)) {
            this.extend();
        }

        this.app.translateElem(this.contentElem);
    }

    private extend(): void
    {
        this.windowElem.style.maxWidth = '400px';
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
        }
        this.contentElem.append(completeListElem);
    }
}
