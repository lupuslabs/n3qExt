import { is } from '../lib/is'
import { BoxEdgeMovements, dummyLeftBottomRect, LeftBottomRect, Utils } from '../lib/Utils'
import { ContentApp, WindowStyle } from './ContentApp'
import { Memory } from '../lib/Memory'
import { DomUtils } from '../lib/DomUtils'
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'
import { PointerEventData } from '../lib/PointerEventData'
import { as } from '../lib/as'
import { Config } from '../lib/Config'
import { Environment } from '../lib/Environment'
import * as windowUndockIconDataUrl from '../assets/icons/clarity_pop-out-line.svg'
import { BackgroundMessage, PopupDefinition } from '../lib/BackgroundMessage'

export type WindowBaseOptions = {
    onClose?:      () => void,
    closeIsHide?:  string|boolean,
    hidden?:       boolean,
    above?:        DOMRect|HTMLElement, // Used when left and center and/or bottom unset.
    aboveYOffset?: string|number, // Added to above's top when bottom unset.
    width?:        'content'|string|number,
    height?:       'content'|string|number,
    top?:          string|number,
    bottom?:       string|number,
    left?:         string|number,
    center?:       string|number, // Used when left unset.
    undockable?:   boolean, // Makes window non-undockable when set to false.
    undocked?:     boolean, // Undocks instead of showing when show is called and window is undockable.
}

export type WindowGeometryInitStrategy = 'beforeContent'|'afterContent'|'none'

export type WindowSizingMode = 'normal' | 'maximized';

export abstract class WindowBase<OptionsType extends WindowBaseOptions>
{
    protected readonly app: ContentApp
    protected onClose: null|(() => void) = null
    protected readonly viewportVisibleListener: () => void
    protected readonly viewportInvisibleListener: () => void
    protected readonly viewportResizeListener: () => void

    protected style: WindowStyle = 'overlay'
    protected guiLayer: number|string = ContentApp.LayerWindow
    protected sizingMode: WindowSizingMode = 'normal'
    protected windowCssClasses: string[] = []

    protected windowSettingsId: string = 'Default'
    protected persistGeometry: boolean = false

    protected showHidden: boolean = false
    protected closeIsHide: boolean = false

    protected withCloseButton: boolean = false
    protected withUndockButton: boolean = true
    protected withTitlebar: boolean = false
    protected withPageTitle: boolean = false
    protected withActionbar: boolean = false

    protected isMovable: boolean = false
    protected isResizable: boolean = false
    protected geometryInitstrategy: WindowGeometryInitStrategy = 'beforeContent'

    protected titleText: string = ''
    protected titleTextId: null|string = null
    protected titleTextReplacements: Map<string, () => string> = new Map()

    protected containerMarginTop: number = 0
    protected containerMarginRight: number = 0
    protected containerMarginBottom: number = 0
    protected containerMarginLeft: number = 0
    protected minWidth: number = 180
    protected minHeight: number = 100
    protected defaultWidth: 'content'|number = 180
    protected defaultHeight: 'content'|number = 100
    protected defaultBottom: number = 10
    protected defaultAboveBottomOffset: number = 10 // Only used when bottom derived from givenOptions.above and givenOptions.bottomOffset not given.
    protected defaultLeft: number = 10

    protected givenOptions: null|OptionsType = null

    protected containerElem: null|HTMLElement = null
    protected windowElem: null|HTMLElement = null
    protected windowRowsElem: null|HTMLElement = null
    protected windowElemPointerDispatcher: null|PointerEventDispatcher = null
    protected windowButtonsElem: null|HTMLElement = null
    protected titlebarElem: null|HTMLElement = null
    protected actionbarElem: null|HTMLElement = null
    protected contentElem: null|HTMLElement = null

    protected geometry: LeftBottomRect = dummyLeftBottomRect
    protected geometryAtActionStart: LeftBottomRect = dummyLeftBottomRect // For move and resize.
    protected isShowing: boolean = false
    protected isClosing: boolean = false

    public constructor(app: ContentApp)
    {
        this.app = app
        this.viewportVisibleListener = () => this.onViewportVisible()
        this.viewportInvisibleListener = () => this.onViewportInvisible()
        this.viewportResizeListener = () => this.onViewportResize()
    }

