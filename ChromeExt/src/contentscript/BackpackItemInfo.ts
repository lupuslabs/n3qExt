import log = require('loglevel');
import { is } from '../lib/is'
import { as } from '../lib/as'
import { BackgroundMessage } from '../lib/BackgroundMessage'
import { Config } from '../lib/Config'
import { ItemProperties, Pid } from '../lib/ItemProperties'
import { BackpackItem } from './BackpackItem'
import { ContentApp } from './ContentApp'
import { DomUtils } from '../lib/DomUtils'
import { Window, WindowOptions } from './Window'
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'
import { Payload } from '../lib/Payload'
import { WeblinClientIframeApi } from '../lib/WeblinClientIframeApi'
import { WeblinClientApi } from '../lib/WeblinClientApi'
import { ItemException } from '../lib/ItemException'
import { ItemExceptionToast } from './Toast'

export type BackpackItemInfoOptions = WindowOptions & {
    top: number,
    left: number,
}

export class BackpackItemInfo extends Window<BackpackItemInfoOptions>
{
    protected readonly backpackItem: BackpackItem
    protected readonly contentPaddingWrapper: HTMLElement
    protected readonly headerContainer: HTMLElement
    protected readonly iframeContainer: HTMLElement
    protected readonly buttonsContainer: HTMLElement
    protected readonly debuginfoContainer: HTMLElement

    protected drawHeader: boolean = true
    protected iframeUrlTpl: string = ''
    protected iframeElem: null|HTMLIFrameElement = null

    public getElem(): HTMLElement { return this.contentElem }

    public constructor(app: ContentApp, backpackItem: BackpackItem, onClose: () => void)
    {
        super(app)
        this.backpackItem = backpackItem
        this.onClose = onClose
        this.contentPaddingWrapper = DomUtils.elemOfHtml('<div class="n3q-itemprops" data-translate="children"></div>')
        this.headerContainer = DomUtils.elemOfHtml('<div class="header-container" data-translate="children"></div>')
        this.iframeContainer = DomUtils.elemOfHtml('<div class="iframe-container" data-translate="children"></div>')
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
        this.updateIframe()
        this.updateButtons()
        this.updateDebugInfo()
        this.sendPropertiesUpdateToIframe()
        this.updateGeometryFromContent()
    }

    public handleItemInventoryiframeApiRequest(request: WeblinClientIframeApi.Request): void
    {
        if (!this.iframeElem) {
            this.sendResponseToIframe(request, new WeblinClientApi.ErrorResponse('Item inventory iframe not found!'))
            return
        }
        (async () => {
            let response: WeblinClientApi.Response
            switch (request.type) {
                case WeblinClientIframeApi.WindowCloseRequest.type: {
                    response = this.handleWindowCloseRequest(<WeblinClientIframeApi.WindowCloseRequest>request)
                } break;
                case WeblinClientIframeApi.WindowPositionRequest.type: {
                    response = this.handleWindowPositionRequest(<WeblinClientIframeApi.WindowPositionRequest>request)
                } break;
                case WeblinClientIframeApi.ItemGetPropertiesRequest.type: {
                    response = this.handleItemGetPropertiesRequest(<WeblinClientIframeApi.ItemGetPropertiesRequest>request)
                } break;
                case WeblinClientIframeApi.ItemActionRequest.type: {
                    response = await this.handleItemActionRequest(<WeblinClientIframeApi.ItemActionRequest>request)
                } break;
                case WeblinClientIframeApi.ClientOpenPrivateChatRequest.type: {
                    response = this.handleOpenPrivateChatRequest(<WeblinClientIframeApi.ClientOpenPrivateChatRequest>request);
                } break;
                default: {
                    response = new WeblinClientApi.ErrorResponse('Unhandled request: ' + request.type)
                } break;
            }
            this.sendResponseToIframe(request, response)
        })().catch(error => {
            this.app.onError(error)
            this.sendResponseToIframe(request, new WeblinClientApi.ErrorResponse(error))
        })
    }

    protected sendPropertiesUpdateToIframe(): void
    {
        if (!this.iframeElem) {
            return
        }
        const itemId = this.backpackItem.getItemId()
        const props = this.backpackItem.getProperties()
        const notification = new WeblinClientIframeApi.ItemPropertiesChangedNotification(itemId, props)
        this.sendMessageToIframe(notification);
    }

    protected sendResponseToIframe(request: WeblinClientIframeApi.Request, response: WeblinClientApi.Message): void
    {
        response['id'] = request.id;
        this.sendMessageToIframe(response)
    }

    protected sendMessageToIframe(message: WeblinClientApi.Message): void
    {
        if (!this.iframeElem) {
            return
        }
        message[Config.get('iframeApi.messageMagicRezactive', 'tr67rftghg_Rezactive')] = true
        this.iframeElem?.contentWindow?.postMessage(message, '*')
    }

