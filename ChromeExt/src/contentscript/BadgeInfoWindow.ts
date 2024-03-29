import { ItemProperties } from '../lib/ItemProperties';
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
            const geometry = this.readGeometryFromDom();
            this.close();
            this.show(geometry);
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
        this.isResizable = false;
        this.withTitlebar = false;
        this.geometryInitstrategy = 'afterContent';
        const aboveRect = this.badge.getBoundingClientRect();
        this.givenOptions = {
            width: 'content',
            height: 'content',
            left: this.givenOptions.left ?? aboveRect.left,
            bottom: this.givenOptions.bottom,
            above: aboveRect,
            aboveYOffset: Config.get('badges.infoWindowBadgeDistanceY', 0),
        };
    }

    protected async makeContent(): Promise<void>
    {
        await super.makeContent();

        const properties = this.badge.getProperties();
        const columnsElem = DomUtils.elemOfHtml('<div class="n3q-badgeInfoWindow-columns"></div>');
        this.contentElem.append(columnsElem);

        const {imageUrl, imageWidth, imageHeight} = ItemProperties.getBadgeImageData(properties);
        if (imageUrl.length !== 0) {
            const elem = DomUtils.elemOfHtml('<img class="n3q-badgeInfoWindow-image"/>');
            elem.style.width = `${imageWidth}px`;
            elem.style.height = `${imageHeight}px`;
            columnsElem.appendChild(elem);
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
            columnsElem.appendChild(columnElem);
        }
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
