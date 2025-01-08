import { ContentApp } from './ContentApp';
import { Window, WindowOptions } from './Window';
import { Config } from '../lib/Config';
import { DomUtils } from '../lib/DomUtils'
import { PopupDefinition } from '../lib/BackgroundMessage'

export type VidconfWindowOptions = WindowOptions & {
    url: string,
};

export class VidconfWindow extends Window<VidconfWindowOptions>
{
    protected popupId: string;
    private url: string;

    public constructor(app: ContentApp)
    {
        super(app);
        this.windowName = 'Vidconf';
        this.isResizable = true;
        this.persistGeometry = true;
        this.popupId = 'room.vidconfUndocked:' + (app.getRoom()?.getJid() ?? '');
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
        this.url = encodeURI(this.givenOptions.url);
    }

    protected async makeContent(): Promise<void>
    {
        await super.makeContent();

        const windowElem = this.windowElem;
        const contentElem = this.contentElem;
        windowElem.classList.add('n3q-vidconfwindow');

        const urlWrapped = this.app.getWrappedIframeUrl(this.url);
        const iframeElem = DomUtils.elemOfHtml(`<iframe class="n3q-base n3q-vidconfwindow-content" src="${urlWrapped}" frameborder="0" allow="camera; microphone; fullscreen; display-capture"></iframe>`);

        contentElem.append(iframeElem);
    }

    protected makeUndockPopupDefinition(): PopupDefinition
    {
        const popupDefinition: PopupDefinition = {
            id: this.popupId,
            url: this.url,
            top: Config.get('room.vidconfUndockedTop', 100),
            left: Config.get('room.vidconfUndockedLeft', 100),
            height: Config.get('room.vidconfHeight', 400),
            width: Config.get('room.vidconfWidth', 600),
            allowContentApp: true,
        }
        return popupDefinition
    }

}
