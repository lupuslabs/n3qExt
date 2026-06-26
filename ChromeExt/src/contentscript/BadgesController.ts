import log = require('loglevel');
import { is } from '../lib/is';
import { as } from '../lib/as';
import { iter, Iter } from '../lib/Iter'
import { ItemProperties, Pid } from '../lib/ItemProperties';
import { ContentApp } from './ContentApp';
import { BackpackUpdateEventData } from './OwnItemRepository'
import { Entity } from './Entity';
import { ErrorWithData, Utils } from '../lib/Utils';
import { Config } from '../lib/Config';
import { Badge } from './Badge';
import { BackgroundMessage } from '../lib/BackgroundMessage';
import { PointerEventData } from '../lib/PointerEventData';
import { SimpleToast } from './Toast';
import { ItemStatBoostsRepository } from '../lib/ItemStatBoostsRepository'

export class BadgesController
{
    // Displays and allows for drag 'n drop editing of badges.
    //
    // Avatar coordinates start at the bottom center of the avatar:
    //         ___
    //   Y    /.,.\
    // + ^    \ ~ /
    //   |     /|\
    //   |    / | \
    //   |     / \
    // 0 |    /   \
    //     <----+----> X
    //     -    0    +
    //
    // A Badge's position are the avatar coordinates measured at the middle center of the badge.
    //
    // Local badges are initialized from backpack once and then kept up to date by onBackpack*Item methods.
    // Other's badges are initialized and updated by updateBadgesFromPresence.
    private readonly app: ContentApp;
    private readonly entity: Entity;
    private readonly parentDisplay: HTMLElement;
    private readonly isLocal: boolean;

    private debugLogEnabled: boolean;
    private readonly debugLogEntityInfo: {};
    private badges: Map<string,Badge> = new Map();
    private containerDimensions: {avatarYTop: number, avatarXRight: number, avatarYBottom: number, avatarXLeft: number};
    private containerElem: HTMLElement;
    private editModeBackgroundElem?: HTMLElement;
    private editModeHintElem?: HTMLElement;
    private editModeExitElem?: HTMLElement = null;
    private isInEditMode: boolean = false;

    private readonly confiogUpdateHandler: () => void;
    private readonly itemHandling: BadgesControllerItemHandling;

    constructor(app: ContentApp, entity: Entity, parentDisplay: HTMLElement)
    {
        this.app = app;
        this.entity = entity;
        this.parentDisplay = parentDisplay;
        this.isLocal = entity.getIsSelf();
        this.debugLogEntityInfo = {isOwn: this.isLocal, userRoomNick: this.entity.getRoomNick()};

        this.confiogUpdateHandler = () => this.onConfigUpdated();

        if (this.isLocal) {
            this.itemHandling = new OwnParticipantBadgesControllerItemHandling(this.app, this);
        } else {
            this.itemHandling = new OtherParticipantBadgesControllerItemHandling(this.app, this);
        }
        this.app.configUpdateListeners.addListener(this.confiogUpdateHandler);
        this.onConfigUpdated();
        this.itemHandling.start();
        if (this.debugLogEnabled) {
            log.info('BadgesController.constructor: Construction complete.', this.debugLogEntityInfo);
        }
    }

    //--------------------------------------------------------------------------
    // API for Entity and the avatar menu

    public updateBadgesFromPresence(badgesStr: string): void
    {
        this.itemHandling.updateBadgesFromPresence(badgesStr);
    }

    public getBadgesStrForPresence(): string
    {
        const publicBadgeItems = this.getPublicBadges()
            .map(([key, badge]) => badge.getProperties());
        return this.itemHandling.getBadgesStrForPresence(publicBadgeItems);
    }

    public getIsInEditMode(): boolean
    {
        return this.isInEditMode;
    }

    public setEditMode(enterEditMode: boolean): void
    {
        if (enterEditMode) {
            this.enterEditMode()
        } else {
            this.exitEditMode()
        }
    }

