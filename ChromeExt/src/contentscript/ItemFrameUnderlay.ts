import log = require('loglevel');
import { is } from '../lib/is'
import { as } from '../lib/as';
import { Utils } from '../lib/Utils';
import { Pid } from '../lib/ItemProperties';
import { Config } from '../lib/Config';
import { ContentApp } from './ContentApp';
import { RoomItem } from './RoomItem';
import { DomUtils } from '../lib/DomUtils'

export class ItemFrameUnderlay
{
    private app: ContentApp;
    private roomItem: RoomItem;
    private elem: HTMLIFrameElement = null;
    private lastUrlTemplate = 'about:blank';
    private url = 'about:blank';
    private iframeId: string;

    public constructor(app: ContentApp, roomItem: RoomItem)
    {
        this.app = app;
        this.roomItem = roomItem;
    }

    public show(): void
    {
        try {
            this.iframeId = Utils.randomString(15);
            this.elem = <HTMLIFrameElement> DomUtils.elemOfHtml(`<iframe id="${this.iframeId}" class="popunder" src="${this.url}" allow="autoplay; encrypted-media"></iframe>`);

            const optionsJson = as.String(this.roomItem.getProperties()[Pid.ScreenOptions], '{}');
            const options = JSON.parse(optionsJson);
            for (const [poropName, rawValue] of Object.entries(options)) {
                // Only properties defined for ScreenOptions are: left, top, width, height.
                if (is.string(rawValue) || is.number(rawValue)) {
                    const value = DomUtils.prepareLengthValueForCss(rawValue);
                    this.elem.style.setProperty(poropName, value);
                }
            }

            this.update();

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
        const itemProps = this.roomItem.getProperties();
        const urlTemplate = as.String(itemProps[Pid.ScreenUrl], 'about:blank');
        if (urlTemplate === this.lastUrlTemplate) {
            return;
        }
        this.lastUrlTemplate = urlTemplate;
        const roomId = this.app.getRoom()?.getJid() ?? '';
        const frameUrl = this.app.itemFrameContexts.makeItemIframeUrl(roomId, itemProps, urlTemplate);
        this.url = this.app.uiHelper.getWrappedIframeUrl(frameUrl);
        this.elem.setAttribute('src', this.url);
    }

    public sendMessage(message: any): void
    {
        message[Config.get('iframeApi.messageMagic2Screen', 'uzv65b76t_weblin2screen')] = true;
        this.elem.contentWindow.postMessage(message, '*');
    }
}
