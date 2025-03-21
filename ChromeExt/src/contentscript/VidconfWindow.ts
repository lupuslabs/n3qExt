import { ContentApp } from './ContentApp';
import { FullWindow, FullWindowOptions } from './FullWindow';
import { Config } from '../lib/Config';
import { DomUtils } from '../lib/DomUtils'
import { PopupDefinition } from '../lib/BackgroundMessage'

export type VidconfWindowOptions = FullWindowOptions & {
    url: string,
};

export class VidconfWindow extends FullWindow<VidconfWindowOptions>
{
    protected popupId: string;
    private url: string;

    public constructor(app: ContentApp)
    {
        super(app);
        this.windowSettingsId = 'Vidconf';
        this.persistGeometry = true;
        this.windowCssClasses.push('vidconfwindow');
        this.titleText = 'Video Conference';
        this.titleTextId = 'Vidconfwindow.Video Conference';
        this.minWidth = 180;
        this.minHeight = 180;
        this.defaultWidth = 600;
        this.defaultHeight = 400;
        this.defaultBottom = 200;
        this.defaultLeft = 50;

        this.popupId = 'room.vidconfUndocked:' + (app.getRoom()?.getJid() ?? '');
    }

    protected prepareMakeDom(): void
    {
        super.prepareMakeDom();
        this.url = encodeURI(this.givenOptions.url);
    }

    protected async makeContent(): Promise<void>
    {
        await super.makeContent();
        const urlWrapped = this.app.uiHelper.getWrappedIframeUrl(this.url);
        const iframeElem = DomUtils.elemOfHtml(`<iframe src="${urlWrapped}" allow="camera; microphone; fullscreen; display-capture"></iframe>`);
        this.contentElem.append(iframeElem);
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
