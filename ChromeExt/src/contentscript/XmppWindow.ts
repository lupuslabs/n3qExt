import * as ltx from 'ltx';
import { as } from '../lib/as';
import { Utils } from '../lib/Utils';
import { ContentApp } from './ContentApp';
import { Window, WindowOptions } from './Window';
import { Memory } from '../lib/Memory';
import { DomUtils } from '../lib/DomUtils';
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'

export class XmppWindow extends Window<WindowOptions>
{
    private readonly label_errpr = 'error';
    private outElem: HTMLElement;
    private inInputElem: HTMLTextAreaElement;

    public constructor(app: ContentApp)
    {
        super(app);
        this.windowName = 'Xmpp';
        this.isResizable = true;
        this.persistGeometry = true;
    }

    protected prepareMakeDom(): void
    {
        super.prepareMakeDom();
        this.windowCssClasses.push('n3q-xmppwindow');
        this.titleText = this.app.translateText('XmppWindow.Xmpp', 'XMPP');
        this.minWidth = 180;
        this.minHeight = 160;
        this.defaultWidth = 600;
        this.defaultHeight = 600;
        this.defaultBottom = 400;
        this.defaultLeft = 50;
    }

    protected async makeContent(): Promise<void>
    {
        await super.makeContent();
        const contentElem = this.contentElem;

        this.outElem = DomUtils.elemOfHtml('<div class="n3q-base n3q-xmppwindow-out" data-translate="children"></div>');
        const inElem = DomUtils.elemOfHtml('<div class="n3q-base n3q-xmppwindow-in" data-translate="children"></div>');
        this.inInputElem = <HTMLTextAreaElement> DomUtils.elemOfHtml('<textarea class="n3q-base n3q-xmppwindow-in-input n3q-input n3q-text"></textarea>');
        const inSendElem = DomUtils.elemOfHtml('<div class="n3q-base n3q-absolutebutton n3q-xmppwindow-in-send" title="Send">Send</div>');
        const inSaveElem = DomUtils.elemOfHtml('<div class="n3q-base n3q-absolutebutton n3q-xmppwindow-in-save" title="Save">Save</div>');
        const outClearElem = DomUtils.elemOfHtml('<div class="n3q-base n3q-absolutebutton n3q-xmppwindow-out-clear" title="Clear">Clear</div>');

        inElem.append(this.inInputElem);

        contentElem.append(this.outElem);
        contentElem.append(inElem);
        contentElem.append(inSendElem);
        contentElem.append(inSaveElem);
        contentElem.append(outClearElem);

        PointerEventDispatcher.makeOpaqueDefaultActionsDispatcher(this.app, this.outElem);
        PointerEventDispatcher.makeOpaqueDefaultActionsDispatcher(this.app, this.inInputElem);
        PointerEventDispatcher.makeOpaqueDispatcher(this.app, inSendElem).addUnmodifiedLeftClickListener(ev => this.sendText());
        PointerEventDispatcher.makeOpaqueDispatcher(this.app, inSaveElem).addUnmodifiedLeftClickListener(ev => this.saveText());
        PointerEventDispatcher.makeOpaqueDispatcher(this.app, outClearElem).addUnmodifiedLeftClickListener(ev => {
            this.outElem.innerHTML = '';
        });

        this.getStoredText().then(text => this.setText(text)).catch(error => this.app.onError(error));

        this.inInputElem.focus();
    }

    protected onBeforeClose(): void
    {
        super.onBeforeClose();
        this.saveText();
        this.outElem = null;
        this.inInputElem = null;
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
        this.inInputElem.focus();
    }

    private setText(text: string): void
    {
        this.inInputElem.value = text;
    }

    private getText(): string
    {
        return this.inInputElem.value;
    }

    private getSelectedText(): string
    {
        const start = this.inInputElem.selectionStart;
        const finish = this.inInputElem.selectionEnd;
        const selectedText = this.getText().substring(start, finish);
        return selectedText;
    }

    private saveText()
    {
        this.storeText(this.getText()).catch(error => this.app.onError(error));
    }

    private async storeText(text: string)
    {
        await Memory.setSync('dev.scratchPad', text);
    }

    private async getStoredText(): Promise<string>
    {
        return await Memory.getSync('dev.scratchPad', '');
    }

    private text2Stanza(text: string): ltx.Element
    {
        const json = JSON.parse(text);
        const stanza = Utils.jsObject2xmlObject(json);
        return stanza;
    }

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
