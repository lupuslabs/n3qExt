import { as } from '../lib/as'
import { BackgroundMessage } from '../lib/BackgroundMessage'
import { Config } from '../lib/Config'
import { is } from '../lib/is'
import { ItemProperties, Pid } from '../lib/ItemProperties'
import { BackpackItem } from './BackpackItem'
import { ContentApp } from './ContentApp'
import { DomUtils } from '../lib/DomUtils'
import { Window, WindowOptions } from './Window'
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'

export type BackpackItemInfoOptions = WindowOptions & {
    top: number,
    left: number,
}

export class BackpackItemInfo extends Window<BackpackItemInfoOptions>
{
    protected readonly backpackItem: BackpackItem
    protected readonly headerContainer: HTMLElement
    protected readonly buttonsContainer: HTMLElement
    protected readonly debuginfoContainer: HTMLElement

    protected drawHeader: boolean = true

    public getElem(): HTMLElement { return this.contentElem }

    public constructor(app: ContentApp, backpackItem: BackpackItem, onClose: () => void)
    {
        super(app)
        this.backpackItem = backpackItem
        this.onClose = onClose
        this.headerContainer = DomUtils.elemOfHtml('<div class="header-container" data-translate="children"></div>')
        this.buttonsContainer = DomUtils.elemOfHtml('<div class="buttons-container" data-translate="children"></div>')
        this.debuginfoContainer = DomUtils.elemOfHtml('<div class="debuginfo-container" data-translate="children"></div>')
    }

    public update(): void
    {
        if (!this.isOpen()) {
            return
        }
        this.drawHeader = ItemProperties.getInventoryIframeUrl(this.backpackItem.getProperties()).length === 0
        this.updateHeader()
        this.updateButtons()
        this.updateDebugInfo()
    }

    protected prepareMakeDom(): void
    {
        super.prepareMakeDom()
        this.style = 'overlay'
        this.guiLayer = ContentApp.LayerWindowContent
        this.windowCssClasses.push('n3q-backpackiteminfo')
        this.contentCssClasses.push('n3q-itemprops')
        this.withTitlebar = false
        this.geometryInitstrategy = 'afterContent'

        const offset = Config.get('backpack.itemInfoOffset', { x: 4, y: 4 })
        this.givenOptions.left += offset.x
        this.givenOptions.top += offset.y
        this.givenOptions.width = 'content'
        this.givenOptions.height = 'content'
    }

    protected async makeContent(): Promise<void>
    {
        await super.makeContent()
        this.contentElem.append(this.headerContainer)
        this.contentElem.append(this.buttonsContainer)
        this.contentElem.append(this.debuginfoContainer)
        this.update()
    }

    protected onBeforeClose(): void
    {
        super.onBeforeClose()
    }

    protected updateHeader(): void
    {
        this.headerContainer.innerHTML = ''
        if (!this.drawHeader) {
            return
        }
        const props = this.backpackItem.getProperties()

        let label = as.String(props[Pid.Label])
        if (label === '') {
            label = as.String(props[Pid.Template])
        }
        if (label) {
            const labelElem = DomUtils.elemOfHtml(`<div class="n3q-base n3q-title" data-translate="text:ItemLabel">${as.Html(label)}</div>`)
            this.headerContainer.append(labelElem)
        }

        const description = as.String(props[Pid.Description])
        if (description) {
            const descriptionElem = DomUtils.elemOfHtml(`<div class="n3q-base n3q-description">${as.Html(description)}</div>`)
            this.headerContainer.append(descriptionElem)
        }

        const display = ItemProperties.getDisplay(props)
        if (as.Bool(props[Pid.IsRezzed])) {
            display[Pid.IsRezzed] = props[Pid.IsRezzed]
            display[Pid.RezzedDestination] = props[Pid.RezzedDestination]
        }
        const listElem = DomUtils.elemOfHtml('<div class="n3q-base n3q-itemprops-list" data-translate="children"></div>')
        let hasStats = false
        for (const pid in display) {
            let value = display[pid]
            if (!is.nil(value)) {
                hasStats = true

                if (pid === Pid.RezzedDestination) {
                    if (value.startsWith('http://')) { value = value.substr('http://'.length) }
                    if (value.startsWith('https://')) { value = value.substr('https://'.length) }
                    if (value.startsWith('www.')) { value = value.substr('www.'.length) }
                }

                let lineElem = null
                lineElem = DomUtils.elemOfHtml(''
                    + '<div class="n3q-base n3q-itemprops-line" data-translate="children" > '
                    + `<span class="n3q-base n3q-itemprops-key" data-translate="text:ItemPid">${as.Html(pid)}</span>`
                    + `<span class="n3q-base n3q-itemprops-value" data-translate="text:ItemValue" title="${as.Html(value)}">${as.Html(value)}</span>`
                    + '</div>')
                listElem.append(lineElem)
            }
        }
        if (hasStats) {
            this.headerContainer.append(listElem)
        }
        this.app.translateElem(this.headerContainer)
    }

