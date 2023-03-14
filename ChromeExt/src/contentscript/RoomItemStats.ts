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
        this.elem = DomUtils.elemOfHtml('<div class="n3q-base n3q-itemprops n3q-roomitemstats n3q-shadow-small" data-translate="children"></div>');
        const hasStats = this.update();
        if (!hasStats) {
            return;
        }
        this.app.getDisplay().append(this.elem);
        this.app.toFront(this.elem, ContentApp.LayerEntityTooltip);
        this.elem.style.opacity = '0';
        const transition = { property: 'opacity', duration: '200ms' };
        DomUtils.startElemTransition(this.elem, null, transition, '1');
    }

    public close(): void
    {
        this.elem?.remove();
        this.onClose?.();
    }

    public update(): boolean
    {
        this.elem.innerHTML = '';

        let props = this.roomItem.getProperties();

        let label = as.String(props[Pid.Label]);
        if (!label.length) {
            label = as.String(props[Pid.Template]);
        }
        if (label) {
            let labelElem = DomUtils.elemOfHtml('<div class="n3q-base n3q-title" data-translate="text:ItemLabel">' + label + '</div>');
            this.elem.append(labelElem);
        }

        let description = as.String(props[Pid.Description], '');
        if (description.length) {
            let descriptionElem = DomUtils.elemOfHtml('<div class="n3q-base n3q-description">' + description + '</div>');
            this.elem.append(descriptionElem);
        }

        let display = ItemProperties.getDisplay(props);

        // if (as.Bool(props[Pid.IsRezzed], false)) {
        //     display[Pid.IsRezzed] = props[Pid.IsRezzed];
        //     display[Pid.RezzedDestination] = props[Pid.RezzedDestination];
        // }

        if (this.roomItem.isMyItem()) {
            display[Pid.OwnerName] = 'You';
        } else {
            display[Pid.OwnerName] = this.roomItem.getOwnerName();
        }

        let listElem = DomUtils.elemOfHtml('<div class="n3q-base n3q-itemprops-list" data-translate="children"></div>');
        let hasStats = description !== '';
        for (let pid in display) {
            let value = display[pid];
            if (value) {
                hasStats = true;
                let lineElem = DomUtils.elemOfHtml('<div class="n3q-base n3q-itemprops-line" data-translate="children">'
                    + '<span class="n3q-base n3q-itemprops-key" data-translate="text:ItemPid">'
                    + pid + '</span><span class="n3q-base n3q-itemprops-value" data-translate="text:ItemValue" title="'
                    + as.Html(value) + '">'
                    + as.Html(value) + '</span>'
                    + '</div>');
                listElem.append(lineElem);
            }
        }
        if (hasStats) {
            this.elem.append(listElem);
        }

        this.app.translateElem(this.elem);

        if (hasStats) {
            this.updateGeometry();
        }
        return hasStats;
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