    public enterEditMode(): void
    {
        if (!this.isLocal || this.isInEditMode) {
            return;
        }
        this.isInEditMode = true;
        this.containerElem.classList.add('edit-mode');
        this.editModeBackgroundElem = document.createElement('div');
        this.editModeBackgroundElem.classList.add('participant-badges-edit-mode-background');
        this.parentDisplay.appendChild(this.editModeBackgroundElem);
        this.editModeHintElem = document.createElement('div');
        this.editModeHintElem.classList.add('edit-mode-hint');
        this.editModeHintElem.innerText = this.app.translateText('Badges.editModeHint');
        this.containerElem.appendChild(this.editModeHintElem);
        this.editModeExitElem = this.app.uiHelper.makeWindowCloseButton(() => this.exitEditMode(), 'overlay');
        this.containerElem.appendChild(this.editModeExitElem);
        this.updateDisplay();
        if (this.debugLogEnabled) {
            log.info('BadgesController.enterEditMode: Entered edit mode.');
        }
    }

    public exitEditMode(): void
    {
        if (!this.isInEditMode) {
            return;
        }
        this.isInEditMode = false;
        this.containerElem.classList.remove('edit-mode');
        this.containerElem.removeChild(this.editModeHintElem);
        this.editModeHintElem = null;
        this.parentDisplay.removeChild(this.editModeBackgroundElem);
        this.editModeBackgroundElem = null;
        this.containerElem.removeChild(this.editModeExitElem);
        this.editModeExitElem = null;
        this.updateDisplay();
        if (this.debugLogEnabled) {
            log.info('BadgesController.exitEditMode: Exited edit mode.');
        }
    }

    public stop(): void
    {
        this.app.configUpdateListeners.removeListener(this.confiogUpdateHandler);
        this.itemHandling.stop()
        this.exitEditMode();
        for (const [badgeKey, badgeDisplay] of this.badges) {
            badgeDisplay.stop();
            this.badges.delete(badgeKey);
        }
        if (!is.nil(this.containerElem)) {
            this.parentDisplay.removeChild(this.containerElem);
            this.containerElem = null;
        }
        if (this.debugLogEnabled) {
            log.info('BadgesController.stop: Stopped.', this.debugLogEntityInfo);
        }
    }

    //--------------------------------------------------------------------------
    // Drag 'n drop related API

    public makeDraggedBadgeIcon(item: ItemProperties, iconDataUrl?: string): HTMLImageElement|null {
        if (!this.isValidBadge(item)) {
            return null;
        }
        const iconElem = document.createElement('img');
        iconElem.classList.add('badge-draggedElem', 'hidden');
        if (is.string(iconDataUrl)) {
            iconElem.setAttribute('src', iconDataUrl);
        } else {
            const iconUrl = ItemProperties.getBadgeIconUrl(item);
            this.app.fetchUrlAsDataUrl(iconUrl).then(iconDataUrl => {
                iconElem.setAttribute('src', iconDataUrl);
            });
        }
        this.app.getDisplay()?.append(iconElem);
        this.app.toFront(iconElem, ContentApp.LayerDrag);
        return iconElem;
    }

    public showDraggedBadgeIconInside(
        item: ItemProperties,
        eventData: PointerEventData,
        badgeIconElem?: HTMLImageElement,
        correctPointerOffset: boolean = false,
    ): void {
        if (is.nil(badgeIconElem)) {
            return;
        }
        const {iconWidth, iconHeight} = ItemProperties.getBadgeIconDimensions(item);
        const [iconWidthHalf, iconHeightHalf] = [iconWidth / 2, iconHeight / 2];
        let [centerClientX, centerClientY] = [eventData.clientX, eventData.clientY];
        if (correctPointerOffset) {
            centerClientX = centerClientX - eventData.startDomElementOffsetX + iconWidthHalf;
            centerClientY = centerClientY - eventData.startDomElementOffsetY + iconHeightHalf;
        }
        const {avatarX, avatarY} = this.translateClientToAvatarPos(centerClientX, centerClientY);
        const {avatarXClipped, avatarYClipped} = this.clipBadgeAvatarPos(avatarX, avatarY, iconWidth, iconHeight);
        const {clientX, clientY} = this.translateAvatarToClientPos(avatarXClipped, avatarYClipped);
        badgeIconElem.style.width = `${iconWidth}px`;
        badgeIconElem.style.height = `${iconHeight}px`;
        badgeIconElem.style.left = `${clientX - iconWidthHalf}px`;
        badgeIconElem.style.top = `${clientY - iconHeightHalf}px`;
        badgeIconElem.classList.remove('outside', 'hidden');
    }