    protected updateButtons(): void
    {
        this.buttonsContainer.innerHTML = ''
        const itemId = this.backpackItem.getItemId()
        const props = this.backpackItem.getProperties()

        const buttonListElem = DomUtils.elemOfHtml('<div class="n3q-base n3q-button-list" data-translate="children"></div>')

        if (as.Bool(props[Pid.IsUnrezzedAction]) && as.Bool(props[Pid.ActivatableAspect])) {
            const activateGroup = DomUtils.elemOfHtml('<div class="n3q-base n3q-backpack-activate" data-translate="children"></div>')
            const activateLabel = DomUtils.elemOfHtml('<span class="n3q-base " data-translate="text:Backpack">Active</div>')
            const activateCheckbox = <HTMLInputElement>DomUtils.elemOfHtml(`<input type="checkbox" class="n3q-base n3q-backpack-activate" data-translate="text:Backpack"${as.Bool(props[Pid.ActivatableIsActive]) ? ' checked' : ''}/>`) // Active
            PointerEventDispatcher.makeOpaqueDefaultActionsDispatcher(this.app, activateCheckbox)
            activateCheckbox.addEventListener('change', ev =>
            {
                ev.stopPropagation();
                (async () =>
                {
                    const isChecked = activateCheckbox.checked
                    await BackgroundMessage.executeBackpackItemAction(itemId, 'Activatable.SetState', { 'Value': isChecked }, [itemId])

                    if (as.Bool(props[Pid.AvatarAspect]) || as.Bool(props[Pid.NicknameAspect])) {
                        this.app.getRoom()?.sendPresence()
                    }
                })().catch(error => this.app.onError(error))
            })
            activateGroup.append(activateLabel)
            activateGroup.append(activateCheckbox)
            buttonListElem.append(activateGroup)
        }

        if (as.Bool(props[Pid.IsRezzed])) {
            const derezBtn = DomUtils.elemOfHtml('<div class="n3q-base n3q-button n3q-backpack-derez" data-translate="text:Backpack">Derez item</div>')
            PointerEventDispatcher.makeOpaqueDispatcher(this.app, derezBtn).addUnmodifiedLeftClickListener(ev => {
                this.app.derezItem(itemId)
                this.close()
            })
            buttonListElem.append(derezBtn)

            const destination = as.String(props[Pid.RezzedDestination])
            if (destination) {
                const goBtn = DomUtils.elemOfHtml('<div class="n3q-base n3q-button n3q-backpack-go" data-translate="text:Backpack">Go to item</div>')
                PointerEventDispatcher.makeOpaqueDispatcher(this.app, goBtn).addUnmodifiedLeftClickListener(ev => {
                    window.location.assign(destination)
                })
                buttonListElem.append(goBtn)
            }
        } else {
            if (as.Bool(props[Pid.IsRezable], true)) {
                const rezBtn = DomUtils.elemOfHtml('<div class="n3q-base n3q-button n3q-backpack-rez" data-translate="text:Backpack">Rez item</div>')
                PointerEventDispatcher.makeOpaqueDispatcher(this.app, rezBtn).addUnmodifiedLeftClickListener(ev => {
                    const rezzedX = as.Int(props[Pid.RezzedX], -1);
                    this.app.rezItemInCurrentRoom(props[Pid.Id], rezzedX);
                    this.close();
                });
                buttonListElem.append(rezBtn);
            }
        }

        if (as.Bool(props[Pid.DeletableAspect], true)) {
            const delBtn = DomUtils.elemOfHtml('<div class="n3q-base n3q-button n3q-backpack-delete" data-translate="text:Backpack">Delete item</div>')
            PointerEventDispatcher.makeOpaqueDispatcher(this.app, delBtn).addUnmodifiedLeftClickListener(ev => {
                this.app.deleteItemAsk(itemId)
                this.close()
            })
            buttonListElem.append(delBtn)
        }

        if (buttonListElem.children.length > 0) {
            this.buttonsContainer.append(buttonListElem)
        }
        this.app.translateElem(this.buttonsContainer)
    }

    protected updateDebugInfo(): void
    {
        this.debuginfoContainer.innerHTML = ''
        if (!Config.get('backpack.itemInfoExtended', false)) {
            return
        }
        const props = this.backpackItem.getProperties()

        this.windowElem.style.maxWidth = '400px'

        let keys = []
        for (const pid in props) { keys.push(pid) }
        keys = keys.sort()

        const completeListElem = DomUtils.elemOfHtml('<div class="n3q-base n3q-itemprops-list" data-translate="children"></div>')
        for (const pid of keys) {
            const value = props[pid]
            const lineElem = DomUtils.elemOfHtml(''
                + '<div class="n3q-base n3q-itemprops-line">'
                + `<span class="n3q-base n3q-itemprops-key">${as.Html(pid)}</span>`
                + `<span class="n3q-base n3q-itemprops-value" title="${as.Html(value)}">${as.Html(value)}</span>`
                + '</div>')
            completeListElem.append(lineElem)
        }
        this.debuginfoContainer.append(completeListElem)

        this.app.translateElem(this.debuginfoContainer)
    }
}
