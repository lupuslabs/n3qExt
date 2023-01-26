import log = require('loglevel');
import { as } from '../lib/as';
import { Utils } from '../lib/Utils';
import { ContentApp } from './ContentApp';
import { Window, WindowOptions } from './Window';
import { Pid } from '../lib/ItemProperties';
import { Config } from '../lib/Config';
import { domHtmlElemOfHtml } from '../lib/domTools'
import { RoomItem } from './RoomItem'

export type ItemFrameWindowOptions = WindowOptions & {
    above: HTMLElement,
    url: string,
    resizable?: boolean,
    undockable?: boolean,
    hidden?: boolean,
    transparent?: boolean, // Not implemented on ItemFrameWindow.
    onClose?: () => void,
    titleText: string,
}

export class ItemFrameWindow extends Window<ItemFrameWindowOptions>
{
    protected readonly item: RoomItem;
    protected iframeElem: HTMLIFrameElement;
    private url: string;
    private width = 400;
    private height = 400;

    public constructor(app: ContentApp, item: RoomItem)
    {
        super(app);
        this.item = item;
    }

    public getIframeElem(): null|HTMLIFrameElement {
        return this.iframeElem;
    }

    protected prepareMakeDom(): void
    {
        super.prepareMakeDom();
        this.titleText = this.givenOptions.titleText;
        this.isResizable = as.Bool(this.givenOptions.resizable);
        this.minWidth = 180;
        this.minHeight = 100;
        this.isUndockable = as.Bool(this.givenOptions.undockable);

        const url: string = as.String(this.givenOptions.url);
        if (!url.length) {
            throw new Error('ItemFrameWindow.show: No url given!');
        }
        this.url = url; // member for undock
        this.width = as.Int(this.givenOptions.width, this.width); // member for undock
        this.height = as.Int(this.givenOptions.height, this.height); // member for undock

        const json = as.String(this.item.getProperties()[Pid.IframeOptions], '{}');
        const iframeOptions = JSON.parse(json);
        this.closeIsHide = as.Bool(iframeOptions.closeIsHide, false);
    }

    protected async makeContent(): Promise<void>
    {
        await super.makeContent();

        if (Utils.logChannel('iframeApi', true)) {
            log.info('ItemFrameWindow.makeContent', this.url);
        }

        this.windowElem.classList.add('n3q-itemframewindow');

        this.iframeElem = <HTMLIFrameElement>domHtmlElemOfHtml(`<iframe class="n3q-base n3q-itemframewindow-content" src="${this.url}" frameborder="0" allow="camera; microphone; fullscreen; display-capture"></iframe>`);

        if (this.givenOptions.hidden) {
            this.setVisibility(false);
        }

        this.contentElem.append(this.iframeElem);
    }

    public position(width: number, height: number, left: number, bottom: number): void
    {

        const offset = this.givenOptions.above.getBoundingClientRect();
        left += offset.left;
        this.setGeometry({ left, bottom, width, height });
    }

    protected undock(): void
    {
        const left = Config.get('roomItem.frameUndockedLeft', 100);
        const top = Config.get('roomItem.frameUndockedTop', 100);
        const width = this.width;
        const height = this.height;
        const params = `scrollbars=no,resizable=yes,status=no,location=no,toolbar=no,menubar=no,width=${width},height=${height},left=${left},top=${top}`;

        const url = this.url;

        this.close();

        const undocked = window.open(url, Utils.randomString(10), params);
        undocked.focus();
    }
}
