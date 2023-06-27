import { Window, WindowOptions } from './Window';
import { ContentApp } from './ContentApp';
import { domHtmlElemOfHtml } from '../lib/domTools'
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'
import { Config } from '../lib/Config';
import { Client } from '../lib/Client';
import { as } from '../lib/as';

interface Line
{
    key: string;
    value: string;
    type?: 'raw' | 'link' | 'html';
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
        this.defaultWidth = Config.get('about.defaultWidth', 650);
        this.defaultHeight = Config.get('about.defaultHeight', 300);
        this.defaultBottom = Config.get('about.defaultBottom', 400);
        this.defaultLeft = Config.get('about.defaultLeft', 50);
    }

    protected async makeContent(): Promise<void>
    {
        await super.makeContent();
        const contentElem = this.contentElem;

        const pane = domHtmlElemOfHtml('<div class="n3q-base n3q-aboutwindow-pane" data-translate="children"></div>');
        const logo = domHtmlElemOfHtml('<div class="n3q-aboutwindow-logo"></div>');
        const title = domHtmlElemOfHtml('<div class="n3q-aboutwindow-title" data-translate="text:AboutWindow"></div>');
        const linesContainer = domHtmlElemOfHtml('<div class="n3q-aboutwindow-lines" data-translate="children"></div>');

        const lines: Line[] = [
            { key: 'Version', value: Client.getVersion() },
            { key: 'Variant', value: Client.getVariant() },
            { key: 'Language', value: Client.getUserLanguage() },
            { key: 'Landing page', value: Config.get('about.landingPage', ''), type: 'link' },
            { key: 'Project page', value: Config.get('about.projectPage', ''), type: 'link' },
            { key: 'Privacy policy', value: Config.get('about.privacyPolicy', ''), type: 'link' },
            { key: 'Extension link', value: Config.get('about.extensionLink', ''), type: 'link' },
            { key: 'Description', value: Config.get('about.description', ''), type: 'raw' },
        ]

        lines.forEach(line =>
        {
            var value = '';
            switch (line.type ?? 'html') {
                case 'raw': 
                value = line.value;
                break;

                case 'link': 
                value = as.HtmlLink(line.value, line.value, null, null, '_new')
                break;

                case 'html': 
                value = as.HtmlWithClickableLinks(line.value);
                break;
            }
            
            const lineElem = domHtmlElemOfHtml(
                '<div class="n3q-aboutwindow-line" data-translate="children">'
                + '<span class="n3q-aboutwindow-label" data-translate="text:AboutWindow">' + line.key + '</span>'
                + '<span class="n3q-aboutwindow-text" data-translate="text:AboutWindow">' + value + '</span>'
                + '</div>')
                ;

            linesContainer.appendChild(lineElem);
        });

        pane.append(logo);
        pane.append(title);
        pane.append(linesContainer);
        contentElem.append(pane);

        PointerEventDispatcher.makeOpaqueDefaultActionsDispatcher(this.app, pane);
        PointerEventDispatcher.protectElementsWithDefaultActions(this.app, pane);
    }
}