    public show(options: OptionsType): void
    {
        if (this.isOpen()) {
            return
        }
        this.givenOptions = options
        this.isShowing = true
        const inExclusiveWindowPopup = this.app.getIsExclusiveWindowPopup()
        const mayBeExlusiveWindow = inExclusiveWindowPopup && !!this.makeCheckedUndockPopupDefinition()
        let isExlusiveWindow = false

        try {
            this.prepareMakeDom()
            if (as.Bool(this.givenOptions.undocked)) {
                this.isClosing = this.undock()
            } else if (mayBeExlusiveWindow) {
                isExlusiveWindow = this.app.setExclusiveWindowId(this.windowSettingsId)
                if (!isExlusiveWindow) {
                    this.isClosing = this.undock()
                }
            }
        } catch (error) {
            this.app.onError(error)
            this.isClosing = true
        }
        if (this.isClosing) {
            this.isClosing = false
            this.isShowing = false
            this.close()
            return
        }

        if (isExlusiveWindow) {
            this.sizingMode = 'maximized'
            this.withPageTitle = true
            this.withTitlebar = false
            this.withCloseButton = false
            this.withUndockButton = false
            this.isMovable = false
            this.isResizable = false
            this.geometryInitstrategy = 'beforeContent'
            this.persistGeometry = false
        }

        (async () => {
            this.makeWindowFrameAndDecorations()
            this.windowElem.classList.add('hidden')
            this.app.translateElem(this.windowElem)
            if (this.geometryInitstrategy === 'beforeContent') {
                await DomUtils.waitForRenderComplete() // Wait for frame having dimensions in DOM.
                await this.initGeometry() // Need to wait for it so makeContent can use geometry.
            }
            this.toFront()
            this.containerElem.append(this.windowElem)
            await this.makeContent()
            this.app.translateElem(this.contentElem)
            await DomUtils.waitForRenderComplete() // Wait for window content having dimensions in DOM.
            if (this.geometryInitstrategy === 'afterContent') {
                await this.initGeometry()
            }
            if (!this.isClosing && !(this.givenOptions.hidden ?? this.showHidden)) {
                this.setVisibility(true)
            }
            if (!this.isClosing) {
                this.onBeforeShowDone()
            }
        })().catch(error => {
            this.app.onError(error)
            this.isClosing = true
        }).then(() => {
            this.isShowing = false
            if (this.isClosing) {
                this.isClosing = false
                this.close()
            }
        })
    }

    /**
     * Called before window DOM elements are created.
     *
     * - Fill this.titleText with translated title in inheriting classes.
     */
    protected prepareMakeDom(): void
    {
        this.onClose = this.givenOptions.onClose ?? this.onClose
        this.containerElem = this.app.getDisplay()
        if (!this.containerElem) {
            throw new Error('Window.show: Display not ready!')
        }
        this.closeIsHide = as.Bool(this.givenOptions.closeIsHide, this.closeIsHide)
        this.containerMarginTop    = as.Int(Config.get('system.windowContainerMarginTop'), 0)
        this.containerMarginRight  = as.Int(Config.get('system.windowContainerMarginRight'), 0)
        this.containerMarginBottom = as.Int(Config.get('system.windowContainerMarginBottom'), 0)
        this.containerMarginLeft   = as.Int(Config.get('system.windowContainerMarginLeft'), 0)
    }

    protected makeWindowFrameAndDecorations(): void
    {
        this.windowElem = DomUtils.elemOfHtml(`<div data-translate="children"></div>`)
        this.windowElem.classList.add('window', `window-style-${this.style}`, `window-sizing-${this.sizingMode}`, ...this.windowCssClasses)
        this.windowElem.addEventListener('pointerdown', ev => this.onCapturePhasePointerDownInside(ev), { capture: true })
        this.windowElemPointerDispatcher = PointerEventDispatcher.makeOpaqueDefaultActionsDispatcher(this.app, this.windowElem)

        this.windowRowsElem = DomUtils.elemOfHtml(`<div class="window-rows" data-translate="children"></div>`)
        this.windowElem.append(this.windowRowsElem)

        if (this.withTitlebar) {
            this.makeTitlebar()
        }
        this.updateTitleText()

        if (this.withActionbar) {
            this.makeButtonbar()
        }
        this.windowButtonsElem = DomUtils.elemOfHtml(`<div class="window-buttons" data-translate="children"></div>`);
        (this.titlebarElem ?? this.windowElem).append(this.windowButtonsElem)

        const contentWrapperElem = DomUtils.elemOfHtml('<div class="window-content-wrapper" data-translate="children"></div>')
        this.contentElem = DomUtils.elemOfHtml('<div class="window-content" data-translate="children"></div>')
        contentWrapperElem.append(this.contentElem)
        this.windowRowsElem.append(contentWrapperElem)

        this.makeCloseButton()

        this.makeUndockButton()

        if (this.isMovable) {
            this.makeUsermovable()
        }
        if (this.isResizable) {
            this.makeUserresizable()
        }
    }

