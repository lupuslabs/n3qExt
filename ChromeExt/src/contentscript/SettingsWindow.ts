import * as $ from 'jquery';
import '../popup/popup.scss';
import 'webpack-jquery-ui';
import { as } from '../lib/as';
import { PopupApp } from '../popup/PopupApp';
import { ContentApp } from './ContentApp';
import { Window, WindowOptions } from './Window';

export class SettingsWindow extends Window
{
    constructor(app: ContentApp)
    {
        super(app);
    }

    async show(options: WindowOptions)
    {
        options.titleText = this.app.translateText('Settingswindow.Settings', 'Settings');
        options.resizable = true;

        super.show(options);

        const aboveElem: HTMLElement = options.above;
        const bottom = as.Int(options.bottom, 150);
        const width = as.Int(options.width, 420);
        const height = as.Int(options.height, 490);

        if (this.windowElem) {
            const windowElem = this.windowElem;
            const contentElem = this.contentElem;
            $(windowElem).addClass('n3q-settingswindow');

            let left = 50;
            if (aboveElem) {
                left = Math.max(aboveElem.offsetLeft - 180, left);
            }
            let top = this.app.getDisplay().offsetHeight - height - bottom;
            {
                const minTop = 10;
                if (top < minTop) {
                    top = minTop;
                }
            }

            const popup = new PopupApp(contentElem);
            await popup.start(() => this.close());

            $(windowElem).css({ 'width': width + 'px', 'height': height + 'px', 'left': left + 'px', 'top': top + 'px' });
        }
    }

    isOpen(): boolean
    {
        return this.windowElem != null;
    }
}
