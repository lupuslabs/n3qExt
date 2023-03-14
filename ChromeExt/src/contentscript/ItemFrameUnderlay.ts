import * as $ from 'jquery';
import log = require('loglevel');
import { as } from '../lib/as';
import { Utils } from '../lib/Utils';
import { Pid } from '../lib/ItemProperties';
import { Config } from '../lib/Config';
import { ContentApp } from './ContentApp';
import { RoomItem } from './RoomItem';
import { DomUtils } from '../lib/DomUtils'

export class ItemFrameUnderlay
{
    private elem: HTMLIFrameElement = null;
    private url = 'about:blank';
    private iframeId: string;

    public constructor(app: ContentApp, protected roomItem: RoomItem)
    {
    }

    public show(): void
    {
        try {
            this.url = as.String(this.roomItem.getProperties()[Pid.ScreenUrl], 'about:blank');
            let options = as.String(this.roomItem.getProperties()[Pid.ScreenOptions], '{}');
            let css = JSON.parse(options);
            this.iframeId = Utils.randomString(15);

            this.elem = <HTMLIFrameElement> DomUtils.elemOfHtml(`<iframe id="${this.iframeId}" class="n3q-base n3q-itemframepopunder-content" src="${this.url}" frameborder="0" allow="autoplay; encrypted-media"></iframe>`);
            $(this.elem).css(css);

            let avatar = this.roomItem.getAvatar();
            if (avatar) {
                avatar.getElem().prepend(this.elem);
            }
        } catch (error) {
            log.info('ItemFrameUnderlay', error);
        }
    }

    public update(): void
    {
        let url = as.String(this.roomItem.getProperties()[Pid.ScreenUrl], 'about:blank');
        if (url !== this.url) {
            this.url = url;
            this.elem.setAttribute('src', this.url);
        }
    }

    public sendMessage(message: any): void
    {
        message[Config.get('iframeApi.messageMagic2Screen', 'uzv65b76t_weblin2screen')] = true;
        this.elem.contentWindow.postMessage(message, '*');
    }
}
