import { is } from './is';
import { as } from './as';
import log = require('loglevel');
import { AppWithDom } from './App';
import { Config } from './Config';
import { DomUtils } from './DomUtils';
import { PointerEventData, PointerEventType } from './PointerEventData';

type ButtonsState = {isButtonsUp: boolean, buttons: number};

export type PointerEventListener = (ev: PointerEventData) => void;

export type PointerEventDispatcherOptions = {
    ignoreOpacity?: boolean,
    dragStartDistance?: number,
    dragCssCursor?: string,
    dragTransparentClasses?: string[],
    allowDefaultActions?: boolean,
};

type EventListenerRecord = {
    buttons:      null|DomUtils.ButtonId,
    modifierKeys: null|DomUtils.ModifierKeyId,
    listener:     PointerEventListener,
};

export class PointerEventDispatcher {
    // Known bugs:
    // Text cursor doesn't show for text behind transparent areas of domElem.
    // Text not selectable behind transparent areas of domElem.
    // Continuing text selection behind domElem is broken.

    private static readonly elementsWithDefaultActions: Set<string> = new Set([
        'A', 'BUTTON',
        'LABEL', 'INPUT', 'TEXTAREA', 'SELECT',
    ]);
    private static readonly mouseclickEventTypes: Set<string> = new Set(['click', 'dblclick', 'contextmenu']);

    private readonly app: AppWithDom;
    private readonly shadowDomRoot: DocumentOrShadowRoot;
    private readonly domElem: Element;

    private readonly logEventsIn: Set<string> = new Set();
    private readonly logEventsOut: Set<string> = new Set();
    private readonly logListenerCalls: Set<PointerEventType> = new Set();

    private readonly eventListeners: Map<PointerEventType, EventListenerRecord[]> = new Map();
    private ignoreOpacity: boolean;
    private allowDefaultActions: boolean;
    private readonly opacityMin: number;
    private clickLongMinDelayMs: number = 0.0;
    private clickDoubleMaxDelayMs: number = 0.0;
    private dragStartDistance: number;
    private readonly dragDropTargetUpdateIntervalMs: number;

    private dragCssCursor: null|string;

    private inEventHandling: boolean = false; // For infinite recursion prevention.
    private swallowNextMouseclickEvent: boolean = false;

    private hoverEventsLast: Map<number,PointerEvent> = new Map<number, PointerEvent>();
    private hoverRedirectTargetsLast: Map<number,Element> = new Map<number, Element>();

    private buttonsPointerStatesLast: Map<number,ButtonsState> = new Map<number, ButtonsState>();
    private buttonsDownEventStart: PointerEvent|null = null;
    private buttonsActionPointerId: number|null = null;
    private buttonsResetOngoing: boolean = false; // Waiting until no button pressed.

    private dragEnabled: boolean = false;
    private dragOngoing: boolean = false;
    private dragUserCanceled: boolean = false;
    private dragStartPossible: boolean = false;
    private dragDownEventStart: PointerEventData|null = null;
    private dragDownEventLast: PointerEvent|null = null;
    private dragMoveEventLast: PointerEvent|null = null;
    private dragDropTargetLast: Element|null = null;
    private dragMoveEventDataLast: PointerEventData|null = null;
    private dragUpdateTimeoutHandle: number|null = null;
    private dragTransparentClasses: Set<string> = new Set();
    private dragTransparentElements: Set<Element> = new Set();

    private longClickEnabled: boolean = false;
    private doubleClickEnabled: boolean = false;
    private clickOngoing: boolean = false;
    private clickCount: number = 0;
    private clickIsLong: boolean = false;
    private clickDownEventStart: PointerEvent|null = null;
    private clickDownEventLast: PointerEvent|null = null;
    private clickMoveEventLast: PointerEvent|null = null;
    private clickTimeoutHandle: number|null = null;

    public static makeDispatcher(
        app: AppWithDom, domElem: Element, options?: PointerEventDispatcherOptions,
    ): PointerEventDispatcher {
        return new PointerEventDispatcher(app, domElem, options);
    }

    public static makeOpaqueDispatcher(
        app: AppWithDom, domElem: Element, options?: PointerEventDispatcherOptions,
    ): PointerEventDispatcher {
        options = options ?? {};
        options.ignoreOpacity = options.ignoreOpacity ?? true;
        return new PointerEventDispatcher(app, domElem, options);
    }

    public static makeOpaqueDefaultActionsDispatcher(
        app: AppWithDom, domElem: Element, options?: PointerEventDispatcherOptions,
    ): PointerEventDispatcher {
        options = options ?? {};
        options.ignoreOpacity = options.ignoreOpacity ?? true;
        options.allowDefaultActions = options.allowDefaultActions ?? true;
        return new PointerEventDispatcher(app, domElem, options);
    }

    /**
     * Use to prevent PointerEventDispatchers from preventing default pointer actions happening on element or its children.
     */
    public static protectElementsWithDefaultActions(app: AppWithDom, element: Element): void
    {
        if (this.elementsWithDefaultActions.has(element.tagName)) {
            this.makeOpaqueDefaultActionsDispatcher(app, element);
        } else {
            for (const child of element.children[Symbol.iterator]()) {
                this.protectElementsWithDefaultActions(app, child);
            }
        }
    }

