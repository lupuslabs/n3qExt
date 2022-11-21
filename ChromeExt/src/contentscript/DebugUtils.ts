import { ContentApp } from './ContentApp';
import { Memory } from '../lib/Memory';
import { is } from '../lib/is';

export class DebugUtils
{
    protected app: ContentApp;

    protected iframeTestBoxEnabled: boolean = false;
    protected iframeTestBoxElem: null|HTMLElement;
    
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
        if (this.iframeTestBoxEnabled) {
            if (is.nil(this.iframeTestBoxElem)) {
                const elem = document.createElement('iframe');
                this.iframeTestBoxElem = elem;
                this.app.getDisplay().appendChild(elem);
                elem.classList.add('n3q-base', 'n3q-iframe-test-box');
                const iframeDoc = elem.contentWindow.document;
                iframeDoc.open();
                iframeDoc.write('<html lang="en"><head>'
                    + '<title>iFrame Test Box</title>'
                    + '<style>'
                    + '    html {overflow: hidden;}'
                    + '    body {'
                    + '        margin: 3px; background: rgba(128,0,0,0.75);'
                    + '        font: bold 12px sans-serif; color: red; text-align: center;'
                    + '    }'
                    + '    .title {color: white;}'
                    + '    .classed {color: rgba(128,255,128,1);}'
                    + '</style>'
                    + '<script> window.document.addEventListener("DOMContentLoaded", () => {'
                    + '    document.querySelector(".scripted").style.color = "rgba(128,255,128,1)";'
                    + '}); </script>'
                    + '</head><body>'
                    + '    <div class="title">iFrame Test</div>'
                    + '    <div class="classed">Class</div>'
                    + '    <div style="color: rgba(128,255,128,1);">Inline</div>'
                    + '    <div class="scripted">Script</div>'
                    + '</body></html>'
                );
                iframeDoc.close();
            }
        } else {
            this.iframeTestBoxElem?.parentNode?.removeChild(this.iframeTestBoxElem);
            this.iframeTestBoxElem = null;
        }
    }

}
