import { is } from '../lib/is';
import { BoxEdgeMovements, dummyLeftBottomRect, LeftBottomRect, Utils } from '../lib/Utils';
import { ContentApp, WindowStyle } from './ContentApp';
import { Memory } from '../lib/Memory';
import { DomButtonId, domHtmlElemOfHtml, domWaitForRenderComplete, getDomElementLeftBottomRect } from '../lib/domTools'
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'
import { DomModifierKeyId, PointerEventData } from '../lib/PointerEventData'
import { as } from '../lib/as'
import { Config } from '../lib/Config'

export type WindowOptions = {
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
};

type WindowGeometryInitStrategy = 'beforeContent'|'afterContent'|'none';

export abstract class Window<OptionsType extends WindowOptions>
{
    protected readonly app: ContentApp;
    protected onClose: null|(() => void) = null;
    protected readonly viewportResizeListener: () => void;

    protected windowName: string = 'Default';
    protected style: WindowStyle = 'window';
    protected windowCssClasses: string[] = ['n3q-window'];
    protected contentCssClasses: string[] = ['n3q-window-content'];
    protected showHidden:       boolean = false;
    protected withTitlebar:     boolean = true;
    protected closeIsHide:      boolean = false;
    protected isMovable:        boolean = true;
    protected isResizable:      boolean = false;
    protected geometryInitstrategy: WindowGeometryInitStrategy = 'beforeContent';
    protected persistGeometry:  boolean = false;
    protected isUndockable:     boolean = false;

    protected containerMarginTop:    number = 0;
    protected containerMarginRight:  number = 0;
    protected containerMarginBottom: number = 0;
    protected containerMarginLeft:   number = 0;
    protected minWidth:  number = 180;
    protected minHeight: number = 100;
    protected defaultWidth:  number = 180;
    protected defaultHeight: number = 100;
    protected defaultBottom: number = 10;
    protected defaultAboveBottomOffset: number = 10; // Only used when bottom derived from givenOptions.above and givenOptions.bottomOffset not given.
    protected defaultLeft:   number = 10;

    protected givenOptions: null|OptionsType = null;
    protected titleText: string = '';

    protected containerElem: null|HTMLElement = null;
    protected windowElem: null|HTMLElement = null;
    protected windowElemPointerDispatcher: null|PointerEventDispatcher = null;
    protected titlebarElem: null|HTMLElement = null;
    protected contentElem: null|HTMLElement = null;

    protected guiLayer: number|string = ContentApp.LayerWindow;
    protected geometry: LeftBottomRect = dummyLeftBottomRect;
    protected geometryAtActionStart: LeftBottomRect = dummyLeftBottomRect; // For move and resize.
    protected isShowing: boolean = false;
    protected isClosing: boolean = false;

    public constructor(app: ContentApp)
    {
        this.app = app;
        this.viewportResizeListener = () => this.onViewportResize();
    }

    public show(options: OptionsType): void
    {
        if (this.isOpen()) {
            return;
        }
        this.isShowing = true;
        (async () => {
            this.givenOptions = options;
            this.onClose = this.givenOptions.onClose ?? this.onClose;
            this.containerElem = this.app.getDisplay();
            if (!this.containerElem) {
                throw new Error('Window.show: Display not ready!');
            }
            this.prepareMakeDom();
            this.makeWindowFrameAndDecorations();
            this.windowElem.classList.add('n3q-hidden');
            this.app.translateElem(this.windowElem);
            if (this.geometryInitstrategy === 'beforeContent') {
                await domWaitForRenderComplete(); // Wait for frame having dimensions in DOM.
                await this.initGeometry(); // Need to wait for it so makeContent can use geometry.
            }
            this.toFront();
            this.containerElem.append(this.windowElem);
            await this.makeContent();
            this.app.translateElem(this.contentElem);
            await domWaitForRenderComplete(); // Wait for window content having dimensions in DOM.
            if (this.geometryInitstrategy === 'afterContent') {
                await this.initGeometry();
            }
            if (!this.isClosing && !(this.givenOptions.hidden ?? this.showHidden)) {
                this.setVisibility(true);
            }
        })().catch(error => {
            this.app.onError(error);
            this.isClosing = true;
        }).then(() => {
            this.isShowing = false;
            if (this.isClosing) {
                this.isClosing = false;
                this.close();
            }
        });
    }

