import { is } from './is'
import { as } from './as'
import { iter } from './Iter'
import { ErrorWithData, LeftBottomRect, BoxEdges } from './Utils'
import { PointerEventData } from './PointerEventData'

export namespace DomUtils {

    export type CssClasses = null|string|CssClasses[]

    export function prepareCssClass(cssClass: null|string): string[] {
        return as.String(cssClass).split(' ').map(e => e.trim()).filter(e => e.length !== 0)
    }
    export function prepareCssClasses(cssClasses: CssClasses, defaultCssClasses?: CssClasses): string[] {
        const prepared = as.FlatArray(prepareCssClass, cssClasses)
        return prepared.length !== 0 ? prepared : as.FlatArray(prepareCssClass, defaultCssClasses)
    }

    const elemIdPrefix: string = 'n3q-id-'
    let elemIdCounter: number = 0
    export function makeUniqueElemId(): string {
        elemIdCounter++;
        return `${elemIdPrefix}${elemIdCounter}`
    }

    export function parsePxValue(pxValue: string): number {
        if (pxValue.endsWith('px')) {
            pxValue = pxValue.substring(0, pxValue.length - 2)
        }
        return as.Float(pxValue)
    }

    export function prepareLengthValueForCss(length: null|number|string): string {
        if (is.nil(length)) {
            return '0'
        }
        if (is.number(length)) {
            return `${length}px`
        }
        const trimmedLength = length.trim()
        if (trimmedLength === '') {
            return '0'
        }
        const lengthAsNumber = Number(trimmedLength)
        if (Number.isNaN(lengthAsNumber)) {
            return trimmedLength
        }
        return `${lengthAsNumber}px`
    }

    //------------------------------------------------------------------------------
    // Element creation

    export function elemOfHtml(html: string): HTMLElement {
        const elems = elemsOfHtml(html)
        const htmlElems = <HTMLElement[]> elems.filter(e => e instanceof HTMLElement)
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

    export function nodesOfText(text: string): Node[] {
        const nodes: Node[] = []
        for (const lineText of text.split('\n')) {
            const lineTrimmed = lineText.trim()
            if (lineTrimmed.length !== 0) {
                if (nodes.length !== 0) {
                    nodes.push(document.createElement('br'))
                }
                nodes.push(document.createTextNode(lineTrimmed))
            }
        }
        return nodes
    }

    export function paragraphNodesOfText(text: string): Node[] {
        const nodes: Node[] = []
        for (const paragraphText of text.split(/\n{2,}/)) {
            const paragraphNodes: Node[] = DomUtils.nodesOfText(paragraphText)
            if (paragraphNodes.length !== 0) {
                const paragraphElem = document.createElement('p')
                paragraphNodes.forEach(node => paragraphElem.append(node))
                nodes.push(paragraphElem)
            }
        }
        return nodes
    }

    export function makeExternalTextLinkElem(url: string, label: string, target: string = '_blank'): HTMLAnchorElement
    {
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'http://' + url
        }
        const linkElem = document.createElement('a')
        linkElem.classList.add('link', 'external')
        linkElem.setAttribute('href', url)
        linkElem.setAttribute('target', target)
        DomUtils.nodesOfText(label).forEach(node => linkElem.appendChild(node))
        linkElem.appendChild(DomUtils.elemOfHtml('<span class="icon"/>'));
        return linkElem
    }

