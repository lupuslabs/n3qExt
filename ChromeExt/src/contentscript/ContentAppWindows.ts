import { ContentApp } from './ContentApp'

export type WindowRegistrationInfo = {
    readonly windowRootElems?: null|Iterable<Element>,
    readonly ignoredRootElems?: null|Iterable<Element>,
    readonly pointerDownOutsideHandler?: null|(() => void),
};

type WindowInfo = {
    readonly windowId: number,
    readonly windowRootElems: Set<Element>,
    readonly ignoredRootElems: Set<Element>,
    readonly pointerDownOutsideHandler: null|(() => void),
};

export class ContentAppWindows {
    private readonly app: ContentApp;
    private isStopped: boolean = false;

    private nextWindowId: number = 1;
    private readonly windows: Map<number,WindowInfo> = new Map();

    private readonly onDocumentPointerDownHandler: (ev: PointerEvent) => void;
    private readonly onPointerDownHandlerOptions = {passive: true, capture: true};

    constructor(app: ContentApp) {
        this.app = app;
        this.onDocumentPointerDownHandler = ev => this.onDocumentPointerDown(ev);
    }

    public init(): void {
        document.addEventListener('pointerdown', this.onDocumentPointerDownHandler, this.onPointerDownHandlerOptions);
    }

    public stop(): void {
        this.isStopped = true;
        document.removeEventListener('pointerdown', this.onDocumentPointerDownHandler, this.onPointerDownHandlerOptions);
        this.windows.clear();
    }

    public registerWindow(windowInfo: WindowRegistrationInfo): number {
        const windowId = this.nextWindowId;
        this.nextWindowId++;
        this.windows.set(windowId, {
            windowId,
            windowRootElems: new Set(windowInfo.windowRootElems ?? null),
            ignoredRootElems: new Set(windowInfo.ignoredRootElems ?? null),
            pointerDownOutsideHandler: windowInfo.pointerDownOutsideHandler ?? null,
        });
        return windowId;
    }

    public forgetWindow(windowId: null|number): void {
        this.windows.delete(windowId);
    }

    public registerWindowRootElement(windowId: number, rootElem: Element): void {
        this.windows.get(windowId)?.windowRootElems.add(rootElem);
    }

    public forgetWindowRootElement(windowId: number, rootElem: Element): void {
        this.windows.get(windowId)?.windowRootElems.delete(rootElem);
    }

    public registerIgnoredRootElement(windowId: number, rootElem: Element): void {
        this.windows.get(windowId)?.ignoredRootElems.add(rootElem);
    }

    public forgetIgnoredRootElement(windowId: number, rootElem: Element): void {
        this.windows.get(windowId)?.ignoredRootElems.delete(rootElem);
    }

    public onIframePointerDown(iframeElem: null|HTMLElement): void {
        if (this.isStopped || !iframeElem) {
            return;
        }
        this.onPointerDownForElems(this.getElemParentChain(iframeElem));
    }

    private onDocumentPointerDown(ev: PointerEvent): void {
        if (this.isStopped) {
            return;
        }
        this.onPointerDownForElems(this.getPotentialWindowElemAtViewportCoords(ev.clientX, ev.clientY));
    }

    private onPointerDownForElems(targetWindowElems: Element[]): void {
        for (const {windowRootElems, ignoredRootElems, pointerDownOutsideHandler} of this.windows.values()) {
            if (targetWindowElems.some(elem => ignoredRootElems.has(elem))) {
                continue;
            }
            const isInsideWindow = targetWindowElems.some(elem => windowRootElems.has(elem))
            if (!isInsideWindow) {
                try {
                    pointerDownOutsideHandler();
                } catch (error) {
                    this.app.onError(error);
                }
            }
        }
    }

    private getPotentialWindowElemAtViewportCoords(x: number, y: number): Element[] {
        const pointerElem = this.app.display.getShadowDomRoot().elementFromPoint(x, y);
        return this.getElemParentChain(pointerElem);
    }

    private getElemParentChain(topElem: null|Element): Element[] {
        const elems: Element[] = [];
        let elem = topElem;
        while (elem) {
            elems.push(elem);
            elem = elem.parentElement;
        }
        return elems;
    }
}
