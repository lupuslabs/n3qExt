import { ItemProperties } from '../lib/ItemProperties';
import { ContentApp } from './ContentApp';
import { BadgesController } from './BadgesController';
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher';
import { DomUtils } from '../lib/DomUtils';
import { BadgeInfoWindow } from './BadgeInfoWindow';
import { BackgroundMessage } from '../lib/BackgroundMessage';
import { as } from '../lib/as';
import { Utils } from '../lib/Utils';

export class Badge
{
    // Displays a single badge.

    private readonly app: ContentApp;
    private readonly badgesDisplay: BadgesController;

    private item: ItemProperties;
    private readonly iconElem: HTMLImageElement;
    private readonly pointerEventDispatcher: PointerEventDispatcher;
    private readonly infoWindow: BadgeInfoWindow;

    private isStopping: boolean = false;
    private dragIconElem?: HTMLImageElement = null;

    //--------------------------------------------------------------------------
    // API for BadgesController and BadgeInfoWindow

    constructor(app: ContentApp, badgesDisplay: BadgesController, item: ItemProperties)
    {
        this.app = app;
        this.badgesDisplay = badgesDisplay;
        this.infoWindow = new BadgeInfoWindow(this.app, this);
        this.iconElem = document.createElement('img');
        this.iconElem.classList.add('n3q-base', 'n3q-badge');
        this.badgesDisplay.getBadgesContainer().appendChild(this.iconElem);
        this.pointerEventDispatcher = new PointerEventDispatcher(this.app, this.iconElem);
        this.pointerEventDispatcher.addDropTargetTransparentClass('n3q-badge');
        this.initEventHandling();
        this.onPropertiesLoaded(item);
    }

    public getProperties(): ItemProperties
    {
        return this.item;
    }

    public onPropertiesLoaded(item: ItemProperties): void
    {
        this.item = item;
        this.updateDisplay();
    }

    public getBoundingClientRect(): DOMRect
    {
        return this.iconElem.getBoundingClientRect();
    }

    public stop(): void
    {
        this.isStopping = true;
        this.onDragEnd();
        this.infoWindow.close();
        this.iconElem?.parentElement?.removeChild(this.iconElem);
    }

    public updateDisplay(): void
    {
        this.updateIcon();
        this.infoWindow.updateDisplay();
    }

    //--------------------------------------------------------------------------
    // Display and event handling

    private updateIcon(): void
    {
        if (this.isStopping) {
            return;
        }
        const {iconWidth, iconHeight} = ItemProperties.getBadgeIconDimensions(this.item);
        const {iconX, iconY} = ItemProperties.getBadgeIconPos(this.item);
        const {inContainerTop, inContainerLeft}
            = this.badgesDisplay.translateBadgePos(iconX, iconY, iconWidth, iconHeight);
        this.iconElem.style.width = `${iconWidth}px`;
        this.iconElem.style.height = `${iconHeight}px`;
        this.iconElem.style.top = `${inContainerTop - iconHeight / 2}px`;
        this.iconElem.style.left = `${inContainerLeft - iconWidth / 2}px`;
        this.iconElem.setAttribute('src', this.item.iconDataUrl);
        this.iconElem.setAttribute('title', ItemProperties.getBadgeTitle(this.item));

        const inEditMode = this.badgesDisplay.getIsInEditMode();
        if (inEditMode) {
            this.pointerEventDispatcher.cancelDrag();
            this.pointerEventDispatcher.setDragStartDistance(3.0);
        } else {
            this.pointerEventDispatcher.setDragStartDistance(null);
        }
    }

    private openOrFocusPopup()
    {
        const linkData = ItemProperties.getBadgeLinkData(this.item);
        const popupId = String(Utils.hashString(linkData.linkUrl));
        const popupLink = linkData.linkUrl + '#n3qdisable'
        const popupOptions = ItemProperties.getBadgeToolOptions(this.item);
        BackgroundMessage.openOrFocusPopup({
            id: popupId,
            url: popupLink,
            left: as.Int(popupOptions.left, 40),
            top: as.Int(popupOptions.top, 40),
            width: as.Int(popupOptions.width, 400),
            height: as.Int(popupOptions.height, 400),
        }).catch(error => this.app.onError(error));
    }

    private closePopup()
    {
        const linkData = ItemProperties.getBadgeLinkData(this.item);
        const popupId = String(Utils.hashString(linkData.linkUrl));
        BackgroundMessage.closePopup(popupId).catch(error => this.app.onError(error));
    }

    private initEventHandling(): void
    {
        this.pointerEventDispatcher.addDropTargetTransparentClass('n3q-backpack-item');

        this.pointerEventDispatcher.addHoverEnterListener(ev => this.badgesDisplay.onMouseEnterBadge(ev));
        this.pointerEventDispatcher.addHoverLeaveListener(ev => this.badgesDisplay.onMouseLeaveBadge(ev));

        this.pointerEventDispatcher.addAnyButtonDownListener(ev => this.badgesDisplay.onBadgePointerDown(ev));
        this.pointerEventDispatcher.addUnmodifiedLeftClickListener(ev => {
            if (!this.isStopping && !this.badgesDisplay.getIsInEditMode()) {
                if (ItemProperties.getIsToolBadge(this.item)) {
                    this.openOrFocusPopup();
                } else {
                    this.infoWindow.toggleVisibility();
                }
            }
        });
        this.pointerEventDispatcher.addCtrlLeftClickListener(ev => {
            if (!this.isStopping) {
                if (this.badgesDisplay.getIsInEditMode()) {
                    const display = this.badgesDisplay;
                    display.onBadgeDropOutside(this.item);
                } else {
                    if (ItemProperties.getIsToolBadge(this.item)) {
                        this.closePopup();
                    }
                }
            }
        });

        this.pointerEventDispatcher.addDragStartListener(ev => {
            if (this.badgesDisplay.getIsInEditMode()) {
                this.iconElem.classList.add('n3q-hidden');
                this.dragIconElem = this.badgesDisplay.makeDraggedBadgeIcon(this.item, this.item.iconDataUrl);
            } else {
                this.pointerEventDispatcher.cancelDrag();
            }
        });

        this.pointerEventDispatcher.addDragMoveListener(ev => {
            if (this.badgesDisplay.getIsInEditMode()) {
                if (ev.buttons !== DomUtils.ButtonId.first || ev.modifierKeys !== DomUtils.ModifierKeyId.none) {
                    this.pointerEventDispatcher.cancelDrag();
                    return;
                }
                const display = this.badgesDisplay;
                if (display.isValidEditModeBadgeDrop(ev, this.item)) {
                    display.showDraggedBadgeIconInside(this.item, ev, this.dragIconElem, true);
                } else {
                    display.showDraggedBadgeIconOutside(this.item, ev, this.dragIconElem);
                }
            }
        });

        this.pointerEventDispatcher.addDragDropListener(ev => {
            if (this.badgesDisplay.getIsInEditMode()) {
                const display = this.badgesDisplay;
                if (display.isValidEditModeBadgeDrop(ev, this.item)) {
                    display.onBadgeDropInside(ev, this.item, true);
                } else {
                    display.onBadgeDropOutside(this.item);
                }
            }
        });

        this.pointerEventDispatcher.addDragEndListener(ev => this.onDragEnd());

    }

    private onDragEnd(): void
    {
        this.dragIconElem = this.badgesDisplay.disposeDraggedBadgeIcon(this.dragIconElem);
        if (!this.isStopping) {
            this.iconElem.classList.remove('n3q-hidden');
            this.updateDisplay();
        }
    }

}
