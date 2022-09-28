import { is } from '../lib/is';
import { ItemProperties, Pid } from '../lib/ItemProperties';
import { ContentApp } from './ContentApp';
import { as } from '../lib/as';
import { BadgesDisplay } from './BadgesDisplay';

export class BadgeDisplay
{
    // Displays a single badge.

    private readonly app: ContentApp;
    private readonly badgesDisplay: BadgesDisplay;

    private properties: ItemProperties;
    private propertiesLoaded: boolean = false;
    private iconElem: HTMLElement;
    private iconDataUrl?: string;
    private loadComplete: boolean = false;
    private isInEditMode: boolean = false;

    constructor(app: ContentApp, badgesDisplay: BadgesDisplay, properties: ItemProperties)
    {
        this.app = app;
        this.badgesDisplay = badgesDisplay;
        if (is.nil(properties[Pid.BadgeIconUrl])) {
            this.properties = properties;
        } else {
            this.properties = {};
            this.onPropertiesLoaded(properties);
        }
    }

    //--------------------------------------------------------------------------
    // API for BadgesDisplay

    public getProperties(): ItemProperties
    {
        return this.properties;
    }

    public onPropertiesLoaded(properties: ItemProperties): void
    {
        if (this.properties[Pid.BadgeIconUrl] !== properties[Pid.BadgeIconUrl]) {
            const iconUrl = as.String(properties[Pid.BadgeIconUrl]);
            this.app.fetchUrlAsDataUrl(iconUrl).then(dataUrl => this.onIconLoaded(dataUrl));
        }
        this.properties = properties;
        this.propertiesLoaded = true;
        this.updateDisplay();
    }

    public stop(): void
    {
        if (!is.nil(this.iconElem)) {
            // Todo: Cancel drag.
            this.badgesDisplay.getBadgesContainer().removeChild(this.iconElem);
            this.iconElem = null;
        }
    }

    public updateDisplay(): void
    {
        if (!this.loadComplete) {
            return;
        }
        if (is.nil(this.iconElem)) {
            this.iconElem = document.createElement('div');
            this.iconElem.classList.add('n3q-base', 'n3q-badge');
            this.badgesDisplay.getBadgesContainer().appendChild(this.iconElem);
        }
        this.iconElem.style.backgroundImage = `url("${this.iconDataUrl}")`;

        const width = as.Int(this.properties[Pid.BadgeIconWidth]);
        const height = as.Int(this.properties[Pid.BadgeIconHeight]);
        let x = as.Float(this.properties[Pid.BadgeIconX]);
        let y = as.Float(this.properties[Pid.BadgeIconY]);
        const {inContainerTop, inContainerLeft} = this.badgesDisplay.translateBadgePos(x, y, width, height);
        this.iconElem.style.width = `${width}px`;
        this.iconElem.style.height = `${height}px`;
        this.iconElem.style.top = `${inContainerTop - height / 2}px`;
        this.iconElem.style.left = `${inContainerLeft - width / 2}px`;
    }

    public enterEditMode(): void
    {
        if (this.isInEditMode) {
            return;
        }
        this.isInEditMode = true;
    }

    public exitEditMode(): void
    {
        if (!this.isInEditMode) {
            return;
        }
        this.isInEditMode = false;
    }

    //--------------------------------------------------------------------------
    // Handling of updates and properties/icon loading

    private onIconLoaded(iconDataUrl: string): void
    {
        this.iconDataUrl = iconDataUrl;
        this.updateLoadComplete();
        this.updateDisplay();
    }

    private updateLoadComplete(): void
    {
        this.loadComplete = this.propertiesLoaded && !is.nil(this.iconDataUrl);
    }

}
