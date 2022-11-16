import * as $ from 'jquery';
import 'webpack-jquery-ui';
import { as } from '../lib/as';
import { ContentApp } from './ContentApp';
import { Window, WindowOptions } from './Window';
import { _Changes } from '../lib/_Changes';

export class ChangesWindow extends Window
{
    private outElem: HTMLElement;

    constructor(app: ContentApp)
    {
        super(app);
    }

    async show(options: WindowOptions)
    {
        options.titleText = this.app.translateText('ChangesWindow.Changes', 'Change History');
        options.resizable = true;

        super.show(options);

        const bottom = as.Int(options.bottom, 400);
        const width = as.Int(options.width, 600);
        const height = as.Int(options.height, 600);
        const onClose = options.onClose;

        if (this.windowElem) {
            const windowElem = this.windowElem;
            const contentElem = this.contentElem;
            $(windowElem).addClass('n3q-changeswindow');

            const left = 50;
            let top = this.app.getDisplay().offsetHeight - height - bottom;
            {
                const minTop = 10;
                if (top < minTop) {
                    top = minTop;
                }
            }

            const outElem = <HTMLElement>$('<div class="n3q-base n3q-changeswindow-out" data-translate="children" />').get(0);

            $(contentElem).append(outElem);

            this.app.translateElem(windowElem);

            this.outElem = outElem;

            $(windowElem).css({ 'width': width + 'px', 'height': height + 'px', 'left': left + 'px', 'top': top + 'px' });

            this.onClose = () =>
            {
                this.outElem = null;
                if (onClose) { onClose(); }
            };

            this.showHistory();
        }
    }

    showHistory()
    {
        _Changes.data.slice().reverse().forEach(release =>
        {
            this.showLine(release[0] + ' ' + release[1]);
            release[2].forEach(change =>
            {
                { this.showLine(change[0] + ' ' + change[1]); }
            });
            this.showLine('.');
        });
    }

    public showLine(text: string)
    {
        const lineElem = <HTMLElement>$(
            `<div class="n3q-base n3q-changeswindow-line">
                <span class="n3q-base n3q-text n3q-changeswindow-text">`+ as.HtmlWithClickableLinks(text) + `</span>
            <div>`
        ).get(0);

        if (this.outElem) {
            $(this.outElem).append(lineElem).scrollTop($(this.outElem).get(0).scrollHeight);
        }
    }
}
