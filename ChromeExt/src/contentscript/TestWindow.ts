import * as $ from 'jquery';
import 'webpack-jquery-ui';
import { as } from '../lib/as';
import { sut } from '../lib/sut';
import { sutGui } from '../lib/sutGui';
import { Window, WindowOptions } from './Window';
import { ContentApp } from './ContentApp';
import { LiveTestPayload } from './LiveTestPayload';
import { LiveTestSimpleRpc } from './LiveTestSimpleRpc';

export class TestWindow extends Window
{
    private outElem: HTMLElement;

    constructor(app: ContentApp)
    {
        super(app);
    }

    async show(options: WindowOptions)
    {
        options.titleText = this.app.translateText('TestWindow.Tests', 'Integration Tests');
        options.resizable = true;

        super.show(options);

        const bottom = as.Int(options.bottom, 400);
        const width = as.Int(options.width, 800);
        let height = as.Int(options.height, 600);
        const onClose = options.onClose;

        if (this.windowElem) {
            const windowElem = this.windowElem;
            const contentElem = this.contentElem;
            $(windowElem).addClass('n3q-testwindow');

            const left = 50;
            let top = this.app.getDisplay().offsetHeight - height - bottom;
            {
                const minTop = 10;
                if (top < minTop) {
                    height -= minTop - top;
                    top = minTop;
                }
            }

            const outElem = <HTMLElement>$('<div class="n3q-base n3q-testwindow-out" data-translate="children" />').get(0);
            const runElem = <HTMLElement>$('<div class="n3q-base n3q-absolutebutton n3q-testwindow-run" title="Run">Run</div>').get(0);

            $(contentElem).append(outElem);
            $(contentElem).append(runElem);

            this.app.translateElem(windowElem);

            this.outElem = outElem;

            $(windowElem).css({ 'width': width + 'px', 'height': height + 'px', 'left': left + 'px', 'top': top + 'px' });

            $(runElem).click(ev =>
            {
                $('#n3q .n3q-testwindow-out .sut').remove();
                this.runTests();
            });

            this.onClose = async () =>
            {
                this.outElem = null;
                if (onClose) { onClose(); }
            };

            this.runTests();
        }
    }

    runTests()
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
