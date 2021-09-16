import * as $ from 'jquery';
import log = require('loglevel');
import { as } from '../lib/as';
import { Config } from '../lib/Config';
import { ItemProperties, Pid } from '../lib/ItemProperties';
import { ContentApp } from './ContentApp';
import { RoomItem } from './RoomItem';

export class RoomItemStats
{
    private elem: HTMLElement = null;

    constructor(protected app: ContentApp, protected roomItem: RoomItem, protected onClose: () => void)
    {
    }

    show(): void
    {
        if (this.elem == null) {
            this.setup();

            let bottom = 70;
            if (this.roomItem) {
                let itemHeight = $(this.roomItem.getAvatar().getElem()).height();
                bottom = itemHeight + Config.get('roomItem.statsPopupOffset', 0);
            }
            $(this.elem).css({ bottom: bottom + 'px' });
        }

        this.app.toFront(this.elem, ContentApp.LayerEntityTooltip);
        $(this.elem).stop().delay(Config.get('room.itemStatsTooltipDelay', 500)).fadeIn('fast');
    }

    close(): void
    {
        $(this.elem).remove();
        if (this.onClose) { this.onClose(); }
    }

    setup(): void
    {
        this.elem = <HTMLDivElement>$('<div class="n3q-base n3q-itemprops n3q-roomitemstats n3q-shadow-small" data-translate="children" />').get(0);
        $(this.elem).css({ display: 'none' });

        let hasStats = this.update();

        if (hasStats) {
            $(this.roomItem.getElem()).append(this.elem);
        }
    }

    update(): boolean
    {
        $(this.elem).empty();

        let props = this.roomItem.getProperties();

        let label = as.String(props[Pid.Label], null);
        if (label == null) {
            let label = as.String(props[Pid.Template], null);
        }
        if (label) {
            let labelElem = <HTMLDivElement>$('<div class="n3q-base n3q-title" data-translate="text:ItemLabel">' + label + '</div>').get(0);
            $(this.elem).append(labelElem);
        }

        let description = as.String(props[Pid.Description], '');
        if (description != '') {
            let descriptionElem = <HTMLDivElement>$('<div class="n3q-base n3q-description">' + description + '</div>').get(0);
            $(this.elem).append(descriptionElem);
        }

        let display = ItemProperties.getDisplay(props);

        // if (as.Bool(props[Pid.IsRezzed], false)) {
        //     display[Pid.IsRezzed] = props[Pid.IsRezzed];
        //     display[Pid.RezzedDestination] = props[Pid.RezzedDestination];
        // }

        let listElem = <HTMLDivElement>$('<div class="n3q-base n3q-itemprops-list" data-translate="children" />').get(0);
        let hasStats = false;
        for (let pid in display) {
            let value = display[pid];
            if (value) {
                hasStats = true;
                let lineElem = <HTMLDivElement>$('<div class="n3q-base n3q-itemprops-line" data-translate="children">'
                    + '<span class="n3q-base n3q-itemprops-key" data-translate="text:ItemPid">'
                    + pid + '</span><span class="n3q-base n3q-itemprops-value" data-translate="text:ItemValue" title="'
                    + as.Html(value) + '">'
                    + as.Html(value) + '</span>'
                    + '</div>').get(0);
                $(listElem).append(lineElem);
            }
        }
        if (hasStats) {
            $(this.elem).append(listElem);
        }

        this.app.translateElem(this.elem);

        return hasStats || description != '';
    }
}
