import * as $ from 'jquery';
import '../popup/popup.scss';
import 'webpack-jquery-ui';
import log = require('loglevel');
import { as } from '../lib/as';
import { Config } from '../lib/Config';
import { Environment } from '../lib/Environment';
import { PopupApp } from '../popup/PopupApp';
import { ContentApp } from './ContentApp';
import { Room } from './Room';
import { Window } from './Window';

export class SettingsWindow extends Window
{
    constructor(app: ContentApp)
    {
        super(app);
    }

    async show(options: any)
    {
        options.titleText = this.app.translateText('Settingswindow.Settings', 'Settings');
        options.resizable = false;

        super.show(options);

        let aboveElem: HTMLElement = options.above;
        let bottom = as.Int(options.bottom, 150);
        let width = as.Int(options.width, 420);
        let height = as.Int(options.height, 350);

        if (this.windowElem) {
            let windowElem = this.windowElem;
            let contentElem = this.contentElem;
            $(windowElem).addClass('n3q-settingswindow');

            let left = 50;
            if (aboveElem) {
                left = Math.max(aboveElem.offsetLeft - 180, left);
            }
            let top = this.app.getDisplay().offsetHeight - height - bottom;
            {
                let minTop = 10;
                if (top < minTop) {
                    top = minTop;
                }
            }

            // let uri = Environment.isEmbedded() ? 'popup.html' : 'chrome-extension://' + chrome.runtime.id + '/popup.html';
            // let iframeElem = <HTMLElement>$('<iframe class="n3q-base n3q-settingswindow-content" style="width: 420px; height: 380px;" src="' + uri + ' " frameborder="0"></iframe>').get(0);
            // $(contentElem).append(iframeElem);
            // this.app.translateElem(windowElem);

            let popup = new PopupApp(contentElem);
            await popup.start(() => this.close());

            $(windowElem).css({ 'width': width + 'px', 'height': height + 'px', 'left': left + 'px', 'top': top + 'px' });
        }
    }

    isOpen(): boolean
    {
        return this.windowElem != null;
    }
}
