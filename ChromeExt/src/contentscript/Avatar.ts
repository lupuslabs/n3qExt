import log = require('loglevel');
import { is } from '../lib/is'
import { as } from '../lib/as';
import { ContentApp } from './ContentApp';
import { Entity } from './Entity';
import { BackgroundMessage } from '../lib/BackgroundMessage';
import { Config } from '../lib/Config';
import { Utils } from '../lib/Utils';
import { IObserver } from '../lib/ObservableProperty';
import { AnimationsXml, AnimationsDefinition } from './AnimationsXml';
import { RoomItem } from './RoomItem';
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher';
import { SimpleToast } from './Toast';
import { DomUtils } from '../lib/DomUtils';
import { PointerEventData } from '../lib/PointerEventData';

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
    private pointerEventDispatcher: PointerEventDispatcher;
    private dragElem?: HTMLElement;
    private dragBadgeElem?: HTMLImageElement;
    private oldBadgesEditMode: boolean = false;
    private hasAnimation = false;
    private animations: AnimationsDefinition;
    private defaultGroup: string;
    private currentCondition: string = '';
    private currentState: string = '';
    private currentActivity: string = '';
    private currentAction: string = '';
    private isDefault: boolean = true;
    private speedPixelPerSec: number = 0;
    private imageCache: Map<string,string> = new Map();

    isDefaultAvatar(): boolean { return this.isDefault; }
    getElem(): HTMLElement { return this.elem; }

    constructor(protected app: ContentApp, private entity: Entity, private isSelf: boolean, private isVisible: boolean)
    {
        this.imageElem = <HTMLImageElement>DomUtils.elemOfHtml('<img class="n3q-base n3q-avatar-image" />');
        this.elem = <HTMLDivElement>DomUtils.elemOfHtml('<div class="n3q-base n3q-avatar" />');
        this.elem.append(this.imageElem);

        // const url = 'https://www.virtual-presence.org/images/wolf.png';
        // const url = app.getAssetUrl('default-avatar.png');
        const url = entity.getDefaultAvatar();
        // this.elem.src = url;
        this.setImage(url).then(() => {});
        this.setSize(100, 100);
        this.isDefault = true;

        if (!this.isVisible) {
            this.addClass('n3q-hidden');
        }

        entity.getElem().append(this.elem);

        this.pointerEventDispatcher = new PointerEventDispatcher(this.app, this.imageElem);
        this.pointerEventDispatcher.addDropTargetTransparentClass('n3q-backpack-item', 'n3q-badge');

        this.pointerEventDispatcher.addHoverEnterListener(ev => this.entity.onMouseEnterAvatar(ev));
        this.pointerEventDispatcher.addHoverLeaveListener(ev => this.entity.onMouseLeaveAvatar(ev));

        this.pointerEventDispatcher.addAnyButtonDownListener(ev => this.entity.select());

        this.pointerEventDispatcher.addUnmodifiedLeftClickListener(ev => this.entity.onUnmodifiedLeftClickAvatar(ev));
        this.pointerEventDispatcher.addCtrlLeftClickListener(ev => this.entity.onCtrlLeftClickAvatar(ev));
        this.pointerEventDispatcher.addUnmodifiedLeftLongclickListener(ev => this.entity.onUnmodifiedLeftLongclickAvatar(ev));
        this.pointerEventDispatcher.addUnmodifiedLeftDoubleclickListener(ev => this.entity.onUnmodifiedLeftDoubleclickAvatar(ev));
        this.pointerEventDispatcher.addCtrlLeftDoubleclickListener(ev => this.entity.onCtrlLeftDoubleclickAvatar(ev));

        this.pointerEventDispatcher.addDragStartListener(ev => {
            const dragElem: HTMLElement = <HTMLElement>this.elem.cloneNode(true);

            // Work around wrongly applied CSP in Firefox on pages limiting img-src after cloning by unsetting and setting img src:
            const dragImgElem = dragElem.querySelector('img');
            dragImgElem.setAttribute('src', '');
            dragImgElem.setAttribute('src', this.imageElem.getAttribute('src'));

            dragElem.classList.add('n3q-dragging');
            this.dragElem = dragElem;
            this.app.getDisplay()?.append(dragElem);
            this.app.toFront(dragElem, ContentApp.LayerDrag);

            if (this.entity instanceof RoomItem && this.entity.isMyItem()) {
                this.app.getBackpackWindow()?.setIsDropTargetStyle(true)
                const badges = this.app.getRoom()?.getMyParticipant()?.getBadgesDisplay();
                this.dragBadgeElem = badges?.makeDraggedBadgeIcon(this.entity.getProperties());

                this.oldBadgesEditMode = badges?.getIsInEditMode() ?? false;
                const wantedBadgesEditMode = badges?.isValidBadge(this.entity.getProperties()) ?? false;
                badges?.setEditMode(wantedBadgesEditMode)
            }

            this.entity.onDragAvatarStart(ev);
        });

        this.pointerEventDispatcher.addDragMoveListener(ev => {
            if (ev.buttons !== DomUtils.ButtonId.first || ev.modifierKeys !== DomUtils.ModifierKeyId.none) {
                this.pointerEventDispatcher.cancelDrag();
            }

            const badges = this.app.getRoom()?.getMyParticipant()?.getBadgesDisplay();
            const properties = this.entity instanceof RoomItem ? this.entity.getProperties() : {};
            let targetIsBadges = badges?.isValidEditModeBadgeDrop(ev, properties) ?? false;
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

            const backpack = this.app.getBackpackWindow()
            const isMyItem = this.entity instanceof RoomItem && this.entity.isMyItem();
            backpack?.setIsDropTargetStyle(isMyItem, backpack?.getIsDropTargetInBackpack(ev) ?? false)
        });

        this.pointerEventDispatcher.addDragEnterListener(ev => {
            const dropTargetElem = ev.dropTarget;
            if (this.entity instanceof RoomItem
            && this.app.getEntityByElem(dropTargetElem)?.isValidDropTargetForItem(this.entity) === true) {
                dropTargetElem?.parentElement?.classList.add('n3q-avatar-drophilite');
            }
        });

        this.pointerEventDispatcher.addDragLeaveListener(ev => {
            const dropTargetElem = ev.dropTargetLast;
            dropTargetElem?.parentElement?.classList.remove('n3q-avatar-drophilite');
        });

        this.pointerEventDispatcher.addDragDropListener(ev => {
            const backpack = this.app.getBackpackWindow()
            if (this.entity instanceof RoomItem && (backpack?.getIsDropTargetInBackpack(ev) ?? false)) {
                this.onRoomItemDropOnBackpack(ev, this.entity);
                return;
            }
            if (this.entity instanceof RoomItem) {

                const badges = this.app.getRoom()?.getMyParticipant()?.getBadgesDisplay();
                const properties = this.entity.getProperties();
                if (badges?.isValidEditModeBadgeDrop(ev, properties)) {
                    badges?.onBadgeDropInside(ev, properties);
                    return;
                }

                const dropTargetEntity = this.app.getEntityByElem(ev.dropTarget);
                if (dropTargetEntity?.isValidDropTargetForItem(this.entity)) {
                    dropTargetEntity.onGotItemDroppedOn(this.entity);
                    return;
                }

            }
            let newX = as.Int(ev.clientX - ev.startDomElementOffsetX + this.elem.offsetWidth / 2);
            newX = Math.max(0, Math.min(document.documentElement.offsetWidth - 1, newX));
            this.entity.onDraggedTo(newX);
        });

        this.pointerEventDispatcher.addDragEndListener(ev => this.onDragEnd());

    }

    private onDragEnd(): void
    {
        this.dragElem?.parentElement?.removeChild(this.dragElem);
        const badges = this.app.getRoom()?.getMyParticipant()?.getBadgesDisplay();
        this.dragBadgeElem = badges?.disposeDraggedBadgeIcon(this.dragBadgeElem);
        this.app.getBackpackWindow()?.setIsDropTargetStyle(false)

        this.app.getRoom()?.getMyParticipant()?.getBadgesDisplay()?.setEditMode(this.oldBadgesEditMode);
    }

    private onRoomItemDropOnBackpack(eventData: PointerEventData, roomItem: RoomItem): void
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
        const backpack = this.app.getBackpackWindow()
        if (!backpack) {
            return;
        }
        const itemProps = roomItem.getProperties();

        const drggedElemVpX = eventData.clientX - eventData.startDomElementOffsetX;
        const drggedElemVpY = eventData.clientY - eventData.startDomElementOffsetY;
        const [drggedElemBackpackX, drggedElemBackpackY]
            = backpack.translateClientPosToBackpackPos(drggedElemVpX, drggedElemVpY)
        const x = Math.round(drggedElemBackpackX + as.Float(itemProps.Width) / 2);
        const LabelHeightHalf = 7;
        const y = Math.round(drggedElemBackpackY + as.Float(itemProps.Height) / 2 + LabelHeightHalf);

        this.app.derezItem(roomItem.getItemId(), x, y); // x, y is center of item with label in backpack.
        backpack.getItem(roomItem.getItemId())?.toFront();
    }

    addClass(className: string): void
    {
        this.imageElem.classList.add(className);
    }

    static getEntityIdByAvatarElem(elem: HTMLElement): string
    {
        if (elem) {
            const nick = elem.getAttribute('data-nick') ?? '';
            if (nick) { if (nick !== '') { return nick; } }

            const avatarElem = elem.parentElement;
            if (avatarElem) {
                if (avatarElem.classList.contains('n3q-entity')) {
                    return avatarElem.getAttribute('data-nick');
                } else {
                    const avatarEntityElem = avatarElem.parentElement;
                    if (avatarEntityElem) {
                        return avatarEntityElem.getAttribute('data-nick');
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
        this.onDragEnd();
    }

    hilite(on: boolean)
    {
        if (on) {
            this.imageElem.classList.add('n3q-avatar-hilite');
        } else {
            this.imageElem.classList.remove('n3q-avatar-hilite');
        }
    }

    updateObservableProperty(key: string, value: string): void
    {
        switch (key) {
            case 'ImageUrl': {
                if (!this.hasAnimation) {
                    // let defaultSize = Config.get('room.defaultStillimageSize', 80);
                    // this.setSize(defaultSize, defaultSize);
                    this.setImage(value).then(() => {});
                }
            } break;
            case 'VCardImageUrl': {
                if (!this.hasAnimation) {
                    const maxSize = Config.get('room.defaultStillimageSize', 80);
                    const minSize = maxSize * 0.75;
                    const slightlyRandomSize = Utils.randomInt(minSize, maxSize);
                    this.setSize(slightlyRandomSize, slightlyRandomSize);
                    this.setImage(value).then(() => {});
                }
            } break;
            case 'AnimationsUrl': {
                if (value === '') {
                    this.setAnimations(value).catch(error => log.info(error));
                } else {
                    // let defaultSize = Config.get('room.defaultAnimationSize', 100);
                    // this.setSize(defaultSize, defaultSize);
                    this.setAnimations(value).catch(error => log.info(error));
                }
            } break;
        }
    }

    private async getDataUrlImage(imageUrl: string): Promise<string>
    {
        if (imageUrl.startsWith('data:')) {
            return imageUrl;
        }
        let dataUrlImage = this.imageCache.get(imageUrl);
        if (is.string(dataUrlImage)) {
            return dataUrlImage;
        }
        const proxiedUrl = as.String(Config.get('avatars.dataUrlProxyUrlTemplate', 'https://webex.vulcan.weblin.com/Avatar/DataUrl?url={url}')).replace('{url}', encodeURIComponent(imageUrl));
        dataUrlImage = await BackgroundMessage.fetchUrlAsText(proxiedUrl, '').catch(error => imageUrl);
        this.imageCache.set(imageUrl, dataUrlImage);
        return dataUrlImage;
    }

    private async setImage(imageUrl: string): Promise<void>
    {
        let dataUrlImage = await this.getDataUrlImage(imageUrl);
        if (this.imageElem.getAttribute('src')?.startsWith(dataUrlImage)) {
            return;
        }

        // Prevent browsers from syncing animations:
        // https://stackoverflow.com/a/51488398/4017937
        dataUrlImage = `${dataUrlImage}#${Math.random().toString()}`;

        this.imageElem.setAttribute('src', dataUrlImage);
    }

    setSize(width: number, height: number)
    {
        this.elem.style.width = `${width}px`;
        this.elem.style.height = `${height}px`;
        this.elem.style.left = `${-(width / 2)}px`;
    }

    setCondition(condition: string): void
    {
        if (this.currentCondition !== condition) {
            this.currentCondition = condition;
            this.startNextAnimation();
        }
    }

    setState(state: string): void
    {
        if (this.currentState !== state) {
            this.currentState = state;
            this.startNextAnimation();
        }
    }

    setActivity(activity: string): void
    {
        if (this.currentActivity !== activity) {
            this.currentActivity = activity;
            this.startNextAnimation();
        }
    }

    setAction(action: string): void
    {
        if (this.currentAction !== action) {
            this.currentAction = action;
            this.startNextAnimation();
        }
    }

    async setAnimations(url: string): Promise<void>
    {
        if (url === '') {
            this.animations = null;
            this.hasAnimation = false;
            return;
        }
        let data: string;
        try {
            data = await BackgroundMessage.fetchUrlAsText(url, '');
        } catch (errorResponse) {
            return; // Nothing to do if the URL couldn't be resolved.
        }
        const parsed = AnimationsXml.parseXml(url, data);
        this.setSize(parsed.params.width, parsed.params.height);

        this.animations = parsed;
        this.defaultGroup = this.getDefaultGroup();

        if (!this.hasAnimation) {
            this.startNextAnimation();
            this.hasAnimation = true;
        }

        this.entity.onAvatarAnimationsParsed(this.animations);
    }

    private moveCnt = 0;
    private animationTimer: number = undefined;
    startNextAnimation(): void
    {
        let group = this.currentAction;
        this.currentAction = '';
        if (group === '') { group = this.currentCondition; }
        if (group === '') { group = this.currentState; }
        if (group === '') { group = this.currentActivity; }
        if (group === '') { group = this.defaultGroup; }

        let animation = this.getAnimationByGroup(group);
        if (!animation) {
            group = this.defaultGroup;
            animation = this.getAnimationByGroup(group);
            if (!animation) {
                return;
            }
        }

        clearTimeout(this.animationTimer);
        this.animationTimer = undefined;

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

        this.setImage(animation.url).then(() => {
            this.animationTimer = window.setTimeout(() => this.startNextAnimation(), durationSec * 1000);
        });
    }

    hasSpeed(): boolean
    {
        return this.speedPixelPerSec !== 0;
    }

    getSpeedPixelPerSec(): Number
    {
        return this.speedPixelPerSec;
    }

    setSpeed(pixelPerSec: number): void
    {
        this.speedPixelPerSec = pixelPerSec;
    }

    public getAnimations(): null|AnimationsDefinition
    {
        return this.animations;
    }

    getAnimationByGroup(group: string): null|AvatarGetAnimationResult
    {
        if (this.animations == null) { return null; }

        const groupAnimations: AvatarGetAnimationResult[] = [];
        let nWeightSum: number = 0;

        for (const name in this.animations.sequences) {
            const animation = this.animations.sequences[name];
            if (animation.group === group) {
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
        return as.String(this.animations.params[AnimationsDefinition.defaultsequence], 'idle');
    }
}
