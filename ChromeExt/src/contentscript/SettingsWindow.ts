import '../popup/popup.scss';
import { PopupApp } from '../popup/PopupApp';
import { ContentApp } from './ContentApp';
import { Window, WindowOptions } from './Window';

export class SettingsWindow extends Window<WindowOptions>
{
    public constructor(app: ContentApp)
    {
        super(app);
        this.isResizable = true;
    }

    protected prepareMakeDom(): void
    {
        super.prepareMakeDom();
        this.titleText = this.app.translateText('Settingswindow.Settings', 'Settings');
        this.defaultWidth = 420;
        this.defaultHeight = 495;
        this.defaultBottom = 150;
        this.defaultLeft = 50;
    }

    protected async makeContent(): Promise<void>
    {
        await super.makeContent();
        this.windowElem.classList.add('n3q-settingswindow');

        const popup = new PopupApp(this.contentElem);
        await popup.start(() => this.close());
    }

}