    public showDraggedBadgeIconOutside(
        item: ItemProperties, eventData: PointerEventData, badgeIconElem?: HTMLImageElement
    ): void {
        if (is.nil(badgeIconElem)) {
            return;
        }
        badgeIconElem.style.left = `${eventData.clientX - eventData.startDomElementOffsetX}px`;
        badgeIconElem.style.top = `${eventData.clientY - eventData.startDomElementOffsetY}px`;
        badgeIconElem.classList.remove('hidden');
        badgeIconElem.classList.add('outside');
    }

    public hideDraggedBadgeIcon(badgeIconElem?: HTMLImageElement): void {
        badgeIconElem?.classList.add('hidden');
    }

    public disposeDraggedBadgeIcon(badgeIconElem?: HTMLImageElement): null {
        badgeIconElem?.remove();
        return null;
    }

    public isValidBadge(item: ItemProperties): boolean
    {
        return ItemProperties.getIsBadge(item);
    }

    public isValidEditModeBadgeDrop(eventData: PointerEventData, item: ItemProperties): boolean
    {
        if (!this.isInEditMode
        || !this.isValidBadge(item)
        || eventData.dropTarget !== this.containerElem) {
            return false;
        }
        const {avatarX, avatarY} = this.translateClientToAvatarPos(eventData.clientX, eventData.clientY);
        return this.isAvatarPosInside(avatarX, avatarY);
    }

    public onBadgeDropInside(
        eventData: PointerEventData, item: ItemProperties, correctPointerOffset: boolean = false,
    ): void {
        const badgeKey = this.makeBadgeKey(item);
        if (!this.badges.has(badgeKey) && !this.mayAddBadge(item)) {
            const toast = new SimpleToast(
                this.app, 'badges-TooManyBadges',
                Config.get('room.errorToastDurationSec', 8),
                'warning', 'BadgeNotEnabled', 'TooManyBadgesEnabled',
            );
            toast.show();
            if (this.debugLogEnabled) {
                const msg = 'BadgesController.onBadgeDropInside: Done with too much badges toast.';
                log.info(msg, {eventData, item});
            }
            return;
        }
        const {iconWidth, iconHeight} = ItemProperties.getBadgeIconDimensions(item);
        let [centerClientX, centerClientY] = [eventData.clientX, eventData.clientY];
        if (correctPointerOffset) {
            const [iconWidthHalf, iconHeightHalf] = [iconWidth / 2, iconHeight / 2];
            centerClientX = centerClientX - eventData.startDomElementOffsetX + iconWidthHalf;
            centerClientY = centerClientY - eventData.startDomElementOffsetY + iconHeightHalf;
        }
        const {avatarX, avatarY} = this.translateClientToAvatarPos(centerClientX, centerClientY);
        const {avatarXClipped, avatarYClipped} = this.clipBadgeAvatarPos(avatarX, avatarY, iconWidth, iconHeight);
        const itemNew = {...item};
        itemNew[Pid.BadgeIsActive] = 'true';
        itemNew[Pid.BadgeIconX] = String(avatarXClipped);
        itemNew[Pid.BadgeIconY] = String(avatarYClipped);
        this.addOrUpdateBadge(badgeKey, itemNew);
        this.itemHandling.updateBadgeOnServer(itemNew);
        if (this.debugLogEnabled) {
            const msg = 'BadgesController.onBadgeDropInside: Done with update.';
            log.info(msg, {eventData, item, itemNew});
        }
    }

    public onBadgeDropOutside(item: ItemProperties): void
    {
        this.removeBadge(this.makeBadgeKey(item));
        const itemNew = {...item};
        itemNew[Pid.BadgeIsActive] = '0';
        this.itemHandling.updateBadgeOnServer(itemNew);
        if (this.debugLogEnabled) {
            log.info('BadgesController.onBadgeDropOutside: Done.', {item, itemNew});
        }
    }

    //--------------------------------------------------------------------------
    // API for Badge

    public getBadgesContainer(): HTMLElement
    {
        return this.containerElem;
    }

    public translateBadgePos(
        avatarX: number, avatarY: number, width: number, height: number
    ): {inContainerTop: number, inContainerLeft: number} {
        // avatarX and avatarY are measured from avatar center bottom towards right top.
        const {avatarXClipped, avatarYClipped} = this.clipBadgeAvatarPos(avatarX, avatarY, width, height);

        // Offset coordinates to DOM top/left coordinates inside container div:
        const cDims = this.containerDimensions;
        const inContainerTop = cDims.avatarYTop - avatarYClipped;
        const inContainerLeft = avatarXClipped - cDims.avatarXLeft;

        return {inContainerTop, inContainerLeft}
    }

