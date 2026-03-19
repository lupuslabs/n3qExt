import { is } from '../lib/is'
import { as } from '../lib/as';
import { Config } from '../lib/Config';
import { ItemProperties, Pid } from '../lib/ItemProperties';
import { ContentApp } from './ContentApp';
import { RoomItem } from './RoomItem';
import { DomUtils } from '../lib/DomUtils'
import { Utils } from '../lib/Utils'

export class RoomItemStats // Todo: Convert to Window.
{
    private elem: HTMLElement = null;

    public constructor(protected app: ContentApp, protected roomItem: RoomItem, protected onClose: () => void)
    {
    }

    public show(): void
    {
        this.elem = DomUtils.elemOfHtml('<div class="roomitemstats" data-translate="children"></div>');
        this.update();
        this.app.getDisplay().append(this.elem);
        this.app.toFront(this.elem, ContentApp.LayerPopup);
        this.elem.style.opacity = '0';
        const transition = { property: 'opacity', duration: '200ms' };
        DomUtils.startElemTransition(this.elem, null, transition, '1');
    }

    public close(): void
    {
        this.elem?.remove();
        this.onClose?.();
    }

    public update(): void
    {
        this.elem.innerHTML = '';
        const props = this.roomItem.getProperties();

        let label = as.String(props[Pid.Label]);
        if (!label.length) {
            label = as.String(props[Pid.Template]);
        }
        if (label.length) {
            this.elem.append(DomUtils.elemOfHtml(`<div class="title" data-translate="text:ItemLabel">${as.Html(label)}</div>`));
        }

        const description = as.String(props[Pid.Description]);
        if (description.length) {
            this.elem.append(DomUtils.elemOfHtml(`<div class="description">${as.Html(description)}</div>`));
        }

        const displayProps = ItemProperties.getDisplay(props);
        if (this.roomItem.isMyItem()) {
            displayProps[Pid.OwnerName] = 'You';
        } else {
            displayProps[Pid.OwnerName] = this.roomItem.getOwnerName();
        }

        const listElem = DomUtils.elemOfHtml('<div class="itemprops" data-translate="children"></div>');
        for (const [pid, value] of Object.entries(displayProps).filter(([_, value]) => is.nonEmptyString(value))) {
            listElem.append(DomUtils.elemOfHtml(`<span class="label" data-translate="text:ItemPid">${as.Html(pid)}</span>`));
            listElem.append(DomUtils.elemOfHtml(`<span class="value" data-translate="text:ItemValue" title="${as.Html(value)}">${as.Html(value)}</span>`));
        }
        this.elem.append(listElem);

        this.app.translateElem(this.elem);
        this.updateGeometry();
    }

    public updateGeometry(): void
    {
        (async () => {
            await DomUtils.waitForRenderComplete();
            const container = this.app.getDisplay();
            const roomItemElem = this.roomItem.getElem();
            if (!container || !roomItemElem || !this.elem) {
                return;
            }
            const containerMarginTop    = as.Int(Config.get('system.windowContainerMarginTop'), 0);
            const containerMarginRight  = as.Int(Config.get('system.windowContainerMarginRight'), 0);
            const containerMarginBottom = as.Int(Config.get('system.windowContainerMarginBottom'), 0);
            const containerMarginLeft   = as.Int(Config.get('system.windowContainerMarginLeft'), 0);
            const containerRect = container.getBoundingClientRect();
            const itemRect = roomItemElem.getBoundingClientRect();
            const ourRect = this.elem.getBoundingClientRect();
            const bottom = itemRect.height + as.Int(Config.get('roomItem.statsPopupOffset', 0));
            const left = as.Int(itemRect.left - ourRect.width / 2);
            const geometry = Utils.fitLeftBottomRect(
                { left, bottom, width: ourRect.width, height: ourRect.height },
                containerRect.width, containerRect.height, 1, 1,
                containerMarginLeft, containerMarginRight, containerMarginTop, containerMarginBottom,
            );
            this.elem.style.bottom = `${geometry.bottom}px`;
            this.elem.style.left = `${geometry.left}px`;
        })().catch(error => this.app.onError(error));
    }

}