    public constructor(app: AppWithDom, domElem: Element, options?: PointerEventDispatcherOptions)
    {
        this.app = app;
        this.shadowDomRoot = app.getShadowDomRoot();
        this.domElem = domElem;
        this.dragTransparentElements.add(domElem);

        const logIncommingPointer = as.Bool(Config.get('pointerEventDispatcher.logIncommingPointer'));
        const logIncommingMouse   = as.Bool(Config.get('pointerEventDispatcher.logIncommingMouse'));
        const logOutgoingPointer  = as.Bool(Config.get('pointerEventDispatcher.logOutgoingPointer'));
        const logOutgoingMouse    = as.Bool(Config.get('pointerEventDispatcher.logOutgoingMouse'));
        const logButtons           = as.Bool(Config.get('pointerEventDispatcher.logButtons'));
        const logDrag              = as.Bool(Config.get('pointerEventDispatcher.logDrag'));
        const logHover             = as.Bool(Config.get('pointerEventDispatcher.logHover'));
        const logWithEnterLeave    = as.Bool(Config.get('pointerEventDispatcher.logWithEnterLeave'));
        const logWithMove          = as.Bool(Config.get('pointerEventDispatcher.logWithMove'));

        if (logIncommingPointer) {
            this.logEventsIn.add('gotpointercapture');
            this.logEventsIn.add('lostpointercapture');
            this.logEventsIn.add('pointercancel');
            this.logEventsIn.add('pointerdown');
            this.logEventsIn.add('pointerup');
            if (logWithMove) {
                this.logEventsIn.add('pointermove');
            }
            if (logWithEnterLeave) {
                this.logEventsIn.add('pointerover');
                this.logEventsIn.add('pointerout');
                this.logEventsIn.add('pointerenter');
                this.logEventsIn.add('pointerleave');
            }
        }
        if (logIncommingMouse) {
            this.logEventsIn.add('mousedown');
            this.logEventsIn.add('mouseup');
            this.logEventsIn.add('click');
            this.logEventsIn.add('dblclick');
            this.logEventsIn.add('contextmenu');
            if (logWithMove) {
                this.logEventsIn.add('mousemove');
            }
            if (logWithEnterLeave) {
                this.logEventsIn.add('mouseover');
                this.logEventsIn.add('mouseout');
                this.logEventsIn.add('mouseenter');
                this.logEventsIn.add('mouseleave');
            }
        }

        if (logOutgoingPointer) {
            this.logEventsOut.add('gotpointercapture');
            this.logEventsOut.add('lostpointercapture');
            this.logEventsOut.add('pointercancel');
            this.logEventsOut.add('pointerdown');
            this.logEventsOut.add('pointerup');
            if (logWithMove) {
                this.logEventsOut.add('pointermove');
            }
            if (logWithEnterLeave) {
                this.logEventsOut.add('pointerover');
                this.logEventsOut.add('pointerout');
                this.logEventsOut.add('pointerenter');
                this.logEventsOut.add('pointerleave');
            }
        }
        if (logOutgoingMouse) {
            this.logEventsOut.add('mousedown');
            this.logEventsOut.add('mouseup');
            this.logEventsOut.add('click');
            this.logEventsOut.add('dblclick');
            this.logEventsOut.add('contextmenu');
            if (logWithMove) {
                this.logEventsOut.add('mousemove');
            }
            if (logWithEnterLeave) {
                this.logEventsOut.add('mouseover');
                this.logEventsOut.add('mouseout');
                this.logEventsOut.add('mouseenter');
                this.logEventsOut.add('mouseleave');
            }
        }

        if (logButtons) {
            this.logListenerCalls.add('clickstart');
            this.logListenerCalls.add('buttondown');
            this.logListenerCalls.add('buttonup');
            this.logListenerCalls.add('click');
            this.logListenerCalls.add('longclick');
            this.logListenerCalls.add('doubleclick');
            this.logListenerCalls.add('clickend');
        }
        if (logDrag) {
            this.logListenerCalls.add('dragstart');
            if (logWithEnterLeave) {
                this.logListenerCalls.add('dragenter');
                this.logListenerCalls.add('dragleave');
            }
            this.logListenerCalls.add('dragdrop');
            this.logListenerCalls.add('dragcancel');
            this.logListenerCalls.add('dragend');
            if (logWithMove) {
                this.logListenerCalls.add('dragmove');
            }
        }
        if (logHover) {
            if (logWithEnterLeave) {
                this.logListenerCalls.add('hoverenter');
                this.logListenerCalls.add('hoverleave');
            }
            if (logWithMove) {
                this.logListenerCalls.add('hovermove');
            }
        }

        this.opacityMin = as.Float(Config.get('pointerEventDispatcher.pointerOpaqueOpacityMin'), 0.001);
        this.dragDropTargetUpdateIntervalMs = 1000 * as.Float(Config.get('pointerEventDispatcher.pointerDropTargetUpdateIntervalSec'), 0.5);
        this.clickLongMinDelayMs            = 1000 * as.Float(Config.get('pointerEventDispatcher.pointerLongclickMinSec'), 1);
        this.clickDoubleMaxDelayMs          = 1000 * as.Float(Config.get('pointerEventDispatcher.pointerDoubleclickMaxSec'), 0.25);

        this.setIgnoreOpacity(options?.ignoreOpacity);
        this.setAllowDefaultActions(options?.allowDefaultActions);

        this.setDragStartDistance(options?.dragStartDistance);
        this.setDragCssCursor(options?.dragCssCursor);
        this.addDropTargetTransparentClass(...(options?.dragTransparentClasses ?? []));

        const logOnlyHandler = (ev: MouseEvent) => this.handleEventLogOnly(ev);
        const updateHandler = (ev: PointerEvent) => this.handlePointerEvent(ev);
        this.domElem.addEventListener('pointermove',  updateHandler);
        this.domElem.addEventListener('pointerover',  logOnlyHandler);
        this.domElem.addEventListener('pointerout',   updateHandler); // For non-capturing leave detection.
        this.domElem.addEventListener('pointerenter', logOnlyHandler);
        this.domElem.addEventListener('pointerleave', logOnlyHandler);
        this.domElem.addEventListener('pointerdown',  updateHandler);
        this.domElem.addEventListener('pointerup',    updateHandler);

        const cancelHandler = (ev: PointerEvent) => this.handlePointerCancelEvent(ev);
        this.domElem.addEventListener('gotpointercapture',  logOnlyHandler);
        this.domElem.addEventListener('lostpointercapture', logOnlyHandler);
        this.domElem.addEventListener('pointercancel',      cancelHandler);

        // Handle legacy mouse events:
        const mouseHandler = (ev: MouseEvent) => this.handleMouseEvent(ev);
        this.domElem.addEventListener('mousemove',   mouseHandler);
        this.domElem.addEventListener('mouseover',   logOnlyHandler);
        this.domElem.addEventListener('mouseout',    logOnlyHandler);
        this.domElem.addEventListener('mouseenter',  logOnlyHandler);
        this.domElem.addEventListener('mouseleave',  logOnlyHandler);
        this.domElem.addEventListener('mousedown',   mouseHandler);
        this.domElem.addEventListener('mouseup',     mouseHandler);
        this.domElem.addEventListener('click',       mouseHandler);
        this.domElem.addEventListener('dblclick',    mouseHandler);
        this.domElem.addEventListener('contextmenu', mouseHandler); // Singleclick with secondary button or long tap.
    }