    public clipBadgeAvatarPos(
        avatarX: number, avatarY: number, width: number, height: number
    ): {avatarXClipped: number, avatarYClipped: number} {
        // Clips avatarX and avatarY to display baoundaries taking width and height of the badge into account:
        const {avatarYTop, avatarXRight, avatarYBottom, avatarXLeft} = this.containerDimensions;
        const [halfwidth, halfHeight] = [width / 2, height / 2];
        const [avatarYBottomM, avatarYTopM] = [avatarYBottom + halfHeight, avatarYTop - halfHeight];
        const [avatarXLeftM, avatarXRightM] = [avatarXLeft + halfwidth, avatarXRight - halfwidth];
        const avatarXClipped = Math.max(avatarXLeftM, Math.min(avatarXRightM, avatarX));
        const avatarYClipped = Math.max(avatarYBottomM, Math.min(avatarYTopM, avatarY));
        return {avatarXClipped, avatarYClipped};
    }

    public isAvatarPosInside(avatarX: number, avatarY: number): boolean
    {
        const {avatarYTop, avatarXRight, avatarYBottom, avatarXLeft} = this.containerDimensions;
        return avatarX >= avatarXLeft && avatarX <= avatarXRight
            && avatarY >= avatarYBottom && avatarY <= avatarYTop;
    }

    public translateClientToAvatarPos(clientX: number, clientY: number): {avatarX: number, avatarY: number}
    {
        const {avatarOriginClientX, avatarOriginClientY} = this.entity.getClientPos();
        const avatarX = clientX - avatarOriginClientX;
        const avatarY = avatarOriginClientY - clientY;
        return {avatarX, avatarY};
    }

    public translateAvatarToClientPos(avatarX: number, avatarY: number): {clientX: number, clientY: number}
    {
        const {avatarOriginClientX, avatarOriginClientY} = this.entity.getClientPos();
        const clientX = avatarX + avatarOriginClientX;
        const clientY = avatarOriginClientY - avatarY;
        return {clientX, clientY};
    }

    public onMouseEnterBadge(eventData: PointerEventData): void
    {
        if (!this.isInEditMode) {
            //this.entity.onMouseEnterAvatar(eventData);
        }
    }

    public onMouseLeaveBadge(eventData: PointerEventData): void
    {
        if (!this.isInEditMode) {
            //this.entity.onMouseLeaveAvatar(eventData);
        }
    }

    public onBadgePointerDown(eventData: PointerEventData): void
    {
        this.entity.select();
    }

    //--------------------------------------------------------------------------
    // Badge state updates

    private onConfigUpdated(): void
    {
        this.debugLogEnabled = Utils.logChannel('badges');
        const containerDimensions = {
            avatarYTop: as.Int(Config.get('badges.displayAvatarYTop'), 200),
            avatarXRight: as.Int(Config.get('badges.displayAvatarXRight'), 100),
            avatarYBottom: as.Int(Config.get('badges.displayAvatarYBottom'), 0),
            avatarXLeft: as.Int(Config.get('badges.displayAvatarXLeft'), -100),
        };
        if (is.nil(this.containerDimensions)
            || containerDimensions.avatarYTop !== this.containerDimensions.avatarYTop
            || containerDimensions.avatarXRight !== this.containerDimensions.avatarXRight
            || containerDimensions.avatarYBottom !== this.containerDimensions.avatarYBottom
            || containerDimensions.avatarXLeft !== this.containerDimensions.avatarXLeft
        ) {
            this.containerDimensions = containerDimensions;
            const inEditMode = this.isInEditMode;
            this.exitEditMode();
            this.updateDisplay();
            if (inEditMode) {
                this.enterEditMode();
            }
        }
        this.itemHandling.onConfigUpdated();
        if (this.debugLogEnabled) {
            const msg = 'BadgesController.onUserSettingsChanged: Update complete.';
            log.info(msg, {...this.debugLogEntityInfo, containerDimensions});
        }
    }

