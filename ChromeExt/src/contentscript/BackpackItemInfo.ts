import log = require('loglevel');
import { is } from '../lib/is'
import { as } from '../lib/as'
import { BackgroundMessage, BackgroundRequest, PopupDefinition } from '../lib/BackgroundMessage'
import { Config } from '../lib/Config'
import { ItemProperties, Pid } from '../lib/ItemProperties'
import { ContentApp } from './ContentApp'
import { DomUtils } from '../lib/DomUtils'
import { PopupWindow, PopupWindowOptions } from './PopupWindow'
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'
import { Payload } from '../lib/Payload'
import { WeblinClientIframeApi } from '../lib/WeblinClientIframeApi'
import { WeblinClientApi } from '../lib/WeblinClientApi'
import { ItemException } from '../lib/ItemException'
import { ItemExceptionToast } from './Toast'
import { ContentMessage, ContentOpenBackpackItemInfo, ContentSetGuiModeMessage } from '../lib/ContentMessage'

export type BackpackItemInfoOptions = PopupWindowOptions & {
    top: number,
    left: number,
}

export class BackpackItemInfo extends PopupWindow<BackpackItemInfoOptions>
{
    protected readonly itemId: string
    protected itemProperties: Readonly<ItemProperties> = {}
    protected readonly withDebugInfo: boolean
    protected readonly headerContainer: HTMLElement
    protected readonly iframeContainer: HTMLElement
    protected readonly buttonsContainer: HTMLElement
    protected readonly debuginfoContainer: HTMLElement
    protected readonly themesChangeHandler: (themesCss: string) => void
    protected readonly itemUpdateHandler: (item: null|ItemProperties) => void
    protected readonly itemFrameRequestHandler: (request: WeblinClientIframeApi.Request) => void

    protected drawHeader: boolean = true
    protected iframeUrlTpl: string = ''
    protected iframeElem: null|HTMLIFrameElement = null

    public getElem(): HTMLElement { return this.contentElem }

    public constructor(app: ContentApp, itemId: string, withDebugInfo: null|boolean, onClose: () => void)
    {
        super(app)
        this.withUndockButton = false
        this.windowCssClasses.push('backpackiteminfo')
        this.titleText = '{itemLabel}';
        this.titleTextId = 'BackpackItemInfo.Title';
        this.titleTextReplacements.set('{itemLabel}', () => ItemProperties.getLabel(this.itemProperties));
        this.guiLayer = ContentApp.LayerWindowContent
        this.minHeight = 50

        this.itemId = itemId
        this.withDebugInfo = withDebugInfo ?? Config.get('backpack.itemInfoExtended', false)
        this.onClose = onClose
        this.headerContainer = DomUtils.elemOfHtml('<div class="header-container" data-translate="children"></div>')
        this.iframeContainer = DomUtils.elemOfHtml('<div class="iframe-container" data-translate="children"></div>')
        this.buttonsContainer = DomUtils.elemOfHtml('<div class="buttons-container" data-translate="children"></div>')
        this.debuginfoContainer = DomUtils.elemOfHtml('<div class="debuginfo-container" data-translate="children"></div>')
        this.themesChangeHandler = themesCss => this.handleThemesChanged(themesCss)
        this.itemUpdateHandler = item => this.handleItemUpdate(item)
        this.itemFrameRequestHandler = request => this.handleItemInventoryiframeApiRequest(request)
    }

    protected handleItemUpdate(itemProperties: null|ItemProperties): void
    {
        this.itemProperties = itemProperties ?? {}
        if (!this.isOpen()) {
            return
        }
        if (!itemProperties) {
            this.close()
            return
        }
        this.drawHeader = ItemProperties.getInventoryIframeUrl(this.itemProperties).length === 0
        this.updateTitleText()
        this.updateHeader()
        this.updateIframe()
        this.updateButtons()
        this.updateDebugInfo()
        this.sendPropertiesUpdateToIframe()
        this.updateGeometryFromContent()
    }

