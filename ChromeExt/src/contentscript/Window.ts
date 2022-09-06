import * as $ from 'jquery';
import 'webpack-jquery-ui';
import { as } from '../lib/as';
import { Utils } from '../lib/Utils';
import { ContentApp } from './ContentApp';
import { Memory } from '../lib/Memory';

export type WindowOptions = {[prop: string]: any};

export class Window
{
    onResizeStart: { (ev: JQueryEventObject, ui: JQueryUI.ResizableUIParams): void };
    onResizeStop: { (ev: JQueryEventObject, ui: JQueryUI.ResizableUIParams): void };
    onResize: { (ev: JQueryEventObject, ui: JQueryUI.ResizableUIParams): void };
    onDragStart: { (ev: JQueryEventObject, ui: JQueryUI.DraggableEventUIParams): void };
    onDrag: { (ev: JQueryEventObject, ui: JQueryUI.DraggableEventUIParams): void };
    onDragStop: { (ev: JQueryEventObject, ui: JQueryUI.DraggableEventUIParams): void };
    onClose: { (): void };

    protected windowElem: HTMLElement;
    protected contentElem: HTMLElement;
    protected closeIsHide = false;

    constructor(protected app: ContentApp) { }

    show(options: WindowOptions)
    {
        this.onClose = options.onClose;
        this.closeIsHide = options.closeIsHide;

        if (!this.windowElem) {
            const windowId = Utils.randomString(15);
            const resizable = as.Bool(options.resizable, false);
            const undockable = as.Bool(options.undockable, false);

            const windowElem = <HTMLElement>$('<div id="' + windowId + '" class="n3q-base n3q-window n3q-shadow-medium" data-translate="children" />').get(0);
            const titleBarElem = <HTMLElement>$('<div class="n3q-base n3q-window-title-bar" data-translate="children" />').get(0);
            const titleElem = <HTMLElement>$('<div class="n3q-base n3q-window-title" data-translate="children" />').get(0);
            const titleTextElem = <HTMLElement>$('<div class="n3q-base n3q-window-title-text">' + (options.titleText ? options.titleText : '') + '</div>').get(0);

            const undockElem = undockable ? <HTMLElement>$(
                `<div class="n3q-base n3q-window-button n3q-window-button-2" title="Undock" data-translate="attr:title:Common">
                    <div class="n3q-base n3q-button-symbol n3q-button-undock" />
                </div>`
            ).get(0) : null;

            const closeElem = <HTMLElement>$(
                `<div class="n3q-base n3q-window-button" title="Close" data-translate="attr:title:Common">
                    <div class="n3q-base n3q-button-symbol n3q-button-close" />
                </div>`
            ).get(0);

            const contentElem = <HTMLElement>$('<div class="n3q-base n3q-window-content" data-translate="children" />').get(0);

            $(titleElem).append(titleTextElem);
            $(titleBarElem).append(titleElem);
            if (undockable) { $(titleBarElem).append(undockElem); }
            $(titleBarElem).append(closeElem);
            $(windowElem).append(titleBarElem);

            $(windowElem).append(contentElem);

            // if (resizable) {
            //     $(windowElem).append(<HTMLElement>$('<div class="n3q-base n3q-window-resize n3q-window-resize-se"/>').get(0));
            //     $(windowElem).append(<HTMLElement>$('<div class="n3q-base n3q-window-resize n3q-window-resize-s"/>').get(0));
            //     $(windowElem).append(<HTMLElement>$('<div class="n3q-base n3q-window-resize n3q-window-resize-n"/>').get(0));
            // }

            this.contentElem = contentElem;
            this.windowElem = windowElem;

            $(this.app.getDisplay()).append(windowElem);
            this.app.toFront(windowElem, ContentApp.LayerWindow);

            const maskId = Utils.randomString(15);

            if (resizable) {
                $(windowElem).resizable({
                    minWidth: 180,
                    minHeight: 100,
                    handles: 'n, e, s, w, se, ne, nw, sw',
                    // handles: {
                    //     se: '#n3q #' + windowId + ' .n3q-window-resize-se',
                    //     s: '#n3q #' + windowId + ' .n3q-window-resize-s',
                    //     n: '#n3q #' + windowId + ' .n3q-window-resize-n',
                    // },
                    start: (ev: JQueryEventObject, ui: JQueryUI.ResizableUIParams) =>
                    {
                        $(windowElem).append('<div id="' + maskId + '" style="background-color: #ffffff; opacity: 0.001; position: absolute; left: 0; top: 0; right: 0; bottom: 0;"></div>');
                        if (this.onResize) { this.onResize(ev, ui); }
                    },
                    resize: (ev: JQueryEventObject, ui: JQueryUI.ResizableUIParams) =>
                    {
                        if (this.onResizeStart) { this.onResizeStart(ev, ui); }
                    },
                    stop: (ev: JQueryEventObject, ui: JQueryUI.ResizableUIParams) =>
                    {
                        $('#' + maskId).remove();
                        if (this.onResizeStop) { this.onResizeStop(ev, ui); }
                    },
                });
            }

            $(undockElem).click(ev =>
            {
                this.undock();
            });

            this.isClosing = false;
            $(closeElem).click(ev =>
            {
                if (this.closeIsHide) {
                    this.setVisibility(false);
                } else {
                    this.close();
                }
            });

            $(windowElem).click(ev =>
            {
                this.app.toFront(windowElem, ContentApp.LayerWindow);
            });

            $(windowElem).draggable({
                handle: '.n3q-window-title',
                scroll: false,
                iframeFix: true,
                stack: '.n3q-entity',
                // opacity: 0.5,
                distance: 4,
                containment: 'document',
                start: (ev: JQueryEventObject, ui: JQueryUI.DraggableEventUIParams) =>
                {
                    this.app.toFront(windowElem, ContentApp.LayerWindow);
                    if (this.onDragStart) { this.onDragStart(ev, ui); }
                },
                drag: (ev: JQueryEventObject, ui: JQueryUI.DraggableEventUIParams) =>
                {
                    if (this.onDrag) { this.onDrag(ev, ui); }
                },
                stop: (ev: JQueryEventObject, ui: JQueryUI.DraggableEventUIParams) =>
                {
                    if (this.onDragStop) { this.onDragStop(ev, ui); }
                },
            });
        }
    }