    public onPublicBadgesLimitChanged()
    {
        const publicBadges = this.getPublicBadges().toArray();
        const publicBadgesLimit = this.itemHandling.getPublicBadgesLimit();
        const badgesToRemove = publicBadges.length - publicBadgesLimit;
        if (badgesToRemove <= 0) {
            return;
        }
        this.exitEditMode();
        const badgeKeys = publicBadges.map(([key,badge]) => key);
        badgeKeys.sort(); // Makes behavior deterministic (always unattach lowest item IDs first.
        const badgeKeysToRemove = badgeKeys.slice(0, badgesToRemove);
        badgeKeysToRemove.forEach(badgeKey => this.removeBadge(badgeKey));
        if (this.debugLogEnabled) {
            const msg = `BadgesController.enforcePublicBadgesLimit: Removed ${badgesToRemove} badges.`;
            log.info(msg, {...this.debugLogEntityInfo, publicBadgesLimit, badgeKeysToRemove});
        }
    }

    public removeBadge(badgeKey: string): void
    {
        const badge = this.badges.get(badgeKey);
        if (is.nil(badge)) {
            return;
        }
        this.itemHandling.triggerSendPresence();
        badge.stop();
        this.badges.delete(badgeKey);
        if (this.debugLogEnabled) {
            const item = badge.getProperties();
            log.info('BadgesController.removeBadge: Done.', {...this.debugLogEntityInfo, item});
        }
    }

    public addOrUpdateBadge(badgeKey: string, item: ItemProperties): void
    {
        // Race-free update for already present badges with unchanged icon preventing display of old state for a frame:
        const badge = this.badges.get(badgeKey);
        if (!is.nil(badge)) {
            const itemOld = badge.getProperties();
            if (ItemProperties.getBadgeIconUrl(itemOld) === ItemProperties.getBadgeIconUrl(item)) {
                this.addOrUpdateBadgeWithKnownIconDataUrl(badgeKey, item, itemOld.iconDataUrl);
                return;
            }
        }

        // Regular asynchronous update delaying badge construction until icon data has been retrieved:
        const iconUrl = ItemProperties.getBadgeIconUrl(item);
        this.app.fetchUrlAsDataUrl(iconUrl).then(iconDataUrl => {
            if (!is.nil(this.containerElem)) {
                this.addOrUpdateBadgeWithKnownIconDataUrl(badgeKey, item, iconDataUrl);
            }
        });
        if (this.debugLogEnabled) {
            const msg = 'BadgesController.addOrUpdateBadge: Triggered iconDataUrl fetch.';
            log.info(msg, {...this.debugLogEntityInfo, item});
        }
    }

    private addOrUpdateBadgeWithKnownIconDataUrl(badgeKey: string, item: ItemProperties, iconDataUrl: string): void
    {
        this.itemHandling.triggerSendPresence();
        item.iconDataUrl = iconDataUrl;
        const badge = this.badges.get(badgeKey);
        if (!is.nil(badge)) {
            badge.onPropertiesLoaded(item);
            return;
        }
        if (this.mayAddBadge(item)) {
            const badgeDisplay = new Badge(this.app, this, item);
            this.badges.set(badgeKey, badgeDisplay);
            return;
        }
        if (this.debugLogEnabled) {
            const msg = 'BadgesController.addOrUpdateBadge: Disabling badge - limit reached.';
            log.info(msg, {...this.debugLogEntityInfo, item, badgesEnabledMax: this.itemHandling.getPublicBadgesLimit()});
        }
        const itemNew = {...item, [Pid.BadgeIsActive]: 'false'};
        this.itemHandling.updateBadgeOnServer(itemNew);
    }

    public makeBadgeKey(item: ItemProperties): string
    {
        return `${item[Pid.Id]}:${item[Pid.InventoryId]}:${item[Pid.Provider]}`;
    }

    private mayAddBadge(badgeProperties: ItemProperties): boolean
    {
        if (as.Bool(badgeProperties[Pid.BadgeIsPrivate])) {
            return true;
        }
        return this.getPublicBadges().count() < this.itemHandling.getPublicBadgesLimit();
    }

    public getPublicBadges(): Iter<[string,Badge]>
    {
        return iter(this.badges.entries()).filter(([key,badge]) => !as.Bool(badge.getProperties()[Pid.BadgeIsPrivate]));
    }

    //--------------------------------------------------------------------------
    // Display