    /**
     * Called before window DOM elements are created.
     *
     * - Fill this.titleText with translated title in inheriting classes.
     */
    protected prepareMakeDom(): void
    {
        this.closeIsHide = as.Bool(this.givenOptions.closeIsHide, this.closeIsHide);
        this.containerMarginTop    = as.Int(Config.get('system.windowContainerMarginTop'), 0);
        this.containerMarginRight  = as.Int(Config.get('system.windowContainerMarginRight'), 0);
        this.containerMarginBottom = as.Int(Config.get('system.windowContainerMarginBottom'), 0);
        this.containerMarginLeft   = as.Int(Config.get('system.windowContainerMarginLeft'), 0);
    }

    protected makeWindowFrameAndDecorations(): void
    {
        const windowId = Utils.randomString(15);

        this.windowElem = domHtmlElemOfHtml(`<div id="${windowId}" data-translate="children"></div>`);
        this.windowElem.classList.add(...this.windowCssClasses, `n3q-window-style-${this.style}`);
        this.windowElem.addEventListener('pointerdown', ev => this.onCapturePhasePointerDownInside(ev), { capture: true });
        const options = { ignoreOpacity: true };
        this.windowElemPointerDispatcher = new PointerEventDispatcher(this.app, this.windowElem, options);

        if (this.withTitlebar) {
            this.makeTitlebar();
        }

        this.contentElem = domHtmlElemOfHtml('<div data-translate="children"></div>');
        this.contentElem.classList.add(...this.contentCssClasses);
        this.windowElem.append(this.contentElem);

        this.makeCloseButton();

        if (this.isUndockable) {
            this.makeUndockButton();
        }

        if (this.isMovable) {
            this.makeUsermovable();
        }
        if (this.isResizable) {
            this.makeUserresizable();
        }
    }

    protected makeTitlebar(): void
    {
        this.titlebarElem = domHtmlElemOfHtml('<div class="n3q-base n3q-window-title-bar" data-translate="children"></div>');
        const titleElem = domHtmlElemOfHtml('<div class="n3q-base n3q-window-title" data-translate="children"></div>');
        const titleTextElem = domHtmlElemOfHtml(`<div class="n3q-base n3q-window-title-text"></div>`);
        titleTextElem.innerText = this.titleText;
        this.windowElem.append(this.titlebarElem);
        this.titlebarElem.append(titleElem);
        titleElem.append(titleTextElem);
    }

    protected makeCloseButton(): void
    {
        const onCloseBtnClick = () => {
            if (this.closeIsHide) {
                this.setVisibility(false);
            } else {
                this.close();
            }
        };
        const closeElem = this.app.makeWindowCloseButton(onCloseBtnClick, this.style);
        (this.titlebarElem ?? this.windowElem).append(closeElem);
    }

    protected makeUndockButton(): void
    {
        const button = domHtmlElemOfHtml(
            `<div class="n3q-base n3q-window-button n3q-window-button-2" title="Undock" data-translate="attr:title:Common">
                <div class="n3q-base n3q-button-symbol n3q-button-undock"></div>
            </div>`
        );
        PointerEventDispatcher.makeOpaqueDispatcher(this.app, button).addUnmodifiedLeftclickListener(ev => this.undock());
        (this.titlebarElem ?? this.contentElem).append(button);
    }

    protected makeUsermovable(): void
    {
        const newGeometryFun = (ev: PointerEventData) => ({
            ...this.geometryAtActionStart,
            left: this.geometryAtActionStart.left + ev.distanceX,
            bottom: this.geometryAtActionStart.bottom - ev.distanceY,
        });
        const elem = this.titlebarElem ?? this.windowElem;
        this.makeFrameElemUsermovable(elem, 'move', newGeometryFun);
    }

