import { sut } from '../lib/sut';
import { sutGui } from '../lib/sutGui';
import { Window, WindowOptions } from './Window';
import { ContentApp } from './ContentApp';
import { LiveTestPayload } from './LiveTestPayload';
import { LiveTestSimpleRpc } from './LiveTestSimpleRpc';
import { domHtmlElemOfHtml } from '../lib/domTools'

export class TestWindow extends Window<WindowOptions>
{
    private outElem: HTMLElement;

    constructor(app: ContentApp)
    {
        super(app);
        this.isResizable = true;
    }

    protected prepareMakeDom(): void
    {
        super.prepareMakeDom();
        this.titleText = this.app.translateText('TestWindow.Tests', 'Integration Tests');
        this.defaultWidth = 800;
        this.defaultHeight = 600;
        this.defaultBottom = 400;
        this.defaultLeft = 50;
    }

    protected async makeContent(): Promise<void>
    {
        await super.makeContent();
        const windowElem = this.windowElem;
        const contentElem = this.contentElem;
        windowElem.classList.add('n3q-testwindow');

        const outElem = domHtmlElemOfHtml('<div class="n3q-base n3q-testwindow-out" data-translate="children"></div>');
        const runElem = domHtmlElemOfHtml('<div class="n3q-base n3q-absolutebutton n3q-testwindow-run" title="Run">Run</div>');

        contentElem.append(outElem);
        contentElem.append(runElem);

        this.app.translateElem(windowElem);

        this.outElem = outElem;

        runElem.addEventListener('click', ev =>
        {
            outElem.innerHTML = '';
            this.runTests();
        });

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
        s.addTestClass(LiveTestPayload);

        s.run().then(() =>
        {
            new sutGui().render(s, this.outElem);
        });
    }
}