    private updateDisplay(): void
    {
        if (is.nil(this.containerElem)) {
            this.containerElem = document.createElement('div');
            this.containerElem.classList.add('participant-badges');
            this.parentDisplay.appendChild(this.containerElem);
        }
        const {avatarYTop, avatarXRight, avatarYBottom, avatarXLeft} = this.containerDimensions;
        const [width, height] = [avatarXRight - avatarXLeft, avatarYTop - avatarYBottom];
        this.containerElem.style.bottom = `${avatarYBottom}px`;
        this.containerElem.style.left = `${avatarXLeft}px`;
        this.containerElem.style.width = `${width}px`;
        this.containerElem.style.height = `${height}px`;
        if (!is.nil(this.editModeBackgroundElem)) {
            this.editModeBackgroundElem.style.bottom = `${avatarYBottom}px`;
            this.editModeBackgroundElem.style.left = `${avatarXLeft}px`;
            this.editModeBackgroundElem.style.width = `${width}px`;
            this.editModeBackgroundElem.style.height = `${height}px`;
        }

        for (const badge of this.badges.values()) {
            badge.updateDisplay();
        }
    }
}

abstract class BadgesControllerItemHandling {
    protected readonly app: ContentApp;
    protected readonly badgesController: BadgesController;

    protected debugLogEnabled: boolean;
    protected publicBadgesLimitStatId: string;
    protected publicBadgesLimitBaseValue: number;
    protected publicBadgesLimit: number;

    public constructor(app: ContentApp, badgesController: BadgesController) {
        this.app = app;
        this.badgesController = badgesController;
    }

    public abstract start(): void;

    public abstract stop(): void;

    public getPublicBadgesLimit(): number {
        return this.publicBadgesLimit;
    }

    public abstract updateBadgesFromPresence(badgesStr: string): void;

    public abstract triggerSendPresence(): void;

    public abstract updateBadgeOnServer(item: Readonly<ItemProperties>): void;

    public abstract getBadgesStrForPresence(publicBadgeItems: Iter<Readonly<ItemProperties>>): string;

    public onConfigUpdated(): void {
        this.debugLogEnabled = Utils.logChannel('badges');
        this.publicBadgesLimitStatId = as.String(Config.get('badges.publicBadgesLimitStatId'));
        this.publicBadgesLimitBaseValue = as.Int(Config.get('badges.badgesEnabledMax'), 3);
        this.updatePublicBadgesLimit();
    }

    protected updatePublicBadgesLimit(): void {
        const publicBadgesLimit = this.calcPublicBadgesLimit();
        if (publicBadgesLimit !== this.publicBadgesLimit) {
            this.publicBadgesLimit = publicBadgesLimit;
            this.badgesController.onPublicBadgesLimitChanged();
        }
        if (this.debugLogEnabled) {
            const msg = 'BadgesControllerItemHandling.updatePublicBadgesLimit: Update complete.';
            log.info(msg, {publicBadgesLimit});
        }
    }

    protected abstract calcPublicBadgesLimit(): number;
}

class OwnParticipantBadgesControllerItemHandling extends BadgesControllerItemHandling {
    private readonly backPackUpdateListener: (data: BackpackUpdateEventData) => void;
    private readonly statBoostsUpdateListener: () => void;

    private sendPresenceTimerHandle: number = null;

    public constructor(app: ContentApp, badgesController: BadgesController) {
        super(app, badgesController);
        this.backPackUpdateListener = ({itemsDeleted, itemsNewOrChanged}) => this.onBackpackUpdate(itemsDeleted, itemsNewOrChanged);
        this.statBoostsUpdateListener = () => this.updatePublicBadgesLimit();
    }

    public start(): void {
        if (Utils.isBackpackEnabled()) {
            this.updateBadgesFromBackpack();
            this.app.ownItems.backpackUpdateListeners.addListener(this.backPackUpdateListener);
            this.app.ownItems.statBoostsUpdateListeners.addListener(this.statBoostsUpdateListener);
        }
    }

    public stop(): void {
        this.app.ownItems.statBoostsUpdateListeners.removeListener(this.statBoostsUpdateListener);
        this.app.ownItems.backpackUpdateListeners.removeListener(this.backPackUpdateListener);
        if (this.debugLogEnabled) {
            log.info('OwnParticipantBadgesControllerItemHandling.stop: Stopped.', {this: {...this}});
        }
    }

    public updateBadgesFromPresence(badgesStr: string): void {
        // Nothing to do for own participant.
    }

    public triggerSendPresence(): void {
        if (!is.nil(this.sendPresenceTimerHandle)) {
            return;
        }
        const sendPresenceDelayMs = 1e3 * as.Int(Config.get('badges.sendPresenceDelaySec'), 1);
        this.sendPresenceTimerHandle = window.setTimeout(() => {
            this.sendPresenceTimerHandle = null;
            this.app.getRoom()?.sendPresence();
            if (this.debugLogEnabled) {
                log.info('OwnParticipantBadgesControllerItemHandling.triggerSendPresence: Sending own presence.');
            }
        }, sendPresenceDelayMs);
    }

