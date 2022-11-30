import imgDefaultAvatar from '../assets/DefaultAvatar.png';

import log = require('loglevel');
import * as $ from 'jquery';
import 'jqueryui';
import { is } from '../lib/is';
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

export class Entity
{
    protected elem: HTMLElement;
    protected rangeElem: HTMLElement;
    protected visible: boolean = false;
    protected avatarDisplay: Avatar;
    protected positionX: number = -1;
    protected defaultSpeedPixelPerSec: number = as.Float(Config.get('room.defaultAvatarSpeedPixelPerSec', 100));

    constructor(protected app: ContentApp, protected room: Room, protected roomNick: string, protected isSelf: boolean)
    {
        this.elem = <HTMLDivElement>$('<div class="n3q-base n3q-entity" />').get(0);
        this.elem.style.display = 'none';

        $(app.getDisplay()).append(this.elem);
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
                if (durationSec > 0) {
                    $(this.elem).fadeIn(durationSec * 1000);
                } else {
                    this.elem.style.display = 'block';
                }
            } else {
                this.elem.style.display = 'none';
            }
            this.visible = visible;
        }
    }

    remove(): void
    {
        this.show(false);
        $(this.elem).remove();
        delete this.elem;
    }

    showEffect(effect: string): void
    {
        const pulseElem = <HTMLDivElement>$('<div class="n3q-base n3q-pulse" />').get(0);
        $(this.elem).append(pulseElem);
        window.setTimeout(() => { $(pulseElem).remove(); }, 1000);
    }

    setRange(left: number, right: number): void
    {
        this.removeRange();
        this.rangeElem = <HTMLDivElement>$('<div class="n3q-base n3q-range" />').get(0);
        $(this.rangeElem).css({ left: left + 'px', width: (right - left)  + 'px' });
        $(this.elem).prepend(this.rangeElem);
        $(this.elem).css( { 'z-index': '' });
    }

    removeRange(): void
    {
        if (this.rangeElem) { $(this.rangeElem).remove(); }
    }

    public onAvatarAnimationsParsed(avatarAnimations: AnimationsDefinition): void
    {
        // Nothing to do if not having a Chatout.
    }

    setPosition(x: number): void
    {
        this.positionX = x;
        if (!is.nil(this.elem)) {
            this.elem.style.left = x + 'px';
        }
    }

    move(newX: number): void
    {
        if (newX < 0) { newX = 0; }

        const oldX = this.getPosition();
        this.setPosition(oldX);
        const diffX = newX - oldX;

        this.avatarDisplay?.setActivity(diffX < 0 ? 'moveleft' : 'moveright'); // Also sets speed.
        if (!this.avatarDisplay?.hasSpeed()) {
            // Happens when no avatarDisplay or animations not loaded yet or move animation has no speed defined.
            this.avatarDisplay?.setActivity(''); // Slide doesn't clear activity when done, so do it now.
            this.quickSlide(newX);
            return;
        }
        const speedPixelPerSec = as.Float(this.avatarDisplay?.getSpeedPixelPerSec(), this.defaultSpeedPixelPerSec);
        const durationSec = Math.abs(diffX) / speedPixelPerSec;
        $(this.getElem())
            .stop(true)
            .animate(
                { left: newX + 'px' },
                {
                    duration: durationSec * 1000,
                    step: (x) => { this.positionX = x; },
                    easing: 'linear',
                    complete: () => this.onMoveDestinationReached(newX)
                }
            );
    }

    onMoveDestinationReached(newX: number): void
    {
        this.setPosition(newX);
        this.avatarDisplay?.setActivity('');
    }

    getPosition(): number
    {
        return this.positionX;
    }

    /**
     * Returns avatar bottom center viewport coordinates.
     */
    getClientPos(): {avatarOriginClientX: number, avatarOriginClientY: number}
    {
        const clientRect = this.elem.getBoundingClientRect();
        return {avatarOriginClientX: clientRect.left, avatarOriginClientY: clientRect.bottom};
    }

    quickSlide(newX: number): void
    {
        if (newX < 0) { newX = 0; }

        $(this.elem)
            .stop(true)
            .animate(
                { left: newX + 'px' },
                {
                    duration: as.Float(Config.get('room.quickSlideSec'), 0.1) * 1000,
                    step: (x) => { this.positionX = x; },
                    easing: 'linear',
                    complete: () => this.onQuickSlideReached(newX)
                }
            );
    }

    onQuickSlideReached(newX: number): void
    {
        this.positionX = newX;
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

    onMouseClickAvatar(ev: PointerEventData): void
    {
        this.select();
    }

    onMouseDoubleClickAvatar(ev: PointerEventData): void
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
