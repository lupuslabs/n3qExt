import log = require('loglevel');
import * as $ from 'jquery';
import { as } from '../lib/as';
import { ContentApp } from './ContentApp';
import { Entity } from './Entity';
import { BackgroundMessage } from '../lib/BackgroundMessage';
import { Config } from '../lib/Config';
import { Utils } from '../lib/Utils';
import { is } from '../lib/is';
import { IObserver } from '../lib/ObservableProperty';
import * as AnimationsXml from './AnimationsXml';
import { RoomItem } from './RoomItem';
import { DomOpacityAwarePointerEventDispatcher } from '../lib/DomOpacityAwarePointerEventDispatcher';
import { SimpleToast } from './Toast';
import { DomButtonId } from '../lib/domTools';
import { DomModifierKeyId, PointerEventData, PointerEventType } from '../lib/PointerEventData';

class AvatarGetAnimationResult
{
    constructor(
        public url: string,
        public weight: number,
        public dx: number,
        public duration: number,
        public loop: boolean
    ) { }
}

export class Avatar implements IObserver
{
    private elem: HTMLDivElement;
    private imageElem: HTMLImageElement;
    private pointerEventDispatcher: DomOpacityAwarePointerEventDispatcher;
    private dragElem?: HTMLElement;
    private dragBadgeElem?: HTMLImageElement;
    private hasAnimation = false;
    private animations: AnimationsXml.AnimationsDefinition;
    private defaultGroup: string;
    private currentCondition: string = '';
    private currentState: string = '';
    private currentActivity: string = '';
    private currentAction: string = '';
    private isDefault: boolean = true;
    private speedPixelPerSec: number = 0;

    isDefaultAvatar(): boolean { return this.isDefault; }
    getElem(): HTMLElement { return this.elem; }

