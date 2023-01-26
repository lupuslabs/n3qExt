import { as } from '../lib/as';
import { ContentApp } from './ContentApp';
import { Window, WindowOptions } from './Window';
import { _Changes } from '../lib/_Changes';
import { domHtmlElemOfHtml } from '../lib/domTools'

export class ChangesWindow extends Window<WindowOptions>
{
    private outElem: HTMLElement;

    public constructor(app: ContentApp)
    {
        super(app);
        this.windowName = 'Changes';
        this.isResizable = true;
        this.persistGeometry = true;
    }

    protected prepareMakeDom(): void
    {
        super.prepareMakeDom();
        this.titleText = this.app.translateText('ChangesWindow.Changes', 'Change History');
        this.defaultWidth = 600;
        this.defaultHeight = 600;
        this.defaultBottom = 400;
        this.defaultLeft = 50;
    }

    protected async makeContent(): Promise<void>
    {
        await super.makeContent();
        const windowElem = this.windowElem;
        const contentElem = this.contentElem;
        windowElem.classList.add('n3q-changeswindow');
        const outElem = domHtmlElemOfHtml('<div class="n3q-base n3q-changeswindow-out" data-translate="children"></div>');
        contentElem.append(outElem);
        this.outElem = outElem;
        this.showHistory();
    }

    protected onBeforeClose(): void
    {
        super.onBeforeClose();
        this.outElem = null;
    }

    protected showHistory(): void
    {
        _Changes.data.slice().reverse().forEach(release =>
        {
            this.showLine(release[0] + ' ' + release[1]);
            release[2].forEach(change =>
            {
                this.showLine(change[0] + ' ' + change[1]);
            });
            this.showLine('.');
        });
    }

    protected showLine(text: string): void
    {
        const lineElem = domHtmlElemOfHtml(
            `<div class="n3q-base n3q-changeswindow-line">
                <span class="n3q-base n3q-text n3q-changeswindow-text">${as.HtmlWithClickableLinks(text)}</span>
            <div>`
        );
        this.outElem?.append(lineElem);
    }
}
