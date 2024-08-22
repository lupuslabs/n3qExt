import { is } from '../lib/is'
import { BadgeIframeData, ItemProperties } from '../lib/ItemProperties';
import { ContentApp } from './ContentApp';
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher';
import { DomUtils } from '../lib/DomUtils';
import { Badge } from './Badge';
import { Utils } from '../lib/Utils'
import { Config } from '../lib/Config';
import { Window, WindowOptions } from './Window'

export class BadgeInfoWindow extends Window<WindowOptions>
{
    // Displays information about a single badge.

    private readonly badge: Badge;
    private badgeContent: null|BadgeInfoWindowContent;
    private badgeContentElem: null|HTMLElement;

    //--------------------------------------------------------------------------
    // API for Badge

    constructor(app: ContentApp, badge: Badge)
    {
        super(app);
        this.badge = badge;
    }

    public toggleVisibility(): void
    {
        if (this.getVisibility()) {
            this.close();
        } else {
            this.show({});
        }
    }

    public updateDisplay(): void
    {
        if (this.getVisibility()) {
            this.updateContent();
        }
    }

    //--------------------------------------------------------------------------
    // Display and event handling

    protected prepareMakeDom(): void
    {
        super.prepareMakeDom();
        this.windowName = 'badge';
        this.style = 'popup';
        this.guiLayer = ContentApp.LayerPopup;
        this.windowCssClasses.push('n3q-badgeInfoWindow');
        this.isResizable = true;
        this.withTitlebar = false;
        this.geometryInitstrategy = 'afterContent';
        const aboveRect = this.badge.getBoundingClientRect();
        this.givenOptions = {
            left: this.givenOptions.left ?? aboveRect.left,
            bottom: this.givenOptions.bottom,
            above: aboveRect,
            aboveYOffset: Config.get('badges.infoWindowBadgeDistanceY', 0),
        };
    }

    protected async makeContent(): Promise<void>
    {
        await super.makeContent();
        this.updateContent();
    }

    protected onBeforeClose(): void
    {
        super.onBeforeClose();
        this.badgeContent = null;
        this.contentElem.remove();
        this.contentElem = null;
    }

    public updateContent(): void
    {
        const properties = this.badge.getProperties();

        if (this.badgeContent) {
            this.badgeContent.setProperties(properties);
        }
        if (!(this.badgeContent?.canMakeContentForBadge() ?? false)) {
            this.badgeContent = new BadgeInfoWindowIframeContent(this.app, properties);
            if (!this.badgeContent.canMakeContentForBadge()) {
                this.badgeContent = new BadgeInfoWindowNativeContent(this.app, properties);
            }
        }

        const { contentElem, defaultWidth, defaultHeight } = this.badgeContent.makeContent();
        if (contentElem !== this.badgeContentElem) {
            this.badgeContentElem?.remove();
            this.contentElem.appendChild(contentElem);
            this.badgeContentElem = contentElem;
            this.givenOptions.width = defaultWidth ?? 'content';
            this.givenOptions.height = defaultHeight ?? 'content';
        }
    }

}

type MakeContentResult = { contentElem: HTMLElement, defaultWidth?: number, defaultHeight?: number }

interface BadgeInfoWindowContent
{
    setProperties(properties: ItemProperties): void;
    canMakeContentForBadge(): boolean;
    makeContent(): MakeContentResult
}

class BadgeInfoWindowNativeContent implements BadgeInfoWindowContent
{
    private readonly app: ContentApp;
    private properties: ItemProperties;

    constructor(app: ContentApp, properties: ItemProperties)
    {
        this.app = app;
        this.setProperties(properties);
    }

    public setProperties(properties: ItemProperties): void
    {
        this.properties = properties;
    }

    public canMakeContentForBadge(): boolean
    {
        return true;
    }

