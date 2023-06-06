import { ContentApp } from './ContentApp';
import { Window, WindowOptions } from './Window';
import { Config } from '../lib/Config';
import { Utils } from '../lib/Utils';
import { DomUtils } from '../lib/DomUtils'

export type VidconfWindowOptions = WindowOptions & {
    url: string,
};

export class VidconfWindow extends Window<VidconfWindowOptions>
{
    private url: string;

    public constructor(app: ContentApp)
    {
        super(app);
        this.windowName = 'Vidconf';
        this.isResizable = true;
        this.persistGeometry = true;
        this.isUndockable = true;
    }

    protected prepareMakeDom(): void
    {
        super.prepareMakeDom();
        this.titleText = this.app.translateText('Vidconfwindow.Video Conference', 'Video Conference');
        this.minWidth = 180;
        this.minHeight = 180;
        this.defaultWidth = 600;
        this.defaultHeight = 400;
        this.defaultBottom = 200;
        this.defaultLeft = 50;
    }

    protected async makeContent(): Promise<void>
    {
        await super.makeContent();
        this.url = encodeURI(this.givenOptions.url);

        const windowElem = this.windowElem;
        const contentElem = this.contentElem;
        windowElem.classList.add('n3q-vidconfwindow');

        const iframeElem = DomUtils.elemOfHtml(`<iframe class="n3q-base n3q-vidconfwindow-content" src="${this.url}" frameborder="0" allow="camera; microphone; fullscreen; display-capture"></iframe>`);

        contentElem.append(iframeElem);
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
        //     undocked.document.title = this.titleText;
        // };
    }

}
