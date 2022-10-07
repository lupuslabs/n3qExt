import { ItemProperties } from '../lib/ItemProperties';
import { ContentApp } from './ContentApp';
import { BadgesDisplay } from './BadgesDisplay';
import { DomOpacityAwarePointerEventDispatcher } from '../lib/DomOpacityAwarePointerEventDispatcher';
import { DomModifierKeyId, PointerEventType } from '../lib/PointerEventData';
import { DomButtonId } from '../lib/domTools';

export class BadgeDisplay
{
    // Displays a single badge.

    private readonly app: ContentApp;
    private readonly badgesDisplay: BadgesDisplay;

    private properties: ItemProperties;
    private iconDataUrl: string;
    private readonly iconElem: HTMLImageElement;
    private readonly pointerEventDispatcher: DomOpacityAwarePointerEventDispatcher = null;

    private isStopping: boolean = false;
    private dragIconElem?: HTMLImageElement = null;

    //--------------------------------------------------------------------------
    // API for BadgesDisplay

    constructor(app: ContentApp, badgesDisplay: BadgesDisplay, properties: ItemProperties, iconDataUrl: string)
    {
        this.app = app;
        this.badgesDisplay = badgesDisplay;
        this.iconElem = document.createElement('img');
        this.iconElem.classList.add('n3q-base', 'n3q-badge');
        this.badgesDisplay.getBadgesContainer().appendChild(this.iconElem);
        this.pointerEventDispatcher = new DomOpacityAwarePointerEventDispatcher(this.app, this.iconElem);
        this.initEventHandling();
        this.onPropertiesLoaded(properties, iconDataUrl);
    }

    public onPropertiesLoaded(itemProperties: ItemProperties, iconDataUrl: string): void
    {
        this.properties = itemProperties;
        this.iconDataUrl = iconDataUrl;
        this.updateDisplay();
    }

    public getProperties(): ItemProperties
    {
        return this.properties;
    }

    public stop(): void
    {
        this.isStopping = true;
        // Todo: Close info popup.
        this.onExitEditMode();
        this.iconElem?.parentElement?.removeChild(this.iconElem);
    }

    public updateDisplay(): void
    {
        this.updateIcon();
    }

    public onEnterEditMode(): void
    {
        // Called when badges display is entering edit mode after creation of this badge.
        // Todo: Close info popup.
    }

    public onExitEditMode(): void
    {
        // Called when badges display is exiting edit mode after creation of this badge.
        this.pointerEventDispatcher.cancelDrag();
    }

    //--------------------------------------------------------------------------
    // Display and event handling

    private updateIcon(): void
    {
        if (this.isStopping) {
            return;
        }
        const {iconWidth, iconHeight} = ItemProperties.getBadgeIconDimensions(this.properties);
        const {iconX, iconY} = ItemProperties.getBadgeIconPos(this.properties);
        const {inContainerTop, inContainerLeft}
            = this.badgesDisplay.translateBadgePos(iconX, iconY, iconWidth, iconHeight);
        this.iconElem.style.width = `${iconWidth}px`;
        this.iconElem.style.height = `${iconHeight}px`;
        this.iconElem.style.top = `${inContainerTop - iconHeight / 2}px`;
        this.iconElem.style.left = `${inContainerLeft - iconWidth / 2}px`;
        this.iconElem.setAttribute('src', this.iconDataUrl);

        this.pointerEventDispatcher.setDragStartDistance(this.badgesDisplay.getIsInEditMode() ? 0.0 : null);
    }

    private initEventHandling(): void
    {
        this.pointerEventDispatcher.addDropTargetTransparentClass('n3q-backpack-item');

        this.pointerEventDispatcher.setEventListener(PointerEventType.hoverenter, ev => {
            this.badgesDisplay.onMouseEnterBadge(ev);
        });
        this.pointerEventDispatcher.setEventListener(PointerEventType.hoverleave, ev => {
            this.badgesDisplay.onMouseLeaveBadge(ev);
        });

        this.pointerEventDispatcher.setEventListener(PointerEventType.buttondown, ev => {
            this.badgesDisplay.onBadgePointerDown(ev);
        });
        this.pointerEventDispatcher.setEventListener(PointerEventType.click, ev => {
            if (!this.isStopping && !this.badgesDisplay.getIsInEditMode()) {
                // Todo: Toggle info popup.
            }
        });

        this.pointerEventDispatcher.setEventListener(PointerEventType.dragstart, ev => {
            if (this.badgesDisplay.getIsInEditMode()) {
                this.iconElem.classList.add('n3q-hidden');
                this.dragIconElem = this.badgesDisplay.makeDraggedBadgeIcon(this.properties, this.iconDataUrl);
            } else {
                this.pointerEventDispatcher.cancelDrag();
            }
        });

        this.pointerEventDispatcher.setEventListener(PointerEventType.dragmove, ev => {
            if (this.badgesDisplay.getIsInEditMode()) {
                if (ev.buttons !== DomButtonId.first || ev.modifierKeys !== DomModifierKeyId.none) {
                    this.pointerEventDispatcher.cancelDrag();
                    return;
                }
                const display = this.badgesDisplay;
                if (display.isValidEditModeBadgeDrop(ev, this.properties)) {
                    display.showDraggedBadgeIconInside(this.properties, ev, this.dragIconElem, true);
                } else {
                    display.showDraggedBadgeIconOutside(this.properties, ev, this.dragIconElem);
                }
            }
        });

        this.pointerEventDispatcher.setEventListener(PointerEventType.dragdrop, ev => {
            if (this.badgesDisplay.getIsInEditMode()) {
                const display = this.badgesDisplay;
                if (display.isValidEditModeBadgeDrop(ev, this.properties)) {
                    display.onBadgeDropInside(ev, this.properties, true);
                } else {
                    display.onBadgeDropOutside(this.properties);
                }
            }
        });

        this.pointerEventDispatcher.setEventListener(PointerEventType.dragend, ev => {
            this.dragIconElem = this.badgesDisplay.disposeDraggedBadgeIcon(this.dragIconElem);
            this.iconElem.classList.remove('n3q-hidden');
            this.updateDisplay();
        });

    }

}