    protected makeTitlebar(): void
    {
        this.titlebarElem = DomUtils.elemOfHtml('<div class="window-title-bar" data-translate="children"></div>')
        const titleTextElem = DomUtils.elemOfHtml(`<div class="window-title-text"></div>`)
        this.windowRowsElem.append(this.titlebarElem)
        this.titlebarElem.append(titleTextElem)
    }

    protected setTitleText(titleText: string): void {
        this.titleTextId = null
        this.titleText = titleText
        this.updateTitleText()
    }

    protected updateTitleText(): void {
        const titleText = this.translateTitleText()
        if (this.withPageTitle) {
            document.title = titleText
        }
        const textelem = <HTMLElement> this.titlebarElem?.querySelector('.window-title-text') ?? null
        if (textelem) {
            textelem.innerText = titleText
        }
    }

    protected translateTitleText(): string
    {
        let text = this.titleText
        if (!is.nil(this.titleTextId)) {
            text = this.app.translateText(this.titleTextId, this.titleText)
        }
        this.titleTextReplacements.forEach((replacementFun, placeholder) => {
            try {
                text = text.replace(placeholder, replacementFun())
            } catch (error) {
                this.app.onError(error)
            }
        })
        return text
    }

    protected makeCloseButton(): void
    {
        if (!this.withCloseButton) {
            return
        }
        const onCloseBtnClick = () => {
            if (this.closeIsHide) {
                this.setVisibility(false)
            } else {
                this.close()
            }
        }
        const closeElem = this.app.uiHelper.makeWindowCloseButton(onCloseBtnClick, this.style)
        this.windowButtonsElem.append(closeElem)
    }

    protected makeUndockButton(): void
    {
        if (!this.withUndockButton || !this.makeCheckedUndockPopupDefinition()) {
            return
        }
        const button = this.app.uiHelper.makeWindowButton(() => this.undock(), 'window', 'undock', windowUndockIconDataUrl, 'Common.Undock', 'Undock')
        this.windowButtonsElem.append(button)
    }

    protected makeUsermovable(): void
    {
        const newGeometryFun = (ev: PointerEventData) => ({
            ...this.geometryAtActionStart,
            left: this.geometryAtActionStart.left + ev.distanceX,
            bottom: this.geometryAtActionStart.bottom - ev.distanceY,
        })
        const elem = this.titlebarElem ?? 'move-handle-n'
        this.makeFrameElemUsermovable(elem, 'move', newGeometryFun)
    }

    protected makeUserresizable(): void
    {
        const makeNewGeometryFun = (geoChangeFun: (PointerEventData) => BoxEdgeMovements) => {
            return (ev: PointerEventData) => {
                const edgeMovements = geoChangeFun(ev)
                const containerRect = this.containerElem.getBoundingClientRect()
                const containerWidth = containerRect.width
                const containerHeight = containerRect.height
                const newGeometry = Utils.moveLeftBottomRectEdges(
                    this.geometryAtActionStart, edgeMovements,
                    containerWidth, containerHeight, this.minWidth, this.minHeight,
                    this.containerMarginLeft, this.containerMarginRight, this.containerMarginTop, this.containerMarginBottom,
                )
                return newGeometry
            }
        }
        const newPropsFunN = (ev) => ({ top: -ev.distanceY })
        const newPropsFunS = (ev) => ({ bottom: -ev.distanceY })
        const newPropsFunE = (ev) => ({ right: ev.distanceX })
        const newPropsFunW = (ev) => ({ left: ev.distanceX })
        const newPropsFunNW = (ev) => ({ ...newPropsFunN(ev), ...newPropsFunW(ev) })
        const newPropsFunNE = (ev) => ({ ...newPropsFunN(ev), ...newPropsFunE(ev) })
        const newPropsFunSW = (ev) => ({ ...newPropsFunS(ev), ...newPropsFunW(ev) })
        const newPropsFunSE = (ev) => ({ ...newPropsFunS(ev), ...newPropsFunE(ev) })
        this.makeFrameElemUsermovable('resizable-handle resize-handle-n', 'n-resize', makeNewGeometryFun(newPropsFunN))
        this.makeFrameElemUsermovable('resizable-handle resize-handle-s', 's-resize', makeNewGeometryFun(newPropsFunS))
        this.makeFrameElemUsermovable('resizable-handle resize-handle-e', 'e-resize', makeNewGeometryFun(newPropsFunE))
        this.makeFrameElemUsermovable('resizable-handle resize-handle-w', 'w-resize', makeNewGeometryFun(newPropsFunW))
        this.makeFrameElemUsermovable('resizable-handle resize-handle-nw', 'nw-resize', makeNewGeometryFun(newPropsFunNW))
        this.makeFrameElemUsermovable('resizable-handle resize-handle-ne', 'ne-resize', makeNewGeometryFun(newPropsFunNE))
        this.makeFrameElemUsermovable('resizable-handle resize-handle-sw', 'sw-resize', makeNewGeometryFun(newPropsFunSW))
        this.makeFrameElemUsermovable('resizable-handle resize-handle-se', 'se-resize', makeNewGeometryFun(newPropsFunSE))
    }

