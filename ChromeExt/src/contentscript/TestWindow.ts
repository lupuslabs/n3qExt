import { sut } from '../lib/sut';
import { sutGui } from '../lib/sutGui';
import { Window, WindowOptions } from './Window';
import { ContentApp } from './ContentApp';
import { LiveTestPayload } from './LiveTestPayload';
import { LiveTestSimpleRpc } from './LiveTestSimpleRpc';
import { DomUtils } from '../lib/DomUtils'
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'

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
        this.windowCssClasses.push('n3q-testwindow');
        this.titleText = this.app.translateText('TestWindow.Tests', 'Integration Tests');
        this.defaultWidth = 800;
        this.defaultHeight = 600;
        this.defaultBottom = 400;
        this.defaultLeft = 50;
    }

    protected async makeContent(): Promise<void>
    {
        await super.makeContent();
        const contentElem = this.contentElem;

        const outElem = DomUtils.elemOfHtml('<div class="n3q-base n3q-testwindow-out" data-translate="children"></div>');
        const runElem = DomUtils.elemOfHtml('<div class="n3q-base n3q-absolutebutton n3q-testwindow-run" title="Run">Run</div>');

        contentElem.append(outElem);
        contentElem.append(runElem);

        this.outElem = outElem;

        PointerEventDispatcher.makeOpaqueDefaultActionsDispatcher(this.app, this.outElem);
        PointerEventDispatcher.makeOpaqueDispatcher(this.app, runElem).addUnmodifiedLeftClickListener(ev => {
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