    public addHoverEnterListener(listener: PointerEventListener): PointerEventDispatcher {
        return this.addListener('hoverenter', null, null, listener);
    }
    public addHoverLeaveListener(listener: PointerEventListener): PointerEventDispatcher {
        return this.addListener('hoverleave', null, null, listener);
    }

    public addAnyButtonDownListener(listener: PointerEventListener): PointerEventDispatcher {
        return this.addListener('buttondown', null, null, listener);
    }

    public addUnmodifiedLeftClickListener(listener: PointerEventListener): PointerEventDispatcher {
        return this.addListener('click', DomUtils.ButtonId.first, DomUtils.ModifierKeyId.none, listener);
    }
    public addShiftLeftClickListener(listener: PointerEventListener): PointerEventDispatcher {
        return this.addListener('click', DomUtils.ButtonId.first, DomUtils.ModifierKeyId.shift, listener);
    }
    public addCtrlLeftClickListener(listener: PointerEventListener): PointerEventDispatcher {
        return this.addListener('click', DomUtils.ButtonId.first, DomUtils.ModifierKeyId.control, listener);
    }

    public addUnmodifiedLeftLongclickListener(listener: PointerEventListener): PointerEventDispatcher {
        return this.addListener('longclick', DomUtils.ButtonId.first, DomUtils.ModifierKeyId.none, listener);
    }
    public addShiftLeftLongclickListener(listener: PointerEventListener): PointerEventDispatcher {
        return this.addListener('longclick', DomUtils.ButtonId.first, DomUtils.ModifierKeyId.shift, listener);
    }
    public addCtrlLeftLongclickListener(listener: PointerEventListener): PointerEventDispatcher {
        return this.addListener('longclick', DomUtils.ButtonId.first, DomUtils.ModifierKeyId.control, listener);
    }

    public addUnmodifiedLeftDoubleclickListener(listener: PointerEventListener): PointerEventDispatcher {
        return this.addListener('doubleclick', DomUtils.ButtonId.first, DomUtils.ModifierKeyId.none, listener);
    }
    public addShiftLeftDoubleclickListener(listener: PointerEventListener): PointerEventDispatcher {
        return this.addListener('doubleclick', DomUtils.ButtonId.first, DomUtils.ModifierKeyId.shift, listener);
    }
    public addCtrlLeftDoubleclickListener(listener: PointerEventListener): PointerEventDispatcher {
        return this.addListener('doubleclick', DomUtils.ButtonId.first, DomUtils.ModifierKeyId.control, listener);
    }

    public addDragStartListener(listener: PointerEventListener): PointerEventDispatcher {
        return this.addListener('dragstart', null, null, listener);
    }
    public addDragMoveListener(listener: PointerEventListener): PointerEventDispatcher {
        return this.addListener('dragmove', null, null, listener);
    }
    public addDragEnterListener(listener: PointerEventListener): PointerEventDispatcher {
        return this.addListener('dragenter', null, null, listener);
    }
    public addDragLeaveListener(listener: PointerEventListener): PointerEventDispatcher {
        return this.addListener('dragleave', null, null, listener);
    }
    public addDragDropListener(listener: PointerEventListener): PointerEventDispatcher {
        return this.addListener('dragdrop', null, null, listener);
    }
    public addDragCancelListener(listener: PointerEventListener): PointerEventDispatcher {
        return this.addListener('dragcancel', null, null, listener);
    }
    public addDragEndListener(listener: PointerEventListener): PointerEventDispatcher {
        return this.addListener('dragend', null, null, listener);
    }

    public addListener(
        type:         PointerEventType,
        buttons:      null|DomUtils.ButtonId,
        modifierKeys: null|DomUtils.ModifierKeyId,
        listener:     PointerEventListener
    ): PointerEventDispatcher {
        const record: EventListenerRecord = { buttons, modifierKeys, listener };
        const typeListeners = this.eventListeners.get(type) ?? [];
        typeListeners.push(record);
        this.eventListeners.set(type, typeListeners);
        switch (type) {
            case 'longclick': {
                this.longClickEnabled = true;
            } break;
            case 'doubleclick': {
                this.doubleClickEnabled = true;
            } break;
            case 'dragstart':
            case 'dragmove':
            case 'dragenter':
            case 'dragleave':
            case 'dragdrop':
            case 'dragcancel':
            case 'dragend': {
                this.dragEnabled = true;
            } break;
        }
        return this;
    }

    public setDragStartDistance(startDistance?: number): void
    {
        startDistance = startDistance ?? as.Float(Config.get('pointerEventDispatcher.pointerDragStartDistance'), 3.0);
        this.dragStartDistance = Math.max(1, startDistance);
    }

    public setIgnoreOpacity(ignoreOpacity?: boolean): void
    {
        this.ignoreOpacity = ignoreOpacity ?? false;
    }

    public setAllowDefaultActions(allowDefaultActions?: boolean): void
    {
        this.allowDefaultActions = allowDefaultActions ?? false;
    }

    public setDragCssCursor(cssCursor?: string): void
    {
        this.dragCssCursor = cssCursor ?? null;
    }

    public addDropTargetTransparentClass(...classNames: Array<string>): void
    {
        for (const className of classNames.values()) {
            this.dragTransparentClasses.add(className);
        }
    }

    public removeDropTargetTransparentClass(...classNames: Array<string>): void
    {
        for (const className of classNames.values()) {
            this.dragTransparentClasses.delete(className);
        }
    }

    public cancelDrag(): void
    {
        if (this.dragOngoing) {
            this.dragUserCanceled = true;
        }
    }

    private cancelAllActions(): void
    {
        this.clickEnd(true);
        this.dragCancel(true);
        this.buttonsResetOngoing = true; // Triggers cleaning of this.buttons* by handleButtonsReset.
    }

