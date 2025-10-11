import { sut } from '../lib/sut';
import { sutGui } from '../lib/sutGui';
import { FullWindow, FullWindowOptions } from './FullWindow';
import { ContentApp } from './ContentApp';
import { LiveTestSimpleRpc } from './LiveTestSimpleRpc';
import { DomUtils } from '../lib/DomUtils'
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'

export class TestWindow extends FullWindow<FullWindowOptions>
{
    private outElem: HTMLElement;

    constructor(app: ContentApp)
    {
        super(app);
        this.windowCssClasses.push('testwindow');
        this.titleText = 'Integration Tests';
        this.titleTextId = 'TestWindow.Tests';
        this.defaultWidth = 800;
        this.defaultHeight = 600;
        this.defaultBottom = 400;
        this.defaultLeft = 50;
    }

    protected async makeContent(): Promise<void>
    {
        await super.makeContent();
        const contentElem = this.contentElem;

        this.outElem = DomUtils.elemOfHtml('<div class="output" data-translate="children"></div>');
        PointerEventDispatcher.makeOpaqueDefaultActionsDispatcher(this.app, this.outElem);
        contentElem.append(this.outElem);

        const runElem = this.app.uiHelper.makeDefaultTextButton('run-button', null, 'Run', () => {
            this.outElem.innerHTML = '';
            this.runTests();
        });
        contentElem.append(runElem);

        this.runTests();
    }

    protected onBeforeClose(): void
    {
        super.onBeforeClose();
        this.outElem = null;
    }

    protected runTests(): void
    {
        const s = new sut();

        s.addTestClass(LiveTestSimpleRpc);

        s.run().then(() =>
        {
            new sutGui().render(s, this.outElem);
        });
    }
}