    protected handleItemInventoryiframeApiRequest(request: WeblinClientIframeApi.Request): void
    {
        if (!this.iframeElem) {
            this.sendResponseToIframe(request, new WeblinClientApi.ErrorResponse('Item inventory iframe not found!'))
            return
        }
        (async () => {
            let response: WeblinClientApi.Response
            switch (request.type) {
                case WeblinClientApi.ClientGetApiRequest.type: {
                    response = await this.app.iframeApi.handle_ClientGetApiRequest(<WeblinClientApi.ClientGetApiRequest>request)
                } break
                case WeblinClientIframeApi.WindowCloseRequest.type: {
                    response = this.handleWindowCloseRequest(<WeblinClientIframeApi.WindowCloseRequest>request)
                } break
                case WeblinClientIframeApi.WindowPositionRequest.type: {
                    response = this.handleWindowPositionRequest(<WeblinClientIframeApi.WindowPositionRequest>request)
                } break
                case WeblinClientIframeApi.ClientBaseCssRequest.type: {
                    response = this.handleClientBaseCssRequest(<WeblinClientIframeApi.ClientBaseCssRequest>request)
                } break
                case WeblinClientIframeApi.ItemGetPropertiesRequest.type: {
                    response = this.handleItemGetPropertiesRequest(<WeblinClientIframeApi.ItemGetPropertiesRequest>request)
                } break
                case WeblinClientIframeApi.ItemActionRequest.type: {
                    response = await this.handleItemActionRequest(<WeblinClientIframeApi.ItemActionRequest>request)
                } break
                case WeblinClientIframeApi.ClientOpenPrivateChatRequest.type: {
                    response = this.handleOpenPrivateChatRequest(<WeblinClientIframeApi.ClientOpenPrivateChatRequest>request);
                } break
                default: {
                    response = new WeblinClientApi.ErrorResponse('Unhandled request: ' + request.type)
                } break
            }
            this.sendResponseToIframe(request, response)
        })().catch(error => {
            this.app.onError(error)
            this.sendResponseToIframe(request, new WeblinClientApi.ErrorResponse(error))
        })
    }

    protected makeUndockPopupDefinition(): PopupDefinition
    {
        const itemId: string = this.itemId
        const popupId = `BackpackItemInfo:${itemId}`
        const setGuiRequest: ContentSetGuiModeMessage = {
            type: ContentMessage.type_setGuiMode, mode: 'popupWindow',
        }
        const openImRequest: ContentOpenBackpackItemInfo = {
            type: ContentMessage.type_openBackpackItemInfo, itemId, withDebugInfo: this.withDebugInfo,
        }
        const startupRequests: BackgroundRequest[] = [setGuiRequest, openImRequest]
        const startupRequestsArg = encodeURIComponent(JSON.stringify(startupRequests))
        const popupDefinition: PopupDefinition = {
            id: popupId,
            url: '/assets/popupApp.html?startupRequests=' + startupRequestsArg,
            top: Config.get('backpackItemInfo.undockedTop', 100),
            left: Config.get('backpackItemInfo.undockedLeft', 100),
            height: Config.get('backpackItemInfo.undockedHeight', 400),
            width: Config.get('backpackItemInfo.undockedWidth', 600),
            allowContentApp: true,
        }
        return popupDefinition
    }

    protected handleThemesChanged(themesCss: string): void
    {
        if (!this.iframeElem) {
            return
        }
        const notification = new WeblinClientIframeApi.ClientThemeCssNotification(themesCss)
        this.sendMessageToIframe(notification);
    }

    protected sendPropertiesUpdateToIframe(): void
    {
        if (!this.iframeElem) {
            return
        }
        const itemId = this.itemId
        const props = this.itemProperties
        const notification = new WeblinClientIframeApi.ItemPropertiesChangedNotification(itemId, props)
        this.sendMessageToIframe(notification);
    }