    private handleEventLogOnly(ev: MouseEvent): void
    {
        if (this.logEventsIn.has(ev.type)) {
            const msg = `PointerEventDispatcher.handleEventLogOnly: Ignoring event we aren't interested in.`;
            const {type, buttons} = ev;
            log.info(msg, {type, buttons, domelem: this.domElem, ev, this: {...this}});
        }
    }

    private handleMouseEvent(ev: MouseEvent): void
    {
        // Handles the legacy mouse events. For every mouse event one or more pointer events already have been handled.

        if (this.inEventHandling) {
            // Routing loop detected. Just swallow the event.
            if (this.logEventsIn.has(ev.type)) {
                const msg = `PointerEventDispatcher.handleMouseEvent: Ignoring event while handling another event (probably a redirection loop).`;
                const {type, buttons} = ev;
                log.info(msg, {type, buttons, domelem: this.domElem, ev, this: {...this}});
            }
            this.stopEventProcessing(ev, true, true);
            return;
        }

        this.inEventHandling = true;
        this.swallowIgnoreOrRerouteMouseEvent(ev);
        this.inEventHandling = false;
    }

    private swallowIgnoreOrRerouteMouseEvent(ev: MouseEvent): void
    {
        // Special handling for some click mouse events:
        const isClick = PointerEventDispatcher.mouseclickEventTypes.has(ev.type);
        if (isClick && this.swallowNextMouseclickEvent) {
            // Event represents already-handled click.
            this.stopEventProcessing(ev, true, !this.allowDefaultActions);
            this.swallowNextMouseclickEvent = false;
            if (this.logEventsIn.has(ev.type)) {
                const msg = `PointerEventDispatcher.swallowIgnoreOrRerouteMouseEvent: Swallowing mouse click because swallowNextMouseclickEvent was true.`;
                const {type, buttons} = ev;
                log.info(msg, {type, buttons, domelem: this.domElem, ev, this: {...this}});
            }
            return;
        }

        if (ev.type === 'contextmenu') {
            // Don't touch the event lest it won't become untrusted and not make the browser display the context menu.
            if (this.logEventsIn.has(ev.type)) {
                const msg = `PointerEventDispatcher.swallowIgnoreOrRerouteMouseEvent: Completely ignoring the contextmenu event (it should just bubble up).`;
                const {type, buttons} = ev;
                log.info(msg, {type, buttons, domelem: this.domElem, ev, this: {...this}});
            }
            return;
        }

        // Handle remaining events that are for us:
        if (this.isOpaqueAtEventLocation(ev)) {
            const preventDefault = !this.allowDefaultActions || this.dragOngoing;
            this.stopEventProcessing(ev, true, preventDefault);
            return;
        }

        // Reroute remaining events (not special case clicks and not for us):
        // The event becomes untrusted by this.
        if (this.logEventsIn.has(ev.type)) {
            const msg = `PointerEventDispatcher.swallowIgnoreOrRerouteMouseEvent: Rerouting event.`;
            const {type, buttons} = ev;
            log.info(msg, {type, buttons, domelem: this.domElem, ev, this: {...this}});
        }
        this.reroutePointerOrMouseEvent(ev);
        this.stopEventProcessing(ev, true, true);
    }

    private handlePointerCancelEvent(ev: PointerEvent): void
    {
        if (this.logEventsIn.has(ev.type)) {
            const msg = `PointerEventDispatcher.handlePointerCancelEvent`;
            const {type, buttons} = ev;
            log.info(msg, {type, buttons, domelem: this.domElem, ev, this: {...this}});
        }

        // Call buttonup event handlers when any button was down:
        if ((this.buttonsPointerStatesLast.get(ev.pointerId)?.buttons ?? DomUtils.ButtonId.none) !== DomUtils.ButtonId.none) {
            const data = new PointerEventData('buttonup', ev, this.domElem, {
                buttons: DomUtils.ButtonId.none, // Assume buttons to be all up no matter what.
            });
            this.callEventListener(data);
        }

        // Untrack pointer button state (implicitly assumes buttons to be up for releasePointer and handleButtonsReset):
        this.buttonsPointerStatesLast.delete(ev.pointerId);

        // Allow other elements to receive events in case the pointer comes back online:
        if (this.dragEnabled) {
            DomUtils.releasePointer(this.domElem, ev.pointerId);
        }

        // Clean up any action-in-progress state:
        const isInvolvedInAction
            =  ev.pointerId === (this.buttonsDownEventStart?.pointerId ?? null)
            || ev.pointerId === (this.clickDownEventStart?.pointerId ?? null);
        if (isInvolvedInAction) {
            this.cancelAllActions();
        }
        if (this.buttonsResetOngoing) {
            this.handleButtonsReset();
        }

        // Send hoverleave if it was the last pointer hovering over domElem:
        this.handleHoverleave(ev);
    }

    private handlePointerEvent(ev: PointerEvent): void
    {
        if (this.inEventHandling) {
            if (this.logEventsIn.has(ev.type)) {
                const msg = `PointerEventDispatcher.handlePointerEvent: Ignoring event while handling another event (probably a redirection loop).`;
                const {type, buttons} = ev;
                log.info(msg, {type, buttons, domelem: this.domElem, ev, this: {...this}});
            }
            this.stopEventProcessing(ev, true, true);
            return;
        }

        this.inEventHandling = true;
        const pointerId = ev.pointerId;
        const lastButtonsState
            = this.buttonsPointerStatesLast.get(pointerId) ?? {isButtonsUp: false, buttons: DomUtils.ButtonId.none};
        const isOpaqueAtLoc = this.isOpaqueAtEventLocation(ev);
        const isInvolvedInAction = pointerId === this.buttonsActionPointerId;
        const hadButtonsDown = lastButtonsState.buttons !== DomUtils.ButtonId.none;

        if (this.logEventsIn.has(ev.type)) {
            const msg = `PointerEventDispatcher.handlePointerEvent`;
            const {type, buttons} = ev;
            log.info(msg, {type, buttons, isOpaqueAtLoc, isInvolvedInAction, hadButtonsDown, domelem: this.domElem, ev, this: {...this}});
        }

        const evIsForUs = isOpaqueAtLoc || isInvolvedInAction || hadButtonsDown;
        if (evIsForUs) {
            this.handlePointerEventForUs(ev, isOpaqueAtLoc, lastButtonsState);
        } else {
            this.handlePointerEventNotForUs(ev);
        }
        this.inEventHandling = false;
    }

