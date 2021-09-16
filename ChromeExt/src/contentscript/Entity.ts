import imgDefaultAvatar from '../assets/DefaultAvatar.png';

import log = require('loglevel');
import * as $ from 'jquery';
import 'jqueryui';
import { as } from '../lib/as';
import { Config } from '../lib/Config';
import { Room } from './Room';
import { Avatar } from './Avatar';
import { ContentApp } from './ContentApp';

export class Entity
{
    protected elem: HTMLElement;
    protected rangeElem: HTMLElement;
    protected visible: boolean = false;
    protected avatarDisplay: Avatar;
    protected positionX: number = -1;
    protected defaultSpeedPixelPerSec: number = as.Float(Config.get('room.defaultAvatarSpeedPixelPerSec', 100));
    protected inMove: boolean = false;

    constructor(protected app: ContentApp, protected room: Room, protected roomNick: string, protected isSelf: boolean)
    {
        this.elem = <HTMLDivElement>$('<div class="n3q-base n3q-entity" />').get(0);
        this.elem.style.display = 'none';

        $(app.getDisplay()).append(this.elem);
    }

    getRoom(): Room { return this.room; }
    getElem(): HTMLElement { return this.elem; }
    getDefaultAvatar(): string { return imgDefaultAvatar; }
    getAvatar(): Avatar { return this.avatarDisplay; }
    getIsSelf(): boolean { return this.isSelf; }

    show(visible: boolean, durationSec: number = 0.0): void
    {
        if (visible != this.visible) {
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

    showEffect(effect: any): void
    {
        let pulseElem = <HTMLDivElement>$('<div class="n3q-base n3q-pulse" />').get(0);
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

    setPosition(x: number): void
    {
        this.positionX = x;
        if (this.elem != undefined) {
            this.elem.style.left = x + 'px';
        }
    }

    move(newX: number): void
    {
        this.inMove = true;

        if (newX < 0) { newX = 0; }

        this.setPosition(this.getPosition());

        var oldX = this.getPosition();
        var diffX = newX - oldX;
        var absDiffX = diffX < 0 ? -diffX : diffX;

        if (this.avatarDisplay) {
            if (diffX < 0) {
                this.avatarDisplay.setActivity('moveleft');
            } else {
                this.avatarDisplay.setActivity('moveright');
            }
        }

        if (this.avatarDisplay) {
            if (!this.avatarDisplay.hasSpeed()) {
                this.quickSlide(newX);
                return;
            }
        }

        let speedPixelPerSec = as.Float(this.avatarDisplay.getSpeedPixelPerSec(), this.defaultSpeedPixelPerSec);
        var durationSec = absDiffX / speedPixelPerSec;

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
        this.inMove = false;
        this.setPosition(newX);
        this.avatarDisplay?.setActivity('');
    }

    getPosition(): number
    {
        return this.positionX;
    }

    quickSlide(newX: number): void
    {
        if (newX < 0) { newX = 0; }

        $(this.elem)
            .stop(true)
            .animate(
                { left: newX + 'px' },
                {
                    duration: Config.get('room.quickSlideSec', 0.1) * 1000,
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

    onPresenceAvailable(stanza: any)
    {
        log.error('Entity.onPresenceAvailable', 'not implemented', 'you should not be here');
    }

    // Mouse

    onMouseEnterAvatar(ev: JQuery.Event): void
    {
        this.avatarDisplay?.hilite(true);
    }

    onMouseLeaveAvatar(ev: JQuery.Event): void
    {
        this.avatarDisplay?.hilite(false);
    }

    onMouseClickAvatar(ev: JQuery.Event): void
    {
        this.select()
    }

    onMouseDoubleClickAvatar(ev: JQuery.Event): void
    {
    }

    select(): void
    {
        this.app.toFront(this.elem, ContentApp.LayerEntity);
    }

    // Drag

    protected dragStartPosition: { top: number; left: number; };
    onDragAvatarStart(ev: JQueryMouseEventObject, ui: JQueryUI.DraggableEventUIParams): void
    {
        this.dragStartPosition = ui.position;
        this.app.toFront(this.elem, ContentApp.LayerEntity);
    }

    onDragAvatar(ev: JQueryMouseEventObject, ui: JQueryUI.DraggableEventUIParams): void
    {
    }

    onDragAvatarStop(ev: JQueryMouseEventObject, ui: JQueryUI.DraggableEventUIParams): void
    {
        let dX = ui.position.left - this.dragStartPosition.left;
        let newX = this.getPosition() + dX;
        this.onDraggedTo(newX);
    }

    onDraggedTo(newX: number): void
    {
    }
}