    constructor(protected app: ContentApp, private entity: Entity, private isSelf: boolean)
    {
        this.imageElem = <HTMLImageElement>$('<img class="n3q-base n3q-avatar-image" />').get(0);
        this.elem = <HTMLDivElement>$('<div class="n3q-base n3q-avatar" />').get(0);
        this.elem.append(this.imageElem);

        // const url = 'https://www.virtual-presence.org/images/wolf.png';
        // const url = app.getAssetUrl('default-avatar.png');
        const url = entity.getDefaultAvatar();
        // this.elem.src = url;
        this.setImage(url);
        this.setSize(100, 100);
        this.isDefault = true;

        entity.getElem().append(this.elem);

        this.pointerEventDispatcher = new DomOpacityAwarePointerEventDispatcher(this.app, this.imageElem);
        this.pointerEventDispatcher.addDropTargetTransparentClass('n3q-backpack-item');

        this.pointerEventDispatcher.setEventListener(PointerEventType.hoverenter, eventData => {
            this.entity.onMouseEnterAvatar(eventData);
        });
        this.pointerEventDispatcher.setEventListener(PointerEventType.hoverleave, eventData => {
            this.entity.onMouseLeaveAvatar(eventData);
        });

        this.pointerEventDispatcher.setEventListener(PointerEventType.buttondown, eventData => {
            this.entity.select();
        });
        this.pointerEventDispatcher.setEventListener(PointerEventType.click, eventData => {
            this.entity.onMouseClickAvatar(eventData);
        });
        this.pointerEventDispatcher.setEventListener(PointerEventType.doubleclick, eventData => {
            this.entity.onMouseDoubleClickAvatar(eventData);
        });

        this.pointerEventDispatcher.setEventListener(PointerEventType.dragstart, ev => {
            const dragElem: HTMLElement = <HTMLElement>this.elem.cloneNode(true);
            dragElem.classList.add('n3q-dragging');
            this.dragElem = dragElem;
            this.app.getDisplay()?.append(dragElem);
            this.app.toFront(dragElem, ContentApp.LayerDrag);

            if (this.entity instanceof RoomItem && this.entity.isMyItem()) {
                const badges = this.app.getRoom()?.getMyParticipant()?.getBadgesDisplay();
                this.dragBadgeElem = badges?.makeDraggedBadgeIcon(this.entity.getProperties());
            }

            this.entity.onDragAvatarStart(ev);
        });

        this.pointerEventDispatcher.setEventListener(PointerEventType.dragmove, ev => {
            if (ev.buttons !== DomButtonId.first || ev.modifierKeys !== DomModifierKeyId.none) {
                this.pointerEventDispatcher.cancelDrag();
            }

            const badges = this.app.getRoom()?.getMyParticipant()?.getBadgesDisplay();
            const properties = this.entity instanceof RoomItem ? this.entity.getProperties() : {};
            let targetIsBadges = badges?.isValidEditModeBadgeDrop(ev, properties);
            if (targetIsBadges) {
                badges?.showDraggedBadgeIconInside(properties, ev, this.dragBadgeElem);
            } else {
                badges?.hideDraggedBadgeIcon(this.dragBadgeElem);
            }

            if (targetIsBadges) {
                this.dragElem.classList.add('n3q-hidden');
            } else {
                this.dragElem.style.left = `${ev.clientX - ev.startDomElementOffsetX}px`;
                this.dragElem.style.top = `${ev.clientY - ev.startDomElementOffsetY}px`;
                this.dragElem.classList.remove('n3q-hidden');
            }
        });

        this.pointerEventDispatcher.setEventListener(PointerEventType.dragenter, ev => {
            const dropTargetElem = ev.dropTarget;
            if (this.entity instanceof RoomItem 
            && this.app.getEntityByelem(dropTargetElem)?.isValidDropTargetForItem(this.entity) === true) {
                dropTargetElem?.parentElement?.classList.add('n3q-avatar-drophilite');
            }
        });

        this.pointerEventDispatcher.setEventListener(PointerEventType.dragleave, ev => {
            const dropTargetElem = ev.dropTargetLast;
            dropTargetElem?.parentElement?.classList.remove('n3q-avatar-drophilite');
        });

        this.pointerEventDispatcher.setEventListener(PointerEventType.dragdrop, ev => {
            if (this.entity instanceof RoomItem && ev.dropTarget instanceof HTMLElement
            && ev.dropTarget.classList.contains('n3q-backpack-pane')) {
                this.onRoomItemDropOnBackpack(ev, this.entity, ev.dropTarget);
                return;
            }
            if (this.entity instanceof RoomItem) {

                const badges = this.app.getRoom()?.getMyParticipant()?.getBadgesDisplay();
                const properties = this.entity.getProperties();
                if (badges?.isValidEditModeBadgeDrop(ev, properties)) {
                    badges?.onBadgeDropInside(ev, properties);
                    return;
                }

                const dropTargetEntity = this.app.getEntityByelem(ev.dropTarget);
                if (dropTargetEntity?.isValidDropTargetForItem(this.entity)) {
                    dropTargetEntity.onGotItemDroppedOn(this.entity);
                    return;
                }

            }
            let newX = this.entity.getPosition() + ev.distanceX;
            newX = Math.max(0, Math.min(document.documentElement.offsetWidth - 1, newX));
            this.entity.onDraggedTo(newX);
        });

        this.pointerEventDispatcher.setEventListener(PointerEventType.dragend, ev => {
            this.dragElem?.parentElement?.removeChild(this.dragElem);
            const badges = this.app.getRoom()?.getMyParticipant()?.getBadgesDisplay();
            this.dragBadgeElem = badges?.disposeDraggedBadgeIcon(this.dragBadgeElem);
        });

    }

    private onRoomItemDropOnBackpack(eventData: PointerEventData, roomItem: RoomItem, bpPaneElem: HTMLElement): void
    {
        if (!roomItem.isMyItem()) {
            const toast = new SimpleToast(
                this.app, 'backpack-DerezNotMyItem',
                Config.get('room.errorToastDurationSec', 8),
                'warning', 'NotDerezzed', 'NotYourItem',
            );
            toast.show();
            return;
        }
        const itemProps = roomItem.getProperties();
        const paneElemDims = bpPaneElem.getBoundingClientRect();

        const drggedElemVpX = eventData.clientX - eventData.startDomElementOffsetX;
        const drggedElemBackpackX = drggedElemVpX - paneElemDims.x + bpPaneElem.scrollLeft;
        const x = Math.round(drggedElemBackpackX + as.Float(itemProps?.Width) / 2);
        const drggedElemVpY = eventData.clientY - eventData.startDomElementOffsetY;
        const drggedElemBackpackY = drggedElemVpY - paneElemDims.y + bpPaneElem.scrollTop;
        const LabelHeightHalf = 7;
        const y = Math.round(drggedElemBackpackY + as.Float(itemProps?.Height) / 2 + LabelHeightHalf);

        this.app.derezItem(roomItem.getItemId(), x, y); // x, y is center of item with label in backpack.
        this.app.getBackpackWindow()?.getItem(roomItem.getItemId())?.toFront();
    }