    public updateBadgeOnServer(item: Readonly<ItemProperties>): void {
        const itemId = item[Pid.Id];
        const action = 'Badge.SetState';
        const args = {
            'IsActive': item[Pid.BadgeIsActive],
            'IconX': item[Pid.BadgeIconX],
            'IconY': item[Pid.BadgeIconY],
        };
        BackgroundMessage.executeBackpackItemAction(itemId, action, args, [itemId]).catch(error => {
            const msg = 'OwnParticipantBadgesControllerItemHandling.updateBadgeOnServer: executeBackpackItemAction failed!';
            this.app.onError(new ErrorWithData(msg, {item, action, error}));
            this.updateBadgesFromBackpack();
        });
        if (this.debugLogEnabled) {
            const msg = 'OwnParticipantBadgesControllerItemHandling.updateBadgeOnServer: executeBackpackItemAction message sent.';
            log.info(msg, {itemId, action, args});
        }
    }

    public getBadgesStrForPresence(publicBadgeItems: Iter<Readonly<ItemProperties>>): string {
        if (!is.nil(this.sendPresenceTimerHandle)) {
            window.clearTimeout(this.sendPresenceTimerHandle);
            this.sendPresenceTimerHandle = null;
        }
        const itemsToSend: Iter<Readonly<ItemProperties>> = publicBadgeItems
            .concat(this.app.ownItems.getStatBoostItemsByStat(this.publicBadgesLimitStatId))
        const itemStrs: string[] = [];
        let lastProviderId: string|null = null;
        let lastInventoryId: string|null = null;
        for (const properties of itemsToSend) {
            const provider = ItemProperties.getProviderId(properties);
            const inventoryId = ItemProperties.getInventoryId(properties);
            const itemId = ItemProperties.getId(properties);
            const version = as.String(ItemProperties.getVersion(properties));
            const ids: string[] = [];
            if (provider !== lastProviderId) {
                ids.push(provider, inventoryId);
            } else if (inventoryId !== lastInventoryId) {
                ids.push(inventoryId);
            }
            ids.push(itemId, version);
            itemStrs.push(ids.join(':'));
            [lastProviderId, lastInventoryId] = [provider, inventoryId];
        }
        const badgesStr = itemStrs.join(' ');
        return badgesStr;
    }

    private updateBadgesFromBackpack(): void {
        this.onBackpackUpdate([], [...this.app.ownItems.getAllItems().values()]);
    }

    private onBackpackUpdate(itemsHide: ReadonlyArray<ItemProperties>, itemsShowOrSet: ReadonlyArray<ItemProperties>): void {
        if (this.debugLogEnabled) {
            log.info('OwnParticipantBadgesControllerItemHandling.onBackpackUpdate', { itemsShowOrSet, itemsHide });
        }
        this.updatePublicBadgesLimit();
        itemsHide.forEach(item => this.badgesController.removeBadge(this.badgesController.makeBadgeKey(item)));
        for (const item of itemsShowOrSet) {
            const badgeKey = this.badgesController.makeBadgeKey(item);
            if (as.Bool(item[Pid.BadgeIsActive])) {
                this.badgesController.addOrUpdateBadge(badgeKey, item);
            } else {
                this.badgesController.removeBadge(badgeKey);
            }
        }
    }

    protected calcPublicBadgesLimit(): number {
        return this.app.ownItems.applyItemStatBoosts(this.publicBadgesLimitStatId, this.publicBadgesLimitBaseValue);
    }
}

class OtherParticipantBadgesControllerItemHandling extends BadgesControllerItemHandling {

    private readonly statBoosts: ItemStatBoostsRepository = new ItemStatBoostsRepository();

    public constructor(app: ContentApp, badgesController: BadgesController) {
        super(app, badgesController);
    }

    public start(): void {
        // Nothing to do.
    }

    public stop(): void {
        if (this.debugLogEnabled) {
            log.info('OtherParticipantBadgesControllerItemHandling.stop: Stopped.', {this: {...this}});
        }
    }

