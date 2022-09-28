import { is } from '../lib/is';
import { as } from '../lib/as';
import { ItemProperties, Pid } from '../lib/ItemProperties';
import { ContentApp } from './ContentApp';
import { Entity } from './Entity';
import { ErrorWithData, Utils } from '../lib/Utils';
import { Config } from '../lib/Config';
import { BadgeDisplay } from './BadgeDisplay';
import { BackgroundMessage } from '../lib/BackgroundMessage';
import { DomOpacityAwarePointerEventDispatcher } from '../lib/DomOpacityAwarePointerEventDispatcher';
import { DomModifierKeyId, PointerEventType } from '../lib/PointerEventData';
import { DomButtonId } from '../lib/domTools';

export class BadgesDisplay
{
    // Displays and allows for drag 'n drop editing of badges.

    private readonly app: ContentApp;
    private readonly entity: Entity;
    private readonly parentDisplay: HTMLElement;
    private readonly isLocal: boolean;

    private debugLogEnabled: boolean;
    private badges: Map<string,BadgeDisplay> = new Map();
    private containerDimensions: {top: number, right: number, bottom: number, left: number}; // From avatar center bottom.
    private containerElem: HTMLElement;
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
    }

    //--------------------------------------------------------------------------
    // Public API for Entity and the avatar menu

    public onUserSettingsChanged(): void
    {
        this.debugLogEnabled = Utils.logChannel('badges');
        this.containerDimensions = {
            top: as.Int(Config.get('badges.displayTop'), 200),
            right: as.Int(Config.get('badges.displayRight'), 100),
            bottom: as.Int(Config.get('badges.displayBottom'), 0),
            left: as.Int(Config.get('badges.displayLeft'), 100),
        };
        this.exitEditMode();
        this.updateDisplay();
    }

    public updateBadgesFromPresence(badgesStr: string): void
    {
        if (this.isLocal) {
            return; // Own badges are updated by onItem* methods.
        }
        const sparseItems = this.parseBadgesStrFromPresence(badgesStr);
        // Todo: Get properties somehow and update.
    }

    public getBadgesStrForPresence(): string
    {
        const badgeStrs: string[] = [];
        let lastProviderId: string|null = null;
        let lastInventoryId: string|null = null;
        for (const badgeDisplay of this.badges.values()) {
            const {Provider, InventoryId, Id} = badgeDisplay.getProperties();
            const ids: string[] = [];
            if (Provider !== lastProviderId) {
                ids.push(Provider);
            }
            if (InventoryId !== lastInventoryId) {
                ids.push(InventoryId);
            }
            ids.push(Id);
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
        this.editModeHintElem = document.createElement('div');
        this.editModeHintElem.classList.add('n3q-badgesEditModeHint');
        this.editModeHintElem.innerText = this.app.translateText('Badges.editModeHint');
        this.containerElem.appendChild(this.editModeHintElem);
        this.showEditModeExitButton();
        for (const badgeDisplay of this.badges.values()) {
            badgeDisplay.enterEditMode();
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
        this.containerElem.removeChild(this.editModeExitElem);
        this.editModeExitElem = null;
        for (const badgeDisplay of this.badges.values()) {
            badgeDisplay.exitEditMode();
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
    }

    //--------------------------------------------------------------------------
    // Public API for BadgeDisplay

    public getBadgesContainer(): HTMLElement
    {
        return this.containerElem;
    }

    public translateBadgePos(
        avatarX: number, avatarY: number, width: number, height: number
    ): {inContainerTop: number, inContainerLeft: number} {
        // avatarX and avatarY are measured from avatar center bottom towards right top.
        const cDims = this.containerDimensions;

        // Clip avatarX and avatarY to display baoundaries taking width and height into account:
        const halfwidth = width / 2;
        const halfHeight = height / 2;
        const avatarXM = Math.max(-cDims.left + halfwidth, Math.min(cDims.right - halfwidth, avatarX));
        const avatarYM = Math.max(cDims.bottom + halfHeight, Math.min(cDims.top - halfHeight, avatarY));

        // Offset coordinates to DOM top/left coordinates inside container div:
        const inContainerTop = cDims.top - avatarYM;
        const inContainerLeft = avatarXM + cDims.left;

        return {inContainerTop, inContainerLeft}
    }

    //--------------------------------------------------------------------------
    // Badge state updates

    private updateBadgesFromBackpack(): void
    {
        BackgroundMessage.getBackpackState().then(response => {
            if (!response?.ok) {
                throw new ErrorWithData('BackgroundMessage.getBackpackState failed!', {response});
            }
            const items: ItemProperties[] = [];
            for (const id in response.items) {
                items.push(response.items[id]);
            }
            items.forEach(itemProperties => this.updateBadgeFromFullItem(itemProperties));
        }).catch(error => {
            const msg = 'BadgesDisplay.updateBadgesFromBackpack: !';
            this.app.onError(new ErrorWithData(msg, {error}))
        });
    }

    private removeBadge(itemProperties: ItemProperties): void
    {
        const badgeKey = this.makeBadgeKey(itemProperties);
        this.badges.get(badgeKey)?.stop();
        this.badges.delete(badgeKey);
    }

    private updateBadgeFromFullItem(itemProperties: ItemProperties): void
    {
        const badgeKey = this.makeBadgeKey(itemProperties);
        const isEnabledBadge = as.Bool(itemProperties[Pid.BadgeIsActive]);
        const badge = this.badges.get(badgeKey);
        if (is.nil(badge)) {
            if (isEnabledBadge) {
                this.badges.set(badgeKey, new BadgeDisplay(this.app, this, itemProperties));
            }
        } else {
            if (isEnabledBadge) {
                badge.onPropertiesLoaded(itemProperties);
            } else {
                badge.stop();
                this.badges.delete(badgeKey);
            }
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
        return badges;
    }

    private makeBadgeKey(item: ItemProperties): string
    {
        return `${item[Pid.Id]}:${item[Pid.InventoryId]}:${item[Pid.Provider]}`;
    }

    //--------------------------------------------------------------------------
    // GUI updates

    private updateDisplay(): void
    {
        if (is.nil(this.containerElem)) {
            this.containerElem = document.createElement('div');
            this.containerElem.classList.add('n3q-base', 'n3q-badges');
            this.parentDisplay.appendChild(this.containerElem);
        }
        const cDims = this.containerDimensions;
        this.containerElem.style.bottom = `${cDims.bottom}px`;
        this.containerElem.style.left = `${-cDims.left}px`;
        this.containerElem.style.width = `${cDims.left + cDims.right}px`;
        this.containerElem.style.height = `${cDims.top - cDims.bottom}px`;

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
