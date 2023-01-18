import * as $ from 'jquery';
import 'webpack-jquery-ui';
import * as ltx from 'ltx';
import { as } from '../lib/as';
import { Utils } from '../lib/Utils';
import { ContentApp } from './ContentApp';
import { Window, WindowOptions } from './Window';
import { Memory } from '../lib/Memory';

export class XmppWindow extends Window
{
    private outElem: HTMLElement;
    private inInputElem: HTMLElement;

    constructor(app: ContentApp)
    {
        super(app);
    }

    async show(options: WindowOptions)
    {
        options.titleText = this.app.translateText('XmppWindow.Xmpp', 'XMPP');
        options.resizable = true;

        super.show(options);

        const bottom = as.Int(options.bottom, 400);
        const width = as.Int(options.width, 600);
        const height = as.Int(options.height, 600);
        const onClose = options.onClose;

        if (this.windowElem) {
            const windowElem = this.windowElem;
            const contentElem = this.contentElem;
            $(windowElem).addClass('n3q-xmppwindow');

            const left = 10;
            let top = this.app.getDisplay().offsetHeight - height - bottom;
            {
                const minTop = 10;
                if (top < minTop) {
                    //height -= minTop - top;
                    top = minTop;
                }
            }

            const outElem = <HTMLElement>$('<div class="n3q-base n3q-xmppwindow-out" data-translate="children" />').get(0);
            const inElem = <HTMLElement>$('<div class="n3q-base n3q-xmppwindow-in" data-translate="children" />').get(0);
            const inInputElem = <HTMLElement>$('<textarea class="n3q-base n3q-xmppwindow-in-input n3q-input n3q-text" />').get(0);
            const inSendElem = <HTMLElement>$('<div class="n3q-base n3q-absolutebutton n3q-xmppwindow-in-send" title="Send">Send</div>').get(0);
            const inSaveElem = <HTMLElement>$('<div class="n3q-base n3q-absolutebutton n3q-xmppwindow-in-save" title="Save">Save</div>').get(0);
            const outClearElem = <HTMLElement>$('<div class="n3q-base n3q-absolutebutton n3q-xmppwindow-out-clear" title="Clear">Clear</div>').get(0);

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
        const delta = 14;
        const parentWidth = chatin.offsetWidth;
        const width = parentWidth - delta;
        $(chatinText).css({ 'width': width });
    }

    private sendText(): void
    {
        this.saveText();

        let text = this.getSelectedText();
        if (text === '') {
            text = this.getText();
        }
        if (text !== '') {
            try {
                const stanza = this.text2Stanza(text);
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
        const txtarea = <HTMLTextAreaElement>this.inInputElem;
        const start = txtarea.selectionStart;
        const finish = txtarea.selectionEnd;
        const selectedText = this.getText().substring(start, finish);
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

    text2Stanza(text: string): ltx.Element
    {
        const json = JSON.parse(text);
        const stanza = Utils.jsObject2xmlObject(json);
        return stanza;
    }

    private label_errpr = 'error';
    public showLine(label: string, text: string)
    {
        const lineElem = <HTMLElement>$(
            `<div class="n3q-base n3q-xmppwindow-line` + (label === this.label_errpr ? ' n3q-xmppwindow-line-error' : '') + `">
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
