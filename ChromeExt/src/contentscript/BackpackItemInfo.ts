import * as $ from 'jquery';
import log = require('loglevel');
import { as } from '../lib/as';
import { Config } from '../lib/Config';
import { ItemProperties, Pid } from '../lib/ItemProperties';
import { BackpackItem } from './BackpackItem';
import { ContentApp } from './ContentApp';

export class BackpackItemInfo
{
    private elem: HTMLElement = null;

    getElem(): HTMLElement { return this.elem; }

    constructor(protected app: ContentApp, protected backpackItem: BackpackItem, protected onClose: () => void)
    {
    }

    show(x: number, y: number): void
    {
        if (this.elem == null) {
            this.setup();
        }

        let offset = Config.get('backpack.itemInfoOffset', { x: 4, y: 4 });
        x = x + offset.x;
        y = y + offset.y;

        $(this.elem).css({ left: x, top: y });
        this.app.toFront(this.elem, ContentApp.LayerWindowContent);
        // $(this.elem).stop().delay(Config.get('backpack.itemInfoDelay', 300)).show();
    }

    close(): void
    {
        $(this.elem).remove();
        if (this.onClose) { this.onClose(); }
    }

    setup(): void
    {
        this.elem = <HTMLDivElement>$('<div class="n3q-base n3q-itemprops n3q-backpackiteminfo n3q-shadow-small" data-translate="children" />').get(0);

        // Fix (jquery?) bug: 
        // Uncaught TypeError: Cannot read property 'ownerDocument' of undefined
        // at jQuery.fn.init.$.fn.scrollParent (scroll-parent.js:41)
        $(this.elem).on('mousemove', ev => { ev.stopPropagation(); });

        this.update();

        $(this.getElem()).on({
            click: (ev) => 
            {
                ev.stopPropagation();
            }
        });

        $(this.backpackItem.getElem()).append(this.elem);
    }

    update(): void
    {
        $(this.elem).empty();

        let closeElem = <HTMLElement>$('<div class="n3q-base n3q-overlay-button n3q-shadow-small" title="Close" data-translate="attr:title:Common"><div class="n3q-base n3q-button-symbol n3q-button-close-small" />').get(0);
        $(closeElem).on('click', ev =>
        {
            this.close();
            ev.stopPropagation();
        });
        $(this.elem).append(closeElem);

        let props = this.backpackItem.getProperties();

        let label = as.String(props[Pid.Label], null);
        if (label == null) {
            let label = as.String(props[Pid.Template], null);
        }
        if (label) {
            let labelElem = <HTMLDivElement>$('<div class="n3q-base n3q-title" data-translate="text:ItemLabel">' + label + '</div>').get(0);
            $(this.elem).append(labelElem);
        }

        let description = as.String(props[Pid.Description], null);
        if (description) {
            let descriptionElem = <HTMLDivElement>$('<div class="n3q-base n3q-description">' + description + '</div>').get(0);
            $(this.elem).append(descriptionElem);
        }

        let display = ItemProperties.getDisplay(props);

        if (as.Bool(props[Pid.IsRezzed], false)) {
            display[Pid.IsRezzed] = props[Pid.IsRezzed];
            display[Pid.RezzedDestination] = props[Pid.RezzedDestination];
        }

        let listElem = <HTMLDivElement>$('<div class="n3q-base n3q-itemprops-list" data-translate="children" />').get(0);
        let hasStats = false;
        for (let pid in display) {
            let value = display[pid];
            if (value) {
                hasStats = true;

                if (pid == Pid.RezzedDestination) {
                    if (value.startsWith('http://')) { value = value.substr('http://'.length); }
                    if (value.startsWith('https://')) { value = value.substr('https://'.length); }
                    if (value.startsWith('www.')) { value = value.substr('www.'.length); }
                }

                let lineElem = <HTMLDivElement>$(''
                    + '<div class="n3q-base n3q-itemprops-line" data-translate="children" > '
                    + '<span class="n3q-base n3q-itemprops-key" data-translate="text:ItemPid">' + pid + '</span>'
                    + '<span class="n3q-base n3q-itemprops-value" data-translate="text:ItemValue" title="' + as.Html(value) + '">' + as.Html(value) + '</span>'
                    + '</div>')
                    .get(0);
                $(listElem).append(lineElem);
            }
        }

        if (hasStats) {
            $(this.elem).append(listElem);
        }

        if (as.Bool(props[Pid.IsRezzed], false)) {
            let derezElem = <HTMLElement>$('<div class="n3q-base n3q-button n3q-backpack-derez" data-translate="text:Backpack">Derez item</div>').get(0);
            $(derezElem).on('click', (ev) =>
            {
                ev.stopPropagation();
                this.backpackItem.derezItem();
                this.close();
            });
            $(this.elem).append(derezElem);

            let destination = as.String(props[Pid.RezzedDestination], null);
            if (destination) {
                let goElem = <HTMLElement>$('<div class="n3q-base n3q-button n3q-backpack-go" data-translate="text:Backpack">Go to item</div>').get(0);
                $(goElem).on('click', (ev) =>
                {
                    ev.stopPropagation();
                    window.location.assign(destination);
                });
                $(this.elem).append(goElem);
            }
        } else {
            if (as.Bool(props[Pid.IsRezable], true)) {
                let rezElem = <HTMLElement>$('<div class="n3q-base n3q-button n3q-backpack-rez" data-translate="text:Backpack">Rez item</div>').get(0);
                $(rezElem).on('click', (ev) =>
                {
                    ev.stopPropagation();
                    this.backpackItem.rezItem(-1);
                    this.close();
                });
                $(this.elem).append(rezElem);
            }
        }

        if (Config.get('backpack.itemInfoExtended', false)) {
            this.extend();
        }

        this.app.translateElem(this.elem);
    }

    extend(): void
    {
        let props = this.backpackItem.getProperties();

        let keys = [];
        for (let pid in props) { keys.push(pid); }
        keys = keys.sort();

        let completeListElem = <HTMLDivElement>$('<div class="n3q-base n3q-itemprops-list" data-translate="children" />').get(0);
        for (let i in keys) {
            let pid = keys[i]
            let value = props[pid];
            let lineElem = <HTMLDivElement>$(''
                + '<div class="n3q-base n3q-itemprops-line">'
                + '<span class="n3q-base n3q-itemprops-key">' + pid + '</span>'
                + '<span class="n3q-base n3q-itemprops-value" title="' + as.Html(value) + '">' + as.Html(value) + '</span>'
                + '</div>')
                .get(0);
            $(completeListElem).append(lineElem);
            $(this.elem).css({ maxWidth: '400px', width: '400px' });

        }
        $(this.elem).append(completeListElem);
    }
}
