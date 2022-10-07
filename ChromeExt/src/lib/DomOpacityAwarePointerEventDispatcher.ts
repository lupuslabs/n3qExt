import log = require('loglevel');
import { ContentApp } from '../contentscript/ContentApp';
import { as } from './as';
import { Config } from './Config';
import { is } from './is';
import {
    getDomElemOpacityAtPos, getNextDomElemBehindElemAtViewportPos, getTopmostOpaqueDomElemAtViewportPos,
    cloneDomEvent, dispatchDomEvent, capturePointer, releasePointer, DomButtonId, calcDomButtonIdsDiff,
} from './domTools';
import { Utils } from './Utils';
import {
    getDataFromPointerEvent, makeDummyPointerEventData, hasMovedDragDistance,
    PointerEventData, PointerEventType, setButtonsOnPointerEventData,
    setClientPosOnPointerEventData, setDistanceOnPointerEventData, setModifierKeysOnPointerEventData
} from './PointerEventData';

type ButtonsState = {isButtonsUp: boolean, buttons: number};

export class DomOpacityAwarePointerEventDispatcher {
    // Known bugs:
    // Text cursor doesn't show for text behind transparent areas of domElem.
    // Text not selectable behind transparent areas of domElem.
    // Continuing text selection behind domElem is broken.

    private readonly app: ContentApp;
    private readonly domElem: Element;

    private readonly logEventsIn: Set<string> = new Set<string>();
    private readonly logButtons: boolean;
    private readonly logDrag: boolean;
    private readonly logHover: boolean;
    private readonly logWithMove: boolean;
    private readonly logEventsOut: Set<string> = new Set<string>();

    private readonly eventListeners = new Map<string, (data: PointerEventData) => any>();
    private readonly opacityMin: number;
    private readonly clickDoubleMaxDelayMs: number;
    private dragStartDistance: number;
    private readonly dragDropTargetUpdateIntervalMs: number;

    private lastPointerEventWasForUs: boolean = false;
    
    private hoverEventsLast: Map<number,PointerEvent> = new Map<number, PointerEvent>();
    private hoverRedirectTargetsLast: Map<number,Element> = new Map<number, Element>();

    private buttonsPointerStatesLast: Map<number,ButtonsState> = new Map<number, ButtonsState>();
    private buttonsDownEventStart: PointerEvent|null = null;
    private buttonsActionPointerId: number|null = null;
    private buttonsResetOngoing: boolean = false; // Waiting until no button pressed.

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

    private clickOngoing: boolean = false;
    private clickCount: number = 0;
    private clickDownEventStart: PointerEvent|null = null;
    private clickDownEventLast: PointerEvent|null = null;
    private clickMoveEventLast: PointerEvent|null = null;
    private clickTimeoutHandle: number|null = null;