    protected makeFrameElemUsermovable(
        elemOrClass: string|HTMLElement, dragCssCursor: string, newGeometryFun: (ev: PointerEventData) => LeftBottomRect,
    ): void {
        let elem: HTMLElement
        if (is.string(elemOrClass)) {
            elem = DomUtils.elemOfHtml(`<div class="${elemOrClass}"></div>`)
            this.windowElem.append(elem)
        } else {
            elem = elemOrClass
        }
        const dispatcher = elem === this.windowElem ? this.windowElemPointerDispatcher : new PointerEventDispatcher(this.app, elem)
        dispatcher.addDragStartListener(ev => {
            if (this.isOpen()) {
                this.geometryAtActionStart = this.readGeometryFromDom()
            }
        })
        dispatcher.addDragMoveListener(ev => {
            if (ev.buttons === DomUtils.ButtonId.first && ev.modifierKeys === DomUtils.ModifierKeyId.none) {
                this.setGeometry(newGeometryFun(ev))
            } else {
                dispatcher.cancelDrag()
            }
        })
        dispatcher.addDragEndListener(ev => this.triggerSaveCurrentGeometry())
        dispatcher.setIgnoreOpacity(true)
        dispatcher.setDragCssCursor(dragCssCursor)
        dispatcher.setDragStartDistance(0)
    }

    protected makeButtonbar(): void
    {
        this.actionbarElem = DomUtils.elemOfHtml('<div class="window-actionbar" data-translate="children"></div>')
        this.windowRowsElem.append(this.actionbarElem)
        this.setActionBarVisibleState(false)
    }

    protected setActionBarVisibleState(isVisible: boolean): void
    {
        DomUtils.setElemClassPresent(this.actionbarElem, 'removed', !isVisible)
    }

    /**
     * Called after window decorations and content pane are created.
     *
     * - Fill window by appending elements to this.contentElem in inheriting classes.
     */
    protected async makeContent(): Promise<void>
    {
    }

    protected getContentSizeOffsets(): [number, number]
    {
        if (!this.windowElem || !this.contentElem) {
            return [0, 0]
        }
        const windoweRect = this.windowElem.getBoundingClientRect()
        const contentStyle = window.getComputedStyle(this.contentElem)
        const offsetWidth = windoweRect.width - DomUtils.parsePxValue(contentStyle.getPropertyValue('width'))
        const offsetHeight = windoweRect.height - DomUtils.parsePxValue(contentStyle.getPropertyValue('height'))
        return [offsetWidth, offsetHeight]
    }

    protected setGeometry(geometry: LeftBottomRect|Partial<OptionsType>): void
    {
        const mangledGeometry = this.mangleGeometry(geometry)
        this.geometry = mangledGeometry
        if (this.windowElem) {
            this.windowElem.style.left   = `${mangledGeometry.left}px`
            this.windowElem.style.bottom = `${mangledGeometry.bottom}px`
            this.windowElem.style.width  = `${mangledGeometry.width}px`
            this.windowElem.style.height = `${mangledGeometry.height}px`
        }
    }

