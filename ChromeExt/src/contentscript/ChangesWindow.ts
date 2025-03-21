import { ContentApp } from './ContentApp';
import { FullWindow, FullWindowOptions } from './FullWindow'
import { _Changes } from '../lib/_Changes';
import { DomUtils } from '../lib/DomUtils'
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'

export class ChangesWindow extends FullWindow<FullWindowOptions>
{
    private outElem: HTMLElement;

    public constructor(app: ContentApp)
    {
        super(app);
        this.windowSettingsId = 'Changes';
        this.persistGeometry = true;
        this.windowCssClasses.push('changeswindow');
        this.titleText = 'Change History';
        this.titleTextId = 'ChangesWindow.Changes';
        this.defaultWidth = 600;
        this.defaultHeight = 600;
        this.defaultBottom = 400;
        this.defaultLeft = 50;
    }

    protected async makeContent(): Promise<void>
    {
        await super.makeContent();
        const contentElem = this.contentElem;
        this.outElem = DomUtils.elemOfHtml('<div class="code changelog" data-translate="children"></div>');
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
            `<div class="line">
                <span class="text">${DomUtils.convertTextToHtmlWithClickableLinks(text)}</span>
            <div>`
        );
        PointerEventDispatcher.protectElementsWithDefaultActions(this.app, lineElem);
        this.outElem?.append(lineElem);
    }
}