    export function makeExternalPlainTextWithIconLink(url: string, label: string, target: string = '_blank'): Node[]
    {
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'http://' + url
        }
        const nodes: Node[] = DomUtils.nodesOfText(label)
        const iconLink = document.createElement('a')
        iconLink.classList.add('link', 'external')
        iconLink.setAttribute('href', url)
        iconLink.setAttribute('target', target)
        iconLink.appendChild(DomUtils.elemOfHtml('<span class="icon"/>'))
        nodes.push(iconLink)
        return nodes
    }

    //------------------------------------------------------------------------------
    // Text manipulation

    export const urlRe = new RegExp(''
    + '(https?://[^\\s.]\\S*[^\\s.,;:?!#])' // Starts with schema.
    + '|'
    + '([^\\s/.@]+(?:[.][^\\s/.@]+)*[.][^\\s/.0-9@][^\\s/.@]*(?:/[^\\s]*)?[^\\s.,;:?!#@])' // has at least one dot and has a TLD not starting with a digit.
    , 'g')

    export const invalidATagParents: ReadonlyArray<string> = ['A']

    export function convertTextToHtmlWithClickableLinks(text: string)
    {
        const node = document.createElement('div')
        DomUtils.makeLinksInTextClickable(text, {}).forEach(n => node.appendChild(n))
        return node.innerHTML
    }

    export type NodeConversionContext = {
        forbidA?: boolean
    }

    export type TextToNodesConverter = (text: string, context: NodeConversionContext) => Node[]

    export function convertTextInNodes(nodes: Iterable<Node>, converter: TextToNodesConverter, context: NodeConversionContext): Node[]
    {
        return iter(nodes).flatmap(node => convertTextInNode(node, converter, context)).toArray()
    }

    export function convertTextInNode(node: Node, converter: TextToNodesConverter, context: NodeConversionContext): Node[]
    {
        switch (node.nodeType) {
            case Node.TEXT_NODE: {
                return converter(node.textContent, context)
            }
            case Node.ELEMENT_NODE: {
                const subContext = {...context}
                subContext.forbidA = subContext.forbidA || invalidATagParents.indexOf(node.nodeName) !== -1
                const newNode = node.cloneNode(false)
                const newChildren = convertTextInNodes(node.childNodes, converter, context)
                newChildren.forEach(child => newNode.appendChild(child))
                return [newNode]
            }
        }
        return [node.cloneNode(true)]
    }

    export function makeLinksInTextClickable(text: string, context: NodeConversionContext): Node[]
    {
        if (context.forbidA) {
            return [document.createTextNode(text)]
        }
        const nodes: Node[] = []
        for (const token of text.split(urlRe)) {
            if (!is.nonEmptyString(token)) {
                // Omit.
            } else if (!token.match(urlRe)) {
                nodes.push(document.createTextNode(token))
            } else {
                const url = token
                const label = url.substring(url.match(/^https?:\/\//)?.[0]?.length ?? 0)
                nodes.push(DomUtils.makeExternalTextLinkElem(url, label))
            }
        }
        return nodes
    }

    export function makeLinksInTextPlainWithIcon(text: string, context: NodeConversionContext): Node[]
    {
        const nodes: Node[] = []
        for (const token of text.split(urlRe)) {
            if (!is.nonEmptyString(token)) {
                // Omit.
            } else if (!token.match(urlRe)) {
                nodes.push(document.createTextNode(token))
            } else {
                const url = token
                nodes.push(...DomUtils.makeExternalPlainTextWithIconLink(url, url))
            }
        }
        return nodes
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
        opacity = Math.max(opacity, parseComputedStyleColorOpacity(style.backgroundColor))
        if (elem instanceof HTMLImageElement) {
            const [localX, localY] = [clientX - elemDims.left, clientY - elemDims.top]
            opacity = Math.max(opacity, getImgSrcOpacityAtPos(elem, localX, localY))
        }
        return [opacityF * opacity, true]
    }

    export function parseComputedStyleColorOpacity(colorStr: string): number
    {
        const match = colorStr.match(/^(?:rgba|lch?)\([\d.]+[,\s]\s?[\d.]+[,\s]\s?[\d.]+(?:\s?[,/]\s?([\d.]+))?\)$/i)
        if (is.nil(match)) {
            return 0.0
        }
        return Number(match[1] ?? 1.0) // Alpha defaults to 1.0 (full opacity).
    }

    type GetImgSrcOpacityAtPosElemData = Readonly<{
        lastSrc: string
        lastWidth: number
        lastHeight: number
        canvasContext: CanvasRenderingContext2D
    }>

    export function getImgSrcOpacityAtPos(elem: HTMLImageElement, localX: number, localY: number): number {
        // Only consideres the actual image content. Does not handle whole element opacity, backgrounds, filters...

        // Prepare canvas with image scaled to current size:
        const { currentSrc, width, height } = elem
        let data: null|GetImgSrcOpacityAtPosElemData = elem['getImgSrcOpacityAtPosElemData']
        if (!data || data.canvasContext || data.lastSrc !== currentSrc || data.lastWidth !== width || data.lastHeight !== height) {
            const canvasElem = document.createElement('canvas')
            const ctx = canvasElem.getContext('2d')
            ctx.canvas.width = width
            ctx.canvas.height = height
            ctx.drawImage(elem, 0, 0, width, height)
            data = Object.freeze({
                lastSrc: currentSrc,
                lastWidth: width,
                lastHeight: height,
                canvasContext: ctx,
            })
            try {
                elem['getImgSrcOpacityAtPosElemData'] = data
            } catch (error) {
                console.log('getImgSrcOpacityAtPos: Failed to store data on elem.', { elem, data })
            }
        }

        // Read referenced pixel's alpha channel value:
        localX = Math.round(localX)
        localY = Math.round(localY)
        try {
            const pixelData = data.canvasContext.getImageData(localX, localY, 1, 1).data
            const opacity = pixelData[3] / 255 // [0]R [1]G [2]B [3]A
            return opacity
        } catch (error) {
            // "canvas has been tainted by cross-origin data" - happens when the original image came from another origin.
            const opacity = 1.0
            //console.log('getImgSrcOpacityAtPos: Failed to access pixel data.', error, { elem, data })
            return opacity
        }
    }

    //------------------------------------------------------------------------------
    // Element CSS classes

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

    //------------------------------------------------------------------------------
    // Element geometry

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

    export function setElemBox(elem: null|HTMLElement, box: DOMRectReadOnly): void
    {
        if (!elem) {
            return
        }
        elem.style.left = `${box.left}px`
        elem.style.top = `${box.top}px`
        elem.style.width = `${box.width}px`
        elem.style.height = `${box.height}px`
    }

    //------------------------------------------------------------------------------
    // Helpers for resizeable widgets

    export type VerticalSplitPaneElemHeightInfo = {startHeight: number, maxHeightDec: number}
    export type VerticalSplitPaneMoveInfo = {topStartHeight: number, bottomStartHeight: number, maxUp: number, maxDown: number}
    export type VerticalSplitPaneElemHeights = {topHeight: number, bottomHeight: number}

    function getElemHeightResizeInfo(elem: HTMLElement): VerticalSplitPaneElemHeightInfo
    {
        const style = window.getComputedStyle(elem)
        const startHeight = elem.offsetHeight
        const minHeight = Math.min(startHeight, DomUtils.parsePxValue(style.minHeight))
        const maxHeightDec = startHeight - minHeight
        return {startHeight, maxHeightDec}
    }

    export function getVerticalSplitPaneMoveInfo(topElem: HTMLElement, bottomElem: HTMLElement): VerticalSplitPaneMoveInfo
    {
        const topInfo: VerticalSplitPaneElemHeightInfo = getElemHeightResizeInfo(topElem)
        const bottomInfo: VerticalSplitPaneElemHeightInfo = getElemHeightResizeInfo(bottomElem)
        const topStartHeight = topInfo.startHeight
        const bottomStartHeight = bottomInfo.startHeight
        const maxUp = topInfo.maxHeightDec
        const maxDown = bottomInfo.maxHeightDec
        return {topStartHeight, bottomStartHeight, maxUp, maxDown}
    }

    export function calcVerticalSplitPaneElemHeights(paneInfo: VerticalSplitPaneMoveInfo, movement: number): VerticalSplitPaneElemHeights
    {
        if (movement < 0) {
            const movementUp = Math.min(paneInfo.maxUp, Math.abs(movement))
            return {topHeight: paneInfo.topStartHeight - movementUp, bottomHeight: paneInfo.bottomStartHeight + movementUp}
        }
        const movementDown = Math.min(paneInfo.maxDown, movement)
        return {topHeight: paneInfo.topStartHeight + movementDown, bottomHeight: paneInfo.bottomStartHeight - movementDown}
    }

    export function updateVerticalSplitPaneElemHeights(
        topElem: null|HTMLElement, bottomElem: null|HTMLElement, paneInfo: VerticalSplitPaneMoveInfo, movement: number,
    ): void {
        const {topHeight, bottomHeight}: VerticalSplitPaneElemHeights = calcVerticalSplitPaneElemHeights(paneInfo, movement)
        if (topElem) {
            topElem.style.height = `${topHeight}px`
        }
        if (bottomElem) {
            bottomElem.style.height = `${bottomHeight}px`
        }
    }

    export function makeElemAutoscroll(elem: HTMLElement): void
    {
        let scrollTopOld = elem.scrollTop
        let doAutoscroll = true
        let inResizeHandler = false

        const mutationObserver = new MutationObserver(elems => {
            if (elem.childElementCount === 0) {
                doAutoscroll = true
            }
            if (doAutoscroll) {
                scrollTopOld = elem.scrollHeight - elem.clientHeight
                elem.scrollTop = scrollTopOld
            }
        })
        mutationObserver.observe(elem, {subtree: true, characterData: true, childList: true})

        const resizeObserver = new ResizeObserver(elems => {
            if (inResizeHandler) {
                return
            }
            inResizeHandler = true
            const oldDoAutoscroll = doAutoscroll
            const oldScrollTopOld = scrollTopOld
            requestAnimationFrame(() => {
                doAutoscroll = oldDoAutoscroll
                scrollTopOld = oldScrollTopOld
                inResizeHandler = false
                const maxScrollTop = elem.scrollHeight - elem.clientHeight
                const scrollTopNew = doAutoscroll ? maxScrollTop : Math.min(maxScrollTop, scrollTopOld)
                elem.scrollTop = scrollTopNew
                scrollTopOld = scrollTopNew
            })
        })
        resizeObserver.observe(elem)

        elem.onscroll = (ev) => {
            const _mutationObserver = mutationObserver // Forces observer to be in scope until elem gets discarded.
            const _resizeObserver = resizeObserver // Forces observer to be in scope until elem gets discarded.
            const maxScrollTop = elem.scrollHeight - elem.clientHeight
            const maxScrollTopCorrected = maxScrollTop - 1
            scrollTopOld = elem.scrollTop
            doAutoscroll = scrollTopOld >= maxScrollTopCorrected
        }
    }

    //------------------------------------------------------------------------------
    // Event handling

    export function onDomReady(fun: () => void): void {
        if (document.readyState !== 'loading') {
            fun()
        } else {
            document.addEventListener('DOMContentLoaded', fun)
        }
    }

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

    export function getInnerDomRectDistances(outerRect: DOMRectReadOnly, innerRect: DOMRectReadOnly): BoxEdges
    {
        const top = innerRect.top - outerRect.top
        const right = outerRect.right - innerRect.right
        const bottom = outerRect.bottom - innerRect.bottom
        const left = innerRect.left - outerRect.left
        return { top, right, bottom, left }
    }

    export function getImageData(imageSrc: CanvasImageSource, width: number, height: number): null|ImageData
    {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context2d = canvas.getContext('2d')
        if (!context2d) {
            return null
        }
        context2d.drawImage(imageSrc, 0, 0, width, height)
        return context2d.getImageData(0, 0, width, height)
    }

    export function getImageElemOpacityMeasureDimensions(imgElem: HTMLImageElement, availableWidth: number, availableHeight: number): null|[number, number]
    {
        const measureOversampling = 2
        const maxWidth = Math.max(1, Math.round(measureOversampling * availableWidth))
        const maxHeight = Math.max(1, Math.round(measureOversampling * availableHeight))
        const src = imgElem.currentSrc || imgElem.src
        if (/^data:image\/svg\+xml/i.test(src)) {
            return [maxWidth, maxHeight] // SVG intrinsic size is unreliable in Firefox. So just return oversampled available dimensions.
        }
        const [naturalWidth, naturalHeight] = [imgElem.naturalWidth, imgElem.naturalHeight]
        if (naturalWidth === 0 || naturalHeight === 0) {
            return null
        }
        const scale = Math.min(1, maxWidth / naturalWidth, maxHeight / naturalHeight)
        return [Math.max(1, Math.round(naturalWidth * scale)), Math.max(1, Math.round(naturalHeight * scale))]
    }

    export function getNonTransparentRectOfImageData(imgData: ImageData, opacityMin: number): null|DOMRectReadOnly
    {
        const [imgWidth, imgHeight] = [imgData.width, imgData.height]
        let [top, right, bottom, left] = [imgHeight, 0, 0, imgWidth]
        const imgBytes = imgData.data
        const rowBytesCount = 4 * imgWidth
        let index = imgHeight * rowBytesCount - 1
        for (let y = imgHeight - 1; y >= 0; y--) {
            for (let x = imgWidth - 1; x >= 0; x--, index -= 4) {
                if (imgBytes[index] > opacityMin) {
                    top = Math.min(top, y)
                    right = Math.max(right, x + 1)
                    bottom = Math.max(bottom, y + 1)
                    left = Math.min(left, x)
                }
            }
        }
        return new DOMRectReadOnly(left, top, right - left, bottom - top)
    }

    export function clipImageElemByBoxDistances(imgElem: null|HTMLElement, offsets: BoxEdges): void
    {
        if (!imgElem || !(imgElem instanceof HTMLImageElement)) {
            return
        }
        imgElem.style.clipPath = `inset(${offsets.top}px ${offsets.right}px ${offsets.bottom}px ${offsets.left}px)`
        imgElem.style.margin = `-${offsets.top}px -${offsets.right}px -${offsets.bottom}px -${offsets.left}px`
    }

    export function calcScaleToFitBox(nativeWidth: number, nativeHeight: number, availableWidth: number, availableHeight: number): number
    {
        const scaleWidthF = availableWidth / nativeWidth
        const scaleHeightF = availableHeight / nativeHeight
        return Math.min(scaleWidthF, scaleHeightF)
    }

    export function clipImageElemByOpacityAndFitDimensions(imgElem: null|Element, opacityMin: number = 10, availableWidth: number, availableHeight: number): boolean
    {
        if (!imgElem || !(imgElem instanceof HTMLImageElement)) {
            return false
        }
        const measureDimensions = getImageElemOpacityMeasureDimensions(imgElem, availableWidth, availableHeight)
        if (!measureDimensions) {
            return false
        }
        const [nativeImgWidth, nativeImgHeight] = measureDimensions
        const imgData = getImageData(imgElem, nativeImgWidth, nativeImgHeight)
        if (!imgData) {
            return false
        }
        const nativeContentArea = getNonTransparentRectOfImageData(imgData, opacityMin)
        if (!nativeContentArea || nativeContentArea.width <= 0 || nativeContentArea.height <= 0) {
            return false
        }

        // Fit content area:
        const [nativeAreaWidth, nativeAreaHeight] = [nativeContentArea.width, nativeContentArea.height]
        const scaleF = calcScaleToFitBox(nativeAreaWidth, nativeAreaHeight, availableWidth, availableHeight)
        const scaledImgWidth = scaleF * nativeImgWidth
        const scaledImgHeight = scaleF * nativeImgHeight
        const scaledAreaX = scaleF * nativeContentArea.x
        const scaledAreaY = scaleF * nativeContentArea.y
        const scaledAreaWidth = scaleF * nativeContentArea.width
        const scaledAreaHeigt = scaleF * nativeContentArea.height
        const scaledArea = new DOMRectReadOnly(scaledAreaX, scaledAreaY, scaledAreaWidth, scaledAreaHeigt)

        // Set dimensions and apply clipping:
        imgElem.style.width = `${scaledImgWidth}px`
        imgElem.style.height = `${scaledImgHeight}px`
        const scaledImgRect = new DOMRectReadOnly(0, 0, scaledImgWidth, scaledImgHeight)
        const offsets: BoxEdges = getInnerDomRectDistances(scaledImgRect, scaledArea)
        clipImageElemByBoxDistances(imgElem, offsets)

        return true
    }

}