    private handlePointerEventNotForUs(ev: PointerEvent): void
    {
        this.handleHoverleave(ev); // Handle leave if previously hovering.

        // Reroute to next pointer-enabled element (opaque or not) behind domElem:
        const elemBelow = this.reroutePointerOrMouseEvent(ev);
        if (this.domElem instanceof HTMLElement && elemBelow instanceof HTMLElement) {
            const cursor = this.dragOngoing ? this.dragCssCursor : null;
            this.domElem.style.cursor = cursor ?? window.getComputedStyle(elemBelow)['cursor'];
        }

        this.stopEventProcessing(ev, true, true);
    }

    private handlePointerEventForUs(ev: PointerEvent, isOpaqueAtLoc: boolean, lastButtonsState: ButtonsState): void
    {
        this.handleRedirectTargetPointerOut(ev, null);
        if (!ev.isPrimary) {
            // Multitouch event - trigger full action reset:
            this.cancelAllActions();
        } else {
            // Concurrency check disabled because pointer ID changing for each click in Chrome prevents doubleclick detection:
            const isConcurrent = false;//ev.pointerId !== (this.buttonsActionPointerId ?? ev.pointerId);

            if (ev.buttons !== lastButtonsState.buttons) {
                this.handleButtonEvent(ev, isConcurrent, lastButtonsState);
            }

            // Handle drag start:
            if (this.dragEnabled && !this.buttonsResetOngoing && !isConcurrent && this.dragStartPossible
            && DomUtils.pointerMovedDistance(this.buttonsDownEventStart, ev, this.dragStartDistance)) {
                this.clickEnd(true); // Prevent click or doubleclick.
                this.buttonsResetOngoing = false; // Has been set by clickEnd.
                this.swallowNextMouseclickEvent = true;
                this.dragHandleStart(this.buttonsDownEventStart, ev);
            }

        }
        if (this.buttonsResetOngoing) {
            this.handleButtonsReset();
        }

        this.handleMoveEvents(ev, isOpaqueAtLoc);
        if (this.domElem instanceof HTMLElement) {
            const cursor = this.dragOngoing ? this.dragCssCursor : null;
            this.domElem.style.cursor = cursor ?? '';
        }

        const preventDefault = !this.allowDefaultActions || this.dragOngoing;
        this.stopEventProcessing(ev, true, preventDefault);
    }

    private handleButtonEvent(ev: PointerEvent, isConcurrent: boolean, lastButtonsState: ButtonsState): void
    {
        const [buttonsUp, buttonsDown] = DomUtils.calcButtonIdsDiff(lastButtonsState.buttons, ev.buttons);
        const [isButtonsUp, isButtonsDown] = [buttonsUp !== DomUtils.ButtonId.none, buttonsDown !== DomUtils.ButtonId.none];
        const isInitialDown = lastButtonsState.buttons === DomUtils.ButtonId.none;

        this.buttonsPointerStatesLast.set(ev.pointerId, {isButtonsUp, buttons: ev.buttons});

        if (isButtonsUp) {
            // Only the final button up for a pointer triggers an actual pointerup event in chrome.
            // So just accept all heuristically detected ones:
            this.callEventListener(new PointerEventData('buttonup', ev, this.domElem));
        }
        if (isButtonsDown) {
            const isPointerDownEvent = ev.type === 'pointerdown';

            // Don't swallow autogenerated mouse click / contextmenu event if it doesn't become a drag or a click handled by a listener:
            if (isInitialDown && !isPointerDownEvent) {
                this.swallowNextMouseclickEvent = false;
            }

            // Only the first button down for a pointer triggers an actual pointerdown event in chrome.
            // For an uncaptured pointer (lastButtonsState.buttons is zero), the heuristically detected button down
            // might actually have happened outside domElem. So only use heuristics for detecting additional buttons:
            if (isInitialDown && !isPointerDownEvent) {
                // Missed initial pointerdown (likely because it happened outdside domElem's bounding box).
                this.cancelAllActions();
            } else {
                this.handleHovering(ev);
                this.callEventListener(new PointerEventData('buttondown', ev, this.domElem));
            }
            if (isInitialDown) {
                DomUtils.capturePointer(this.domElem, ev.pointerId);
            }
        }

        if (isConcurrent) {
            this.cancelAllActions();
        }
        if (!this.buttonsResetOngoing && isButtonsUp) {
            this.dragStartPossible = false;
            if (ev.buttons === DomUtils.ButtonId.none) {
                if (this.dragOngoing) {
                    this.dragHandleDrop(ev);
                } else if (this.clickOngoing) {
                    this.clickHandleUpEvent(ev);
                }
                this.buttonsResetOngoing = !this.dragOngoing && !this.clickOngoing;
            }
        }
        if (!this.buttonsResetOngoing && isButtonsDown) {
            this.buttonsActionPointerId = ev.pointerId;
            if (isInitialDown) {
                this.buttonsDownEventStart = ev;
                this.dragStartPossible = true;
                this.clickHandleDownEvent(ev);
            } else {
                if (lastButtonsState.isButtonsUp || isButtonsUp) {
                    // Button down after button up not leading to no buttons pressed.
                    // Interpret as user canceling a drag or click:
                    this.cancelAllActions();
                }
                if (this.clickOngoing) {
                    this.clickHandleDownEvent(ev);
                }
            }
        }
    }

