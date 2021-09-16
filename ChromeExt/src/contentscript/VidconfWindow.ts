import * as $ from 'jquery';
import 'webpack-jquery-ui';
import log = require('loglevel');
import { as } from '../lib/as';
import { ContentApp } from './ContentApp';
import { Window } from './Window';
import { Config } from '../lib/Config';
import { Utils } from '../lib/Utils';

export class VidconfWindow extends Window
{
    private url: string;
    private title: string;

    constructor(app: ContentApp)
    {
        super(app);
    }

    async show(options: any)
    {
        options = await this.getSavedOptions('Vidconf', options);

        options.titleText = this.app.translateText('Vidconfwindow.Video Conference', 'Video Conference');
        options.resizable = true;
        options.undockable = true;

        super.show(options);

        let aboveElem: HTMLElement = options.above;
        let bottom = as.Int(options.bottom, Config.get('room.vidconfBottom', 200));
        let width = as.Int(options.width, Config.get('room.vidconfWidth', 600));
        let height = as.Int(options.height, Config.get('room.vidconfHeight', 400));

        if (this.windowElem) {
            let windowElem = this.windowElem;
            let contentElem = this.contentElem;
            $(windowElem).addClass('n3q-vidconfwindow');

            let left = as.Int(options.left, 50);
            if (options.left == null) {
                if (aboveElem) {
                    left = Math.max(aboveElem.offsetLeft - 250, left);
                }
            }
            let top = this.app.getDisplay().offsetHeight - height - bottom;
            {
                let minTop = 10;
                if (top < minTop) {
                    height -= minTop - top;
                    top = minTop;
                }
            }

            this.title = options.titleText; // member for undock
            this.url = options.url; // member for undock

            this.url = encodeURI(this.url);
            let iframeElem = <HTMLElement>$('<iframe class="n3q-base n3q-vidconfwindow-content" src="' + this.url + ' " frameborder="0" allow="camera; microphone; fullscreen; display-capture"></iframe>').get(0);

            $(contentElem).append(iframeElem);

            this.app.translateElem(windowElem);

            this.onResizeStop = (ev: JQueryEventObject, ui: JQueryUI.ResizableUIParams) =>
            {
                let left = ui.position.left;
                let bottom = this.app.getDisplay().offsetHeight - (ui.position.top + ui.size.height);
                this.saveCoordinates(left, bottom, ui.size.width, ui.size.height);
            };

            this.onDragStop = (ev: JQueryEventObject, ui: JQueryUI.DraggableEventUIParams) =>
            {
                let size = { width: $(this.windowElem).width(), height: $(this.windowElem).height() }
                let left = ui.position.left;
                let bottom = this.app.getDisplay().offsetHeight - (ui.position.top + size.height);
                this.saveCoordinates(left, bottom, size.width, size.height);
            };

            $(windowElem).css({ 'width': width + 'px', 'height': height + 'px', 'left': left + 'px', 'top': top + 'px' });
        }
    }

    undock(): void
    {
        let left = Config.get('room.vidconfUndockedLeft', 100);
        let top = Config.get('room.vidconfUndockedTop', 100);
        let width = Config.get('room.vidconfWidth', 600);
        let height = Config.get('room.vidconfHeight', 400);
        let params = 'scrollbars=no,resizable=yes,status=no,location=no,toolbar=no,menubar=no,width=' + width + ',height=' + height + ',left=' + left + ',top=' + top + '';

        let url = this.url;
        let title = this.title;

        this.close();
        let undocked = window.open(url, Utils.randomString(10), params);
        undocked.focus();

        // let undocked = window.open('about:blank', Utils.randomString(10), params);
        // undocked.onload = function ()
        // {
        //     let html = 
        //     '<iframe'
        //     + ' src="' + url 
        //     + ' " frameborder="0"'
        //     + ' allow="camera; microphone; fullscreen; display-capture"'
        //     + ' style="position: absolute; left: 0; right: 0; bottom: 0; top: 0; width: 100%; height: 100%;"'
        //     + '></iframe>'
        //     ;
        //     undocked.document.body.insertAdjacentHTML('afterbegin', html);
        //     undocked.document.title = title;
        // };
    }

    async saveCoordinates(left: number, bottom: number, width: number, height: number)
    {
        await this.saveOptions('Vidconf', { 'left': left, 'bottom': bottom, 'width': width, 'height': height });
    }

    isOpen(): boolean
    {
        return this.windowElem != null;
    }
}