    addClass(className: string): void
    {
        $(this.imageElem).addClass(className);
    }

    static getEntityIdByAvatarElem(elem: HTMLElement): string
    {
        if (elem) {
            const nick = $(elem).data('nick');
            if (nick) { if (nick != '') { return nick; } }

            const avatarElem = elem.parentElement;
            if (avatarElem) {
                if ($(avatarElem).hasClass('n3q-entity')) {
                    return $(avatarElem).data('nick');
                } else {
                    const avatarEntityElem = avatarElem.parentElement;
                    if (avatarEntityElem) {
                        return $(avatarEntityElem).data('nick');
                    }
                }
            }
        }
    }

    stop()
    {
        if (this.animationTimer !== undefined) {
            clearTimeout(this.animationTimer);
            this.animationTimer = undefined;
        }
    }

    hilite(on: boolean)
    {
        if (on) {
            $(this.imageElem).addClass('n3q-avatar-hilite');
        } else {
            $(this.imageElem).removeClass('n3q-avatar-hilite');
        }
    }

    updateObservableProperty(key: string, value: string): void
    {
        switch (key) {
            case 'ImageUrl': {
                if (!this.hasAnimation) {
                    // let defaultSize = Config.get('room.defaultStillimageSize', 80);
                    // this.setSize(defaultSize, defaultSize);
                    this.setImage(value);
                }
            } break;
            case 'VCardImageUrl': {
                if (!this.hasAnimation) {
                    const maxSize = Config.get('room.defaultStillimageSize', 80);
                    const minSize = maxSize * 0.75;
                    const slightlyRandomSize = Utils.randomInt(minSize, maxSize);
                    this.setSize(slightlyRandomSize, slightlyRandomSize);
                    this.setImage(value);
                }
            } break;
            case 'AnimationsUrl': {
                if (value == '') {
                    this.setAnimations(value);
                } else {
                    // let defaultSize = Config.get('room.defaultAnimationSize', 100);
                    // this.setSize(defaultSize, defaultSize);
                    this.setAnimations(value);
                }
            } break;
        }
    }

    async getDataUrlImage(imageUrl: string): Promise<string>
    {
        const proxiedUrl = as.String(Config.get('avatars.dataUrlProxyUrlTemplate', 'https://webex.vulcan.weblin.com/Avatar/DataUrl?url={url}')).replace('{url}', encodeURIComponent(imageUrl));
        return new Promise(async (resolve, reject) =>
        {
            try {
                const response = await BackgroundMessage.fetchUrl(proxiedUrl, '');
                if (response.ok) {
                    resolve(response.data);
                }
            } catch (error) {
                reject(error);
            }
        });
    }

    setImage(url: string): void
    {
        if (url.startsWith('data:')) {
            $(this.imageElem).attr('src', url);
        } else {
            try {
                this.getDataUrlImage(url).then(dataUrlImage =>
                {
                    $(this.imageElem).attr('src', dataUrlImage);
                });
            } catch (error) {
                $(this.imageElem).attr('src', url);
            }
        }
    }

    setSize(width: number, height: number)
    {
        $(this.elem).css({ 'width': width + 'px', 'height': height + 'px', 'left': -(width / 2) });
    }

    setCondition(condition: string): void
    {
        if (this.currentCondition != condition) {
            this.currentCondition = condition;
            this.startNextAnimation();
        }
    }

    setState(state: string): void
    {
        if (this.currentState != state) {
            this.currentState = state;
            this.startNextAnimation();
        }
    }

