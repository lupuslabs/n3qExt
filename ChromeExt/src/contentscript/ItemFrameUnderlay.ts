import * as $ from 'jquery';
import 'webpack-jquery-ui';
import log = require('loglevel');
import { as } from '../lib/as';
import { Point2D, Utils } from '../lib/Utils';
import { Pid } from '../lib/ItemProperties';
import { Config } from '../lib/Config';
import { ContentApp } from './ContentApp';
import { RoomItem } from './RoomItem';

type PopupOptions = any;

export class ItemFrameUnderlay
{
    private elem: HTMLElement = null;
    private url = 'about:blank';
    private iframeId: string;

    constructor(app: ContentApp, protected roomItem: RoomItem)
    {
    }

    show()
    {
        try {
            this.url = as.String(this.roomItem.getProperties()[Pid.ScreenUrl], 'about:blank');
            let options = as.String(this.roomItem.getProperties()[Pid.ScreenOptions], '{}');
            let css = JSON.parse(options);
            this.iframeId = Utils.randomString(15);

            this.elem = <HTMLElement>$('<iframe id="' + this.iframeId + '" class="n3q-base n3q-itemframepopunder-content" src="' + this.url + ' " frameborder="0" allow="autoplay; encrypted-media"></iframe>').get(0);
            $(this.elem).css(css);

            let avatar = this.roomItem.getAvatar();
            if (avatar) {
                $(avatar.getElem()).prepend(this.elem);
            }
        } catch (error) {
            log.info('ItemFrameUnderlay', error);
        }
    }

    update()
    {
        let url = as.String(this.roomItem.getProperties()[Pid.ScreenUrl], 'about:blank');
        if (url != this.url) {
            this.url = url;
            $(this.elem).attr('src', this.url);
        }
    }

    sendMessage(message: any)
    {
        let iframeElem = <HTMLIFrameElement>$('#' + this.iframeId).get(0);
        let iframeWindow = iframeElem.contentWindow;

        message[Config.get('iframeApi.messageMagic2Screen', 'uzv65b76t_weblin2screen')] = true;
        iframeWindow.postMessage(message, '*');
    }
}
