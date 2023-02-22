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
import { PointerEventData } from '../lib/PointerEventData';
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
    //
    // Local badges are initialized from backpack once and then kept up to date by onBackpack*Item methods.
    // Other's badges are initialized and updated by updateBadgesFromPresence.

    private readonly app: ContentApp;
    private readonly entity: Entity;
    private readonly parentDisplay: HTMLElement;
    private readonly isLocal: boolean;

    private debugLogEnabled: boolean;
    private badgesEnabledMax: number;
    private badges: Map<string,Badge> = new Map();
    private sendPresenceDelaySec: number;
    private sendPresenceTimerHandle: number = null;
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

    public onBackpackShowItem(item: ItemProperties): void
    {
        if (this.debugLogEnabled) {
            log.info('BadgesDisplay.onBackpackShowItem', {item});
        }
        if (this.isLocal) {
            this.updateBadgeFromFullItem(this.makeBadgeKey(item), item);
        }
    }

    public onBackpackSetItem(item: ItemProperties): void
    {
        if (this.debugLogEnabled) {
            log.info('BadgesDisplay.onBackpackSetItem', {item});
        }
        if (this.isLocal) {
            this.updateBadgeFromFullItem(this.makeBadgeKey(item), item);
        }
    }

    public onBackpackHideItem(item: ItemProperties): void
    {
        if (this.debugLogEnabled) {
            log.info('BadgesDisplay.onBackpackHideItem', {item});
        }
        if (this.isLocal) {
            this.removeBadge(this.makeBadgeKey(item));
        }
    }

    //--------------------------------------------------------------------------
    // API for Entity and the avatar menu

    public onUserSettingsChanged(): void
    {
        this.debugLogEnabled = Utils.logChannel('badges');
        this.badgesEnabledMax = as.Int(Config.get('badges.badgesEnabledMax'), 3);
        this.sendPresenceDelaySec = as.Int(Config.get('badges.sendPresenceDelaySec'), 1);
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
        .then(items => {
            this.updateBadgesFromFullItems(items);
            if (this.debugLogEnabled) {
                log.info('BadgesDisplay.updateBadgesFromPresence: Done.', {badgesStr, sparseItems, items});
            }
        }).catch(error => {
            const msg = 'BadgesDisplay.updateBadgesFromPresence: BackgroundMessage.getItemsByInventoryItemIds failed!';
            this.app.onError(new ErrorWithData(msg, {error, badgesStr, sparseItems}));
        }) ;
    }

    public getBadgesStrForPresence(): string
    {
        if (!is.nil(this.sendPresenceTimerHandle)) {
            window.clearTimeout(this.sendPresenceTimerHandle);
            this.sendPresenceTimerHandle = null;
        }
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
        const badgeStr = badgeStrs.join(' ');
        return badgeStr;
    }

    public getIsInEditMode(): boolean
    {
        return this.isInEditMode;
    }

    public enterEditMode(): void
    {
        if (!this.isLocal || this.isInEditMode) {
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
        this.editModeExitElem = this.app.makeWindowCloseButton(() => this.exitEditMode(), 'overlay');
        this.containerElem.appendChild(this.editModeExitElem);
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
        this.updateDisplay();
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

    public makeDraggedBadgeIcon(item: ItemProperties, iconDataUrl?: string): HTMLImageElement|null {
        if (!ItemProperties.getIsBadge(item)) {
            return null;
        }
        const iconElem = document.createElement('img');
        iconElem.classList.add('n3q-base', 'n3q-badge-draggedElem', 'n3q-hidden');
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
        badgeIconElem.classList.remove('n3q-outside', 'n3q-hidden');
    }

    public showDraggedBadgeIconOutside(
        item: ItemProperties, eventData: PointerEventData, badgeIconElem?: HTMLImageElement
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
        badgeIconElem?.remove();
        return null;
    }

    public isValidEditModeBadgeDrop(eventData: PointerEventData, item: ItemProperties): boolean
    {
        if (!this.isInEditMode
        || !ItemProperties.getIsBadge(item)
        || eventData.dropTarget instanceof HTMLElement && eventData.dropTarget !== this.containerElem) {
            return false;
        }
        const {avatarX, avatarY} = this.translateClientToAvatarPos(eventData.clientX, eventData.clientY);
        return this.isAvatarPosInside(avatarX, avatarY);
    }

    public onBadgeDropInside(
        eventData: PointerEventData, item: ItemProperties, correctPointerOffset: boolean = false,
    ): void {
        const badgeKey = this.makeBadgeKey(item);
        if (this.badges.size >= this.badgesEnabledMax && !this.badges.has(badgeKey)) {
            const toast = new SimpleToast(
                this.app, 'badges-TooMuchBadges',
                Config.get('room.errorToastDurationSec', 8),
                'warning', 'BadgeNotEnabled', 'TooMuchBadgesEnabled',
            );
            toast.show();
            if (this.debugLogEnabled) {
                const msg = 'BadgesDisplay.onBadgeDropInside: Done with too much badges toast.';
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
        this.updateBadgeOnServer(itemNew);
        if (this.debugLogEnabled) {
            const msg = 'BadgesDisplay.onBadgeDropInside: Done with update.';
            log.info(msg, {eventData, item, itemNew});
        }
    }

    public onBadgeDropOutside(item: ItemProperties): void
    {
        this.removeBadge(this.makeBadgeKey(item));
        const itemNew = {...item};
        itemNew[Pid.BadgeIsActive] = '0';
        this.updateBadgeOnServer(itemNew);
        if (this.debugLogEnabled) {
            log.info('BadgesDisplay.onBadgeDropOutside: Done.', {item, itemNew});
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

    private updateBadgeOnServer(item: ItemProperties): void
    {
        const itemId = item[Pid.Id];
        const action = 'Badge.SetState';
        const args = {
            'IsActive': item[Pid.BadgeIsActive],
            'IconX': item[Pid.BadgeIconX],
            'IconY': item[Pid.BadgeIconY],
        };
        BackgroundMessage.executeBackpackItemAction(itemId, action, args, [itemId]).catch(error => {
            const msg = 'BadgesDisplay.updateBadgeOnServer: executeBackpackItemAction failed!';
            this.app.onError(new ErrorWithData(msg, {item, action, error}));
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
            this.updateBadgesFromFullItems(Object.values<ItemProperties>(response.items));
            if (this.debugLogEnabled) {
                log.info('BadgesDisplay.updateBadgesFromBackpack: Done.');
            }
        }).catch(error => {
            const msg = 'BadgesDisplay.updateBadgesFromBackpack: Update failed!';
            this.app.onError(new ErrorWithData(msg, {error}));
        });
    }

    private removeBadge(badgeKey: string): void
    {
        const badge = this.badges.get(badgeKey);
        if (is.nil(badge)) {
            return;
        }
        this.triggerSendPresence();
        badge.stop();
        this.badges.delete(badgeKey);
        if (this.debugLogEnabled) {
            const item = badge.getProperties();
            log.info('BadgesDisplay.removeBadge: Done.', {item, this: {...this}});
        }
    }

    private addOrUpdateBadge(badgeKey: string, item: ItemProperties): void
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
            const msg = 'BadgesDisplay.addOrUpdateBadge: Triggered iconDataUrl fetch.';
            log.info(msg, {item});
        }
    }

    private addOrUpdateBadgeWithKnownIconDataUrl(badgeKey: string, item: ItemProperties, iconDataUrl: string): void
    {
        this.triggerSendPresence();
        item.iconDataUrl = iconDataUrl;
        const badge = this.badges.get(badgeKey);
        if (is.nil(badge)) {
            if (this.badges.size >= this.badgesEnabledMax) {
                if (this.isLocal) {
                    if (this.debugLogEnabled) {
                        const msg = 'BadgesDisplay.addOrUpdateBadge: Disabling own badge - limit reached.';
                        log.info(msg, {item, badgesEnabledMax: this.badgesEnabledMax});
                    }
                    const itemNew = {...item, [Pid.BadgeIsActive]: 'false'};
                    this.updateBadgeOnServer(itemNew);
                } else {
                    if (this.debugLogEnabled) {
                        const msg = 'BadgesDisplay.addOrUpdateBadge: Ignored other\'s badge - limit reached.';
                        log.info(msg, {item, badgesEnabledMax: this.badgesEnabledMax});
                    }
                }
            } else {
                const badgeDisplay = new Badge(this.app, this, item);
                this.badges.set(badgeKey, badgeDisplay);
            }
        } else {
            badge.onPropertiesLoaded(item);
        }
    }

    private updateBadgeFromFullItem(badgeKey: string, item: ItemProperties): void
    {
        if (as.Bool(item[Pid.BadgeIsActive])) {
            this.addOrUpdateBadge(badgeKey, item);
        } else {
            this.removeBadge(badgeKey);
        }
    }

    private updateBadgesFromFullItems(items: ItemProperties[]): void
    {
        // Remove before add or update to avoid limit check false positives:
        const badgeKeysToRemove = new Set<string>(this.badges.keys());
        const badgesToAddOrUpdate: {badgeKey: string, item: ItemProperties}[] = [];
        items.forEach(item => {
            const badgeKey = this.makeBadgeKey(item);
            if (as.Bool(item[Pid.BadgeIsActive])) {
                badgeKeysToRemove.delete(badgeKey);
                badgesToAddOrUpdate.push({badgeKey, item});
            } else {
                badgeKeysToRemove.add(badgeKey);
            }
        });
        badgeKeysToRemove.forEach(badgeKey => this.removeBadge(badgeKey));
        badgesToAddOrUpdate.forEach(({badgeKey, item}) => this.addOrUpdateBadge(badgeKey, item));
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
    // Presence

    private triggerSendPresence(): void
    {
        if (!this.isLocal || !is.nil(this.sendPresenceTimerHandle)) {
            return;
        }
        this.sendPresenceTimerHandle = window.setTimeout(() => {
            this.sendPresenceTimerHandle = null;
            this.app.getRoom()?.sendPresence();
            if (this.debugLogEnabled) {
                log.info('BadgesDisplay.triggerSendPresence: Sending own presence.');
            }
        }, this.sendPresenceDelaySec * 1000);
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

}
