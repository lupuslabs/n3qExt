// Generalized PointerEventData type and utilities

import { DomUtils } from './DomUtils'
import { is } from './is'

export type PointerEventType =
    | 'hoverenter'  // Pointer hovers into opaque area
    | 'hovermove'   // Pointer hovers over opaque area
    | 'hoverleave'  // Pointer hovers outside opaque area

    | 'buttondown'  // Pointer button down or touch
    | 'buttonup'    // Pointer button up or touch release

    | 'clickstart'  // Start of a potential click or tap
    | 'click'       // Single click or tap
    | 'longclick'   // Long-pressed single click or tap. Falls back to click.
    | 'doubleclick' // Double click or tap
    | 'clickend'    // Click or tap completed or canceled

    | 'dragstart'   // Start dragging or swiping
    | 'dragmove'    // Still dragging or swiping
    | 'dragenter'   // Dragging over the opaque area of an element
    | 'dragleave'   // Dragging outside the opaque area of an element
    | 'dragdrop'    // Completed drag or swipe
    | 'dragend'     // Drag or swipe completed or canceled

type ExtraData = {
    posEvent?:       PointerEventData|PointerEvent
    startEvent?:     PointerEventData
    buttons?:        PointerEventData|PointerEvent|number
    modifierKeys?:   PointerEventData|PointerEvent|number
    dropTarget?:     Element|null
    dropTargetLast?: Element|null
}

export class PointerEventData {
    public readonly type: PointerEventType
    public readonly domElement: Element
    public readonly domElementRect: DOMRect

    // Last raw event related to this event for debugging purposes:
    public readonly rawEvent: PointerEvent

    // Viewport position:
    // - Initial button down for click/doubleclick.
    // - Drop position for dragdrop.
    public readonly clientX: number
    public readonly clientY: number

    // Position relative to top-left corner of domElement:
    public readonly domElementOffsetX: number
    public readonly domElementOffsetY: number

    // Start viewport position of action:
    // Same as client* for all events except dragmove, dragdrop, dragcancel.
    public readonly startClientX: number
    public readonly startClientY: number

    // Action start position relative to top-left corner of domElement:
    public readonly startDomElementOffsetX: number
    public readonly startDomElementOffsetY: number

    // Distance between initial buttonsdown and final dragdrop event clientX/clientY:
    // - 0.0 if not dragdrop.
    public readonly distanceX: number
    public readonly distanceY: number

    // Or-ed ButtonId values of pressed buttons (touch = ButtonId.first).
    public readonly buttons: number

    // Or-ed ModifierKeyId values of pressed modifier keys:
    public readonly modifierKeys: number

    // Only for drag* events:
    public readonly dropTarget:     Element|null // Current opaque element under the pointer.
    public readonly dropTargetLast: Element|null // Opaque element under the pointer at last event.
    public readonly dropTargetChanged: boolean   // dropTarget !== dropTargetLast.

    public constructor(type: PointerEventType, event: PointerEvent, domElement: Element, extraData?: ExtraData) {
        this.type = type
        this.domElement = domElement
        this.domElementRect = domElement.getBoundingClientRect()
        this.rawEvent = event

        extraData ??= {}

        const posEvent = extraData.posEvent ?? event
        this.clientX = posEvent.clientX
        this.clientY = posEvent.clientY
        // Calculated manually because event.offset* isn't based on actual target inside shadow DOM:
        this.domElementOffsetX = posEvent.clientX - this.domElementRect.left
        this.domElementOffsetY = posEvent.clientY - this.domElementRect.top

        const startEvent = extraData.startEvent ?? this
        this.startClientX = startEvent.clientX
        this.startClientY = startEvent.clientY
        this.startDomElementOffsetX = startEvent.domElementOffsetX
        this.startDomElementOffsetY = startEvent.domElementOffsetY
        this.distanceX = this.clientX - startEvent.clientX
        this.distanceY = this.clientY - startEvent.clientY

        const buttonsOrEvent = extraData.buttons ?? event
        if (is.number(buttonsOrEvent)) {
            this.buttons = buttonsOrEvent
        } else {
            this.buttons = buttonsOrEvent.buttons
        }

        const modifierKeysOrEvent = extraData.modifierKeys ?? event
        if (is.number(modifierKeysOrEvent)) {
            this.modifierKeys = modifierKeysOrEvent
        } else if (modifierKeysOrEvent instanceof PointerEventData) {
            this.modifierKeys = modifierKeysOrEvent.modifierKeys
        } else {
            this.modifierKeys = DomUtils.modifierKeyIdsOfEvent(modifierKeysOrEvent)
        }

        this.dropTarget = extraData.dropTarget ?? null
        this.dropTargetLast = extraData.dropTargetLast ?? null
        this.dropTargetChanged = this.dropTarget !== this.dropTargetLast
    }

}