    protected makeUserresizable(): void
    {
        const makeNewGeometryFun = (geoChangeFun: (PointerEventData) => BoxEdgeMovements) => {
            return (ev: PointerEventData) => {
                const edgeMovements = geoChangeFun(ev);
                const containerRect = this.containerElem.getBoundingClientRect();
                const containerWidth = containerRect.width;
                const containerHeight = containerRect.height;
                const newGeometry = Utils.moveLeftBottomRectEdges(
                    this.geometryAtActionStart, edgeMovements,
                    containerWidth, containerHeight, this.minWidth, this.minHeight,
                    this.containerMarginLeft, this.containerMarginRight, this.containerMarginTop, this.containerMarginBottom,
                );
                return newGeometry;
            };
        };
        const newPropsFunN = (ev) => ({ top: -ev.distanceY });
        const newPropsFunS = (ev) => ({ bottom: -ev.distanceY });
        const newPropsFunE = (ev) => ({ right: ev.distanceX });
        const newPropsFunW = (ev) => ({ left: ev.distanceX });
        const newPropsFunNW = (ev) => ({ ...newPropsFunN(ev), ...newPropsFunW(ev) });
        const newPropsFunNE = (ev) => ({ ...newPropsFunN(ev), ...newPropsFunE(ev) });
        const newPropsFunSW = (ev) => ({ ...newPropsFunS(ev), ...newPropsFunW(ev) });
        const newPropsFunSE = (ev) => ({ ...newPropsFunS(ev), ...newPropsFunE(ev) });
        this.makeFrameElemUsermovable('n3q-window-resize-handle-n', 'n-resize', makeNewGeometryFun(newPropsFunN));
        this.makeFrameElemUsermovable('n3q-window-resize-handle-s', 's-resize', makeNewGeometryFun(newPropsFunS));
        this.makeFrameElemUsermovable('n3q-window-resize-handle-e', 'e-resize', makeNewGeometryFun(newPropsFunE));
        this.makeFrameElemUsermovable('n3q-window-resize-handle-w', 'w-resize', makeNewGeometryFun(newPropsFunW));
        this.makeFrameElemUsermovable('n3q-window-resize-handle-nw', 'nw-resize', makeNewGeometryFun(newPropsFunNW));
        this.makeFrameElemUsermovable('n3q-window-resize-handle-ne', 'ne-resize', makeNewGeometryFun(newPropsFunNE));
        this.makeFrameElemUsermovable('n3q-window-resize-handle-sw', 'sw-resize', makeNewGeometryFun(newPropsFunSW));
        this.makeFrameElemUsermovable('n3q-window-resize-handle-se', 'se-resize', makeNewGeometryFun(newPropsFunSE));
    }

    protected makeFrameElemUsermovable(
        elemOrClass: string|HTMLElement, dragCssCursor: string, newGeometryFun: (ev: PointerEventData) => LeftBottomRect,
    ): void {
        let elem: HTMLElement;
        if (is.string(elemOrClass)) {
            elem = domHtmlElemOfHtml(`<div class="${elemOrClass}"></div>`);
            this.windowElem.append(elem);
        } else {
            elem = elemOrClass;
        }
        const dispatcher = elem === this.windowElem ? this.windowElemPointerDispatcher : new PointerEventDispatcher(this.app, elem);
        dispatcher.addListener('dragstart', DomButtonId.first, DomModifierKeyId.none, ev => {
            if (this.isOpen()) {
                this.geometryAtActionStart = this.readGeometryFromDom();
            }
        });
        dispatcher.addListener('dragmove', null, null, ev => {
            if (ev.buttons === DomButtonId.first && ev.modifierKeys === DomModifierKeyId.none) {
                this.setGeometry(newGeometryFun(ev));
            } else {
                dispatcher.cancelDrag();
            }
        });
        dispatcher.addListener('dragend', null, null, ev => {
            this.triggerSaveCurrentGeometry();
        });
        dispatcher.setIgnoreOpacity(true);
        dispatcher.setDragCssCursor(dragCssCursor);
        dispatcher.setDragStartDistance(0);
    }

