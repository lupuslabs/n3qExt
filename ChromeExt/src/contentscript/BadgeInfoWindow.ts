import { is } from '../lib/is'
import { as } from '../lib/as'
import { BadgeIframeData, ItemProperties } from '../lib/ItemProperties';
import { ContentApp } from './ContentApp';
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher';
import { DomUtils } from '../lib/DomUtils';
import { Badge } from './Badge';
import { Utils } from '../lib/Utils'
import { Config } from '../lib/Config';
import { PopupWindow, PopupWindowOptions } from './PopupWindow'

export class BadgeInfoWindow extends PopupWindow<PopupWindowOptions>
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
        this.guiLayer = ContentApp.LayerPopup;
        this.windowCssClasses.push('badgeInfoWindow');
        this.isResizable = true;

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
        const aboveRect = this.badge.getBoundingClientRect();
        this.givenOptions = {
            anchor: aboveRect,
            leftMode: 'anchorLeft',
            anchorYOffset: as.Int(Config.get('badges.infoWindowBadgeDistanceY', 0)),
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
        this.contentElem?.remove();
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
        const contentElem = DomUtils.elemOfHtml('<div class="columns"></div>');

        const {imageUrl, imageWidth, imageHeight} = ItemProperties.getBadgeImageData(properties);
        if (imageUrl.length !== 0) {
            const elem = DomUtils.elemOfHtml('<img class="image"/>');
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
            const elem = DomUtils.elemOfHtml('<div class="title"></div>');
            const titleTranslated = this.app.translateText(`badge.${title}`, title);
            DomUtils.paragraphNodesOfText(titleTranslated).forEach(node => elem.append(node));
            descriptionColumnElems.push(elem);
        }

        const description = ItemProperties.getBadgeDescription(properties);
        if (description.length !== 0) {
            const elem = DomUtils.elemOfHtml('<div class="description"></div>');
            const descriptionTranslated = this.app.translateText(`badge.${description}`, description);
            DomUtils.paragraphNodesOfText(descriptionTranslated).forEach(node => elem.append(node));
            descriptionColumnElems.push(elem);
        }

        let {linkUrl, linkLabel} = ItemProperties.getBadgeLinkData(properties);
        linkUrl = Utils.mangleUserProvidedUrl(linkUrl);
        if (linkUrl.length !== 0) {
            if (linkLabel.length === 0) {
                linkLabel = Utils.getLabelOfUrl(linkUrl);
            }
            const linkLabelTranslated = this.app.translateText(`badge.${linkLabel}`, linkLabel);
            const elem = DomUtils.makeExternalTextLinkElem(linkUrl, linkLabelTranslated);
            PointerEventDispatcher.makeOpaqueDefaultActionsDispatcher(this.app, elem);
            descriptionColumnElems.push(elem);
        }

        if (descriptionColumnElems.length !== 0) {
            const columnElem = DomUtils.elemOfHtml('<div class="descriptionColumn"></div>');
            descriptionColumnElems.forEach(elem => columnElem.appendChild(elem));
            contentElem.appendChild(columnElem);
        }

        return { contentElem };
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
        const url = this.app.uiHelper.getWrappedIframeUrl(this.iframeData.iframeUrl);
        const contentElem = DomUtils.elemOfHtml(`<iframe src="${url}"></iframe>`);
        this.contentElem = contentElem;
        return contentElem;
    }

}
