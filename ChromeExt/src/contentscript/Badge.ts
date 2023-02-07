import { ItemProperties } from '../lib/ItemProperties';
import { ContentApp } from './ContentApp';
import { BadgesController } from './BadgesController';
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher';
import { DomModifierKeyId } from '../lib/PointerEventData';
import { DomButtonId } from '../lib/domTools';
import { BadgeInfoWindow } from './BadgeInfoWindow';

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
        this.infoWindow.hide();
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

    private initEventHandling(): void
    {
        this.pointerEventDispatcher.addDropTargetTransparentClass('n3q-backpack-item');

        this.pointerEventDispatcher.setEventListener('hoverenter', ev => {
            this.badgesDisplay.onMouseEnterBadge(ev);
        });
        this.pointerEventDispatcher.setEventListener('hoverleave', ev => {
            this.badgesDisplay.onMouseLeaveBadge(ev);
        });

        this.pointerEventDispatcher.setEventListener('buttondown', ev => {
            this.badgesDisplay.onBadgePointerDown(ev);
        });
        this.pointerEventDispatcher.setEventListener('click', ev => {
            if (!this.isStopping) {
                if (this.badgesDisplay.getIsInEditMode()) {
                    if (ev.buttons === DomButtonId.first && ev.modifierKeys === DomModifierKeyId.control) {
                        const display = this.badgesDisplay;
                        display.onBadgeDropOutside(this.item);
                    }
                } else {
                    this.infoWindow.toggleVisibility();
                }
            }
        });

        this.pointerEventDispatcher.setEventListener('dragstart', ev => {
            if (this.badgesDisplay.getIsInEditMode()) {
                this.iconElem.classList.add('n3q-hidden');
                this.dragIconElem = this.badgesDisplay.makeDraggedBadgeIcon(this.item, this.item.iconDataUrl);
            } else {
                this.pointerEventDispatcher.cancelDrag();
            }
        });

        this.pointerEventDispatcher.setEventListener('dragmove', ev => {
            if (this.badgesDisplay.getIsInEditMode()) {
                if (ev.buttons !== DomButtonId.first || ev.modifierKeys !== DomModifierKeyId.none) {
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

        this.pointerEventDispatcher.setEventListener('dragdrop', ev => {
            if (this.badgesDisplay.getIsInEditMode()) {
                const display = this.badgesDisplay;
                if (display.isValidEditModeBadgeDrop(ev, this.item)) {
                    display.onBadgeDropInside(ev, this.item, true);
                } else {
                    display.onBadgeDropOutside(this.item);
                }
            }
        });

        this.pointerEventDispatcher.setEventListener('dragend', ev => this.onDragEnd());

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