    /**
     * Called after window decorations and content pane are created.
     *
     * - Fill window by appending elements to this.contentElem in inheriting classes.
     */
    protected async makeContent(): Promise<void>
    {
    }

    protected setGeometry(geometry: LeftBottomRect|Partial<OptionsType>): void
    {
        const mangledGeometry = this.mangleGeometry(geometry);
        this.geometry = mangledGeometry;
        if (this.windowElem) {
            this.windowElem.style.left   = `${mangledGeometry.left}px`;
            this.windowElem.style.bottom = `${mangledGeometry.bottom}px`;
            this.windowElem.style.width  = `${mangledGeometry.width}px`;
            this.windowElem.style.height = `${mangledGeometry.height}px`;
        }
    }

    protected async initGeometry(): Promise<void>
    {
        await domWaitForRenderComplete();
        const persitedOptions = this.persistGeometry ? await this.getSavedOptions() : {};
        const mergedGeometry = {...this.givenOptions, ...persitedOptions};
        this.setGeometry(mergedGeometry);
    }

    protected readGeometryFromDom(): LeftBottomRect
    {
        return getDomElementLeftBottomRect(this.containerElem, this.windowElem);
    }

    protected mangleGeometry(optionsOrGeometry: LeftBottomRect|Partial<OptionsType>): LeftBottomRect
    {
        const options = <Partial<OptionsType>>optionsOrGeometry; // Partial<OptionsType> is a superset of LeftBottomRect.
        const containerRect = this.containerElem.getBoundingClientRect();
        const containerWidth = containerRect.width;
        const containerHeight = containerRect.height;

        // Get final dimensions first:
        const windowRect = this.windowElem.getBoundingClientRect();
        let optionsWidthRaw: 'content'|string|number = options.width ?? this.defaultWidth;
        if (optionsWidthRaw === 'content') {
            optionsWidthRaw = windowRect.width;
        }
        const optionsWidth = as.Int(optionsWidthRaw);
        let optionsHeightRaw: 'content'|string|number = options.height ?? this.defaultHeight;
        if (optionsHeightRaw === 'content') {
            optionsHeightRaw = windowRect.height;
        }
        const optionsHeight = as.Int(optionsHeightRaw);
        const {width, height} = Utils.fitLeftBottomRect(
            {left: 0, bottom: 0, width: optionsWidth, height: optionsHeight},
            containerWidth, containerHeight, this.minWidth, this.minHeight,
            this.containerMarginLeft, this.containerMarginRight, this.containerMarginTop, this.containerMarginBottom,
        );

        const anchorElemRectRaw = options.above;
        let anchorElemRect: null|DOMRect = null;
        if (anchorElemRectRaw instanceof DOMRect) {
            anchorElemRect = anchorElemRectRaw;
        } else if (anchorElemRectRaw instanceof HTMLElement) {
            anchorElemRect = anchorElemRectRaw.getBoundingClientRect();
        }

        // Find desired left:
        let leftRaw: null|string|number = options.left;
        if (is.nil(leftRaw)) {
            let center: null|string|number = options.center ?? null;
            if (is.nil(center) && anchorElemRect) {
                center = anchorElemRect.left + anchorElemRect.width / 2;
            }
            if (!is.nil(center)) {
                leftRaw = as.Float(center) - width / 2;
            }
        }
        const left = as.Int(leftRaw, this.defaultLeft);

        // Find desired bottom:
        let bottomRaw: null|string|number = options.bottom;
        let bottomOffsetRaw: null|string|number = null;
        if (is.nil(bottomRaw) && !is.nil(options.top)) {
            bottomRaw = containerHeight - as.Int(options.top) - height;
        }
        if (is.nil(bottomRaw) && anchorElemRect) {
            bottomRaw = containerHeight - anchorElemRect.top;
            bottomOffsetRaw = options.aboveYOffset ?? this.defaultAboveBottomOffset;
        }
        const bottom = as.Int(bottomRaw, this.defaultBottom) + as.Int(bottomOffsetRaw);

        const geometry = Utils.fitLeftBottomRect(
            { left, bottom, width, height },
            containerWidth, containerHeight, this.minWidth, this.minHeight,
            this.containerMarginLeft, this.containerMarginRight, this.containerMarginTop, this.containerMarginBottom,
        );
        return geometry;
    }