    protected async initGeometry(): Promise<void>
    {
        const persitedOptions = this.persistGeometry ? await this.getSavedOptions() : {}
        const mergedGeometry = {...this.givenOptions, ...persitedOptions}
        this.setGeometry(mergedGeometry)
    }

    protected readGeometryFromDom(): LeftBottomRect
    {
        return DomUtils.getElemLeftBottomRect(this.containerElem, this.windowElem)
    }

    protected mangleGeometry(optionsOrGeometry: LeftBottomRect|Partial<OptionsType>): LeftBottomRect
    {
        const options = <Partial<OptionsType>>optionsOrGeometry // Partial<OptionsType> is a superset of LeftBottomRect.
        const containerRect = this.containerElem.getBoundingClientRect()
        const containerWidth = containerRect.width
        const containerHeight = containerRect.height

        // Maximized means fully covering the container:
        if (this.sizingMode === 'maximized') {
            const geometry = { left: 0, bottom: 0, width: containerWidth, height: containerHeight }
            return geometry
        }

        // Get final dimensions first:
        const windowRect = this.windowElem.getBoundingClientRect()
        let optionsWidthRaw: 'content'|string|number = options.width ?? this.defaultWidth
        if (optionsWidthRaw === 'content') {
            optionsWidthRaw = windowRect.width
        }
        const optionsWidth = Math.ceil(as.Float(optionsWidthRaw))
        let optionsHeightRaw: 'content'|string|number = options.height ?? this.defaultHeight
        if (optionsHeightRaw === 'content') {
            optionsHeightRaw = windowRect.height
        }
        const optionsHeight = Math.ceil(as.Float(optionsHeightRaw))
        const {width, height} = Utils.fitLeftBottomRect(
            {left: 0, bottom: 0, width: optionsWidth, height: optionsHeight},
            containerWidth, containerHeight, this.minWidth, this.minHeight,
            this.containerMarginLeft, this.containerMarginRight, this.containerMarginTop, this.containerMarginBottom,
        )

        const anchorElemRectRaw = options.above
        let anchorElemRect: null|DOMRect = null
        if (anchorElemRectRaw instanceof DOMRect) {
            anchorElemRect = anchorElemRectRaw
        } else if (anchorElemRectRaw instanceof HTMLElement) {
            anchorElemRect = anchorElemRectRaw.getBoundingClientRect()
        }

        // Find desired left:
        let leftRaw: null|string|number = options.left
        if (is.nil(leftRaw)) {
            let center: null|string|number = options.center ?? null
            if (is.nil(center) && anchorElemRect) {
                center = anchorElemRect.left + anchorElemRect.width / 2
            }
            if (!is.nil(center)) {
                leftRaw = as.Float(center) - width / 2
            }
        }
        const left = as.Int(leftRaw, this.defaultLeft)

        // Find desired bottom:
        let bottomRaw: null|string|number = options.bottom
        let bottomOffsetRaw: null|string|number = null
        if (is.nil(bottomRaw) && !is.nil(options.top)) {
            bottomRaw = containerHeight - as.Int(options.top) - height
        }
        if (is.nil(bottomRaw) && anchorElemRect) {
            bottomRaw = containerHeight - anchorElemRect.top
            bottomOffsetRaw = options.aboveYOffset ?? this.defaultAboveBottomOffset
        }
        const bottom = as.Int(bottomRaw, this.defaultBottom) + as.Int(bottomOffsetRaw)

        const geometry = Utils.fitLeftBottomRect(
            { left, bottom, width, height },
            containerWidth, containerHeight, this.minWidth, this.minHeight,
            this.containerMarginLeft, this.containerMarginRight, this.containerMarginTop, this.containerMarginBottom,
        )
        return geometry
    }

    protected async getSavedOptions(presetOptions?: OptionsType): Promise<OptionsType>
    {
        const savedOptions = await Memory.getLocal(`window.${this.windowSettingsId}`)
        const options = presetOptions ?? {}
        for (const [key, value] of Object.entries(savedOptions ?? {})) {
            options[key] = value
        }
        return <OptionsType>options
    }

    protected async saveOptions(options: OptionsType): Promise<void>
    {
        await Memory.setLocal(`window.${this.windowSettingsId}`, options)
    }

    protected triggerSaveCurrentGeometry(): void
    {
        if (!this.persistGeometry) {
            return
        }
        (async () => {
            const oldOptions = await this.getSavedOptions()
            const newOptions = {...oldOptions, ...this.geometry}
            await this.saveOptions(newOptions)
        })().catch(error => this.app.onError(error))
    }

