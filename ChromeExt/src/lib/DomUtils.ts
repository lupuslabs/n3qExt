import { is } from './is'
import { as } from './as'
import { ErrorWithData, LeftBottomRect } from './Utils'
import { PointerEventData } from './PointerEventData'

export namespace DomUtils {

    //------------------------------------------------------------------------------
    // Element creation

    export function elemOfHtml(html: string): HTMLElement {
        const elems = elemsOfHtml(html)
        const htmlElems = <HTMLElement[]> elemsOfHtml(html).filter(e => e instanceof HTMLElement)
        if (htmlElems.length !== 1) {
            const msg = 'html doesn\'t parse into exactly one HTMLElement!'
            throw new ErrorWithData(msg, {html, elems, htmlElems})
        }
        return htmlElems[0]
    }

    export function elemsOfHtml(html: string): Element[] {
        const template = document.createElement('template')
        template.innerHTML = html
        const elems = template.content.children
        return Array.from(elems)
    }

    //------------------------------------------------------------------------------
    // Element discovery

    export function getNextElemBehindElemAtViewportPos(
        document: DocumentOrShadowRoot, elemTop: Element, vpX: number, vpY: number,
    ): Element|null {
        const elems = getElemsAtViewportPos(document, vpX, vpY, elemTop, true)
        const elem = elems[0] ?? null
        return elem
    }

    export function getElemsAtViewportPos(
        document: DocumentOrShadowRoot, vpX: number, vpY: number, elemTop: Element|null, excludeElemTop: boolean,
    ): Element[] {
        const elems = getAllElemsAtViewportPos(document, vpX, vpY)
        if (!is.nil(elemTop) && elems.includes(elemTop)) {
            while (elems.length !== 0) {
                if (elems[0] === elemTop) {
                    if (excludeElemTop) {
                        elems.shift()
                    }
                    break
                }
                elems.shift()
            }
        }
        return elems
    }

    function getAllElemsAtViewportPos(document: DocumentOrShadowRoot, vpX: number, vpY: number): Element[]
    {
        const elems = document.elementsFromPoint(vpX, vpY)

        // On Firefox element discovery stops at a shadow root.
        // So exit in case the list is complete or recursively get the elements from the outer documents in that case:
        const shadowRootHost: null|Element = document['host']
        if (!shadowRootHost || elems.at(-1)?.tagName === 'HTML') {
            return elems
        }

        const parentElems = getAllElemsAtViewportPos(shadowRootHost.ownerDocument, vpX, vpY)

        // The shadow root host element is returned as first element even when
        // its dimensions in the inspector don't contain the coordinate:
        parentElems.shift()

        elems.push(...parentElems)
        return elems
    }

    export function getTopmostOpaqueElemAtViewportPos(
        document: DocumentOrShadowRoot, vpX: number, vpY: number, opacityMin: number, transparentClasses: Set<string>, transparentElems: Set<Element>
    ): Element|null {
        for (const elem of getElemsAtViewportPos(document, vpX, vpY, null, false)) {
            if (true
            && !transparentElems.has(elem)
            && !hasElemAnyClass(elem, transparentClasses)
            && (opacityMin === 0 || getElemOpacityAtPos(elem, vpX, vpY)[0] >= opacityMin)) {
                return elem
            }
        }
        return null
    }

    //------------------------------------------------------------------------------
    // Element color/opacity

    export function getElemOpacityAtPos(elem: Element, clientX: number, clientY: number): [number, boolean] {
        // Considers:
        // - computed opacity style value of elem (but not the opacities of its parents)
        // - background color
        // - image content of an HTMLImageElement
        // If elem doesn't have any of that, it is assumed to be transparent.
        const elemDims: DOMRect = elem.getBoundingClientRect()

        if (clientX < elemDims.left || clientX >= elemDims.right
        || clientY < elemDims.top || clientY >= elemDims.bottom) {
            return [0.0, false]
        }

        const style = getComputedStyle(elem)
        const opacityF: number = Number(style.opacity)
        let opacity = 0
        opacity = Math.max(opacity, parseComputedStyleColor(style.backgroundColor)[3])
        if (elem instanceof HTMLImageElement) {
            const [localX, localY] = [clientX - elemDims.left, clientY - elemDims.top]
            opacity = Math.max(opacity, getImgSrcOpacityAtPos(elem, localX, localY))
        }
        return [opacityF * opacity, true]
    }

    export function parseComputedStyleColor(colorStr: string): Array<number>
    {
        let match = colorStr.match(/^rgba?\(([\d.]+),\s([\d.]+),\s([\d.]+)(?:,\s([\d.]+))?\)$/i)
        if (is.nil(match)) {
            return [0.0, 0.0, 0.0, 0.0]
        }
        match.unshift() // Remove full match string.
        const rgbaVals = match.map(Number)
        rgbaVals[3] = rgbaVals[3] ?? 1.0 // RGB alpha defaults to 1.0 (full opacity).
        return rgbaVals
    }

