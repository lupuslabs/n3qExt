// Vanilla DOM utilities

import { is } from './is';

//------------------------------------------------------------------------------
// Element discovery

export function getNextDomElemBehindElemAtViewportPos(elemTop: Element, vpX: number, vpY: number): Element|null {
    const elems = getDomElemsAtViewportPos(elemTop.ownerDocument, vpX, vpY, elemTop, true);
    const elem = elems[0] ?? null;
    return elem;
}

export function getDomElemsAtViewportPos(
    document: Document, vpX: number, vpY: number, elemTop: Element|null, excludeElemTop: boolean,
): Element[] {
    const elems = document.elementsFromPoint(vpX, vpY);
    if (!is.nil(elemTop) && elems.includes(elemTop)) {
        while (elems.length !== 0) {
            if (elems[0] === elemTop) {
                if (excludeElemTop) {
                    elems.shift();
                }
                break;
            }
            elems.shift();
        }
    }
    return elems;
}

export function getTopmostOpaqueDomElemAtViewportPos(
    document: Document, vpX: number, vpY: number, opacityMin: number, transparentClasses: Set<string>
): Element|null {
    for (const elem of getDomElemsAtViewportPos(document, vpX, vpY, null, false)) {
        if (!domElementHasAnyClass(elem, transparentClasses)
        && getDomElemOpacityAtPos(elem, vpX, vpY)[0] >= opacityMin) {
            return elem;
        }
    }
    return null;
}

//------------------------------------------------------------------------------
// Element color/opacity

export function getDomElemOpacityAtPos(elem: Element, clientX: number, clientY: number): [number, boolean] {
    // Considers:
    // - computed opacity style value of elem (but not the opacities of its parents)
    // - background color
    // - image content of an HTMLImageElement
    // If elem doesn't have any of that, it is assumed to be transparent.
    const elemDims: DOMRect = elem.getBoundingClientRect();

    if (clientX < elemDims.left || clientX >= elemDims.right
    || clientY < elemDims.top || clientY >= elemDims.bottom) {
        return [0.0, false];
    }

    const style = getComputedStyle(elem);
    const opacityF: number = Number(style.opacity);
    let opacity = 0;
    opacity = Math.max(opacity, parseDomComputedStyleColor(style.backgroundColor)[3]);
    if (elem instanceof HTMLImageElement) {
        const [localX, localY] = [clientX - elemDims.left, clientY - elemDims.top];
        opacity = Math.max(opacity, getHtmlImgSrcOpacityAtPos(elem, localX, localY));
    }
    return [opacityF * opacity, true];
}

export function parseDomComputedStyleColor(colorStr: string): Array<number>
{
    let match = colorStr.match(/^rgba?\(([\d.]+),\s([\d.]+),\s([\d.]+)(?:,\s([\d.]+))?\)$/i);
    if (is.nil(match)) {
        return [0.0, 0.0, 0.0, 0.0];
    }
    match.unshift(); // Remove full match string.
    const rgbaVals = match.map(Number);
    rgbaVals[3] = rgbaVals[3] ?? 1.0; // RGB alpha defaults to 1.0 (full opacity).
    return rgbaVals;
}

export function getHtmlImgSrcOpacityAtPos(elem: HTMLImageElement, localX: number, localY: number): number {
    // Only consideres the actual image content. Does not handle whole element opacity, backgrounds, filters...
    localX = Math.round(localX);
    localY = Math.round(localY);

    const canvasElem = document.createElement('canvas');
    const ctx = canvasElem.getContext('2d');
    ctx.canvas.width = 1;
    ctx.canvas.height = 1;

    // Draw image to canvas and read Alpha channel value:
    const srcPixelSizeX = elem.naturalWidth  / elem.width;
    const srcPixelSizeY = elem.naturalHeight / elem.height;
    const srcX = Math.round(srcPixelSizeX * localX);
    const srcY = Math.round(srcPixelSizeY * localY);
    const srcWidth  = Math.max(1, Math.round(srcPixelSizeX));
    const srcHeight = Math.max(1, Math.round(srcPixelSizeY));
    ctx.drawImage(elem, srcX, srcY, srcWidth, srcHeight, 0, 0, 1, 1);
    let opacity: number;
    try {
        opacity = ctx.getImageData(0, 0, 1, 1).data[3] / 255; // [0]R [1]G [2]B [3]A
    } catch (error) {
        // "canvas has been tainted by cross-origin data" - happens when the original image came from another origin.
        opacity = 1.0;
    }
    canvasElem.remove();
    return opacity;
}

//------------------------------------------------------------------------------
// Other element properties

export function domElementHasAnyClass(elem: Element, classNames: Set<string>): boolean
{
    const elemClassnames = elem.classList;
    for (const className of classNames.values()) {
        if (elemClassnames.contains(className)) {
            return true;
        }
    }
    return false;
}

//------------------------------------------------------------------------------
// Vanilla event handling

export enum DomButtonId {
    none   = 0,
    first  = 1,  // Left by default.
    second = 2,  // Right by default.
    third  = 4,  // Middle or pressing the scroll wheel.
    fourth = 8,  // Might be unsupported in current browsers.
    fifth  = 16, // Might be unsupported in current browsers.
}

export function cloneDomEvent<T extends Event>(ev: T, newProps: {[prop: string]: any} = {}): T
{
    const constructor = <new (type: string, options?: {[p: string]: any}) => T> ev.constructor;
    const options: {[prop: string]: any} = {};
    for (const prop in ev) {
        options[prop] = ev[prop];
    }
    for (const prop in newProps) {
        options[prop] = newProps[prop];
    }
    const evNew = new constructor(options.type, options);
    return evNew;
}

export function dispatchDomEvent(ev: MouseEvent, domElem: Element): void
{
    (async () => domElem.dispatchEvent(ev))( // Do event routing outside current call stack.
    ).catch(_error => {}); // Ignore error and result.
}

export function capturePointer(domElem: Element, pointerId: number): void
{
    try {
        domElem.setPointerCapture(pointerId);
    } catch (_error) {
        // Ignore pointer devices that have gone away.
    }
}
    
export function releasePointer(domElem: Element, pointerId: number): void
{
    try {
        domElem.releasePointerCapture(pointerId);
    } catch (_error) {
        // Ignore pointer devices that have gone away.
    }
}

export function calcDomButtonIdsDiff(buttonsOld: number, buttonsNew: number): [number, number]
{
    const up = buttonsOld & ~buttonsNew;
    const down = buttonsNew & ~buttonsOld;
    return [up, down];
}