    public updateBadgesFromPresence(badgesStr: string): void {
        const sparseItems = this.parseBadgesStrFromPresence(badgesStr);
        BackgroundMessage.getItemsByInventoryItemIds(sparseItems)
            .then(items => {
                this.updateBadgesFromFullItems(items);
                if (this.debugLogEnabled) {
                    log.info('OtherParticipantBadgesControllerItemHandling.updateBadgesFromPresence: Done.', {badgesStr, sparseItems, items});
                }
            }).catch(error => {
                const msg = 'OtherParticipantBadgesControllerItemHandling.updateBadgesFromPresence: BackgroundMessage.getItemsByInventoryItemIds failed!';
                this.app.onError(new ErrorWithData(msg, {error, badgesStr, sparseItems}));
            });
    }

    private updateBadgesFromFullItems(items: ReadonlyArray<Readonly<ItemProperties>>): void
    {
        this.statBoosts.removeAllStatBoosts();
        this.statBoosts.ProcessItemsUpdate([], items);
        this.updatePublicBadgesLimit();

        // Remove before add or update to avoid limit check false positives:
        const badgeKeysToRemove = new Set<string>(this.badgesController.getPublicBadges().map(([key, badge]) => key));
        const badgesToAddOrUpdate: {badgeKey: string, item: ItemProperties}[] = [];
        items.forEach(item => {
            const badgeKey = this.badgesController.makeBadgeKey(item);
            if (!as.Bool(item[Pid.BadgeIsPrivate]) && as.Bool(item[Pid.BadgeIsActive])) {
                badgeKeysToRemove.delete(badgeKey);
                badgesToAddOrUpdate.push({badgeKey, item});
            } else {
                badgeKeysToRemove.add(badgeKey);
            }
        });
        badgeKeysToRemove.forEach(badgeKey => this.badgesController.removeBadge(badgeKey));
        badgesToAddOrUpdate.forEach(({badgeKey, item}) => this.badgesController.addOrUpdateBadge(badgeKey, item));
    }

    private parseBadgesStrFromPresence(badgesStr: string): ItemProperties[] {
        const badges: ItemProperties[] = [];
        if (badgesStr.length === 0) {
            return badges;
        }
        let lastProviderId: string|null = null;
        let lastInventoryId: string|null = null;
        for (const badgeStr of badgesStr.split(' ')) {
            const badgeParts = badgeStr.split(':');
            if (badgeParts.length > 4) {
                const msg = `OtherParticipantBadgesControllerItemHandling.parseBadgesStrFromPresence: Badge identifier has more than four parts!`;
                this.app.onError(new ErrorWithData(msg, {badgeStr, badgesStr}));
                continue;
            }
            if (badgeParts.length < 2) {
                const msg = `OtherParticipantBadgesControllerItemHandling.parseBadgesStrFromPresence: Badge identifier has less than two parts!`;
                this.app.onError(new ErrorWithData(msg, {badgeStr, badgesStr}));
                continue;
            }
            let l = badgeParts.length;
            const providerId: string|null = badgeParts[l - 4] ?? lastProviderId;
            const inventoryId: string|null = badgeParts[l - 3] ?? lastInventoryId;
            const itemId = badgeParts[l - 2];
            const version = badgeParts[l - 1];
            if (is.nil(inventoryId) || is.nil(providerId)) {
                const msg = `OtherParticipantBadgesControllerItemHandling.parseBadgesStrFromPresence: First badge identifier has less than four parts!`;
                this.app.onError(new ErrorWithData(msg, {badgeStr, badgesStr}));
                break;
            }
            badges.push({
                [Pid.Provider]: providerId,
                [Pid.InventoryId]: inventoryId,
                [Pid.Id]: itemId,
                [Pid.Version]: version,
            });
            [lastProviderId, lastInventoryId] = [providerId, inventoryId];
        }
        if (this.debugLogEnabled) {
            log.info('OtherParticipantBadgesControllerItemHandling.parseBadgesStrFromPresence: Done.', {badgesStr, badges});
        }
        return badges;
    }

    public triggerSendPresence(): void {
        // Presences not send for other participant.
    }

    public updateBadgeOnServer(item: Readonly<ItemProperties>): void {
        // Nothing to do for other participant's badges.
    }

    public getBadgesStrForPresence(publicBadgeItems: Iter<Readonly<ItemProperties>>): string {
        return '' // Presences not send for other participant.
    }

    protected calcPublicBadgesLimit(): number {
        return this.statBoosts.applyStatBoosts(this.publicBadgesLimitStatId, this.publicBadgesLimitBaseValue);
    }
}
