import { as } from '../lib/as';
import { ContentApp } from './ContentApp';
import { Window, WindowOptions } from './Window';
import { _Changes } from '../lib/_Changes';
import { DomUtils } from '../lib/DomUtils'
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'

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
        this.windowCssClasses.push('n3q-changeswindow');
        this.titleText = this.app.translateText('ChangesWindow.Changes', 'Change History');
        this.defaultWidth = 600;
        this.defaultHeight = 600;
        this.defaultBottom = 400;
        this.defaultLeft = 50;
    }

    protected async makeContent(): Promise<void>
    {
        await super.makeContent();
        const contentElem = this.contentElem;
        this.outElem = DomUtils.elemOfHtml('<div class="n3q-base n3q-changeswindow-out" data-translate="children"></div>');
        contentElem.append(this.outElem);
        PointerEventDispatcher.makeOpaqueDefaultActionsDispatcher(this.app, this.outElem);
        this.showHistory();
    }

    protected onBeforeClose(): void
    {
        super.onBeforeClose();
        this.outElem = null;
    }

    protected showHistory(): void
    {
        _Changes.data.forEach(release =>
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
        const lineElem = DomUtils.elemOfHtml(
            `<div class="n3q-base n3q-changeswindow-line">
                <span class="n3q-base n3q-text n3q-changeswindow-text">${as.HtmlWithClickableLinks(text)}</span>
            <div>`
        );
        PointerEventDispatcher.protectElementsWithDefaultActions(this.app, lineElem);
        this.outElem?.append(lineElem);
    }
}