    protected setPosition(left: number, bottom: number, width: number, height: number) {
        const displayWidth = this.app.getDisplay().offsetWidth;
        const displayHeight = this.app.getDisplay().offsetHeight;
        let top = displayHeight - height - bottom;
        const [leftFit, topFit, widthFit, heightFit] = Utils.fitDimensions(
            left, top, width, height, displayWidth, displayHeight,
            100, 50, 10, 10, 10, 10,
        );
        if (this.windowElem) {
            this.windowElem.style.left   = `${leftFit}px`;
            this.windowElem.style.top    = `${topFit}px`;
            this.windowElem.style.width  = `${widthFit}px`;
            this.windowElem.style.height = `${heightFit}px`;
        }
        return [leftFit, displayHeight - heightFit - topFit, widthFit, heightFit];
    }

    async getSavedOptions(name: string, presetOptions: WindowOptions): Promise<WindowOptions>
    {
        const savedOptions = await Memory.getLocal('window.' + name, {});
        const options = presetOptions ?? {};
        for (const key in savedOptions) {
            options[key] = savedOptions[key];
        }
        return options;
    }

    async saveOptions(name: string, value: WindowOptions): Promise<void>
    {
        await Memory.setLocal('window.' + name, value);
    }

    getWindowElem(): undefined|HTMLElement { return this.windowElem; }

    isOpen(): boolean
    {
        return this.windowElem != null;
    }

    undock(): void
    {
        const params = `scrollbars=no,resizable=yes,status=no,location=no,toolbar=no,menubar=no,width=600,height=300,left=100,top=100`;
        const undocked = window.open('about:blank', Utils.randomString(10), params);
        undocked.focus();
        undocked.onload = () =>
        {
            const html = `<div style="font-size:30px">Undocked, but not really. Override Window.undock()</div>`;
            undocked.document.body.insertAdjacentHTML('afterbegin', html);
        };
    }

    private isClosing: boolean;
    close(): void
    {
        if (!this.isClosing) {
            this.isClosing = true;

            if (this.onClose) { this.onClose(); }
            $(this.windowElem).remove();
            this.windowElem = null;
        }
    }

    getVisibility(): boolean
    {
        return !$(this.windowElem).hasClass('n3q-hidden');
    }
    setVisibility(visible: boolean): void
    {
        if (as.Bool(visible) !== this.getVisibility()) {
            if (visible) {
                $(this.windowElem).removeClass('n3q-hidden');
            } else {
                $(this.windowElem).addClass('n3q-hidden');
            }
        }
    }
}
