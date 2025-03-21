import { FullWindow, FullWindowOptions } from './FullWindow';
import { DomUtils } from '../lib/DomUtils'
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'
import { Config } from '../lib/Config';
import { Client } from '../lib/Client';
import { ContentApp } from './ContentApp'

interface Line
{
    key: string;
    value: string;
    type: 'raw' | 'link' | 'html';
}

export class AboutWindow extends FullWindow<FullWindowOptions> {

    public constructor(app: ContentApp) {
        super(app)
        this.windowCssClasses.push('aboutwindow');
        this.titleText = 'About';
        this.titleTextId = 'AboutWindow.About';
    }

    protected prepareMakeDom(): void
    {
        super.prepareMakeDom();
        this.defaultBottom = Config.get('about.defaultBottom', 400);
        this.defaultLeft = Config.get('about.defaultLeft', 50);
    }

    protected async makeContent(): Promise<void>
    {
        await super.makeContent();
        const contentElem = this.contentElem;

        const pane = DomUtils.elemOfHtml('<div class="pane" data-translate="children"></div>');
        const logo = DomUtils.elemOfHtml('<div class="logo"></div>');

        const linesContainer = DomUtils.elemOfHtml('<div class="lines" data-translate="children"></div>');
        const lines: Line[] = [
            { key: 'Version', value: Client.getVersion(), type: 'html' },
            { key: 'Variant', value: Client.getVariant(), type: 'html' },
            { key: 'Language', value: Client.getUserLanguage(), type: 'html' },
            { key: 'Landing page', value: Config.get('about.landingPage', ''), type: 'link' },
            { key: 'Project page', value: Config.get('about.projectPage', ''), type: 'link' },
            { key: 'Privacy policy', value: Config.get('about.privacyPolicy', ''), type: 'link' },
            { key: 'Extension link', value: Config.get('about.extensionLink', ''), type: 'link' },
            { key: 'Description', value: Config.get('about.description', ''), type: 'html' },
        ]
        for (const {key, value, type} of lines) {
            const labelElem = DomUtils.elemOfHtml(`<span class="label" data-translate="text:AboutWindow"></span>`);
            const valueElem = DomUtils.elemOfHtml(`<span class="text" data-translate="text:AboutWindow"></span>`);
            linesContainer.appendChild(labelElem);
            linesContainer.appendChild(valueElem);
            labelElem.innerText = key;
            switch (type) {
                case 'raw': {
                    valueElem.innerHTML = value;
                } break;
                case 'link': {
                    valueElem.append(DomUtils.makeExternalTextLinkElem(value, value));
                } break;
                case 'html': {

                    const valueElems = DomUtils.convertTextInNodes(DomUtils.paragraphNodesOfText(value), DomUtils.makeLinksInTextClickable, {});
                    valueElems.forEach(node => valueElem.appendChild(node));
                } break;
            }
        }

        pane.append(logo);
        pane.append(linesContainer);
        contentElem.append(pane);

        PointerEventDispatcher.protectElementsWithDefaultActions(this.app, pane);
    }
}
