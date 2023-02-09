// Generalized PointerEventData type and utilities

export type PointerEventType =
    | 'hoverenter'  // Pointer hovers into opaque area
    | 'hovermove'   // Pointer hovers over opaque area
    | 'hoverleave'  // Pointer hovers outside opaque area

    | 'buttondown'  // Pointer button down or touch
    | 'buttonup'    // Pointer button up or touch release

    | 'click'       // Single click or tap
    | 'longclick'   // Long-pressed single click or tap. Falls back to click.
    | 'doubleclick' // Double click or tap

    | 'dragstart'   // Start dragging or swiping
    | 'dragmove'    // Still dragging or swiping
    | 'dragenter'   // Dragging over the opaque area of an element
    | 'dragleave'   // Dragging outside the opaque area of an element
    | 'dragdrop'    // Completed drag or swipe
    | 'dragcancel'  // Drag or swipe canceled
    | 'dragend'     // Drag or swipe completed or canceled
;

export enum DomModifierKeyId {
    none    = 0,
    shift   = 1,
    control = 2,
    alt     = 4,
    meta    = 8,
}

export type PointerEventData = {
    type: PointerEventType,
    domElement: Element,

    // Last raw event related to this event for debugging purposes:
    rawEvent: PointerEvent,

    // Viewport position:
    // - Initial button down for click/doubleclick.
    // - Drop position for dragdrop.
    clientX: number,
    clientY: number,

    // Position relative to top-left corner of domElement:
    domElementOffsetX: number,
    domElementOffsetY: number,

    // Start viewport position of action:
    // Same as client* for all events except dragmove, dragdrop, dragcancel.
    startClientX: number,
    startClientY: number,

    // Action start position relative to top-left corner of domElement:
    startDomElementOffsetX: number,
    startDomElementOffsetY: number,

    // Distance between initial buttonsdown and final dragdrop event clientX/clientY:
    // - 0.0 if not dragdrop.
    distanceX: number,
    distanceY: number,

    // Or-ed ButtonId values of pressed buttons (touch = ButtonId.first).
    buttons: number,

    // Or-ed ModifierKeyId values of pressed modifier keys:
    modifierKeys: number,

    // Only for drag* events:
    dropTarget:     Element|null, // Current opaque element under the pointer.
    dropTargetLast: Element|null, // Opaque element under the pointer at last event.
    dropTargetChanged: boolean,   // dropTarget !== dropTargetLast.
};

export function hasMovedDragDistance(eventStart: null|PointerEvent, eventMove: null|PointerEvent, dragStartDistance: number): boolean
{
    return eventStart && eventMove && (false
        || Math.abs(eventStart.clientX - eventMove.clientX) >= dragStartDistance
        || Math.abs(eventStart.clientY - eventMove.clientY) >= dragStartDistance
    );
}

export function getDataFromPointerEvent(type: PointerEventType, event: PointerEvent, domElement: Element): PointerEventData {
    const data = this.makeDummyPointerEventData(type, event, domElement);
    data.rawEvent = event;
    return data;
}

export function makeDummyPointerEventData(
    type: PointerEventType, event: PointerEvent, domElement: Element
): PointerEventData {
    const data: PointerEventData = {
        type: type,
        domElement: domElement,
        rawEvent: event,
        clientX: 0,
        clientY: 0,
        domElementOffsetX: 0,
        domElementOffsetY: 0,
        startClientX: 0,
        startClientY: 0,
        startDomElementOffsetX: 0,
        startDomElementOffsetY: 0,
        distanceX: 0.0,
        distanceY: 0.0,
        buttons: event.buttons,
        modifierKeys: modifierKeyIdsOfDomEvent(event),
        dropTarget: null,
        dropTargetLast: null,
        dropTargetChanged: false,
    };
    this.setClientPosOnPointerEventData(data, event);
    this.setButtonsOnPointerEventData(data, event);
    return data;
}

export function setClientPosOnPointerEventData(data: PointerEventData, event: PointerEvent): void
{
    data.clientX = event.clientX;
    data.clientY = event.clientY;
    data.domElementOffsetX = event.offsetX;
    data.domElementOffsetY = event.offsetY;
    data.startClientX = event.clientX;
    data.startClientY = event.clientY;
    data.startDomElementOffsetX = event.offsetX;
    data.startDomElementOffsetY = event.offsetY;
}

export function setDistanceOnPointerEventData(data: PointerEventData, startEvent: PointerEvent): void
{
    data.startClientX = startEvent.clientX;
    data.startClientY = startEvent.clientY;
    data.startDomElementOffsetX = startEvent.offsetX;
    data.startDomElementOffsetY = startEvent.offsetY;
    data.distanceX = data.clientX - startEvent.clientX;
    data.distanceY = data.clientY - startEvent.clientY;
}

export function setButtonsOnPointerEventData(data: PointerEventData, event: PointerEvent): void
{
    data.buttons = event.buttons;
}

export function setModifierKeysOnPointerEventData(data: PointerEventData, event: PointerEvent): void
{
    data.modifierKeys = modifierKeyIdsOfDomEvent(event);
}

export function modifierKeyIdsOfDomEvent(event: MouseEvent): number
{
    return <any>event.shiftKey * DomModifierKeyId.shift
         + <any>event.ctrlKey  * DomModifierKeyId.control
         + <any>event.altKey   * DomModifierKeyId.alt
         + <any>event.metaKey  * DomModifierKeyId.meta;
}
