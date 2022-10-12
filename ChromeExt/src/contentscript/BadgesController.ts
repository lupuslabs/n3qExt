import log = require('loglevel');
import { is } from '../lib/is';
import { as } from '../lib/as';
import { ItemProperties, Pid } from '../lib/ItemProperties';
import { ContentApp } from './ContentApp';
import { Entity } from './Entity';
import { ErrorWithData, Utils } from '../lib/Utils';
import { Config } from '../lib/Config';
import { Badge } from './Badge';
import { BackgroundMessage } from '../lib/BackgroundMessage';
import { DomOpacityAwarePointerEventDispatcher } from '../lib/DomOpacityAwarePointerEventDispatcher';
import { DomModifierKeyId, PointerEventData, PointerEventType } from '../lib/PointerEventData';
import { DomButtonId } from '../lib/domTools';
import { SimpleToast } from './Toast';

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

    private readonly app: ContentApp;
    private readonly entity: Entity;
    private readonly parentDisplay: HTMLElement;
    private readonly isLocal: boolean;

    private debugLogEnabled: boolean;
    private badgesEnabledMax: number;
    private badges: Map<string,Badge> = new Map();
    private containerDimensions: {avatarYTop: number, avatarXRight: number, avatarYBottom: number, avatarXLeft: number};
    private containerElem: HTMLElement;
    private editModeBackgroundElem?: HTMLElement;
    private editModeHintElem?: HTMLElement;
    private editModeExitElem?: HTMLElement = null;
    private isInEditMode: boolean = false;

    constructor(app: ContentApp, entity: Entity, parentDisplay: HTMLElement)
    {
        this.app = app;
        this.entity = entity;
        this.parentDisplay = parentDisplay;
        this.isLocal = entity.getIsSelf();

        this.onUserSettingsChanged();
        if (this.isLocal && Utils.isBackpackEnabled()) {
            this.updateBadgesFromBackpack();
        }
        if (this.debugLogEnabled) {
            log.info('BadgesDisplay.constructor: Construction complete.', {this: {...this}});
        }
    }

    //--------------------------------------------------------------------------
    // API for ContentApp

    public onBackpackShowItem(itemProperties: ItemProperties): void
    {
        if (this.debugLogEnabled) {
            log.info('BadgesDisplay.onBackpackShowItem', {itemProperties});
        }
        this.updateBadgeFromFullItem(this.makeBadgeKey(itemProperties), itemProperties);
    }

    public onBackpackSetItem(itemProperties: ItemProperties): void
    {
        if (this.debugLogEnabled) {
            log.info('BadgesDisplay.onBackpackSetItem', {itemProperties});
        }
        this.updateBadgeFromFullItem(this.makeBadgeKey(itemProperties), itemProperties);
    }

    public onBackpackHideItem(itemProperties: ItemProperties): void
    {
        if (this.debugLogEnabled) {
            log.info('BadgesDisplay.onBackpackHideItem', {itemProperties});
        }
        this.removeBadge(this.makeBadgeKey(itemProperties), itemProperties);
    }

    //--------------------------------------------------------------------------
    // API for Entity and the avatar menu

    public onUserSettingsChanged(): void
    {
        this.debugLogEnabled = Utils.logChannel('badges');
        this.badgesEnabledMax = as.Int(Config.get('badges.badgesEnabledMax'), 3);
        this.containerDimensions = {
            avatarYTop: as.Int(Config.get('badges.displayAvatarYTop'), 200),
            avatarXRight: as.Int(Config.get('badges.displayAvatarXRight'), 100),
            avatarYBottom: as.Int(Config.get('badges.displayAvatarYBottom'), 0),
            avatarXLeft: as.Int(Config.get('badges.displayAvatarXLeft'), -100),
        };
        this.exitEditMode();
        this.updateDisplay();
        if (this.debugLogEnabled) {
            log.info('BadgesDisplay.onUserSettingsChanged: Update complete.', {this: {...this}});
        }
    }

    public updateBadgesFromPresence(badgesStr: string): void
    {
        if (this.isLocal) {
            return; // Own badges are updated by onBackpack*Item methods.
        }
        const sparseItems = this.parseBadgesStrFromPresence(badgesStr);
        BackgroundMessage.getItemsByInventoryItemIds(sparseItems)
        .then(items => items.forEach(item => this.updateBadgeFromFullItem(this.makeBadgeKey(item), item)));
        if (this.debugLogEnabled) {
            log.info('BadgesDisplay.updateBadgesFromPresence: Done.', {badgesStr, sparseItems});
        }
    }

    public getBadgesStrForPresence(): string
    {
        const badgeStrs: string[] = [];
        let lastProviderId: string|null = null;
        let lastInventoryId: string|null = null;
        for (const badgeDisplay of this.badges.values()) {
            const {Provider, InventoryId, Id, Version} = badgeDisplay.getProperties();
            const ids: string[] = [];
            if (Provider !== lastProviderId) {
                ids.push(Provider);
            }
            if (InventoryId !== lastInventoryId) {
                ids.push(InventoryId);
            }
            ids.push(Id);
            ids.push(Version);
            badgeStrs.push(ids.join(':'));
            [lastProviderId, lastInventoryId] = [Provider, InventoryId];
        }
        return badgeStrs.join(' ');
    }

    public getIsInEditMode(): boolean
    {
        return this.isInEditMode;
    }

    public enterEditMode(): void
    {
        if (this.isInEditMode) {
            return;
        }
        this.isInEditMode = true;
        this.containerElem.classList.add('n3q-badgesEditMode');
        this.editModeBackgroundElem = document.createElement('div');
        this.editModeBackgroundElem.classList.add('n3q-base', 'n3q-badgesEditModeBackground');
        this.parentDisplay.appendChild(this.editModeBackgroundElem);
        this.editModeHintElem = document.createElement('div');
        this.editModeHintElem.classList.add('n3q-base', 'n3q-badgesEditModeHint');
        this.editModeHintElem.innerText = this.app.translateText('Badges.editModeHint');
        this.containerElem.appendChild(this.editModeHintElem);
        this.showEditModeExitButton();
        for (const badgeDisplay of this.badges.values()) {
            badgeDisplay.onEnterEditMode();
        }
        this.updateDisplay();
        if (this.debugLogEnabled) {
            log.info('BadgesDisplay.enterEditMode: Entered edit mode.', {this: {...this}});
        }
    }

    public exitEditMode(): void
    {
        if (!this.isInEditMode) {
            return;
        }
        this.isInEditMode = false;
        this.containerElem.classList.remove('n3q-badgesEditMode');
        this.containerElem.removeChild(this.editModeHintElem);
        this.editModeHintElem = null;
        this.parentDisplay.removeChild(this.editModeBackgroundElem);
        this.editModeBackgroundElem = null;
        this.containerElem.removeChild(this.editModeExitElem);
        this.editModeExitElem = null;
        for (const badgeDisplay of this.badges.values()) {
            badgeDisplay.onExitEditMode();
        }
        if (this.debugLogEnabled) {
            log.info('BadgesDisplay.exitEditMode: Exited edit mode.', {this: {...this}});
        }
    }

    public stop(): void
    {
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
            log.info('BadgesDisplay.stop: Stopped.', {this: {...this}});
        }
    }

    //--------------------------------------------------------------------------
    // Drag 'n drop related API

    public makeDraggedBadgeIcon(itemProperties: ItemProperties, iconDataUrl?: string): HTMLImageElement|null {
        if (!ItemProperties.getIsBadge(itemProperties)) {
            return null;
        }
        const iconElem = document.createElement('img');
        iconElem.classList.add('n3q-base', 'n3q-badge-draggedElem', 'n3q-hidden');
        if (is.string(iconDataUrl)) {
            iconElem.setAttribute('src', iconDataUrl);
        } else {
            const iconUrl = ItemProperties.getBadgeIconUrl(itemProperties);
            this.app.fetchUrlAsDataUrl(iconUrl).then(iconDataUrl => {
                iconElem.setAttribute('src', iconDataUrl);
            });
        }
        this.app.getDisplay()?.append(iconElem);
        this.app.toFront(iconElem, ContentApp.LayerDrag);
        return iconElem;
    }

    public showDraggedBadgeIconInside(
        itemProperties: ItemProperties,
        eventData: PointerEventData,
        badgeIconElem?: HTMLImageElement,
        correctPointerOffset: boolean = false,
    ): void {
        if (is.nil(badgeIconElem)) {
            return;
        }
        const {iconWidth, iconHeight} = ItemProperties.getBadgeIconDimensions(itemProperties);
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
        badgeIconElem.classList.remove('n3q-outside', 'n3q-hidden');
    }

    public showDraggedBadgeIconOutside(
        itemProperties: ItemProperties, eventData: PointerEventData, badgeIconElem?: HTMLImageElement
    ): void {
        if (is.nil(badgeIconElem)) {
            return;
        }
        badgeIconElem.style.left = `${eventData.clientX - eventData.startDomElementOffsetX}px`;
        badgeIconElem.style.top = `${eventData.clientY - eventData.startDomElementOffsetY}px`;
        badgeIconElem.classList.remove('n3q-hidden');
        badgeIconElem.classList.add('n3q-outside');
    }

    public hideDraggedBadgeIcon(badgeIconElem?: HTMLImageElement): void {
        badgeIconElem?.classList.add('n3q-hidden');
    }

    public disposeDraggedBadgeIcon(badgeIconElem?: HTMLImageElement): null {
        badgeIconElem?.parentElement?.removeChild(badgeIconElem);
        return null;
    }

    public isValidEditModeBadgeDrop(eventData: PointerEventData, itemProperties: ItemProperties): boolean
    {
        if (!this.isInEditMode
        || !ItemProperties.getIsBadge(itemProperties)
        || eventData.dropTarget instanceof HTMLElement && eventData.dropTarget !== this.containerElem) {
            return false;
        }
        const {avatarX, avatarY} = this.translateClientToAvatarPos(eventData.clientX, eventData.clientY);
        return this.isAvatarPosInside(avatarX, avatarY);
    }

    public onBadgeDropInside(
        eventData: PointerEventData, itemProperties: ItemProperties, correctPointerOffset: boolean = false,
    ): void {
        const badgeKey = this.makeBadgeKey(itemProperties);
        if (this.badges.size >= this.badgesEnabledMax && !this.badges.has(badgeKey)) {
            const toast = new SimpleToast(
                this.app, 'badges-TooMuchBadges',
                Config.get('room.errorToastDurationSec', 8),
                'warning', 'BadgeNotEnabled', 'TooMuchBadgesEnabled',
            );
            toast.show();
            if (this.debugLogEnabled) {
                const msg = 'BadgesDisplay.onBadgeDropInside: Done with too much badges toast.';
                log.info(msg, {eventData, itemProperties});
            }
            return;
        }
        const {iconWidth, iconHeight} = ItemProperties.getBadgeIconDimensions(itemProperties);
        let [centerClientX, centerClientY] = [eventData.clientX, eventData.clientY];
        if (correctPointerOffset) {
            const [iconWidthHalf, iconHeightHalf] = [iconWidth / 2, iconHeight / 2];
            centerClientX = centerClientX - eventData.startDomElementOffsetX + iconWidthHalf;
            centerClientY = centerClientY - eventData.startDomElementOffsetY + iconHeightHalf;
        }
        const {avatarX, avatarY} = this.translateClientToAvatarPos(centerClientX, centerClientY);
        const {avatarXClipped, avatarYClipped} = this.clipBadgeAvatarPos(avatarX, avatarY, iconWidth, iconHeight);
        const itemPropertiesNew = {...itemProperties};
        itemPropertiesNew[Pid.BadgeIsActive] = 'true';
        itemPropertiesNew[Pid.BadgeIconX] = String(avatarXClipped);
        itemPropertiesNew[Pid.BadgeIconY] = String(avatarYClipped);
        this.updateBadgeFromFullItem(badgeKey, itemPropertiesNew);
        this.updateBadgeOnServer(itemPropertiesNew);
        if (this.debugLogEnabled) {
            const msg = 'BadgesDisplay.onBadgeDropInside: Done with update.';
            log.info(msg, {eventData, itemProperties, itemPropertiesNew});
        }
    }

    public onBadgeDropOutside(itemProperties: ItemProperties): void
    {
        this.removeBadge(this.makeBadgeKey(itemProperties), itemProperties);
        const itemPropertiesNew = {...itemProperties};
        itemPropertiesNew[Pid.BadgeIsActive] = '0';
        this.updateBadgeOnServer(itemPropertiesNew);
        if (this.debugLogEnabled) {
            log.info('BadgesDisplay.onBadgeDropOutside: Done.', {itemProperties, itemPropertiesNew});
        }
    }

    //--------------------------------------------------------------------------
    // API for BadgeDisplay

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

    public translateClientToAvatarPos(clientX: number, clientY: number): {avatarX: number, avatarY: number} {
        const avatarOriginClientX = this.entity.getPosition();
        const avatarOriginClientY = document.documentElement.clientHeight;
        const avatarX = clientX - avatarOriginClientX;
        const avatarY = avatarOriginClientY - clientY;
        return {avatarX, avatarY};
    }

    public translateAvatarToClientPos(avatarX: number, avatarY: number): {clientX: number, clientY: number} {
        const avatarOriginClientX = this.entity.getPosition();
        const avatarOriginClientY = document.documentElement.clientHeight;
        const clientX = avatarX + avatarOriginClientX;
        const clientY = avatarOriginClientY - avatarY;
        return {clientX, clientY};
    }

    public onMouseEnterBadge(eventData: PointerEventData): void
    {
        if (!this.isInEditMode) {
            this.entity.onMouseEnterAvatar(eventData);
        }
    }

    public onMouseLeaveBadge(eventData: PointerEventData): void
    {
        if (!this.isInEditMode) {
            this.entity.onMouseLeaveAvatar(eventData);
        }
    }

    public onBadgePointerDown(eventData: PointerEventData): void
    {
        this.entity.select();
    }

    //--------------------------------------------------------------------------
    // Badge state updates

    private updateBadgeOnServer(itemProperties: ItemProperties): void
    {
        const itemId = itemProperties[Pid.Id];
        const action = 'Badge.SetState';
        const args = {
            'IsActive': itemProperties[Pid.BadgeIsActive],
            'IconX': itemProperties[Pid.BadgeIconX],
            'IconY': itemProperties[Pid.BadgeIconY],
        };
        BackgroundMessage.executeBackpackItemAction(itemId, action, args, [itemId]).catch(error => {
            const msg = 'BadgesDisplay.updateBadgeOnServer: executeBackpackItemAction failed!';
            this.app.onError(new ErrorWithData(msg, {itemProperties, action, error}));
            this.updateBadgesFromBackpack();
        });
        if (this.debugLogEnabled) {
            log.info('BadgesDisplay.updateBadgeOnServer: executeBackpackItemAction message sent.', {itemId, action, args});
        }
    }

    private updateBadgesFromBackpack(): void
    {
        BackgroundMessage.getBackpackState().then(response => {
            if (!response?.ok) {
                throw new ErrorWithData('BackgroundMessage.getBackpackState failed!', {response});
            }
            Object.values<ItemProperties>(response.items)
            .forEach(item => this.updateBadgeFromFullItem(this.makeBadgeKey(item), item));
            if (this.debugLogEnabled) {
                log.info('BadgesDisplay.updateBadgesFromBackpack: Update complete.', {this: {...this}});
            }
        }).catch(error => {
            const msg = 'BadgesDisplay.updateBadgesFromBackpack: Update failed!';
            this.app.onError(new ErrorWithData(msg, {error}));
        });
    }

    private removeBadge(badgeKey: string, itemProperties: ItemProperties): void
    {
        this.badges.get(badgeKey)?.stop();
        this.badges.delete(badgeKey);
        if (this.debugLogEnabled) {
            log.info('BadgesDisplay.removeBadge: Done.', {itemProperties, this: {...this}});
        }
    }

    private updateBadgeFromFullItem(badgeKey: string, itemProperties: ItemProperties): void
    {
        const isEnabledBadge = as.Bool(itemProperties[Pid.BadgeIsActive]);
        if (isEnabledBadge) {
            const iconUrl = ItemProperties.getBadgeIconUrl(itemProperties);
            this.app.fetchUrlAsDataUrl(iconUrl).then(iconDataUrl => {
                const badge = this.badges.get(badgeKey);
                if (is.nil(badge)) {
                    if (this.badges.size >= this.badgesEnabledMax) {
                        if (this.debugLogEnabled) {
                            const msg = 'BadgesDisplay.updateBadgeFromFullItem: Disabling badge - limit reached.';
                            log.info(msg, {itemProperties, badgesEnabledMax: this.badgesEnabledMax});
                        }
                        const itemPropertiesNew = {...itemProperties, [Pid.BadgeIsActive]: 'false'};
                        this.updateBadgeOnServer(itemPropertiesNew);
                    } else {
                        const badgeDisplay = new Badge(this.app, this, itemProperties, iconDataUrl);
                        this.badges.set(badgeKey, badgeDisplay);
                    }
                } else {
                    badge.onPropertiesLoaded(itemProperties, iconDataUrl);
                }
            });
        } else {
            this.removeBadge(badgeKey, itemProperties);
        }
    }

    private parseBadgesStrFromPresence(badgesStr: string): ItemProperties[]
    {
        const badges: ItemProperties[] = [];
        if (badgesStr.length === 0) {
            return badges;
        }
        let lastProviderId: string|null = null;
        let lastInventoryId: string|null = null;
        for (const badgeStr of badgesStr.split(' ')) {
            const badgeParts = badgeStr.split(':');
            if (badgeParts.length > 4) {
                const msg = `BadgesDisplay.parseBadgesStrFromPresence: Badge identifier has more than four parts!`;
                this.app.onError(new ErrorWithData(msg, {badgeStr, badgesStr}));
                continue;
            }
            if (badgeParts.length < 2) {
                const msg = `BadgesDisplay.parseBadgesStrFromPresence: Badge identifier has less than two parts!`;
                this.app.onError(new ErrorWithData(msg, {badgeStr, badgesStr}));
                continue;
            }
            let l = badgeParts.length;
            const providerId: string|null = badgeParts[l - 4] ?? lastProviderId;
            const inventoryId: string|null = badgeParts[l - 3] ?? lastInventoryId;
            const itemId = badgeParts[l - 2];
            const version = badgeParts[l - 1];
            if (is.nil(inventoryId) || is.nil(providerId)) {
                const msg = `BadgesDisplay.parseBadgesStrFromPresence: First badge identifier has less than four parts!`;
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
            log.info('BadgesDisplay.parseBadgesStrFromPresence: Done.', {badgesStr, badges});
        }
        return badges;
    }

    private makeBadgeKey(item: ItemProperties): string
    {
        return `${item[Pid.Id]}:${item[Pid.InventoryId]}:${item[Pid.Provider]}`;
    }

    //--------------------------------------------------------------------------
    // Display

    private updateDisplay(): void
    {
        if (is.nil(this.containerElem)) {
            this.containerElem = document.createElement('div');
            this.containerElem.classList.add('n3q-base', 'n3q-badges');
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

    private showEditModeExitButton(): void
    {
        this.editModeExitElem = document.createElement('div');
        this.editModeExitElem.classList.add('n3q-base', 'n3q-overlay-button', 'n3q-shadow-small');
        this.editModeExitElem.setAttribute('title', 'Close');
        this.editModeExitElem.setAttribute('data-translate', 'attr:title:Common');
        const eventdispatcher = new DomOpacityAwarePointerEventDispatcher(this.app, this.editModeExitElem);
        eventdispatcher.setEventListener(PointerEventType.click, eventData => {
            if (eventData.buttons === DomButtonId.first && eventData.modifierKeys === DomModifierKeyId.none) {
                this.exitEditMode();
            }
        });
        const btnIcon = document.createElement('div');
        btnIcon.classList.add('n3q-base', 'n3q-button-symbol', 'n3q-button-close-small');
        this.editModeExitElem.appendChild(btnIcon);
        this.containerElem.appendChild(this.editModeExitElem);
    }

}
