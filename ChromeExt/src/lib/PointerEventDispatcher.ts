import { is } from './is';
import { as } from './as';
import log = require('loglevel');
import { AppWithDom } from './App';
import { Config } from './Config';
import {
    getDomElemOpacityAtPos, getNextDomElemBehindElemAtViewportPos, getTopmostOpaqueDomElemAtViewportPos,
    cloneDomEvent, dispatchDomEvent, capturePointer, releasePointer, DomButtonId, calcDomButtonIdsDiff,
} from './domTools';
import {
    getDataFromPointerEvent, makeDummyPointerEventData, hasMovedDragDistance,
    PointerEventData, PointerEventType, setButtonsOnPointerEventData,
    setClientPosOnPointerEventData, setDistanceOnPointerEventData, setModifierKeysOnPointerEventData, DomModifierKeyId,
} from './PointerEventData';

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
    buttons:      null|DomButtonId,
    modifierKeys: null|DomModifierKeyId,
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

    private readonly logButtons: boolean;
    private readonly logDrag: boolean;
    private readonly logHover: boolean;
    private readonly logWithEnterLeave: boolean;
    private readonly logWithMove: boolean;
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
    private lastMouseEventButtons: number = 0;
    private lastPointerEventWasForUs: boolean = false;
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
    private dragDownEventStart: PointerEvent|null = null;
    private dragDownEventLast: PointerEvent|null = null;
    private dragMoveEventLast: PointerEvent|null = null;
    private dragDropTargetLast: Element|null = null;
    private dragMoveEventDataLast: PointerEventData|null = null;
    private dragUpdateTimeoutHandle: number|null = null;
    private dragTransparentClasses: Set<string> = new Set<string>();

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

        const logIncommingPointer = as.Bool(Config.get('pointerEventDispatcher.logIncommingPointer'));
        const logIncommingMouse   = as.Bool(Config.get('pointerEventDispatcher.logIncommingMouse'));
        const logOutgoingPointer  = as.Bool(Config.get('pointerEventDispatcher.logOutgoingPointer'));
        const logOutgoingMouse    = as.Bool(Config.get('pointerEventDispatcher.logOutgoingMouse'));
        this.logButtons           = as.Bool(Config.get('pointerEventDispatcher.logButtons'));
        this.logDrag              = as.Bool(Config.get('pointerEventDispatcher.logDrag'));
        this.logHover             = as.Bool(Config.get('pointerEventDispatcher.logHover'));
        this.logWithEnterLeave    = as.Bool(Config.get('pointerEventDispatcher.logWithEnterLeave'));
        this.logWithMove          = as.Bool(Config.get('pointerEventDispatcher.logWithMove'));

        if (logIncommingPointer) {
            this.logEventsIn.add('gotpointercapture');
            this.logEventsIn.add('lostpointercapture');
            this.logEventsIn.add('pointercancel');
            this.logEventsIn.add('pointerdown');
            this.logEventsIn.add('pointerup');
            if (this.logWithMove) {
                this.logEventsIn.add('pointermove');
            }
            if (this.logWithEnterLeave) {
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
            if (this.logWithMove) {
                this.logEventsIn.add('mousemove');
            }
            if (this.logWithEnterLeave) {
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
            if (this.logWithMove) {
                this.logEventsOut.add('pointermove');
            }
            if (this.logWithEnterLeave) {
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
            if (this.logWithMove) {
                this.logEventsOut.add('mousemove');
            }
            if (this.logWithEnterLeave) {
                this.logEventsOut.add('mouseover');
                this.logEventsOut.add('mouseout');
                this.logEventsOut.add('mouseenter');
                this.logEventsOut.add('mouseleave');
            }
        }

        if (this.logButtons) {
            this.logListenerCalls.add('buttondown');
            this.logListenerCalls.add('buttonup');
            this.logListenerCalls.add('click');
            this.logListenerCalls.add('longclick');
            this.logListenerCalls.add('doubleclick');
        }
        if (this.logDrag) {
            this.logListenerCalls.add('dragstart');
            if (this.logWithEnterLeave) {
                this.logListenerCalls.add('dragenter');
                this.logListenerCalls.add('dragleave');
            }
            this.logListenerCalls.add('dragdrop');
            this.logListenerCalls.add('dragcancel');
            this.logListenerCalls.add('dragend');
            if (this.logWithMove) {
                this.logListenerCalls.add('dragmove');
            }
        }
        if (this.logHover) {
            if (this.logWithEnterLeave) {
                this.logListenerCalls.add('hoverenter');
                this.logListenerCalls.add('hoverleave');
            }
            if (this.logWithMove) {
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

    public addUnmodifiedLeftclickListener(listener: PointerEventListener): PointerEventDispatcher {
        return this.addListener('click', DomButtonId.first, DomModifierKeyId.none, listener);
    }

    public addUnmodifiedLeftlongclickListener(listener: PointerEventListener): PointerEventDispatcher {
        return this.addListener('longclick', DomButtonId.first, DomModifierKeyId.none, listener);
    }

    public addUnmodifiedLeftdoubleclickListener(listener: PointerEventListener): PointerEventDispatcher {
        return this.addListener('doubleclick', DomButtonId.first, DomModifierKeyId.none, listener);
    }

    public addListener(
        type:         PointerEventType,
        buttons:      null|DomButtonId,
        modifierKeys: null|DomModifierKeyId,
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

    public setEventListener(type: PointerEventType, listener: PointerEventListener): PointerEventDispatcher
    {
        return this.addListener(type, null, null, listener);
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
        this.swallowNextMouseclickEvent = false;
    }

    private handleEventLogOnly(ev: MouseEvent): void
    {
        if (this.logEventsIn.has(ev.type)) {
            const msg = `DomOpacityAwarePointerEventDispatcher.handleEventLogOnly: Ignoring event we aren't interested in.`;
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
                const msg = `DomOpacityAwarePointerEventDispatcher.handleMouseEvent: Ignoring event while handling another event (probably a redirection loop).`;
                const {type, buttons} = ev;
                log.info(msg, {type, buttons, domelem: this.domElem, ev, this: {...this}});
            }
            ev.stopImmediatePropagation();
            ev.preventDefault();
            return;
        }

        if (this.logEventsIn.has(ev.type)) {
            const msg = `DomOpacityAwarePointerEventDispatcher.handleMouseEvent: Processing event.`;
            const {type, buttons} = ev;
            log.info(msg, {type, buttons, domelem: this.domElem, ev, this: {...this}});
        }
        this.inEventHandling = true;
        this.lastMouseEventButtons = ev.buttons;

        const isClick = PointerEventDispatcher.mouseclickEventTypes.has(ev.type);
        if (isClick && this.swallowNextMouseclickEvent) {
            ev.stopImmediatePropagation();
            ev.preventDefault();
            this.swallowNextMouseclickEvent = false;
        } else if (ev.type === 'contextmenu') {
            // Don't touch the event lest it won't become untrusted and not make the browser display the context menu.
        } else if (this.isOpaqueAtEventLocation(ev)) {
            ev.stopImmediatePropagation();
            if (!this.allowDefaultActions || this.dragOngoing) {
                ev.preventDefault();
            }
        } else {
            this.reroutePointerOrMouseEvent(ev);
            ev.stopImmediatePropagation();
            ev.preventDefault();
        }
        this.inEventHandling = false;
    }

    private handlePointerCancelEvent(ev: PointerEvent): void
    {
        if (this.logEventsIn.has(ev.type)) {
            const msg = `DomOpacityAwarePointerEventDispatcher.handlePointerCancelEvent`;
            const {type, buttons} = ev;
            log.info(msg, {type, buttons, domelem: this.domElem, ev, this: {...this}});
        }

        // Call buttonup event handlers when any button was down:
        if ((this.buttonsPointerStatesLast.get(ev.pointerId)?.buttons ?? DomButtonId.none) !== DomButtonId.none) {
            const data = getDataFromPointerEvent('buttonup', ev, this.domElem);
            data.buttons = DomButtonId.none; // Assume buttons to be all up no matter what.
            this.callEventListener(data);
        }

        // Untrack pointer button state (implicitly assumes buttons to be up for releasePointer and handleButtonsReset):
        this.buttonsPointerStatesLast.delete(ev.pointerId);

        // Allow other elements to receive events in case the pointer comes back online:
        releasePointer(this.domElem, ev.pointerId);

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
            // Routing loop detected. Just swallow the event.
            ev.stopImmediatePropagation();
            ev.preventDefault();
            return;
        }

        this.inEventHandling = true;
        const pointerId = ev.pointerId;
        const lastButtonsState
            = this.buttonsPointerStatesLast.get(pointerId) ?? {isButtonsUp: false, buttons: DomButtonId.none};
        const isOpaqueAtLoc = this.isOpaqueAtEventLocation(ev);
        const isInvolvedInAction = pointerId === this.buttonsActionPointerId;
        const hadButtonsDown = lastButtonsState.buttons !== DomButtonId.none;

        if (this.logEventsIn.has(ev.type)) {
            const msg = `DomOpacityAwarePointerEventDispatcher.handlePointerEvent`;
            const {type, buttons} = ev;
            log.info(msg, {type, buttons, isOpaqueAtLoc, isInvolvedInAction, hadButtonsDown, domelem: this.domElem, ev, this: {...this}});
        }

        // Give raw event to lower element if it isn't a buttons event for us and outside domElem's opaque area:
        const isForUs = isOpaqueAtLoc || isInvolvedInAction || hadButtonsDown;
        if (isForUs) {
            const preventDefault = !this.allowDefaultActions || this.dragOngoing;
            this.handlePointerEventForUs(ev, isOpaqueAtLoc, lastButtonsState);
            ev.stopImmediatePropagation();
            if (preventDefault) {
                ev.preventDefault();
            }
        } else {
            this.handlePointerEventNotForUs(ev);
            ev.stopImmediatePropagation();
            ev.preventDefault();
        }
        this.lastPointerEventWasForUs = isForUs;
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
            && hasMovedDragDistance(this.buttonsDownEventStart, ev, this.dragStartDistance)) {
                this.clickEnd(true); // Prevent click or doubleclick.
                this.buttonsResetOngoing = false; // Has been set by clickEnd.
                this.swallowNextMouseclickEvent = true;
                this.dragHandleStart(this.buttonsDownEventStart, ev);
            }

        }
        if (this.buttonsResetOngoing) {
            this.swallowNextMouseclickEvent = true;
            this.handleButtonsReset();
        }

        this.handleMoveEvents(ev, isOpaqueAtLoc);
        if (this.domElem instanceof HTMLElement) {
            const cursor = this.dragOngoing ? this.dragCssCursor : null;
            this.domElem.style.cursor = cursor ?? '';
        }
    }

    private handleButtonEvent(ev: PointerEvent, isConcurrent: boolean, lastButtonsState: ButtonsState): void
    {
        const [buttonsUp, buttonsDown] = calcDomButtonIdsDiff(lastButtonsState.buttons, ev.buttons);
        const [isButtonsUp, isButtonsDown] = [buttonsUp !== DomButtonId.none, buttonsDown !== DomButtonId.none];
        const isInitialDown = lastButtonsState.buttons === DomButtonId.none;

        this.buttonsPointerStatesLast.set(ev.pointerId, {isButtonsUp, buttons: ev.buttons});

        if (isButtonsUp) {
            // Only the final button up for a pointer triggers an actual pointerup event in chrome.
            // So just accept all heuristically detected ones:
            this.callEventListener(getDataFromPointerEvent('buttonup', ev, this.domElem));
        }
        if (isButtonsDown) {
            // Only the first button down for a pointer triggers an actual pointerdown event in chrome.
            // For an uncaptured pointer (lastButtonsState.buttons is zero), the heuristically detected button down
            // might actually have happened outside domElem. So only use heuristics for detecting additional buttons:
            if (ev.type !== 'pointerdown' && isInitialDown) {
                // Missed initial pointerdown (likely because it happened outdside domElem's bounding box).
                this.cancelAllActions();
            } else {
                this.callEventListener(getDataFromPointerEvent('buttondown', ev, this.domElem));
            }
            if (isInitialDown) {
                capturePointer(this.domElem, ev.pointerId);
            }
        }

        if (isConcurrent) {
            this.cancelAllActions();
        }
        if (!this.buttonsResetOngoing && isButtonsUp) {
            this.dragStartPossible = false;
            if (ev.buttons === DomButtonId.none) {
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

    private clickHandlingReleasesPointer(): void
    {
        if (this.buttonsResetOngoing) {
            this.handleButtonsReset();
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
            if (pointerState.buttons === DomButtonId.none && pointerId !== this.buttonsActionPointerId) {
                this.buttonsPointerStatesLast.delete(pointerId);
                releasePointer(this.domElem, pointerId);
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
            isHovering = hasMovedDragDistance(this.clickDownEventStart, ev, this.dragStartDistance)
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
            this.callEventListener(getDataFromPointerEvent('hoverenter', ev, this.domElem));
        }
        this.hoverEventsLast.set(ev.pointerId, ev);
        this.callEventListener(getDataFromPointerEvent('hovermove', ev, this.domElem));
    }

    private handleHoverleave(ev: PointerEvent): void
    {
        const wasHovering = this.hoverEventsLast.delete(ev.pointerId);
        if (wasHovering && this.hoverEventsLast.size === 0) {
            this.callEventListener(getDataFromPointerEvent('hoverleave', ev, this.domElem));
        }
    }

    // -------------------------------------------------------------------------
    // Click/doublecklick
    //
    // Button down for first click (handled by handleInitialButtonDown)
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
                            this.swallowNextMouseclickEvent = true; // Long clicks trigger contextmenu in tablet mode on Chrome.
                            this.clickEnd(false);
                            this.handleButtonsReset();
                        };
                        this.clickTimeoutHandle = window.setTimeout(handler, this.clickLongMinDelayMs);
                    }
                    this.clickDownEventStart = eventDown;
                    this.clickMoveEventLast = eventDown;
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

    private clickEnd(discard: boolean): void
    {
        window.clearTimeout(this.clickTimeoutHandle);
        this.clickTimeoutHandle = null;
        if (true
            && this.clickOngoing
            && this.clickCount !== 0
            && !discard
            && !hasMovedDragDistance(this.clickDownEventStart, this.clickMoveEventLast, this.dragStartDistance)
        ) {
            const type = this.clickCount === 1 ? (this.clickIsLong ? 'longclick' : 'click') : 'doubleclick';
            const data = getDataFromPointerEvent(type, this.clickDownEventLast, this.domElem);
            setClientPosOnPointerEventData(data, this.clickDownEventStart);
            setModifierKeysOnPointerEventData(data, this.clickMoveEventLast);
            this.callEventListener(data);
        }
        this.clickOngoing = false;
        this.clickIsLong = false;
        this.clickCount = 0;
        this.clickDownEventStart = null;
        this.clickDownEventLast = null;
        this.clickMoveEventLast = null;
        this.clickHandlingReleasesPointer();
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
        this.dragDownEventStart = eventStart;
        this.dragDownEventLast = eventStart;
        this.dragMoveEventLast = null;
        this.dragMoveEventDataLast = null;
        const data = getDataFromPointerEvent('dragstart', eventMove, this.domElem);
        setDistanceOnPointerEventData(data, this.dragDownEventStart);
        this.callEventListener(data);
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

        const moveData = this.dragCallMoveHandler(eventUpLast);
        if (this.dragUserCanceled) {
            this.dragCancel(true);
            return;
        }

        const dropData = {...moveData};
        dropData.type = 'dragdrop';
        dropData.dropTargetLast = moveData.dropTarget;
        dropData.dropTargetChanged = false;

        if (!is.nil(dropData.dropTargetLast)) {
            this.callEventListener({...dropData, type: 'dragleave'});
        }

        this.callEventListener(dropData);

        const endData = {...dropData};
        endData.type = 'dragend';
        this.callEventListener(endData);

        this.dragCancel(false);
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

    private dragCallMoveHandler(eventMove: PointerEvent): PointerEventData
    {
        const clientX = eventMove.clientX;
        const clientY = eventMove.clientY;

        if (eventMove.buttons > this.dragDownEventLast.buttons) {
            this.dragDownEventLast = eventMove;
        }

        const opacityMin = this.ignoreOpacity ? 0 : this.opacityMin;
        const dropTarget = getTopmostOpaqueDomElemAtViewportPos(
            this.shadowDomRoot, clientX, clientY, opacityMin, this.dragTransparentClasses);

        const moveData = getDataFromPointerEvent('dragmove', eventMove, this.domElem);
        setDistanceOnPointerEventData(moveData, this.dragDownEventStart);
        setButtonsOnPointerEventData(moveData, this.dragDownEventLast);
        moveData.dropTarget = dropTarget;
        moveData.dropTargetLast = this.dragDropTargetLast;
        moveData.dropTargetChanged = dropTarget !== this.dragDropTargetLast;

        if (moveData.dropTargetChanged) {
            if (!is.nil(this.dragDropTargetLast)) {
                this.callEventListener({...moveData, type: 'dragleave'});
            }
            if (!is.nil(dropTarget)) {
                this.callEventListener({...moveData, type: 'dragenter'});
            }
        }

        if (is.nil(this.dragMoveEventDataLast)
        || this.dragMoveEventLast.clientX !== moveData.clientX || this.dragMoveEventLast.clientY !== moveData.clientY
        || this.dragMoveEventDataLast.buttons !== moveData.buttons
        || this.dragMoveEventDataLast.modifierKeys !== moveData.modifierKeys
        || dropTarget !== this.dragDropTargetLast) {
            this.callEventListener({...moveData});
        }

        this.dragMoveEventDataLast = moveData;
        this.dragDropTargetLast = dropTarget;
        return moveData;
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
                const cancelData = makeDummyPointerEventData('dragcancel', moveEventLast, this.domElem);
                setDistanceOnPointerEventData(cancelData, this.dragDownEventStart);
                setButtonsOnPointerEventData(cancelData, this.dragDownEventLast);
                cancelData.dropTargetLast = this.dragDropTargetLast;
                cancelData.dropTargetChanged = this.dragDropTargetLast !== null;

                if (!is.nil(cancelData.dropTargetLast)) {
                    this.callEventListener({...cancelData, type: 'dragleave'});
                }

                this.callEventListener(cancelData);

                this.callEventListener({...cancelData, type: 'dragend'});
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
        const [opacityAtLoc, pointerInBoundingbox] = getDomElemOpacityAtPos(this.domElem, ev.clientX, ev.clientY);
        const isOpaqueAtLoc = pointerInBoundingbox && opacityAtLoc >= this.opacityMin;
        return isOpaqueAtLoc;
    }

    private callEventListener(data: PointerEventData): void
    {
        const {type, buttons, modifierKeys} = data;
        if (this.logListenerCalls.has(data.type)) {
            const msg = `DomOpacityAwarePointerEventDispatcher.callEventListeners`;
            log.info(msg, {type, buttons, modifierKeys, domElement: this.domElem, data, this: {...this}});
        }
        for (const listenerRecord of this.eventListeners.get(type) ?? []) {
            if ((is.nil(listenerRecord.buttons) || listenerRecord.buttons === buttons)
            && (is.nil(listenerRecord.modifierKeys) || listenerRecord.modifierKeys === modifierKeys)) {
                try {
                    listenerRecord.listener(data);
                } catch (error) {
                    this.app.onError(error);
                }
            }
        }
    }

    private reroutePointerOrMouseEvent(ev: MouseEvent): Element|null
    {
        const elemBelow = getNextDomElemBehindElemAtViewportPos(this.shadowDomRoot, this.domElem, ev.clientX, ev.clientY);
        const isOutEvent = ev.type === 'pointerout' || ev.type === 'pointerleave';

        // Create artificial enter/leave and move events for new and former target element:
        if (ev instanceof PointerEvent) {
            this.handleRedirectTargetPointerOut(ev, elemBelow);
            this.handleRedirectTargetPointerHover(ev, elemBelow);
        }

        if (!is.nil(elemBelow)
        && !isOutEvent) { // Don't reroute event meaningless for other DOM elements.
            this.dispatchDomEvent(cloneDomEvent(ev), elemBelow);
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
            this.dispatchDomEvent(cloneDomEvent(ev, {type: 'pointerout'}), elem);
        }
        this.dispatchDomEvent(cloneDomEvent(ev, {type: 'pointerleave'}), hoverRedirectTargetLast);
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
                this.dispatchDomEvent(cloneDomEvent(ev, {type: 'pointerover'}), elem);
            }
            this.dispatchDomEvent(cloneDomEvent(ev, {type: 'pointerenter'}), hoverRedirectTargetCurrent);
        }
        this.dispatchDomEvent(cloneDomEvent(ev, {type: 'pointermove'}), hoverRedirectTargetCurrent);
    }

    private dispatchDomEvent(ev: MouseEvent, domElem: Element): void
    {
        if (this.logEventsOut.has(ev.type)) {
            const msg = `DomOpacityAwarePointerEventDispatcher.dispatchDomEvent: Dispatching event to other element.`;
            const {type, buttons} = ev;
            log.info(msg, {type, buttons, originalElem: this.domElem, newElem: domElem, ev, this: {...this}});
        }
        dispatchDomEvent(ev, domElem);
    }

}
