import * as $ from 'jquery';
import 'webpack-jquery-ui';
import { as } from '../lib/as';
import { ContentApp } from './ContentApp';
import { Window, WindowOptions } from './Window';
import { Config } from '../lib/Config';
import { Utils } from '../lib/Utils';
import { is } from '../lib/is';

export class VidconfWindow extends Window
{
    private url: string;
    private title: string;

    constructor(app: ContentApp)
    {
        super(app);
    }

    async show(options: WindowOptions)
    {
        options = await this.getSavedOptions('Vidconf', options);

        options.titleText = this.app.translateText('Vidconfwindow.Video Conference', 'Video Conference');
        options.resizable = true;
        options.undockable = true;

        super.show(options);

        const aboveElem: HTMLElement = options.above;
        let bottom = as.Int(options.bottom ?? Config.get('room.vidconfBottom'), 200);
        let width = as.Int(options.width ?? Config.get('room.vidconfWidth'), 600);
        let height = as.Int(options.height ?? Config.get('room.vidconfHeight'), 400);

        if (this.windowElem) {
            const windowElem = this.windowElem;
            const contentElem = this.contentElem;
            $(windowElem).addClass('n3q-vidconfwindow');

            let left = as.Int(options.left, 50);
            if (is.nil(options.left)) {
                if (aboveElem) {
                    left = Math.max(aboveElem.offsetLeft - 250, left);
                }
            }
            [left, bottom, width, height] = this.setPosition(left, bottom, width, height);
            this.saveCoordinates(left, bottom, width, height).catch(error => this.app.onError(error));

            this.title = options.titleText; // member for undock
            this.url = options.url; // member for undock

            this.url = encodeURI(this.url);
            const iframeElem = <HTMLElement>$('<iframe class="n3q-base n3q-vidconfwindow-content" src="' + this.url + ' " frameborder="0" allow="camera; microphone; fullscreen; display-capture"></iframe>').get(0);

            $(contentElem).append(iframeElem);

            this.app.translateElem(windowElem);

            this.onResizeStop = (ev: JQueryEventObject, ui: JQueryUI.ResizableUIParams) =>
            {
                const left = ui.position.left;
                const bottom = this.app.getDisplay().offsetHeight - (ui.position.top + ui.size.height);
                this.saveCoordinates(left, bottom, ui.size.width, ui.size.height);
            };

            this.onDragStop = (ev: JQueryEventObject, ui: JQueryUI.DraggableEventUIParams) =>
            {
                const size = { width: $(this.windowElem).width(), height: $(this.windowElem).height() };
                const left = ui.position.left;
                const bottom = this.app.getDisplay().offsetHeight - (ui.position.top + size.height);
                this.saveCoordinates(left, bottom, size.width, size.height);
            };
        }
    }

    undock(): void
    {
        const left = Config.get('room.vidconfUndockedLeft', 100);
        const top = Config.get('room.vidconfUndockedTop', 100);
        const width = Config.get('room.vidconfWidth', 600);
        const height = Config.get('room.vidconfHeight', 400);
        const params = 'scrollbars=no,resizable=yes,status=no,location=no,toolbar=no,menubar=no,width=' + width + ',height=' + height + ',left=' + left + ',top=' + top + '';

        const url = this.url;

        this.close();
        const undocked = window.open(url, Utils.randomString(10), params);
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
        //     undocked.document.title = this.title;
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
