import * as $ from 'jquery';
import 'webpack-jquery-ui';
import { xml, jid } from '@xmpp/client';
import log = require('loglevel');
import { as } from '../lib/as';
import { Config } from '../lib/Config';
import { Utils } from '../lib/Utils';
import { ContentApp } from './ContentApp';
import { Window } from './Window';
import { _Changes } from '../lib/_Changes';

export class ChangesWindow extends Window
{
    private outElem: HTMLElement;

    constructor(app: ContentApp)
    {
        super(app);
    }

    async show(options: any)
    {
        options.titleText = this.app.translateText('ChangesWindow.Changes', 'Change History');
        options.resizable = true;

        super.show(options);

        let bottom = as.Int(options.bottom, 400);
        let width = as.Int(options.width, 600);
        let height = as.Int(options.height, 600);
        let onClose = options.onClose;

        if (this.windowElem) {
            let windowElem = this.windowElem;
            let contentElem = this.contentElem;
            $(windowElem).addClass('n3q-changeswindow');

            let left = 50;
            let top = this.app.getDisplay().offsetHeight - height - bottom;
            {
                let minTop = 10;
                if (top < minTop) {
                    top = minTop;
                }
            }

            let outElem = <HTMLElement>$('<div class="n3q-base n3q-changeswindow-out" data-translate="children" />').get(0);

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
        _Changes.data.forEach(release =>
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
        let lineElem = <HTMLElement>$(
            `<div class="n3q-base n3q-changeswindow-line">
                <span class="n3q-base n3q-text n3q-changeswindow-text">`+ as.HtmlWithClickableLinks(text) + `</span>
            <div>`
        ).get(0);

        if (this.outElem) {
            $(this.outElem).append(lineElem).scrollTop($(this.outElem).get(0).scrollHeight);
        }
    }
}