    export function getImgSrcOpacityAtPos(elem: HTMLImageElement, localX: number, localY: number): number {
        // Only consideres the actual image content. Does not handle whole element opacity, backgrounds, filters...
        localX = Math.round(localX)
        localY = Math.round(localY)

        const canvasElem = document.createElement('canvas')
        const ctx = canvasElem.getContext('2d')
        ctx.canvas.width = 1
        ctx.canvas.height = 1

        // Draw image to canvas and read Alpha channel value:
        const srcPixelSizeX = elem.naturalWidth  / elem.width
        const srcPixelSizeY = elem.naturalHeight / elem.height
        const srcX = Math.round(srcPixelSizeX * localX)
        const srcY = Math.round(srcPixelSizeY * localY)
        const srcWidth  = Math.max(1, Math.round(srcPixelSizeX))
        const srcHeight = Math.max(1, Math.round(srcPixelSizeY))
        ctx.drawImage(elem, srcX, srcY, srcWidth, srcHeight, 0, 0, 1, 1)
        let opacity: number
        try {
            opacity = ctx.getImageData(0, 0, 1, 1).data[3] / 255 // [0]R [1]G [2]B [3]A
        } catch (error) {
            // "canvas has been tainted by cross-origin data" - happens when the original image came from another origin.
            opacity = 1.0
        }
        canvasElem.remove()
        return opacity
    }

    //------------------------------------------------------------------------------
    // Other element properties

    export function setElemClassPresent(elem: null|Element, className: string, hasClass: boolean): void
    {
        elem?.classList[hasClass ? 'add' : 'remove'](className)
    }

    export function hasElemAnyClass(elem: Element, classNames: Set<string>): boolean
    {
        const elemClassnames = elem.classList
        for (const className of classNames.values()) {
            if (elemClassnames.contains(className)) {
                return true
            }
        }
        return false
    }

    export function getElemLeftBottomRect(container: Element, content: Element): LeftBottomRect
    {
        const containerRect: DOMRect = container.getBoundingClientRect()
        const contentRect: DOMRect = content.getBoundingClientRect()
        const contentLocalRect: LeftBottomRect = {
            left: contentRect.left - containerRect.left,
            bottom: containerRect.bottom - contentRect.bottom,
            width: contentRect.width,
            height: contentRect.height,
        }
        return contentLocalRect
    }

    //------------------------------------------------------------------------------
    // Event handling

    export enum ButtonId {
        none   = 0,
        first  = 1,  // Left by default.
        second = 2,  // Right by default.
        third  = 4,  // Middle or pressing the scroll wheel.
        fourth = 8,  // Might be unsupported in current browsers.
        fifth  = 16, // Might be unsupported in current browsers.
    }

    export enum ModifierKeyId {
        none    = 0,
        shift   = 1, // Same on all OSes.
        control = 2, // Ctrl (Windows) or Control (Mac) key.
        alt     = 4, // Alt (Windows, Mac) or Option (Mac) key
        meta    = 8, // Windows (Windows) or Command (Mac) key.
    }

    export function modifierKeyIdsOfEvent(event: MouseEvent): number {
        return <number><unknown>event.shiftKey * ModifierKeyId.shift
            + <number><unknown>event.ctrlKey * ModifierKeyId.control
            + <number><unknown>event.altKey * ModifierKeyId.alt
            + <number><unknown>event.metaKey * ModifierKeyId.meta
    }

    export function cloneEvent<T extends Event>(ev: T, newProps: {[prop: string]: any} = {}): T
    {
        const constructor = <new (type: string, options?: {[p: string]: any}) => T> ev.constructor
        const options: {[prop: string]: any} = {}
        for (const prop in ev) {
            options[prop] = ev[prop]
        }
        for (const prop in newProps) {
            options[prop] = newProps[prop]
        }
        const evNew = new constructor(options.type, options)
        return evNew
    }

    export function pointerMovedDistance(
        eventStart: null|PointerEvent|PointerEventData,
        eventMove: null|PointerEvent|PointerEventData,
        distance: number,
    ): boolean {
        return eventStart && eventMove && (false
            || Math.abs(eventStart.clientX - eventMove.clientX) >= distance
            || Math.abs(eventStart.clientY - eventMove.clientY) >= distance
        )
    }

    /**
     * Beware: ev.isTrusted becomes false by dispatching.
     * Dispatched ev will not trigger browser context menu or text selection.
     */
    export function triggerEvent(ev: Event, target: EventTarget): void
    {
        (async () => target.dispatchEvent(ev))( // Do event routing outside current call stack.
        ).catch(_error => {}) // Ignore error and result.
    }