    public constructor(app: ContentApp, domElem: Element)
    {
        this.app = app;
        this.domElem = domElem;

        this.logButtons = false; // Utils.logChannel('pointerEventHandlingButtons');
        this.logDrag = false; // Utils.logChannel('pointerEventHandlingDrag');
        this.logHover = false; // Utils.logChannel('pointerEventHandlingHover');
        this.logWithMove = false; // Utils.logChannel('pointerEventHandlingWithMove');
        const logIncommingPointer = false; // Utils.logChannel('pointerEventHandlingIncommingPointer');
        const logIncommingMouse = false; // Utils.logChannel('pointerEventHandlingIncommingMouse');

        if (this.logButtons) {
            this.logEventsOut.add(PointerEventType.click);
            this.logEventsOut.add(PointerEventType.doubleclick);
        }
        if (this.logDrag) {
            this.logEventsOut.add(PointerEventType.dragstart);
            this.logEventsOut.add(PointerEventType.dragenter);
            this.logEventsOut.add(PointerEventType.dragleave);
            this.logEventsOut.add(PointerEventType.dragdrop);
            this.logEventsOut.add(PointerEventType.dragcancel);
            this.logEventsOut.add(PointerEventType.dragend);
            if (this.logWithMove) {
                this.logEventsOut.add(PointerEventType.dragmove);
            }
        }
        if (this.logHover) {
            this.logEventsOut.add(PointerEventType.hoverenter);
            this.logEventsOut.add(PointerEventType.hoverleave);
            if (this.logWithMove) {
                this.logEventsOut.add(PointerEventType.hovermove);
            }
        }
        if (logIncommingPointer) {
            this.logEventsIn.add('pointerout');
            this.logEventsIn.add('pointerdown');
            this.logEventsIn.add('pointerup');
            this.logEventsIn.add('pointercancel');
            if (this.logWithMove) {
                this.logEventsIn.add('pointermove');
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
        }

        this.opacityMin = as.Float(Config.get('avatars.pointerOpaqueOpacityMin'), 0.001);
        this.clickDoubleMaxDelayMs = 1000 * as.Float(Config.get('avatars.pointerDoubleclickMaxSec'), 0.25);
        this.setDragStartDistance();
        const dragUpdateIntervalSecs = as.Float(Config.get('avatars.pointerDropTargetUpdateIntervalSec'), 0.5);
        this.dragDropTargetUpdateIntervalMs = 1000 * dragUpdateIntervalSecs;

        const updateHandler = (ev: PointerEvent) => this.handlePointerEvent(ev);
        this.domElem.addEventListener('pointermove', updateHandler);
        this.domElem.addEventListener('pointerout',  updateHandler); // For non-capturing leave detection.
        this.domElem.addEventListener('pointerdown', updateHandler);
        this.domElem.addEventListener('pointerup',   updateHandler);
        
        const cancelHandler = (ev: PointerEvent) => this.handlePointerCancelEvent(ev);
        this.domElem.addEventListener('pointercancel', cancelHandler);

        // Handle legacy mouse events:
        const mouseHandler = (ev: MouseEvent) => this.handleMouseEvent(ev);
        this.domElem.addEventListener('mousemove', mouseHandler);
        this.domElem.addEventListener('mousedown', mouseHandler);
        this.domElem.addEventListener('mouseup', mouseHandler);
        this.domElem.addEventListener('click', mouseHandler);
        this.domElem.addEventListener('dblclick', mouseHandler);
        this.domElem.addEventListener('contextmenu', mouseHandler); // Singleclick with secondary button.
    }

    public setEventListener(type: string, handler: (ev: PointerEventData) => void): void
    {
        this.eventListeners.set(type, handler);
    }

    public setDragStartDistance(startDistance?: number): void
    {
        startDistance = startDistance ?? as.Float(Config.get('avatars.pointerDragStartDistance'), 3.0);
        this.dragStartDistance = startDistance;
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

    private handleMouseEvent(ev: MouseEvent): void
    {
        // Handles the legacy mouse events. For every mouse event one or more pointer events already have been handled.

        this.logIncommingEvent(ev);

        if (this.lastPointerEventWasForUs) {
            // Just swallow the event.
        } else {
            this.reroutePointerOrMouseEvent(ev);
        }

        ev.stopImmediatePropagation();
        ev.preventDefault();
    }

    private handlePointerCancelEvent(ev: PointerEvent): void
    {
        this.logIncommingEvent(ev);

        // Call buttonup event handlers when any button was down:
        if ((this.buttonsPointerStatesLast.get(ev.pointerId)?.buttons ?? DomButtonId.none) !== DomButtonId.none) {
            const data = getDataFromPointerEvent(PointerEventType.buttonup, ev, this.domElem);
            data.buttons = DomButtonId.none; // Assume buttons to be all up no matter what.
            this.callEventListener(data);
        }

        // Untrack pointer button state (implicitly assumes buttons to be up for releasePointer and handleButtonsReset):
        this.buttonsPointerStatesLast.delete(ev.pointerId);

        // Allow other elements to receive events in case the pointer comes back online:
        releasePointer(this.domElem, ev.pointerId);

        // Clean up any action-in-progress state:
        const isInvolvedInAction 
            =  ev.pointerId === (this.buttonsDownEventStart.pointerId ?? null)
            || ev.pointerId === (this.clickDownEventStart.pointerId ?? null);
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
        this.logIncommingEvent(ev);
        const pointerId = ev.pointerId;
        const lastButtonsState
            = this.buttonsPointerStatesLast.get(pointerId) ?? {isButtonsUp: false, buttons: DomButtonId.none};
        const isOpaqueAtLoc = this.isOpaqueAtEventLocation(ev);
        const isInvolvedInAction = pointerId === this.buttonsActionPointerId;
        const hadButtonsDown = lastButtonsState.buttons !== DomButtonId.none;

        // Give raw event to lower element if it isn't a buttons event for us and outside domElem's opaque area:
        const isForUs = isOpaqueAtLoc || isInvolvedInAction || hadButtonsDown;
        if (isForUs) {
            this.handlePointerEventForUs(ev, isOpaqueAtLoc, lastButtonsState);
        } else {
            this.handlePointerEventNotForUs(ev);
        }
        this.lastPointerEventWasForUs = isForUs;
        ev.stopImmediatePropagation();
        ev.preventDefault();
    }

    private handlePointerEventNotForUs(ev: MouseEvent): void
    {
        if (ev instanceof PointerEvent) {
            this.handleHoverleave(ev); // Handle leave if previously hovering.
        }

        // Reroute to next pointer-enabled element (opaque or not) behind domElem:
        const elemBelow = this.reroutePointerOrMouseEvent(ev);
        if (this.domElem instanceof HTMLElement && elemBelow instanceof HTMLElement) {
            this.domElem.style.cursor = window.getComputedStyle(elemBelow)['cursor'];
        }
    }

    private handlePointerEventForUs(ev: PointerEvent, isOpaqueAtLoc: boolean, lastButtonsState: ButtonsState): void
    {
        if (this.domElem instanceof HTMLElement) {
            this.domElem.style.cursor = '';
        }
        this.handleRedirectTargetPointerOut(ev, null);
        if (!ev.isPrimary) {
            // Multitouch event - trigger full action reset:
            this.cancelAllActions();
        } else {
            const isConcurrent = ev.pointerId !== (this.buttonsActionPointerId ?? ev.pointerId);

            if (ev.buttons !== lastButtonsState.buttons) {
                this.handleButtonEvent(ev, isConcurrent, lastButtonsState);
            }

            // Handle drag start:
            if (!this.buttonsResetOngoing && !isConcurrent && this.dragStartPossible
            && hasMovedDragDistance(this.buttonsDownEventStart, ev, this.dragStartDistance)) {
                this.clickEnd(true); // Prevent click or doubleclick.
                this.buttonsResetOngoing = false; // Has been set by clickEnd.
                this.dragHandleStart(this.buttonsDownEventStart, ev);
            }

        }
        if (this.buttonsResetOngoing) {
            this.handleButtonsReset();
        }

        this.handleMoveEvents(ev, isOpaqueAtLoc);
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
            this.callEventListener(getDataFromPointerEvent(PointerEventType.buttonup, ev, this.domElem));
        }
        if (isButtonsDown) {
            // Only the first button down for a pointer triggers an actual pointerdown event in chrome.
            // For an uncaptured pointer (lastButtonsState.buttons is zero), the heuristically detected button down
            // might actually have happened outside domElem. So only use heuristics for detecting additional buttons:
            if (ev.type !== 'pointerdown' && isInitialDown) {
                // Missed initial pointerdown (likely because it happened outdside domElem's bounding box).
                this.cancelAllActions();
            } else {
                this.callEventListener(getDataFromPointerEvent(PointerEventType.buttondown, ev, this.domElem));
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
            this.callEventListener(getDataFromPointerEvent(PointerEventType.hoverenter, ev, this.domElem));
        }
        this.hoverEventsLast.set(ev.pointerId, ev);
        this.callEventListener(getDataFromPointerEvent(PointerEventType.hovermove, ev, this.domElem));
    }

    private handleHoverleave(ev: PointerEvent): void
    {
        const wasHovering = this.hoverEventsLast.delete(ev.pointerId);
        if (wasHovering && this.hoverEventsLast.size === 0) {
            this.callEventListener(getDataFromPointerEvent(PointerEventType.hoverleave, ev, this.domElem));
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
        switch (this.clickCount) {
            case 0: {
                // Initial full buttons up - this is at least a click but might also become a doubleclick.
                this.clickMoveEventLast = eventUp;
                this.clickCount = 1;
                const handler = () => {
                    this.clickEnd(false);
                    this.handleButtonsReset();
                };
                const delay = this.clickDoubleMaxDelayMs;
                this.clickTimeoutHandle = window.setTimeout(handler, delay);
            } break;
            case 1: {
                this.clickEnd(true); // Cancel click/doubleclick.
            } break;
        }
    }

    private clickEnd(discard: boolean): void
    {
        if (!is.nil(this.clickTimeoutHandle)) {
            window.clearTimeout(this.clickTimeoutHandle);
            this.clickTimeoutHandle = null;
        }
        if (this.clickOngoing) {
            this.clickOngoing = false;
            if (this.clickCount !== 0) {
                if (!discard 
                && !hasMovedDragDistance(this.clickDownEventStart, this.clickMoveEventLast, this.dragStartDistance)) {
                    const type = this.clickCount === 1 ? PointerEventType.click : PointerEventType.doubleclick;
                    const data = getDataFromPointerEvent(type, this.clickDownEventLast, this.domElem);
                    setClientPosOnPointerEventData(data, this.clickDownEventStart);
                    setModifierKeysOnPointerEventData(data, this.clickMoveEventLast);
                    this.callEventListener(data);
                }
            }
            this.clickCount = 0;
        }
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
        const data = getDataFromPointerEvent(PointerEventType.dragstart, eventMove, this.domElem);
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
        dropData.type = PointerEventType.dragdrop;
        dropData.dropTargetLast = moveData.dropTarget;
        dropData.dropTargetChanged = false;

        if (!is.nil(dropData.dropTargetLast)) {
            this.callEventListener({...dropData, type: PointerEventType.dragleave});
        }

        this.callEventListener(dropData);

        const endData = {...dropData};
        endData.type = PointerEventType.dragend;
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

        // Drop target is updated less often to reduce load:
        const dropTarget = getTopmostOpaqueDomElemAtViewportPos(
            document, clientX, clientY, this.opacityMin, this.dragTransparentClasses);

        const moveData = getDataFromPointerEvent(PointerEventType.dragmove, eventMove, this.domElem);
        setDistanceOnPointerEventData(moveData, this.dragDownEventStart);
        setButtonsOnPointerEventData(moveData, this.dragDownEventLast);
        moveData.dropTarget = dropTarget;
        moveData.dropTargetLast = this.dragDropTargetLast;
        moveData.dropTargetChanged = dropTarget !== this.dragDropTargetLast;

        if (moveData.dropTargetChanged) {
            if (!is.nil(this.dragDropTargetLast)) {
                this.callEventListener({...moveData, type: PointerEventType.dragleave});
            }
            if (!is.nil(dropTarget)) {
                this.callEventListener({...moveData, type: PointerEventType.dragenter});
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
                const cancelData = makeDummyPointerEventData(PointerEventType.dragcancel, moveEventLast, this.domElem);
                setDistanceOnPointerEventData(cancelData, this.dragDownEventStart);
                setButtonsOnPointerEventData(cancelData, this.dragDownEventLast);
                cancelData.dropTargetLast = this.dragDropTargetLast;
                cancelData.dropTargetChanged = this.dragDropTargetLast !== null;
    
                if (!is.nil(cancelData.dropTargetLast)) {
                    this.callEventListener({...cancelData, type: PointerEventType.dragleave});
                }
    
                this.callEventListener(cancelData);
    
                this.callEventListener({...cancelData, type: PointerEventType.dragend});
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
        const [opacityAtLoc, pointerInBoundingbox] = getDomElemOpacityAtPos(this.domElem, ev.clientX, ev.clientY);
        const isOpaqueAtLoc = pointerInBoundingbox && opacityAtLoc >= this.opacityMin;
        return isOpaqueAtLoc;
    }

    private callEventListener(data: PointerEventData): void
    {
        if (this.logEventsOut.has(data.type)) {
            const msg = `DomOpacityAwarePointerEventDispatcher.callEventListeners: Event ${data.type}`;
            log.info(msg, this.domElem, {data, this: {...this}});
        }
        try {
            this.eventListeners.get(data.type)?.(data);
        } catch (error) {
            this.app.onError(error);
        }
    }

    private reroutePointerOrMouseEvent(ev: MouseEvent): Element|null
    {
        const elemBelow = getNextDomElemBehindElemAtViewportPos(this.domElem, ev.clientX, ev.clientY);
        const isOutEvent = ev.type === 'pointerout' || ev.type === 'pointerleave';

        // Create pointerout for element which we routed a mousemove to:
        if (ev instanceof PointerEvent) {
            this.handleRedirectTargetPointerOut(ev, elemBelow);
            this.handleRedirectTargetPointerHover(ev, elemBelow);
        }

        if (!is.nil(elemBelow)
        && !isOutEvent) { // Don't reroute event meaningless for other DOM elements.
            dispatchDomEvent(cloneDomEvent(ev), elemBelow);
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
            dispatchDomEvent(cloneDomEvent(ev, {type: 'pointerout'}), elem);
        }
        dispatchDomEvent(cloneDomEvent(ev, {type: 'pointerleave'}), hoverRedirectTargetLast);
    }

    private handleRedirectTargetPointerHover(ev: PointerEvent, hoverRedirectTargetCurrent: Element|null): void
    {
        if (is.nil(hoverRedirectTargetCurrent)
        || ev.type === 'pointerout'
        || hoverRedirectTargetCurrent === this.hoverRedirectTargetsLast.get(ev.pointerId)) {
            return;
        }
        this.hoverRedirectTargetsLast.set(ev.pointerId, hoverRedirectTargetCurrent);
        if (ev.isPrimary) { // Don't send pointerover, pointerenter for secondary multitouch.
            for (let elem: Element = hoverRedirectTargetCurrent; !is.nil(elem); elem = elem.parentElement) {
                dispatchDomEvent(cloneDomEvent(ev, {type: 'pointerover'}), elem);
            }
            dispatchDomEvent(cloneDomEvent(ev, {type: 'pointerenter'}), hoverRedirectTargetCurrent);
        }
        if (ev.type !== 'pointermove') {
            dispatchDomEvent(cloneDomEvent(ev, {type: 'pointermove'}), hoverRedirectTargetCurrent);
        }
    }

    private logIncommingEvent(ev: MouseEvent): void
    {
        if (this.logEventsIn.has(ev.type)) {
            const msg = `DomOpacityAwarePointerEventDispatcher.logIncommingEvent: Event ${ev.type}`;
            log.info(msg, this.domElem, {ev, this: {...this}});
        }
    }

}
