import * as imgDefaultAvatar from '../assets/DefaultAvatar.png';

import log = require('loglevel');
import { as } from '../lib/as';
import { Element as XmlElement } from 'ltx';
import { Config } from '../lib/Config';
import { Room } from './Room';
import { Avatar } from './Avatar';
import { ContentApp } from './ContentApp';
import { RoomItem } from './RoomItem';
import { BackpackItem } from './BackpackItem';
import { PointerEventData } from '../lib/PointerEventData';
import { AnimationsDefinition } from './AnimationsXml';
import { DomElemTransition, domHtmlElemOfHtml, startDomElemTransition } from '../lib/domTools'

export class Entity
{
    protected elem: HTMLElement;
    protected rangeElem: HTMLElement;
    protected visible: boolean = false;
    protected avatarDisplay: Avatar;
    protected defaultSpeedPixelPerSec: number = as.Float(Config.get('room.defaultAvatarSpeedPixelPerSec', 100));
    protected onMoveTransitionEndHandler: null|((ev: TransitionEvent) => void) = null;

    constructor(protected app: ContentApp, protected room: Room, protected roomNick: string, protected isSelf: boolean)
    {
        this.elem = domHtmlElemOfHtml('<div class="n3q-base n3q-entity n3q-hidden"></div>');
        app.getDisplay()?.append(this.elem);
    }

    getRoom(): Room { return this.room; }
    getRoomNick(): string { return this.roomNick; }
    getElem(): HTMLElement { return this.elem; }
    getDefaultAvatar(): string { return imgDefaultAvatar; }
    getAvatar(): Avatar { return this.avatarDisplay; }
    getIsSelf(): boolean { return this.isSelf; }

    show(visible: boolean, durationSec: number = 0.0): void
    {
        if (visible !== this.visible) {
            if (visible) {
                this.elem.classList.remove('n3q-hidden');
                this.elem.style.opacity = '0';
                const transition = { property: 'opacity', duration: `${durationSec}s` };
                startDomElemTransition(this.elem, null, transition, '1');
            } else {
                this.elem.classList.add('n3q-hidden');
            }
            this.visible = visible;
        }
    }

    remove(): void
    {
        this.show(false);
        this.elem?.remove();
    }

    showEffect(effect: string): void
    {
        const pulseElem = domHtmlElemOfHtml('<div class="n3q-base n3q-pulse"></div>');
        this.elem.append(pulseElem);
        window.setTimeout(() => { pulseElem?.remove(); }, 1000);
    }

    setRange(left: number, right: number): void
    {
        this.removeRange();
        this.rangeElem = domHtmlElemOfHtml('<div class="n3q-base n3q-range"></div>');
        this.rangeElem.style.left = `${left}px`;
        this.rangeElem.style.width = `${right - left}px`;
        this.elem.prepend(this.rangeElem);
        this.elem.style.zIndex = '';
    }

    removeRange(): void
    {
        this.rangeElem?.remove();
    }

    public onAvatarAnimationsParsed(avatarAnimations: AnimationsDefinition): void
    {
        // Nothing to do if not having a Chatout.
    }

    protected setPosition(x: number): void
    {
        this.elem.style.left = `${x}px`;
    }