    public getWindowElem(): null|HTMLElement
    {
        return this.windowElem
    }

    /**
     * Whether the window is open. It might still be set to not be visible (see isVisible).
     */
    public isOpen(): boolean
    {
        return !!this.windowElem
    }

    /**
     * This is undockable if method returns a PopupDefinition and this.givenOptions.undockable isn't set to false.
     */
    protected makeUndockPopupDefinition(): null|PopupDefinition
    {
        return null
    }

    private makeCheckedUndockPopupDefinition(): null|PopupDefinition
    {
        if (this.givenOptions.undockable === false || (this.isOpen() && this.app.getIsExclusiveWindowPopup())) {
            return null
        }
        const popupDefinition = this.makeUndockPopupDefinition()
        if ((popupDefinition?.url.length ?? 0) === 0) {
            return null
        }
        if (Environment.isEmbedded() && popupDefinition.url.startsWith('/')) {
            return null
        }
        return popupDefinition
    }

    private undock(): boolean
    {
        const popupDefinition = this.makeCheckedUndockPopupDefinition()
        if (!popupDefinition) {
            return false
        }
        BackgroundMessage.openOrFocusPopup(popupDefinition)
            .then(() => this.close())
            .catch(error => this.app.onError(error))
        return true
    }

    public close(): void
    {
        if (!this.isClosing) {
            this.isClosing = true
            if (this.isShowing) {
                return // Show will call close when done.
            }
            this.setVisibility(false)
            try {
                this.onBeforeClose()
            } catch (error) {
                this.app.onError(error)
            }
            try {
                this.onClose?.()
            } catch (error) {
                this.app.onError(error)
            }
            this.windowElem?.remove()
            this.containerElem = null
            this.windowElem = null
            this.titlebarElem = null
            this.contentElem = null
            this.isClosing = false
        }
    }

    protected onBeforeShowDone(): void
    {
    }

    protected onBeforeClose(): void
    {
    }

    protected onVisible(): void
    {
    }

    protected onInvisible(): void
    {
    }

    protected onViewportVisible(): void
    {
    }

    protected onViewportInvisible(): void
    {
    }

    protected onViewportResize(): void
    {
        if (this.isOpen()) {
            this.setGeometry(this.readGeometryFromDom())
        }
    }

    /**
     * Called for a pointer down event on the window or any of its content elements in the capture phase.
     *
     * Don't cancel propagation or prevent default actions here.
     */
    protected onCapturePhasePointerDownInside(ev: PointerEvent): void
    {
        this.toFront()
    }

    public toFront(layer?: number|string): void
    {
        if (this.windowElem) {
            if (!is.nil(layer)) {
                this.guiLayer = layer
            }
            this.app.toFront(this.windowElem, this.guiLayer)
        }
    }

    /**
     * Whether the window is open and set to be visible.
     */
    public getVisibility(): boolean
    {
        return this.isOpen() && !this.windowElem.classList.contains('hidden')
    }

    /**
     * Whether the window is open, set to be visible, and the containing browser tab is visible too.
     */
    public getViewportVisibility(): boolean
    {
        return this.getVisibility() && this.app.viewportEventDispatcher.getVisibility()
    }

    public setVisibility(visible: boolean): void
    {
        if (!this.isOpen()) {
            return
        }
        const isVisible = this.getVisibility()
        if (isVisible === visible) {
            return
        }
        const viewportEvents = this.app.viewportEventDispatcher
        if (visible) {
            viewportEvents.addVisibleListener(this.viewportVisibleListener)
            viewportEvents.addInvisibleListener(this.viewportInvisibleListener)
            viewportEvents.addResizeListener(this.viewportResizeListener)
            this.onViewportResize()
            this.windowElem.classList.remove('hidden')
            this.toFront()
            this.onVisible()
            if (viewportEvents.getVisibility()) {
                this.onViewportVisible()
            } else {
                this.onViewportInvisible()
            }
        } else {
            viewportEvents.removeVisibleListener(this.viewportVisibleListener)
            viewportEvents.removeInvisibleListener(this.viewportInvisibleListener)
            viewportEvents.removeResizeListener(this.viewportResizeListener)
            this.windowElem.classList.add('hidden')
            this.onInvisible()
        }
    }

}