    export function capturePointer(domElem: Element, pointerId: number): void
    {
        try {
            domElem.setPointerCapture(pointerId)
        } catch (_error) {
            // Ignore pointer devices that have gone away.
        }
    }

    export function releasePointer(domElem: Element, pointerId: number): void
    {
        try {
            domElem.releasePointerCapture(pointerId)
        } catch (_error) {
            // Ignore pointer devices that have gone away.
        }
    }

    export function calcButtonIdsDiff(buttonsOld: number, buttonsNew: number): [number, number]
    {
        const up = buttonsOld & ~buttonsNew
        const down = buttonsNew & ~buttonsOld
        return [up, down]
    }

    export function preventKeyboardEventBubbling(domElem: Element): void
    {
        domElem.addEventListener('keydown', ev => ev.stopPropagation())
        domElem.addEventListener('keyup', ev => ev.stopPropagation())
        domElem.addEventListener('keypress', ev => ev.stopPropagation())
    }

    //------------------------------------------------------------------------------
    // Render- and animation-related

    export function execOnNextRenderComplete(fun: (timestamp: number) => void): void
    {
        // Wait for start of any animation frame (might be the first after DOM manipulations),
        // then wait to start of next animation frame (guaranteed to be after DOM has been rendered at least once):
        window.requestAnimationFrame(() => window.requestAnimationFrame(fun))
    }

    export function waitForRenderComplete(): Promise<void>
    {
        // Wait for start of any animation frame (might be the first after DOM manipulations),
        // then wait to start of next animation frame (guaranteed to be after DOM has been rendered at least once):
        return new Promise(resolve => {
            window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()))
        })
    }

    export type ElemTransition = {property: string, delay?: string, duration?: string, timingFun?: string}

    export function startElemTransition(
        elem: HTMLElement, guard: () => null|boolean, transition: ElemTransition, finalVal: string, onComplete?: () => void,
    ): void {
        guard = guard ?? (() => true)
        if (!guard()) {
            return
        }

        const completedurationSecs
            = transitionDurationToSeconds(transition.delay)
            + transitionDurationToSeconds(transition.duration)

        if (completedurationSecs === 0) {
            stopElemTransition(elem, transition.property, finalVal)
            onComplete?.()
            return
        }

        execOnNextRenderComplete(() => {
            if (!guard()) {
                return
            }
            const transitions = getElemTransitions(elem)
            transitions.set(transition.property, transition)
            setElemTransitions(elem, transitions.values())
            elem.style[transition.property] = finalVal

            if (onComplete) {
                window.setTimeout(onComplete, 1000 * completedurationSecs)
            }
        })
    }

    export function stopElemTransition(elem: HTMLElement, property: string, newValue?: string): void
    {
        newValue = newValue ?? window.getComputedStyle(elem)[property]
        const transitions = getElemTransitions(elem)
        transitions.delete(property)
        setElemTransitions(elem, transitions.values())
        elem.style[property] = newValue
    }

    export function getElemTransitions(elem: HTMLElement): Map<string,ElemTransition>
    {
        const transitions = new Map()
        const currentStyle = window.getComputedStyle(elem)
        const converter = (v) => as.String(v).split(',').map(s => s.trim()).filter(s => s.length !== 0)
        const properties = converter(currentStyle.transitionProperty)
        const delays = converter(currentStyle.transitionDelay)
        const durations = converter(currentStyle.transitionDuration)
        const timingFuns = converter(currentStyle.transitionTimingFunction)
        const getAt = (list: string[], index: number, defaultVal: string): string =>
            list[index % Math.max(1, list.length)] ?? defaultVal
        for (let i = 0; i < properties.length; i++) {
            const property = properties[i]
            transitions.set(property, {
                property: property,
                delay: getAt(delays, i, '0s'),
                duration: getAt(durations, i, '0s'),
                timingFun: getAt(timingFuns, i, 'ease'),
            })
        }
        return transitions
    }

    export function setElemTransitions(elem: HTMLElement, transitions: Iterable<ElemTransition>): void
    {
        const transitionStrings = []
        for (const t of transitions) {
            transitionStrings.push(`${t.property} ${t.duration ?? '0s'} ${t.timingFun ?? 'ease'} ${t.delay ?? '0s'}`)
        }
        elem.style.transition = transitionStrings.join(', ')
    }

    export function transitionDurationToSeconds(duration?: string): number
    {
        duration = (duration ?? '0s').trim().toLowerCase()
        if (duration[0] === '+') {
            duration = duration.substring(1)
        }
        let [suffixLen, factor] = [0, 1.0]
        if (duration.endsWith('ms')) {
            [suffixLen, factor] = [2, 0.001]
        } else if (duration.endsWith('s')) {
            [suffixLen, factor] = [1, 1.0]
        }
        return factor * as.Float(duration.substring(0, duration.length - suffixLen))
    }

}