    private handleButtonsReset(): void
    {
        this.buttonsDownEventStart = null;
        this.buttonsResetOngoing = false;
        if (!this.clickOngoing) {
            // Don't need to capture a doubleclick pointerdown outside domElem.
            this.buttonsActionPointerId = null;
        }
        for (const [pointerId, pointerState] of this.buttonsPointerStatesLast.entries()) {
            if (pointerState.buttons === DomUtils.ButtonId.none && pointerId !== this.buttonsActionPointerId) {
                this.buttonsPointerStatesLast.delete(pointerId);
                if (this.dragEnabled) {
                    DomUtils.releasePointer(this.domElem, pointerId);
                }
            } else {
                this.buttonsResetOngoing = true;
            }
        }
    }

    private handleMoveEvents(ev: PointerEvent, isOpaqueAtLoc: boolean): void
    {
        if (this.buttonsResetOngoing) {
            this.hoverLeaveAll(null); // No hover while cancelling interaction.
            return;
        }

        if (this.dragOngoing) {
            this.dragHandleMove(ev);
            this.hoverLeaveAll(null); // No hover while dragging.
            return;
        }

        if (this.clickOngoing) {
            this.clickHandleMoveEvent(ev);
        }

        let isHovering
            = isOpaqueAtLoc
            && ev.type !== 'pointerout'; // Prevent eternal hover for finger/pen raised out of detection range.
        if (this.clickOngoing) {
            // Only interacting pointer can hover:
            const interactivePointerId = this.clickDownEventStart.pointerId;
            if (ev.pointerId !== interactivePointerId) {
                return;
            }
            this.hoverLeaveAll(interactivePointerId); // All other pointers
        }

        if (isHovering) {
            this.handleHovering(ev);
        } else {
            this.handleHoverleave(ev);
        }
    }

    // -------------------------------------------------------------------------
    // Hover

    private hoverLeaveAll(pointerIdToExclude: number|null): void
    {
        for (const oldEvent of this.hoverEventsLast.values()) {
            if (oldEvent.pointerId !== pointerIdToExclude) {
                this.handleHoverleave(oldEvent);
            }
        }
    }

    private handleHovering(ev: PointerEvent): void
    {
        // Signal pointerout to elements behind us if the pointer started hovering our domElem:
        if (!this.hoverEventsLast.has(ev.pointerId)) {
            this.handleRedirectTargetPointerOut(ev, null);
        }

        if (this.hoverEventsLast.size === 0) {
            this.callEventListener(new PointerEventData('hoverenter', ev, this.domElem));
        }
        this.hoverEventsLast.set(ev.pointerId, ev);
        this.callEventListener(new PointerEventData('hovermove', ev, this.domElem));
    }

    private handleHoverleave(ev: PointerEvent): void
    {
        const wasHovering = this.hoverEventsLast.delete(ev.pointerId);
        if (wasHovering && this.hoverEventsLast.size === 0) {
            this.callEventListener(new PointerEventData('hoverleave', ev, this.domElem));
        }
    }

    // -------------------------------------------------------------------------
    // Click/doublecklick
    //
    // Button down for first click (handled by handleButtonEvent)
    // -> button up for first click
    // -> timeout (single click) / button down (double click)
    // -> wait for button up (handled by handleButtonsReset)

    private clickHandleDownEvent(eventDown: PointerEvent): void
    {
        switch (this.clickCount) {
            case 0: {
                if (!this.clickOngoing) {
                    this.clickOngoing = true;
                    this.clickIsLong = false;
                    if (this.longClickEnabled) {
                        const handler = () => {
                            this.clickCount = 1;
                            this.clickIsLong = true;
                            this.clickEnd(false);
                            this.handleButtonsReset();
                        };
                        this.clickTimeoutHandle = window.setTimeout(handler, this.clickLongMinDelayMs);
                    }
                    this.clickDownEventStart = eventDown;
                    this.clickMoveEventLast = eventDown;
                    this.callEventListener(new PointerEventData('clickstart', eventDown, this.domElem));
                }
                this.clickDownEventLast = eventDown;
            } break;
            case 1: {
                if (eventDown.buttons === this.clickDownEventLast.buttons) {
                    // Double click detected.
                    this.clickMoveEventLast = eventDown;
                    this.clickCount = 2;
                    this.clickEnd(false);
                }
            } break;
        }
    }

    private clickHandleUpEvent(eventUp: PointerEvent): void
    {
        window.clearTimeout(this.clickTimeoutHandle);
        this.clickTimeoutHandle = null;
        switch (this.clickCount) {
            case 0: {
                // Initial full buttons up - this is at least a click but might also become a doubleclick.
                this.clickMoveEventLast = eventUp;
                this.clickCount = 1;
                const handler = () => {
                    this.clickEnd(false);
                    this.handleButtonsReset();
                };
                if (this.doubleClickEnabled) {
                    this.clickTimeoutHandle = window.setTimeout(handler, this.clickDoubleMaxDelayMs);
                } else {
                    handler();
                }
            } break;
            case 1: {
                this.clickEnd(true); // Cancel click/doubleclick.
            } break;
        }
    }

    private clickHandleMoveEvent(eventMove: PointerEvent): void
    {
        if (this.clickOngoing) {
            this.clickMoveEventLast = eventMove;
            if (DomUtils.pointerMovedDistance(this.clickDownEventStart, this.clickMoveEventLast, this.dragStartDistance)) {
                this.clickEnd(true);
            }
        }
    }

    private clickEnd(discard: boolean): void
    {
        window.clearTimeout(this.clickTimeoutHandle);
        this.clickTimeoutHandle = null;
        if (this.clickOngoing) {
            if (true
                && this.clickCount !== 0
                && !discard
                && !DomUtils.pointerMovedDistance(this.clickDownEventStart, this.clickMoveEventLast, this.dragStartDistance)
            ) {
                const type = this.getClickType();
                const data = new PointerEventData(type, this.clickDownEventLast, this.domElem, {
                    posEvent: this.clickDownEventStart,
                    modifierKeys: this.clickMoveEventLast,
                });
                if (this.callEventListener(data)) {
                    this.swallowNextMouseclickEvent = true; // We handled the click, so swallow the browser generated click event.
                }
            }
            this.callEventListener(new PointerEventData('clickend', this.clickMoveEventLast, this.domElem));
        }
        this.clickOngoing = false;
        this.clickIsLong = false;
        this.clickCount = 0;
        this.clickDownEventStart = null;
        this.clickDownEventLast = null;
        this.clickMoveEventLast = null;
        if (this.buttonsResetOngoing) {
            this.handleButtonsReset();
        }
    }

