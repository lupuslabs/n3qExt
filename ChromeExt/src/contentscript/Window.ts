import { is } from '../lib/is';
import { BoxEdgeMovements, dummyLeftBottomRect, LeftBottomRect, Utils } from '../lib/Utils';
import { ContentApp, WindowStyle } from './ContentApp';
import { Memory } from '../lib/Memory';
import { domHtmlElemOfHtml, domWaitForRenderComplete } from '../lib/domTools'
import { PointerEventDispatcher, PointerEventListeners } from '../lib/PointerEventDispatcher'
import { PointerEventData } from '../lib/PointerEventData'
import { as } from '../lib/as'
import { Config } from '../lib/Config'

export type WindowOptions = {
    onClose?: () => void,
    closeIsHide?: string|boolean,
    above?:  HTMLElement,
    width?:  string|number,
    height?: string|number,
    bottom?: string|number,
    left?:   string|number,
};

export abstract class Window<OptionsType extends WindowOptions>
{
    protected app: ContentApp;
    protected onClose: null|(() => void) = null;

    protected windowName: string = 'Default';
    protected style: WindowStyle = 'window';
    protected closeIsHide:     boolean = false;
    protected isMovable:       boolean = true;
    protected isResizable:     boolean = false;
    protected persistGeometry: boolean = false;
    protected isUndockable:    boolean = false;

    protected containerMarginTop:    number = 0;
    protected containerMarginRight:  number = 0;
    protected containerMarginBottom: number = 0;
    protected containerMarginLeft:   number = 0;
    protected minWidth:  number = 180;
    protected minHeight: number = 100;
    protected defaultWidth:  number = 180;
    protected defaultHeight: number = 100;
    protected defaultBottom: number = 10;
    protected defaultLeft:   number = 10;

    protected givenOptions: null|OptionsType = null;
    protected titleText: string = '';

    protected defaultFrameListeners: PointerEventListeners = {};
    protected containerElem: null|HTMLElement = null;
    protected windowElem:    null|HTMLElement = null;
    protected titlebarElem:  null|HTMLElement = null;
    protected contentElem:   null|HTMLElement = null;

    protected guiLayer: number|string = ContentApp.LayerWindow;
    protected geometry: LeftBottomRect = dummyLeftBottomRect;
    protected geometryAtActionStart: LeftBottomRect = dummyLeftBottomRect; // For move and resize.
    protected isClosing: boolean = false;

    public constructor(app: ContentApp)
    {
        this.app = app;
    }

