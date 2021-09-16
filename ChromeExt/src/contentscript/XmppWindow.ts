import * as $ from 'jquery';
import 'webpack-jquery-ui';
import { xml, jid } from '@xmpp/client';
import log = require('loglevel');
import { as } from '../lib/as';
import { Config } from '../lib/Config';
import { Utils } from '../lib/Utils';
import { ContentApp } from './ContentApp';
import { Window } from './Window';
import { Memory } from '../lib/Memory';

export class XmppWindow extends Window
{
    private outElem: HTMLElement;
    private inInputElem: HTMLElement;

    constructor(app: ContentApp)
    {
        super(app);
    }

    async show(options: any)
    {
        options.titleText = this.app.translateText('XmppWindow.Xmpp', 'XMPP');
        options.resizable = true;

        super.show(options);

        let bottom = as.Int(options.bottom, 400);
        let width = as.Int(options.width, 600);
        let height = as.Int(options.height, 600);
        let onClose = options.onClose;

        if (this.windowElem) {
            let windowElem = this.windowElem;
            let contentElem = this.contentElem;
            $(windowElem).addClass('n3q-xmppwindow');

            let left = 10;
            let top = this.app.getDisplay().offsetHeight - height - bottom;
            {
                let minTop = 10;
                if (top < minTop) {
                    //height -= minTop - top;
                    top = minTop;
                }
            }

            let outElem = <HTMLElement>$('<div class="n3q-base n3q-xmppwindow-out" data-translate="children" />').get(0);
            let inElem = <HTMLElement>$('<div class="n3q-base n3q-xmppwindow-in" data-translate="children" />').get(0);
            let inInputElem = <HTMLElement>$('<textarea class="n3q-base n3q-xmppwindow-in-input n3q-input n3q-text" />').get(0);
            let inSendElem = <HTMLElement>$('<div class="n3q-base n3q-absolutebutton n3q-xmppwindow-in-send" title="Send">Send</div>').get(0);
            let inSaveElem = <HTMLElement>$('<div class="n3q-base n3q-absolutebutton n3q-xmppwindow-in-save" title="Save">Save</div>').get(0);
            let outClearElem = <HTMLElement>$('<div class="n3q-base n3q-absolutebutton n3q-xmppwindow-out-clear" title="Clear">Clear</div>').get(0);

            $(inElem).append(inInputElem);

            $(contentElem).append(outElem);
            $(contentElem).append(inElem);
            $(contentElem).append(inSendElem);
            $(contentElem).append(inSaveElem);
            $(contentElem).append(outClearElem);

            this.app.translateElem(windowElem);

            this.inInputElem = inInputElem;
            this.outElem = outElem;

            $(windowElem).css({ 'width': width + 'px', 'height': height + 'px', 'left': left + 'px', 'top': top + 'px' });

            this.fixChatInTextWidth(inInputElem, inElem);

            this.onResize = (ev: JQueryEventObject) =>
            {
                this.fixChatInTextWidth(inInputElem, inElem);
                // $(chatinText).focus();
            };

            $(inSendElem).click(ev =>
            {
                this.sendText();
            });

            $(inSaveElem).click(ev =>
            {
                this.saveText();
            });

            $(outClearElem).click(ev =>
            {
                $('#n3q .n3q-xmppwindow-out .n3q-xmppwindow-line').remove();
            });

            this.onClose = async () =>
            {
                await this.saveText();

                this.outElem = null;
                this.inInputElem = null;

                if (onClose) { onClose(); }
            };

            this.onDragStop = (ev: JQueryEventObject) =>
            {
                // $(chatinText).focus();
            };

            this.setText(await this.getStoredText());

            $(inInputElem).focus();
        }
    }

    fixChatInTextWidth(chatinText: HTMLElement, chatin: HTMLElement)
    {
        let delta = 14;
        let parentWidth = chatin.offsetWidth;
        let width = parentWidth - delta;
        $(chatinText).css({ 'width': width });
    }

    private sendText(): void
    {
        this.saveText();

        let text = this.getSelectedText();
        if (text == '') {
            text = this.getText();
        }
        if (text != '') {
            try {
                let stanza = this.text2Stanza(text);
                this.app.sendStanza(stanza);
            } catch (error) {
                this.showError(error.message);
            }
        }
        $(this.inInputElem).focus();
    }

    private setText(text: string): void
    {
        $(this.inInputElem).val(text);
    }

    getText(): string
    {
        return as.String($(this.inInputElem).val(), '');
    }

    getSelectedText(): string
    {
        var txtarea = <HTMLTextAreaElement>this.inInputElem;
        var start = txtarea.selectionStart;
        var finish = txtarea.selectionEnd;
        var selectedText = this.getText().substring(start, finish);
        return selectedText;
    }

    async saveText()
    {
        await this.storeText(this.getText());
    }

    async storeText(text: string)
    {
        await Memory.setSync('dev.scratchPad', text);
    }

    async getStoredText(): Promise<string>
    {
        return await Memory.getSync('dev.scratchPad', '');
    }

    text2Stanza(text: string): xml
    {
        let json = JSON.parse(text);
        let stanza = Utils.jsObject2xmlObject(json);
        return stanza;
    }

    private label_errpr = 'error';
    public showLine(label: string, text: string)
    {
        let lineElem = <HTMLElement>$(
            `<div class="n3q-base n3q-xmppwindow-line` + (label == this.label_errpr ? ' n3q-xmppwindow-line-error' : '') + `">
                <span class="n3q-base n3q-text n3q-xmppwindow-label">` + as.Html(label) + `</span>
                <span class="n3q-base n3q-text n3q-xmppwindow-text">`+ as.Html(text) + `</span>
            <div>`
        ).get(0);

        if (this.outElem) {
            $(this.outElem).append(lineElem).scrollTop($(this.outElem).get(0).scrollHeight);
        }
    }

    public showError(text: string)
    {
        this.showLine(this.label_errpr, text);
    }
}