    protected sendResponseToIframe(request: WeblinClientIframeApi.Request, response: WeblinClientApi.Response): void
    {
        const isRequest = !is.nil(request.id)
        if (!isRequest && response.ok) {
            return
        }
        if (isRequest) {
            response['id'] = request.id
        }
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

    protected handleClientBaseCssRequest(_request: WeblinClientIframeApi.ClientBaseCssRequest): WeblinClientApi.Response
    {
        this.handleThemesChanged(this.app.themeManager.getEnabledThemesCss())
        return new WeblinClientIframeApi.ClientBaseCssResponse(this.app.display.getBaseCss())
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
        this.app.instantMessageManager.openInstantMessagesWindow(userId);
        return new WeblinClientApi.SuccessResponse()
    }

    protected handleItemGetPropertiesRequest(request: WeblinClientIframeApi.ItemGetPropertiesRequest): WeblinClientApi.Response
    {
        const propsFiltered = ItemProperties.getStrings(this.itemProperties, request.pids)
        return new WeblinClientIframeApi.ItemGetPropertiesResponse(propsFiltered)
    }

    protected async handleItemActionRequest(request: WeblinClientIframeApi.ItemActionRequest): Promise<WeblinClientApi.Response>
    {
        const itemId = this.itemId
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
        const offset = Config.get('backpack.itemInfoOffset', { x: 4, y: 4 })
        this.givenOptions.left += offset.x
        this.givenOptions.top += offset.y
    }

    protected async makeContent(): Promise<void>
    {
        await super.makeContent()
        this.contentElem.append(this.headerContainer)
        this.contentElem.append(this.iframeContainer)
        this.contentElem.append(this.buttonsContainer)
        this.contentElem.append(this.debuginfoContainer)
        this.app.themeManager.themesChangedListeners.addListener(this.themesChangeHandler)
        this.app.ownItems.itemUpdateListeners.addListener(this.itemId, this.itemUpdateHandler)
        this.app.iframeApi.iframeApiRequestListeners.addListener(this.itemId, this.itemFrameRequestHandler)
        this.handleItemUpdate(this.app.ownItems.getItemById(this.itemId))
    }

    protected onBeforeClose(): void
    {
        this.app.iframeApi.iframeApiRequestListeners.removeListener(this.itemId, this.itemFrameRequestHandler)
        this.app.ownItems.itemUpdateListeners.removeListener(this.itemId, this.itemUpdateHandler)
        this.app.themeManager.themesChangedListeners.removeListener(this.themesChangeHandler)
        super.onBeforeClose()
    }

    protected updateGeometryFromContent(): void
    {
        DomUtils.execOnNextRenderComplete(() => DomUtils.execOnNextRenderComplete(() => {
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
            const [extraWidth, extraHeight] = this.getContentSizeOffsets()
            width += extraWidth
            height += extraHeight
            const left = this.geometry.left
            const bottom = this.geometry.bottom + this.geometry.height - height
            this.setGeometry({ left, bottom, width, height })
        }))
    }

    protected updateHeader(): void
    {
        this.headerContainer.innerHTML = ''
        DomUtils.setElemClassPresent(this.headerContainer, 'removed', !this.drawHeader)
        if (!this.drawHeader) {
            return
        }
        const props = this.itemProperties

        let label = as.String(props[Pid.Label])
        if (label === '') {
            label = as.String(props[Pid.Template])
        }
        if (label) {
            const labelElem = DomUtils.elemOfHtml(`<div class="title" data-translate="text:ItemLabel">${as.Html(label)}</div>`)
            this.headerContainer.append(labelElem)
        }

        const description = as.String(props[Pid.Description])
        if (description) {
            const descriptionElem = DomUtils.elemOfHtml(`<div class="description">${as.Html(description)}</div>`)
            this.headerContainer.append(descriptionElem)
        }

        const displayProps = ItemProperties.getDisplay(props)
        if (as.Bool(props[Pid.IsRezzed])) {
            displayProps[Pid.IsRezzed] = props[Pid.IsRezzed]
            displayProps[Pid.RezzedDestination] = props[Pid.RezzedDestination]
        }
        const listElem = DomUtils.elemOfHtml('<div class="itemprops" data-translate="children"></div>')
        let hasStats = false
        for (const [pid, value] of Object.entries(displayProps).filter(([_, value]) => is.nonEmptyString(value))) {
            let value = displayProps[pid]
            hasStats = true

            if (pid === Pid.RezzedDestination) {
                if (value.startsWith('http://')) { value = value.substring('http://'.length) }
                if (value.startsWith('https://')) { value = value.substring('https://'.length) }
                if (value.startsWith('www.')) { value = value.substring('www.'.length) }
            }

            listElem.append(DomUtils.elemOfHtml(`<span class="label" data-translate="text:ItemPid">${as.Html(pid)}</span>`));
            listElem.append(DomUtils.elemOfHtml(`<span class="value" data-translate="text:ItemValue" title="${as.Html(value)}">${as.Html(value)}</span>`));
        }
        if (hasStats) {
            this.headerContainer.append(listElem)
        }
        this.app.translateElem(this.headerContainer)
    }

    protected updateIframe(): void
    {
        const itemProps = this.itemProperties
        const iframeUrlTpl = ItemProperties.getInventoryIframeUrl(itemProps)
        if (iframeUrlTpl === this.iframeUrlTpl) {
            // Iframe content takes care of updating itself.
            return
        }
        this.iframeUrlTpl = iframeUrlTpl

        this.iframeElem?.remove()
        this.iframeElem = null
        const isEmpty = iframeUrlTpl.length === 0
        DomUtils.setElemClassPresent(this.iframeContainer, 'hidden', isEmpty)
        if (isEmpty) {
            return
        }

        const userId = this.app.getUserId()
        const langId = this.app.getLanguage()
        const itemId = this.itemId
        const iframeUrl = Payload.makeItemIframeUrl(userId, langId, null, null, itemId, itemProps, iframeUrlTpl);
        const iframeUrlWrapped = this.app.uiHelper.getWrappedIframeUrl(iframeUrl);
        this.iframeElem = <HTMLIFrameElement> DomUtils.elemOfHtml(`<iframe src="${iframeUrlWrapped}"></iframe>`)
        this.iframeContainer.append(this.iframeElem)
    }

    protected updateButtons(): void
    {
        this.buttonsContainer.innerHTML = ''
        const itemId = this.itemId
        const props = this.itemProperties

        if (as.Bool(props[Pid.IsUnrezzedAction]) && as.Bool(props[Pid.ActivatableAspect])) {
            const activateGroup = DomUtils.elemOfHtml('<div class="item-active" data-translate="children"></div>')
            const activateLabel = DomUtils.elemOfHtml('<span class="" data-translate="text:Backpack">Active</div>')
            const activateCheckbox = <HTMLInputElement>DomUtils.elemOfHtml(`<input type="checkbox" class="item-active-checkbox" data-translate="text:Backpack"${as.Bool(props[Pid.ActivatableIsActive]) ? ' checked' : ''}/>`) // Active
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
            this.buttonsContainer.append(activateGroup)
        }

        if (as.Bool(props[Pid.IsRezzed])) {
            const derezBtn = this.app.uiHelper.makeDefaultTextButton('derez-button', 'Backpack.Derez item', 'Derez item', () => {
                this.app.derezItem(itemId)
                this.close()
            })
            this.buttonsContainer.append(derezBtn)

            const destination = as.String(props[Pid.RezzedDestination])
            if (destination) {
                const goBtn = this.app.uiHelper.makeDefaultTextButton('navigate-to-item-button', 'Backpack.Go to item', 'Go to item', () => {
                    window.location.assign(destination)
                })
                this.buttonsContainer.append(goBtn)
            }
        } else {
            if (as.Bool(props[Pid.IsRezable], true)) {
                const rezBtn = this.app.uiHelper.makeDefaultTextButton('rez-button', 'Backpack.Rez item', 'Rez item', () => {
                    const rezzedX = as.Int(props[Pid.RezzedX], -1);
                    this.app.rezItemInCurrentRoom(props[Pid.Id], rezzedX);
                    this.close();
                });
                this.buttonsContainer.append(rezBtn);
            }
        }

        if (as.Bool(props[Pid.DeletableAspect], true)) {
            const delBtn = this.app.uiHelper.makeDefaultTextButton('delete-button', 'Backpack.Delete item', 'Delete item', () => {
                this.app.deleteItemAsk(itemId)
                this.close()
            })
            this.buttonsContainer.append(delBtn)
        }

        this.app.translateElem(this.buttonsContainer)
    }

    protected updateDebugInfo(): void
    {
        this.debuginfoContainer.innerHTML = ''
        DomUtils.setElemClassPresent(this.debuginfoContainer, 'removed', !this.withDebugInfo)
        if (!this.withDebugInfo) {
            return
        }
        const props = this.itemProperties
        const listElem = DomUtils.elemOfHtml('<div class="itemprops" data-translate="children"></div>')
        for (const pid of Object.keys(props).sort()) {
            const value = props[pid]
            listElem.append(DomUtils.elemOfHtml(`<span class="label" data-translate="text:ItemPid">${as.Html(pid)}</span>`));
            listElem.append(DomUtils.elemOfHtml(`<span class="value" data-translate="text:ItemValue" title="${as.Html(value)}">${as.Html(value)}</span>`));
        }
        this.debuginfoContainer.append(listElem)
        this.app.translateElem(this.debuginfoContainer)
    }
}