    private getClickType(): 'longclick'|'click'|'doubleclick'
    {
        if (this.clickCount > 1) {
            return 'doubleclick';
        }
        if (this.clickIsLong) {
            return 'longclick';
        }
        return 'click';
    }

    // -------------------------------------------------------------------------
    // Drag
    //
    // Button down (handled by handleInitialButtonDown)
    // -> move
    // -> button up (drop)

    private dragHandleStart(eventStart: PointerEvent, eventMove: PointerEvent): void
    {
        this.dragOngoing = true;
        this.dragUserCanceled = false;
        this.dragStartPossible = false;
        this.dragDropTargetLast = null;
        this.dragDownEventStart = new PointerEventData('buttondown', eventStart, this.domElem);
        this.dragDownEventLast = eventStart;
        this.dragMoveEventLast = null;
        this.dragMoveEventDataLast = null;
        this.callEventListener(new PointerEventData('dragstart', eventMove, this.domElem, {
            startEvent: this.dragDownEventStart,
        }));
        if (this.dragUserCanceled) {
            this.dragCancel(true);
        }
    }

    private dragHandleDrop(eventUpLast: PointerEvent): void
    {
        this.dragOngoing = false;
        if (this.dragUpdateTimeoutHandle !== null) {
            window.clearInterval(this.dragUpdateTimeoutHandle);
        }

        this.dragCallMoveHandler(eventUpLast);
        if (this.dragUserCanceled) {
            this.dragCancel(true);
        } else {

            if (this.dragDropTargetLast) {
                this.callEventListener(new PointerEventData('dragleave', eventUpLast, this.domElem, {
                    startEvent: this.dragDownEventStart,
                    buttons: this.dragDownEventLast,
                    dropTargetLast: this.dragDropTargetLast,
                }));
            }

            this.callEventListener(new PointerEventData('dragdrop', eventUpLast, this.domElem, {
                startEvent: this.dragDownEventStart,
                buttons: this.dragDownEventLast,
                dropTarget: this.dragDropTargetLast,
                dropTargetLast: this.dragDropTargetLast,
            }));

            this.callEventListener(new PointerEventData('dragend', eventUpLast, this.domElem, {
                startEvent: this.dragDownEventStart,
                buttons: this.dragDownEventLast,
                dropTarget: this.dragDropTargetLast,
                dropTargetLast: this.dragDropTargetLast,
            }));

            this.dragCancel(false);
        }
    }

    private dragHandleMove(eventMove?: PointerEvent): void
    {
        if (this.dragUpdateTimeoutHandle !== null) {
            window.clearInterval(this.dragUpdateTimeoutHandle);
        }
        if (!this.dragOngoing) {
            return;
        }
        eventMove = eventMove ?? this.dragMoveEventLast;
        this.dragCallMoveHandler(eventMove);
        if (this.dragUserCanceled) {
            this.dragCancel(true);
            return;
        }

        const handler = () => this.dragHandleMove();
        this.dragUpdateTimeoutHandle = window.setTimeout(() => handler, this.dragDropTargetUpdateIntervalMs);
        this.dragMoveEventLast = eventMove;
    }

    private dragCallMoveHandler(eventMove: PointerEvent): void
    {
        const clientX = eventMove.clientX;
        const clientY = eventMove.clientY;

        if (eventMove.buttons > this.dragDownEventLast.buttons) {
            this.dragDownEventLast = eventMove;
        }

        const opacityMin = this.ignoreOpacity ? 0 : this.opacityMin;
        const dropTarget = DomUtils.getTopmostOpaqueElemAtViewportPos(
            this.shadowDomRoot, clientX, clientY, opacityMin, this.dragTransparentClasses, this.dragTransparentElements);

        const moveData = new PointerEventData('dragmove', eventMove, this.domElem, {
            startEvent: this.dragDownEventStart,
            buttons: this.dragDownEventLast,
            dropTarget: dropTarget,
            dropTargetLast: this.dragDropTargetLast,
        });

        if (moveData.dropTargetChanged) {
            if (this.dragDropTargetLast) {
                this.callEventListener(new PointerEventData('dragleave', eventMove, this.domElem, {
                    startEvent: this.dragDownEventStart,
                    buttons: this.dragDownEventLast,
                    dropTarget: dropTarget,
                    dropTargetLast: this.dragDropTargetLast,
                }));
            }
            if (dropTarget) {
                this.callEventListener(new PointerEventData('dragenter', eventMove, this.domElem, {
                    startEvent: this.dragDownEventStart,
                    buttons: this.dragDownEventLast,
                    dropTarget: dropTarget,
                    dropTargetLast: this.dragDropTargetLast,
                }));
            }
        }

        if (!this.dragMoveEventDataLast
        || this.dragMoveEventLast.clientX !== moveData.clientX || this.dragMoveEventLast.clientY !== moveData.clientY
        || this.dragMoveEventDataLast.buttons !== moveData.buttons
        || this.dragMoveEventDataLast.modifierKeys !== moveData.modifierKeys
        || dropTarget !== this.dragDropTargetLast) {
            this.callEventListener(moveData);
        }

        this.dragMoveEventDataLast = moveData;
        this.dragDropTargetLast = dropTarget;
    }

    private dragCancel(sendCancel: boolean): void
    {
        if (this.dragUpdateTimeoutHandle !== null) {
            window.clearInterval(this.dragUpdateTimeoutHandle);
        }
        this.dragStartPossible = false;
        if (this.dragOngoing) {
            this.dragOngoing = false;
            this.dragUserCanceled = false;
            if (sendCancel) {
                const moveEventLast = this.dragMoveEventLast ?? this.dragDownEventLast;

                if (this.dragDropTargetLast) {
                    this.callEventListener(new PointerEventData('dragleave', moveEventLast, this.domElem, {
                        startEvent: this.dragDownEventStart,
                        buttons: this.dragDownEventLast,
                        dropTargetLast: this.dragDropTargetLast,
                    }));
                }

                this.callEventListener(new PointerEventData('dragcancel', moveEventLast, this.domElem, {
                    startEvent: this.dragDownEventStart,
                    buttons: this.dragDownEventLast,
                }));

                this.callEventListener(new PointerEventData('dragend', moveEventLast, this.domElem, {
                    startEvent: this.dragDownEventStart,
                    buttons: this.dragDownEventLast,
                }));
            }
        }
        this.dragDropTargetLast = null;
        this.dragDownEventStart = null;
        this.dragDownEventLast = null;
        this.dragMoveEventLast = null;
        this.dragMoveEventDataLast = null;
    }

