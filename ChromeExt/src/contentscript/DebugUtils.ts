import { ContentApp } from './ContentApp';
import { Memory } from '../lib/Memory';
import { is } from '../lib/is';
import { domHtmlElemOfHtml } from '../lib/domTools';

export class DebugUtils
{
    protected app: ContentApp;

    protected iframeTestBoxEnabled: boolean = false;
    
    public constructor(app: ContentApp)
    {
        this.app = app;
    }

    public genericHandleAsyncError(fun: () => Promise<any>): void
    {
        try {
            fun().catch(error => this.app.onError(error));
        } catch (error) {
            this.app.onError(error);
        }
    }

    public onAppStartComplete(): void
    {
        this.genericHandleAsyncError(() => this.initIframeTestBox());
    }

    //--------------------------------------------------------------------------
    // iFrame test box
    
    public getIframeTestBoxEnabled(): boolean
    {
        return this.iframeTestBoxEnabled;
    }
    
    public toggleIframeTestBoxEnabled(): void
    {
        this.iframeTestBoxEnabled = !this.iframeTestBoxEnabled;
        this.genericHandleAsyncError(async() => {
            await Memory.setLocal('iframeTestBoxEnabled', this.iframeTestBoxEnabled);
            this.updateIframeTestBoxGui();
        });
    }
    
    protected async initIframeTestBox(): Promise<void>
    {
        this.iframeTestBoxEnabled = await Memory.getLocal('iframeTestBoxEnabled', false);
        this.updateIframeTestBoxGui();
    }

    protected updateIframeTestBoxGui(): void
    {
        document.getElementById('n3q-iframe-test-box')?.remove();
        document.getElementById('n3q-shadow-dom-test-anchor')?.remove();
        if (this.iframeTestBoxEnabled) {
            if (is.nil(document.getElementById('n3q-iframe-test-box'))) {
                this.makeIframeTestBoxGui();
            }
            if (is.nil(document.getElementById('n3q-shadow-dom-test-anchor'))) {
                this.makeShadowDomTestBoxGui();
            }
        }
    }

    protected makeIframeTestBoxGui(): void
    {
        const elem = <HTMLIFrameElement> domHtmlElemOfHtml('<iframe id="n3q-iframe-test-box" />');
        elem.addEventListener('click', ev => window.alert('Clicked on iframe test box iframe.'));
        document.getElementsByTagName('body')[0].appendChild(elem);
        const iframeDoc = elem.contentWindow.document;
        iframeDoc.open();
        iframeDoc.write('<html lang="en"><head>'
            + '<title>iFrame Test Box</title>'
            + '<style>'
            + '    html {overflow: hidden; pointer-events: none; user-select: none;}'
            + '    body {'
            + '        margin: 3px; background: rgba(128,0,0,0.45);'
            + '        font: bold 12px sans-serif; color: red; text-align: center;'
            + '        pointer-events: none; user-select: none;'
            + '    }'
            + '    .title {color: white; pointer-events: auto; user-select: auto;}'
            + '    .classed {color: rgba(128,255,128,1);}'
            + '</style>'
            + '<script> window.document.addEventListener("DOMContentLoaded", () => {'
            + '    document.querySelector(".scripted").style.color = "rgba(128,255,128,1)";'
            + '}); </script>'
            + '</head><body>'
            + '    <div class="title" onclick="window.alert(\'Clicked on iframe test box title.\')">iFrame Test</div>'
            + '    <div class="classed">Class</div>'
            + '    <div style="color: rgba(128,255,128,1);">Inline</div>'
            + '    <div class="scripted">Script</div>'
            + '</body></html>'
        );
        iframeDoc.close();
    }

    protected makeShadowDomTestBoxGui(): void
    {
        const shadowDomAnchorElem = domHtmlElemOfHtml('<div id="n3q-shadow-dom-test-anchor"></div>');
        document.getElementsByTagName('body')[0].appendChild(shadowDomAnchorElem);
        const shadowRoot = shadowDomAnchorElem.attachShadow({mode: 'closed'});
        shadowRoot.appendChild(domHtmlElemOfHtml(''
            + '<style>'
            + '    h1 {' // Clearly a tag which is often styled by pages
            + '        position: absolute; right: 80px; bottom: 0; margin: 0;'
            + '        width: 74px; height: 54px; padding: 3px;'
            + '        background: rgba(128,0,0,0.5);'
            + '        font-size: 12px; font-family: sans-serif; text-align: center;'
            + '        pointer-events: none; user-select: none;'
            + '    }'
            + '    .title {color: white;}'
            + '    .classed {color: rgba(128,255,128,1);}'
            + '    .scripted {pointer-events: auto; user-select: auto;}'
            + '</style>'
        ));
        const shadowBody = domHtmlElemOfHtml(''
            + '<h1>'
            + '    <div class="title">iFrame Test</div>'
            + '    <div class="classed">Class</div>'
            + '    <div style="color: rgba(128,255,128,1); pointer-events: auto; user-select: auto;">Inline</div>'
            + '</h1>'
        );
        shadowRoot.appendChild(shadowBody);
        const scriptedElem = domHtmlElemOfHtml('<div class="scripted">Script</div>');
        scriptedElem.onclick = ev => {scriptedElem.style.color = 'rgba(128,255,128,1)'};
        shadowBody.appendChild(scriptedElem);
    }

}