    public makeContent(): MakeContentResult
    {
        const properties = this.properties;
        const contentElem = DomUtils.elemOfHtml('<div class="n3q-badgeInfoWindow-columns"></div>');

        const {imageUrl, imageWidth, imageHeight} = ItemProperties.getBadgeImageData(properties);
        if (imageUrl.length !== 0) {
            const elem = DomUtils.elemOfHtml('<img class="n3q-badgeInfoWindow-image"/>');
            elem.style.width = `${imageWidth}px`;
            elem.style.height = `${imageHeight}px`;
            contentElem.appendChild(elem);
            this.app.fetchUrlAsDataUrl(imageUrl).then(dataUrl => {
                elem.setAttribute('src', dataUrl);
            })
        }

        const descriptionColumnElems = [];

        const title = ItemProperties.getBadgeTitle(properties);
        if (title.length !== 0) {
            const elem = DomUtils.elemOfHtml('<div class="n3q-badgeInfoWindow-title"></div>');
            this.makeTextElems(elem, title);
            descriptionColumnElems.push(elem);
        }

        const description = ItemProperties.getBadgeDescription(properties);
        if (description.length !== 0) {
            const elem = DomUtils.elemOfHtml('<div class="n3q-badgeInfoWindow-description"></div>');
            this.makeTextElems(elem, description);
            descriptionColumnElems.push(elem);
        }

        let {linkUrl, linkLabel} = ItemProperties.getBadgeLinkData(properties);
        linkUrl = Utils.mangleUserProvidedUrl(linkUrl);
        if (linkUrl.length !== 0) {
            if (linkLabel.length === 0) {
                linkLabel = Utils.getLabelOfUrl(linkUrl);
            }
            const elem = DomUtils.elemOfHtml('<a class="n3q-badgeInfoWindow-link" target="_blank"></a>');
            elem.setAttribute('href', linkUrl);
            this.makeTextElems(elem, linkLabel);
            PointerEventDispatcher.makeOpaqueDefaultActionsDispatcher(this.app, elem);
            descriptionColumnElems.push(elem);
        }

        if (descriptionColumnElems.length !== 0) {
            const columnElem = DomUtils.elemOfHtml('<div class="n3q-badgeInfoWindow-descriptionColumn"></div>');
            descriptionColumnElems.forEach(elem => columnElem.appendChild(elem));
            contentElem.appendChild(columnElem);
        }

        return { contentElem };
    }

    private makeTextElems(container: HTMLElement, text: string): void
    {
        text = this.app.translateText(`badge.${text}`, text);
        text.split('\n\n').forEach(paragraph => {
            const paragraphElem = document.createElement('span');
            paragraphElem.classList.add('n3q-badgeInfoWindow-paragraph');
            paragraph.split('\n').forEach(line => {
                const lineElem = document.createElement('span');
                lineElem.classList.add('n3q-badgeInfoWindow-line');
                lineElem.innerText = line;
                paragraphElem.appendChild(lineElem);
            });
            container.appendChild(paragraphElem);
        });
    }

}

class BadgeInfoWindowIframeContent implements BadgeInfoWindowContent
{
    private readonly app: ContentApp;
    private iframeData: Partial<BadgeIframeData> = {};
    private iframeDataOld: Partial<BadgeIframeData> = {};
    private contentElem: null|HTMLElement = null;

    constructor(app: ContentApp, properties: ItemProperties)
    {
        this.app = app;
        this.setProperties(properties);
    }

    public setProperties(properties: ItemProperties): void
    {
        this.iframeDataOld = this.iframeData;
        this.iframeData = ItemProperties.getBadgeIframeData(properties);
    }

    public canMakeContentForBadge(): boolean
    {
        return is.nonEmptyString(this.iframeData.iframeUrl);
    }

    public makeContent(): MakeContentResult
    {
        const defaultWidth = this.iframeData.iframeWidth;
        const defaultHeight = this.iframeData.iframeHeight;
        let contentElem: null|HTMLElement = null;
        if (this.iframeData.iframeUrl === this.iframeDataOld.iframeUrl) {
            contentElem = this.contentElem;
        }
        contentElem ??= this.makeContentElem();
        return { contentElem, defaultWidth, defaultHeight };
    }

    private makeContentElem(): HTMLElement
    {
        const url = this.iframeData.iframeUrl;
        const contentElem = DomUtils.elemOfHtml(`<iframe src="${url}"></iframe>`);
        this.contentElem = contentElem;
        return contentElem;
    }

}