    protected async getSavedOptions(presetOptions?: OptionsType): Promise<OptionsType>
    {
        const savedOptions = await Memory.getLocal(`window.${this.windowName}`, {});
        const options = presetOptions ?? {};
        for (const key in savedOptions) {
            options[key] = savedOptions[key];
        }
        return <OptionsType>options;
    }

    protected async saveOptions(options: OptionsType): Promise<void>
    {
        await Memory.setLocal(`window.${this.windowName}`, options);
    }

    protected triggerSaveCurrentGeometry(): void
    {
        if (!this.persistGeometry) {
            return;
        }
        (async () => {
            const oldOptions = await this.getSavedOptions();
            const newOptions = {...oldOptions, ...this.geometry};
            await this.saveOptions(newOptions);
        })().catch(error => this.app.onError(error));
    }

    public getWindowElem(): null|HTMLElement
    {
        return this.windowElem;
    }

    public isOpen(): boolean
    {
        return !is.nil(this.windowElem);
    }

    protected undock(): void
    {
        const params = `scrollbars=no,resizable=yes,status=no,location=no,toolbar=no,menubar=no,width=600,height=300,left=100,top=100`;
        const undocked = window.open('about:blank', Utils.randomString(10), params);
        undocked.focus();
        undocked.onload = () => {
            const html = `<div style="font-size: 30px;">Undocked, but not really. Override Window.undock()</div>`;
            undocked.document.body.insertAdjacentHTML('afterbegin', html);
        };
    }

    public close(): void
    {
        if (!this.isClosing) {
            this.isClosing = true;
            if (this.isShowing) {
                return; // Show will call close when done.
            }
            this.setVisibility(false);
            try {
                this.onBeforeClose();
            } catch (error) {
                this.app.onError(error);
            }
            try {
                this.onClose?.();
            } catch (error) {
                this.app.onError(error);
            }
            this.windowElem?.remove();
            this.containerElem = null;
            this.windowElem = null;
            this.titlebarElem = null;
            this.contentElem = null;
            this.isClosing = false;
        }
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

    protected onViewportResize(): void
    {
        if (this.isOpen()) {
            this.setGeometry(this.readGeometryFromDom());
        }
    }

    /**
     * Called for a pointer down event on the window or any of its content elements in the capture phase.
     *
     * Don't cancel propagation or prevent default actions here.
     */
    protected onCapturePhasePointerDownInside(ev: PointerEvent): void
    {
        this.toFront();
    }

    public toFront(layer?: number|string): void
    {
        if (this.windowElem) {
            if (!is.nil(layer)) {
                this.guiLayer = layer;
            }
            this.app.toFront(this.windowElem, this.guiLayer);
        }
    }

    public getVisibility(): boolean
    {
        return this.windowElem && !this.windowElem.classList.contains('n3q-hidden');
    }

    public setVisibility(visible: boolean): void
    {
        if (!this.windowElem) {
            return;
        }
        const isVisible = this.getVisibility();
        if (isVisible === visible) {
            return;
        }
        if (visible) {
            this.app.getViewPortEventDispatcher().addResizeListener(this.viewportResizeListener);
            this.onViewportResize();
            this.windowElem.classList.remove('n3q-hidden');
            this.onVisible();
        } else {
            this.app.getViewPortEventDispatcher().removeResizeListener(this.viewportResizeListener);
            this.windowElem.classList.add('n3q-hidden');
            this.onInvisible();
        }
    }

}
