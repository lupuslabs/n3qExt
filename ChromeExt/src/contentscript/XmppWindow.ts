import XmlElement from 'ltx/lib/Element.js';
import { as } from '../lib/as';
import { Utils } from '../lib/Utils';
import { ContentApp } from './ContentApp';
import { FullWindow, FullWindowOptions } from './FullWindow';
import { Memory } from '../lib/Memory';
import { DomUtils } from '../lib/DomUtils';
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'

export class XmppWindow extends FullWindow<FullWindowOptions>
{
    private readonly label_error: string = 'error';
    private outElem: null|HTMLElement = null;
    private inInputElem: null|HTMLTextAreaElement = null;

    public constructor(app: ContentApp)
    {
        super(app);
        this.windowSettingsId = 'Xmpp';
        this.persistGeometry = true;
        this.windowCssClasses.push('xmppwindow');
        this.titleText = 'XMPP';
        this.titleTextId = 'XmppWindow.Xmpp';
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

        this.outElem = DomUtils.elemOfHtml('<div class="code from-server" data-translate="children"></div>');
        PointerEventDispatcher.makeOpaqueDefaultActionsDispatcher(this.app, this.outElem);
        contentElem.append(this.outElem);
        const outClearElem = this.app.uiHelper.makeDefaultTextButton('from-server-clear-button', null, 'Clear', () => {this.outElem.innerHTML = ''})
        contentElem.append(outClearElem);
        this.inInputElem = <HTMLTextAreaElement> DomUtils.elemOfHtml('<textarea class="to-server-input"></textarea>');
        PointerEventDispatcher.makeOpaqueDefaultActionsDispatcher(this.app, this.inInputElem);
        contentElem.append(this.inInputElem);
        const inButtonsElem = DomUtils.elemOfHtml('<div class="to-server-buttons" data-translate="children"></div>');
        const inSendElem = this.app.uiHelper.makeDefaultTextButton('to-server-send-button', null, 'Send', () => this.sendText())
        inButtonsElem.append(inSendElem);
        const inSaveElem = this.app.uiHelper.makeDefaultTextButton('to-server-save-button', null, 'Save', () => this.saveText())
        inButtonsElem.append(inSaveElem);
        contentElem.append(inButtonsElem);

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
        await Memory.setLocal('dev.scratchPad', text);
    }

    private async getStoredText(): Promise<string>
    {
        return as.String(await Memory.getLocal('dev.scratchPad'));
    }

    private text2Stanza(text: string): XmlElement
    {
        const json = JSON.parse(text);
        const stanza = Utils.jsObject2xmlObject(json);
        return stanza;
    }

    public showLine(label: string, text: string)
    {
        const lineElem = DomUtils.elemOfHtml(
            `<div class="line${label === this.label_error ? ' error' : ''}">
                <span class="label">${as.Html(label)}</span>
                <span class="text">${as.Html(text)}</span>
            <div>`
        );

        if (this.outElem) {
            this.outElem.append(lineElem);
            this.outElem.scrollTop = this.outElem.scrollHeight;
        }
    }

    public showError(text: string)
    {
        this.showLine(this.label_error, text);
    }
}