    setActivity(activity: string): void
    {
        if (this.currentActivity != activity) {
            this.currentActivity = activity;
            this.startNextAnimation();
        }
    }

    setAction(action: string): void
    {
        if (this.currentAction != action) {
            this.currentAction = action;
            this.startNextAnimation();
        }
    }

    async setAnimations(url: string): Promise<void>
    {
        if (url == '') {
            this.animations = null;
            this.hasAnimation = false;
        } else {
            const response = await BackgroundMessage.fetchUrl(url, '');
            if (response.ok) {
                try {

                    const parsed = AnimationsXml.AnimationsXml.parseXml(url, response.data);
                    const defaultSize = Config.get('room.defaultAnimationSize', 100);
                    const width = as.Int(parsed.params['width'], defaultSize);
                    const height = as.Int(parsed.params['height'], defaultSize);
                    this.setSize(width, height);

                    this.animations = parsed;
                    this.defaultGroup = this.getDefaultGroup();

                    if (!this.hasAnimation) {
                        this.startNextAnimation();
                        this.hasAnimation = true;
                    }

                } catch (error) {
                    log.info(error);
                }
            }
        }
    }

    private moveCnt = 0;
    private animationTimer: number = undefined;
    startNextAnimation(): void
    {
        let group = this.currentAction;
        this.currentAction = '';
        if (group == '') { group = this.currentCondition; }
        if (group == '') { group = this.currentState; }
        if (group == '') { group = this.currentActivity; }
        if (group == '') { group = this.defaultGroup; }

        let animation = this.getAnimationByGroup(group);
        if (!animation) {
            group = this.defaultGroup;
            animation = this.getAnimationByGroup(group);
            if (!animation) {
                return;
            }
        }

        if (group.startsWith('move')) {
            this.moveCnt++;
            //log.debug('##### startNextAnimation', group, this.moveCnt, Date.now() / 1000);
        }

        let durationSec: number = animation.duration / 1000;
        if (durationSec < 0.1) {
            durationSec = 1.0;
        }

        // this.currentSpeedPixelPerSec = Math.abs(animation.dx) / durationSec;
        // dx means pixels per sec, not pixels per duration
        this.setSpeed(Math.abs(animation.dx));

        this.setImage(animation.url);

        if (this.animationTimer !== undefined) {
            clearTimeout(this.animationTimer);
            this.animationTimer = undefined;
        }
        this.animationTimer = window.setTimeout(() => { this.startNextAnimation(); }, durationSec * 1000);
    }

    hasSpeed(): boolean
    {
        return this.speedPixelPerSec != 0;
    }

    getSpeedPixelPerSec(): Number
    {
        return this.speedPixelPerSec;
    }

    setSpeed(pixelPerSec: number): void
    {
        this.speedPixelPerSec = pixelPerSec;
    }

    getAnimationByGroup(group: string): AvatarGetAnimationResult
    {
        if (this.animations == null) { return null; }

        const groupAnimations: AvatarGetAnimationResult[] = [];
        let nWeightSum: number = 0;

        for (const name in this.animations.sequences) {
            const animation = this.animations.sequences[name];
            if (animation.group == group) {
                const nWeight = as.Int(animation.weight, 1);
                nWeightSum += nWeight;
                groupAnimations.push(new AvatarGetAnimationResult(animation.url, nWeight, as.Int(animation.dx), as.Int(animation.duration, 1000), as.Bool(animation.loop)));
            }
        }

        const nRnd = Math.random() * nWeightSum;
        let idx = 0;

        let nCurrentSum = 0;
        for (let i = 0; i < groupAnimations.length; i++) {
            nCurrentSum += groupAnimations[i].weight;
            if (nRnd < nCurrentSum) {
                idx = i;
                break;
            }
        }

        if (groupAnimations[idx] !== undefined) {
            return new AvatarGetAnimationResult(groupAnimations[idx].url, groupAnimations[idx].weight, groupAnimations[idx].dx, groupAnimations[idx].duration, groupAnimations[idx].loop);
        }

        return null;
    }

    getDefaultGroup(): string
    {
        return as.String(this.animations.params[AnimationsXml.AvatarAnimationParam.defaultsequence], 'idle');
    }
}