    public show(options: OptionsType): void
    {
        if (this.isOpen()) {
            return;
        }
        (async () => {
            this.givenOptions = options;
            this.onClose = this.givenOptions.onClose;
            this.containerElem = this.app.getDisplay();
            if (!this.containerElem) {
                throw new Error('Window.show: Display not ready!');
            }
            this.prepareMakeDom();
            this.makeWindowFrameAndDecorations();
            this.app.translateElem(this.windowElem);
            await this.initGeometry();
            this.toFront();
            this.containerElem.append(this.windowElem);
            await this.makeContent();
            this.app.translateElem(this.contentElem);
        })().catch(error => {
            this.app.onError(error);
            this.close();
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
        this.defaultFrameListeners = {
            'buttondown': (ev) => this.toFront(),
        };
        const windowId = Utils.randomString(15);

        this.windowElem = domHtmlElemOfHtml(`<div id="${windowId}" class="n3q-base n3q-window n3q-shadow-medium" data-translate="children"></div>`);
        this.windowElem.addEventListener('pointerdown', ev => this.toFront());

        this.makeTitlebar();

        this.contentElem = domHtmlElemOfHtml('<div class="n3q-base n3q-window-content" data-translate="children"></div>');
        this.windowElem.append(this.contentElem);

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

        this.makeCloseButton();

        if (this.isUndockable) {
            this.makeUndockButton();
        }
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
        const closeElem = this.app.makeWindowCloseButton(onCloseBtnClick, this.style, this.defaultFrameListeners);
        this.titlebarElem.append(closeElem);
    }

    protected makeUndockButton(): void
    {
        const button = domHtmlElemOfHtml(
            `<div class="n3q-base n3q-window-button n3q-window-button-2" title="Undock" data-translate="attr:title:Common">
                <div class="n3q-base n3q-button-symbol n3q-button-undock"></div>
            </div>`
        );
        const dispatcher = new PointerEventDispatcher(this.app, button, { ignoreOpacity: true });
        dispatcher.setEventListeners(this.defaultFrameListeners);
        dispatcher.setEventListener('click', eventData => this.undock());
        this.titlebarElem.append(button);
    }

    protected makeUsermovable(): void
    {
        const newGeometryFun = (ev: PointerEventData) => ({
            ...this.geometryAtActionStart,
            left: this.geometryAtActionStart.left + ev.distanceX,
            bottom: this.geometryAtActionStart.bottom - ev.distanceY,
        });
        this.makeFrameElemUsermovable(this.titlebarElem, 'move', newGeometryFun);
        this.titlebarElem.style.pointerEvents = 'auto';
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
        const dispatcher = new PointerEventDispatcher(this.app, elem, {
            ignoreOpacity: true,
            dragStartDistance: 0,
            dragCssCursor: dragCssCursor,
        });
        dispatcher.setEventListeners(this.defaultFrameListeners);
        dispatcher.setEventListener('buttondown', eventData => this.toFront());
        dispatcher.setEventListener('dragstart', ev => {
            this.geometryAtActionStart = this.geometry;
        });
        dispatcher.setEventListener('dragmove', ev => {
            this.setGeometry(newGeometryFun(ev), false);
        });
        dispatcher.setEventListener('dragend', ev => {
            this.triggerSaveCurrentGeometry();
        });
    }

    /**
     * Called after window elements are created.
     *
     * - Fill window by appending elements to this.contentElem in inheriting classes.
     */
    protected async makeContent(): Promise<void>
    {
    }

    protected setGeometry(geometry: LeftBottomRect, persist: boolean = true, mangle: boolean = true): void
    {
        const finalGeometry = mangle ? this.mangleGeometry(<Partial<OptionsType>>geometry) : geometry;
        this.applyGeometry(finalGeometry);
        if (persist) {
            this.triggerSaveCurrentGeometry();
        }
    }

    protected async initGeometry(): Promise<void>
    {
        await domWaitForRenderComplete();
        const persitedOptions = this.persistGeometry ? await this.getSavedOptions() : {};
        const mergedGeometry = {...this.givenOptions, ...persitedOptions};
        const finalGeometry = this.mangleGeometry(mergedGeometry);
        this.applyGeometry(finalGeometry);
        if (this.persistGeometry) {
            this.triggerSaveCurrentGeometry();
        }
    }

    protected applyGeometry(geometry: LeftBottomRect): void
    {
        this.geometry = geometry;
        if (this.windowElem) {
            this.windowElem.style.left   = `${geometry.left}px`;
            this.windowElem.style.bottom = `${geometry.bottom}px`;
            this.windowElem.style.width  = `${geometry.width}px`;
            this.windowElem.style.height = `${geometry.height}px`;
        }
    }

    protected mangleGeometry(optionsOrGeometry: Partial<OptionsType>): LeftBottomRect
    {
        const containerRect = this.containerElem.getBoundingClientRect();
        const containerWidth = containerRect.width;
        const containerHeight = containerRect.height;

        // Get final dimensions first:
        const optionsWidth = as.Int(optionsOrGeometry.width, this.defaultWidth);
        const optionsHeight = as.Int(optionsOrGeometry.height, this.defaultHeight);
        const dimensions = Utils.fitLeftBottomRect(
            {left: 0, bottom: 0, width: optionsWidth, height: optionsHeight},
            containerWidth, containerHeight, this.minWidth, this.minHeight,
            this.containerMarginLeft, this.containerMarginRight, this.containerMarginTop, this.containerMarginBottom,
        );

        // Add position:
        const anchorElemRect = optionsOrGeometry.above?.getBoundingClientRect() ?? null;
        let leftRaw = optionsOrGeometry.left;
        if (is.nil(leftRaw) && anchorElemRect) {
            const center = anchorElemRect.left + anchorElemRect.width / 2;
            leftRaw = center - dimensions.width / 2;
        }
        const left = as.Int(leftRaw, this.defaultLeft);
        const bottom = as.Int(optionsOrGeometry.bottom, this.defaultBottom);
        const geometry = Utils.fitLeftBottomRect(
            {left, bottom, width: dimensions.width, height: dimensions.height},
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
        return !this.windowElem?.classList.contains('n3q-hidden');
    }

    public setVisibility(visible: boolean): void
    {
        if (visible) {
            this.initGeometry().catch(error => this.app.onError(error));
            this.windowElem?.classList.remove('n3q-hidden');
        } else {
            this.windowElem?.classList.add('n3q-hidden');
        }
    }

}