    protected move(newX: number): void
    {
        if (newX < 0) { newX = 0; }

        const oldX = this.getPosition();
        if (newX === oldX) {
            this.setPosition(newX);
            this.onMoveDestinationReached(newX);
        }
        const diffX = newX - oldX;

        this.avatarDisplay?.setActivity(diffX < 0 ? 'moveleft' : 'moveright'); // Also sets speed.
        if (!this.avatarDisplay?.hasSpeed()) {
            // Happens when no avatarDisplay or animations not loaded yet or move animation has no speed defined.
            this.avatarDisplay?.setActivity(''); // Slide doesn't clear activity when done, so do it now.
            this.quickSlide(newX);
            return;
        }
        const speedPixelPerSec = as.Float(this.avatarDisplay?.getSpeedPixelPerSec(), this.defaultSpeedPixelPerSec);
        const durationSecs = Math.abs(diffX) / speedPixelPerSec;
        const transition: DomElemTransition = { property: 'left', timingFun: 'linear', duration: `${durationSecs}s` };
        const onMoveComplete = ev => {
            if (ev.propertyName === 'left') {
                this.onMoveDestinationReached(newX);
            }
        }
        this.elem.removeEventListener('transitionend', this.onMoveTransitionEndHandler);
        this.onMoveTransitionEndHandler = onMoveComplete;
        this.elem.addEventListener('transitionend', this.onMoveTransitionEndHandler);
        startDomElemTransition(this.elem, null, transition, `${newX}px`);
    }

    protected onMoveDestinationReached(newX: number): void
    {
        this.avatarDisplay?.setActivity('');
    }

    public getPosition(): number
    {
        return this.elem.offsetLeft;
    }

    /**
     * Returns avatar bottom center viewport coordinates.
     */
    public getClientPos(): {avatarOriginClientX: number, avatarOriginClientY: number}
    {
        const clientRect = this.elem.getBoundingClientRect();
        return {avatarOriginClientX: clientRect.left, avatarOriginClientY: clientRect.bottom};
    }

    protected quickSlide(newX: number): void
    {
        if (newX < 0) { newX = 0; }

        const durationSecs = as.Float(Config.get('room.quickSlideSec'), 0.1);
        const transition: DomElemTransition = { property: 'left', timingFun: 'linear', duration: `${durationSecs}s` };
        const onMoveComplete = ev => {
            if (ev.propertyName === 'left') {
                this.onQuickSlideReached(newX);
            }
        }
        this.elem.removeEventListener('transitionend', this.onMoveTransitionEndHandler);
        this.onMoveTransitionEndHandler = onMoveComplete;
        this.elem.addEventListener('transitionend', this.onMoveTransitionEndHandler);
        startDomElemTransition(this.elem, null, transition, `${newX}px`);
    }

    protected onQuickSlideReached(newX: number): void
    {
    }

    // Xmpp

    onPresenceAvailable(stanza: XmlElement)
    {
        log.error('Entity.onPresenceAvailable', 'not implemented', 'you should not be here');
    }

    // Mouse

    onMouseEnterAvatar(ev: PointerEventData): void
    {
        this.avatarDisplay?.hilite(true);
    }

    onMouseLeaveAvatar(ev: PointerEventData): void
    {
        this.avatarDisplay?.hilite(false);
    }

    onUnmodifiedLeftClickAvatar(ev: PointerEventData): void
    {
        this.select();
    }

    onCtrlLeftClickAvatar(ev: PointerEventData): void
    {
        this.select();
    }

    onUnmodifiedLeftLongclickAvatar(ev: PointerEventData): void
    {
        this.select();
    }

    onUnmodifiedLeftDoubleclickAvatar(ev: PointerEventData): void
    {
        this.select();
    }

    onCtrlLeftDoubleclickAvatar(ev: PointerEventData): void
    {
        this.select();
    }

    select(): void
    {
        this.app.toFront(this.elem, ContentApp.LayerEntity);
    }

    // Drag

    onDragAvatarStart(ev: PointerEventData): void
    {
        this.removeRange();
        this.app.toFront(this.elem, ContentApp.LayerEntity);
    }

    onDraggedTo(newX: number): void
    {
    }

    // Dropped stuff handling

    isValidDropTargetForItem(draggingItem: RoomItem|BackpackItem): boolean
    {
        return false;
    }

    /**
     * Reacts to an item that has been drag-and-dropped on this.
     *
     * @todo: Interface to be implemented by RoomItem and BackpackItem,
     *        so the type can be properly defined in the signature.
     *
     * @param droppedItem RoomItem|BackpackItem
     */
    onGotItemDroppedOn(droppedItem: RoomItem|BackpackItem): void {}

}