    protected handleWindowCloseRequest(_request: WeblinClientIframeApi.WindowCloseRequest): WeblinClientApi.Response
    {
        this.close()
        return new WeblinClientApi.SuccessResponse()
    }

    protected handleWindowPositionRequest(request: WeblinClientIframeApi.WindowPositionRequest): WeblinClientApi.Response
    {
        this.iframeElem.style.width = `${request.width}px`
        this.iframeElem.style.height = `${request.height}px`
        this.updateGeometryFromContent()
        return new WeblinClientApi.SuccessResponse()
    }

    protected handleOpenPrivateChatRequest(request: WeblinClientIframeApi.ClientOpenPrivateChatRequest): WeblinClientApi.Response
    {
        const userId = as.String(request.userId);
        this.app.getInstantMessageManager().openInstantMessagesWindow(userId);
        return new WeblinClientApi.SuccessResponse()
    }

    protected handleItemGetPropertiesRequest(request: WeblinClientIframeApi.ItemGetPropertiesRequest): WeblinClientApi.Response
    {
        const props = this.backpackItem.getProperties()
        const propsFiltered = ItemProperties.getStrings(props, request.pids)
        return new WeblinClientIframeApi.ItemGetPropertiesResponse(propsFiltered)
    }

    protected async handleItemActionRequest(request: WeblinClientIframeApi.ItemActionRequest): Promise<WeblinClientApi.Response>
    {
        const itemId = this.backpackItem.getItemId();
        const actionName = request.action;
        const args = request.args;
        const involvedIds = [itemId];
        try {
            const result = await BackgroundMessage.executeBackpackItemAction(itemId, actionName, args, involvedIds);
            return new WeblinClientIframeApi.ItemActionResponse(result);
        } catch (error) {
            const fact = ItemException.factFrom(error.fact);
            const reason = ItemException.reasonFrom(error.reason);
            const detail = as.String(error.detail, error.message);
            const ex = new ItemException(fact, reason, detail);
            if (request.ignoreError) {
                log.info('IframeApi.handle_ItemActionRequest', error);
            } else {
                new ItemExceptionToast(this.app, Config.get('room.errorToastDurationSec', 8), ex).show();
            }
            return new WeblinClientIframeApi.ItemErrorResponse(ItemException.fact2String(fact), ItemException.reason2String(reason), detail);
        }
    }

    protected prepareMakeDom(): void
    {
        super.prepareMakeDom()
        this.style = 'overlay'
        this.guiLayer = ContentApp.LayerWindowContent
        this.windowCssClasses.push('n3q-backpackiteminfo')
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
        this.contentElem.append(this.contentPaddingWrapper)
        this.contentPaddingWrapper.append(this.headerContainer)
        this.contentPaddingWrapper.append(this.iframeContainer)
        this.contentPaddingWrapper.append(this.buttonsContainer)
        this.contentPaddingWrapper.append(this.debuginfoContainer)
        this.update()
    }

    protected onBeforeClose(): void
    {
        super.onBeforeClose()
    }

    protected updateGeometryFromContent(): void
    {
        DomUtils.execOnNextRenderComplete(() => {
            if (!this.isOpen()) {
                return
            }
            let height = 0
            let width = 0
            for (const elem of this.contentElem.children) {
                const elemRect = elem.getBoundingClientRect()
                width = Math.max(width, elemRect.width)
                height += elemRect.height
            }
            const left = this.geometry.left
            const bottom = this.geometry.bottom + this.geometry.height - height
            this.setGeometry({ left, bottom, width, height })
        })
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

    protected updateIframe(): void
    {
        const itemProps = this.backpackItem.getProperties()
        const iframeUrlTpl = ItemProperties.getInventoryIframeUrl(itemProps)
        if (iframeUrlTpl === this.iframeUrlTpl) {
            // Iframe content takes care of updating itself.
            return
        }
        this.iframeUrlTpl = iframeUrlTpl

        this.iframeElem?.remove()
        this.iframeElem = null
        if (iframeUrlTpl.length === 0) {
            return
        }

        const userId = this.app.getUserId()
        const langId = this.app.getLanguage()
        const itemId = this.backpackItem.getItemId()
        const iframeUrl = Payload.makeItemIframeUrl(userId, langId, null, null, itemId, itemProps, iframeUrlTpl);
        const iframeUrlWrapped = this.app.getWrappedIframeUrl(iframeUrl);
        this.iframeElem = <HTMLIFrameElement> DomUtils.elemOfHtml(`<iframe src="${iframeUrlWrapped}"></iframe>`)
        this.iframeContainer.append(this.iframeElem)
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
