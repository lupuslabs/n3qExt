import { Window, WindowOptions } from './Window';
import { ContentApp } from './ContentApp';
import { domHtmlElemOfHtml } from '../lib/domTools'
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'
import { Config } from '../lib/Config';
import { Client } from '../lib/Client';
import { as } from '../lib/as';

interface Line
{
    label: string;
    text: string;
    isLink: boolean;
}

export class AboutWindow extends Window<WindowOptions> {
    constructor(app: ContentApp)
    {
        super(app);
        this.isResizable = true;
    }

    protected prepareMakeDom(): void
    {
        super.prepareMakeDom();
        this.windowCssClasses.push('n3q-aboutwindow');
        this.titleText = this.app.translateText('AboutWindow.About', 'About');
        this.defaultWidth = 500;
        this.defaultHeight = 300;
        this.defaultBottom = 400;
        this.defaultLeft = 50;
    }

    protected async makeContent(): Promise<void>
    {
        await super.makeContent();
        const contentElem = this.contentElem;

        const pane = domHtmlElemOfHtml('<div class="n3q-base n3q-aboutwindow-pane" data-translate="children"></div>');
        const title = domHtmlElemOfHtml('<div class="n3q-aboutwindow-title" data-translate="text:AboutWindow"></div>');
        const linesContainer = domHtmlElemOfHtml('<div class="n3q-aboutwindow-lines" data-translate="children"></div>');

        const lines: Line[] = [
            { label: 'Version', text: Client.getVersion(), isLink: true },
            { label: 'Landing page', text: Config.get('about.landingPage', ''), isLink: true },
            { label: 'Project page', text: Config.get('about.projectPage', ''), isLink: true },
        ]

        lines.forEach(line =>
        {
            const lineElem = domHtmlElemOfHtml(
                '<div class="n3q-aboutwindow-line" data-translate="children">'
                + '<span class="n3q-aboutwindow-label" data-translate="text:AboutWindow">' + line.label + '</span>'
                + '<span class="n3q-aboutwindow-text" data-translate="text:AboutWindow">'
                + (line.isLink ?
                    as.HtmlLink(line.text, line.text, null, null, '_new')
                    :
                    as.Html(line.text)
                )
                + '</span>'
                + '</div>')
                ;
            linesContainer.appendChild(lineElem);
        });

        pane.append(title);
        pane.append(linesContainer);
        contentElem.append(pane);

        PointerEventDispatcher.protectElementsWithDefaultActions(this.app, pane);
    }
}
