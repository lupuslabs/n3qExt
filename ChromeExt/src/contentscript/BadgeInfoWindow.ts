import { ItemProperties } from '../lib/ItemProperties';
import { ContentApp } from './ContentApp';
import { DomOpacityAwarePointerEventDispatcher } from '../lib/DomOpacityAwarePointerEventDispatcher';
import { DomModifierKeyId, PointerEventType } from '../lib/PointerEventData';
import { DomButtonId } from '../lib/domTools';
import { Badge } from './Badge';
import { is } from '../lib/is';
import { as } from '../lib/as';
import { Config } from '../lib/Config';

export class BadgeInfoWindow
{
    // Displays information about a single badge.

    private readonly app: ContentApp;
    private readonly badge: Badge;

    private state: 'showing'|'visible'|'hidden' = 'hidden';
    private rootElem: HTMLDivElement;
    private rootElemPos: null | {clientX: number, clientY: number};

    //--------------------------------------------------------------------------
    // API for Badge

    constructor(app: ContentApp, badge: Badge)
    {
        this.app = app;
        this.badge = badge;
    }

    public show(): void
    {
        if (this.state === 'hidden') {
            this.state = 'showing';
            this.createWindow();
        }
    }

    public hide(): void
    {
        if (this.state !== 'hidden') {
            this.rootElemPos = null;
            this.rootElem.parentElement.removeChild(this.rootElem);
            this.rootElem = null;
            this.state = 'hidden';
        }
    }

    public toggleVisibility(): void
    {
        if (this.state === 'hidden') {
            this.show();
        } else {
            this.hide();
        }
    }

    public updateDisplay(): void
    {
        if (this.state !== 'hidden') {
            const pos = this.rootElemPos;
            this.hide();
            this.rootElemPos = pos;
            this.show();
        }
    }

    //--------------------------------------------------------------------------
    // Display and event handling

    private createWindow(): void
    {
        this.rootElem = document.createElement('div');
        this.rootElem.classList.add('n3q-base', 'n3q-badgeInfoWindow', 'n3q-hidden');

        const eventDispatcher = new DomOpacityAwarePointerEventDispatcher(this.app, this.rootElem);

        eventDispatcher.setEventListener(PointerEventType.buttondown, ev => {
            if (this.state === 'visible') {
                this.riseToFront();
            }
        });

        eventDispatcher.setEventListener(PointerEventType.dragmove, ev => {
            if (this.state === 'visible') {
                const clientX = ev.clientX - ev.startDomElementOffsetX;
                const clientY = ev.clientY - ev.startDomElementOffsetY;
                this.moveToClientPos({clientX, clientY});
            }
        });

        this.rootElem.appendChild(this.app.makeWindowCloseButton(() => this.hide(), 'popup'));
        this.createWindowContent();

        this.app.getDisplay()?.appendChild(this.rootElem);
        this.riseToFront();
        window.setTimeout(() => this.reactToWindowLayouted(), 1);
    }

    private createWindowContent(): void
    {
        const layoutElem = document.createElement('div');
        layoutElem.classList.add('n3q-base', 'n3q-badgeInfoWindow-content');
        this.rootElem.appendChild(layoutElem);
        const properties = this.badge.getProperties();

        const {imageUrl, imageWidth, imageHeight} = ItemProperties.getBadgeImageData(properties);
        if (imageUrl.length !== 0) {
            const elem = document.createElement('img');
            elem.classList.add('n3q-base', 'n3q-badgeInfoWindow-image');
            elem.style.width = `${imageWidth}px`;
            elem.style.height = `${imageHeight}px`;
            layoutElem.appendChild(elem);
            this.app.fetchUrlAsDataUrl(imageUrl).then(dataUrl => {
                elem.setAttribute('src', dataUrl);
            })
        }

        const descriptionColumnElems = [];

        const title = ItemProperties.getBadgeTitle(properties);
        if (title.length !== 0) {
            const elem = document.createElement('div');
            elem.classList.add('n3q-base', 'n3q-badgeInfoWindow-title');
            this.makeTextElems(elem, title);
            descriptionColumnElems.push(elem);
        }

        const description = ItemProperties.getBadgeDescription(properties);
        if (description.length !== 0) {
            const elem = document.createElement('div');
            elem.classList.add('n3q-base', 'n3q-badgeInfoWindow-description');
            this.makeTextElems(elem, description);
            descriptionColumnElems.push(elem);
        }

        const {linkUrl, linkLabel} = ItemProperties.getBadgeLinkData(properties);
        if (linkUrl.length !== 0) {
            const elem = document.createElement('a');
            elem.setAttribute('href', linkUrl);
            elem.setAttribute('target', '_blank');
            elem.classList.add('n3q-base', 'n3q-badgeInfoWindow-link');
            this.makeTextElems(elem, linkLabel.length === 0 ? linkUrl : linkLabel);

            const eventdispatcher = new DomOpacityAwarePointerEventDispatcher(this.app, elem);
            eventdispatcher.setEventListener(PointerEventType.click, eventData => {
                if (eventData.buttons === DomButtonId.first && eventData.modifierKeys === DomModifierKeyId.none) {
                    window.open(linkUrl, '_blank');
                }
            });

            descriptionColumnElems.push(elem);
        }

        if (descriptionColumnElems.length !== 0) {
            const columnElem = document.createElement('div');
            columnElem.classList.add('n3q-base', 'n3q-badgeInfoWindow-descriptionColumn');
            descriptionColumnElems.forEach(elem => columnElem.appendChild(elem));
            layoutElem.appendChild(columnElem);
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

    private riseToFront(): void
    {
        this.app.toFront(this.rootElem, ContentApp.LayerPopup);
    }

    private reactToWindowLayouted(): void
    {
        if (this.state === 'showing') {
            if (this.rootElem.offsetWidth === 0) {
                window.setTimeout(() => this.reactToWindowLayouted(), 100);
            } else {
                this.rootElem.classList.remove('n3q-hidden');
                this.moveToInitialPos();
                this.state = 'visible';
            }
        }
    }

    private moveToInitialPos(): void
    {
        if (is.nil(this.rootElemPos)) {
            const badgeDims = this.badge.getBoundingClientRect();
            const [badgeTop, badgeCenter] = [badgeDims.top, badgeDims.left + badgeDims.width / 2];
            const [windowWidth, windowHeight] = [this.rootElem.offsetWidth, this.rootElem.offsetHeight];
            const bottomOffset = Config.get('badges.infoWindowBadgeDistanceY', 0);
            const clientY = as.Int(badgeTop - windowHeight - bottomOffset);
            const clientX = as.Int(badgeCenter - windowWidth / 2);
            this.rootElemPos = {clientX, clientY};
        }
        this.moveToClientPos(this.rootElemPos);
    }

    private moveToClientPos(clientPos: {clientX: number, clientY: number}): void
    {
        const margin = 5; // For window border consisting of only the shadow.
        const [displayElem, rootElem] = [this.app.getDisplay(), this.rootElem];
        const [displayWidth, displayHeight] = [displayElem.offsetWidth, displayElem.offsetHeight];
        const [windowWidth, windowHeight] = [rootElem.offsetWidth, rootElem.offsetHeight];
        const clientY = Math.max(margin, Math.min(displayHeight - margin - windowHeight, clientPos.clientY));
        const clientX = Math.max(margin, Math.min(displayWidth - margin - windowWidth, clientPos.clientX));
        this.rootElem.style.top  = `${clientY}px`;
        this.rootElem.style.left = `${clientX}px`;
        this.rootElemPos = {clientX, clientY};
    }

}