    // -------------------------------------------------------------------------
    // Helpers

    private isOpaqueAtEventLocation(ev: MouseEvent): boolean
    {
        if (this.ignoreOpacity) {
            return true; // Event is for us even if actually outside the element's bounding box.
        }
        const [opacityAtLoc, pointerInBoundingbox] = DomUtils.getElemOpacityAtPos(this.domElem, ev.clientX, ev.clientY);
        const isOpaqueAtLoc = pointerInBoundingbox && opacityAtLoc >= this.opacityMin;
        return isOpaqueAtLoc;
    }

    private callEventListener(data: PointerEventData): boolean
    {
        const {type, buttons, modifierKeys} = data;
        const listeners = (this.eventListeners.get(type) ?? []).filter(record => {
            return (is.nil(record.buttons) || record.buttons === buttons)
                && (is.nil(record.modifierKeys) || record.modifierKeys === modifierKeys);
        });
        if (this.logListenerCalls.has(data.type)) {
            const msg = `PointerEventDispatcher.callEventListeners`;
            log.info(msg, {type, buttons, modifierKeys, domElement: this.domElem, data, listeners, this: {...this}});
        }
        listeners.forEach(listenerRecord => {
            try {
                listenerRecord.listener(data);
            } catch (error) {
                this.app.onError(error);
            }
        });
        return listeners.length !== 0;
    }

    private reroutePointerOrMouseEvent(ev: MouseEvent): Element|null
    {
        const elemBelow = DomUtils.getNextElemBehindElemAtViewportPos(this.shadowDomRoot, this.domElem, ev.clientX, ev.clientY);
        const isOutEvent = ev.type === 'pointerout' || ev.type === 'pointerleave';

        // Create artificial enter/leave and move events for new and former target element:
        if (ev instanceof PointerEvent) {
            this.handleRedirectTargetPointerOut(ev, elemBelow);
            this.handleRedirectTargetPointerHover(ev, elemBelow);
        }

        if (!is.nil(elemBelow)
        && !isOutEvent) { // Don't reroute event meaningless for other DOM elements.
            const newEv = DomUtils.cloneEvent(ev);
            this.dispatchDomEvent(newEv, elemBelow);
        }
        return elemBelow;
    }

    private handleRedirectTargetPointerOut(ev: PointerEvent, hoverRedirectTargetCurrent: Element|null): void
    {
        if (!ev.isPrimary) {
            return; // Don't send pointerout, pointerleave for secondary multitouch.
        }
        const hoverRedirectTargetLast = this.hoverRedirectTargetsLast.get(ev.pointerId) ?? null;
        if (is.nil(hoverRedirectTargetLast)
        || (ev.type !== 'pointerout' && hoverRedirectTargetCurrent === hoverRedirectTargetLast)) {
            return;
        }
        this.hoverRedirectTargetsLast.delete(ev.pointerId);
        for (let elem: Element = hoverRedirectTargetLast; !is.nil(elem); elem = elem.parentElement) {
            this.dispatchDomEvent(DomUtils.cloneEvent(ev, {type: 'pointerout'}), elem);
        }
        this.dispatchDomEvent(DomUtils.cloneEvent(ev, {type: 'pointerleave'}), hoverRedirectTargetLast);
    }

    private handleRedirectTargetPointerHover(ev: PointerEvent, hoverRedirectTargetCurrent: Element|null): void
    {
        if (is.nil(hoverRedirectTargetCurrent)
        || ev.type !== 'pointermove'
        || hoverRedirectTargetCurrent === this.hoverRedirectTargetsLast.get(ev.pointerId)) {
            return;
        }
        this.hoverRedirectTargetsLast.set(ev.pointerId, hoverRedirectTargetCurrent);
        if (ev.isPrimary) { // Don't send pointerover, pointerenter for secondary multitouch.
            for (let elem: Element = hoverRedirectTargetCurrent; !is.nil(elem); elem = elem.parentElement) {
                this.dispatchDomEvent(DomUtils.cloneEvent(ev, {type: 'pointerover'}), elem);
            }
            this.dispatchDomEvent(DomUtils.cloneEvent(ev, {type: 'pointerenter'}), hoverRedirectTargetCurrent);
        }
        this.dispatchDomEvent(DomUtils.cloneEvent(ev, {type: 'pointermove'}), hoverRedirectTargetCurrent);
    }

    private dispatchDomEvent(ev: MouseEvent, domElem: Element): void
    {
        if (this.logEventsOut.has(ev.type)) {
            const msg = `PointerEventDispatcher.dispatchDomEvent: Dispatching event to other element.`;
            const {type, buttons} = ev;
            log.info(msg, {type, buttons, originalElem: this.domElem, newElem: domElem, ev, this: {...this}});
        }
        DomUtils.triggerEvent(ev, domElem);
    }

    private stopEventProcessing(ev: MouseEvent, stopPropagation: boolean, preventDefault: boolean): void
    {
        if (this.logEventsIn.has(ev.type)) {
            const actions = [];
            if (stopPropagation) {
                actions.push('stopping propagation');
            }
            if (preventDefault) {
                actions.push('canceling default action');
            }
            if (!actions.length) {
                actions.push('Not touching the event');
            }
            const action = actions.join(' and ');
            const msg = `PointerEventDispatcher.stopEventProcessing: ${action}.`;
            const { type, buttons, } = ev;
            log.info(msg, {type, buttons, stopPropagation, preventDefault, ev});
        }
        if (stopPropagation) {
            ev.stopImmediatePropagation();
        }
        if (preventDefault) {
            ev.preventDefault();
        }
    }

}
