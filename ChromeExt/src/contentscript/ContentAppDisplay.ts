import { iter } from '../lib/Iter'
import { Environment } from '../lib/Environment'
import { Client } from '../lib/Client'
import { Config } from '../lib/Config'
import { DomUtils } from '../lib/DomUtils'
import { Logger } from '../lib/Logger'
import { ContentApp, ContentAppParams } from './ContentApp'

export class ContentAppDisplay {

    private readonly app: ContentApp
    private readonly logger: Logger
    private readonly appendToMe: HTMLElement
    private appendToMeDomObserver: null|MutationObserver = null
    private shadowDomAnchor: null|HTMLElement = null
    private shadowDomAnchorDomObserver: null|MutationObserver = null
    private shadowDomRoot: null|ShadowRoot = null
    private display: null|HTMLElement = null

    private isDisplayVisible: boolean = false
    private baseCss: string = ''

    constructor(app: ContentApp, appendToMe: HTMLElement) {
        this.app = app
        this.logger = app.logger.getSubLogger('', 'ContentAppDisplay:')
        this.appendToMe = appendToMe
    }

    public getShadowDomRoot(): ShadowRoot {
        return this.shadowDomRoot
    }

    public getDisplay(): HTMLElement {
        return this.display
    }

    public getBaseCss(): string {
        return this.baseCss
    }

    public stop(): void {
        this.appendToMeDomObserver?.disconnect()
        this.shadowDomAnchorDomObserver?.disconnect()
        this.appendToMeDomObserver = null
        this.shadowDomAnchorDomObserver = null
        this.setDisplayVisible(false)
        this.display = null
        this.shadowDomRoot = null
        this.shadowDomAnchor?.remove()
        this.shadowDomAnchor = null
        this.baseCss = ''
    }

    public setDisplayVisible(isVisible: boolean): void {
        this.isDisplayVisible = isVisible
        DomUtils.setElemClassPresent(this.display, 'hidden', !isVisible)
    }

    public async initDisplay(params: ContentAppParams): Promise<void> {
        document.querySelector('div#n3q')?.remove()

        this.appendToMeDomObserver = new MutationObserver(() => this.maintainDisplay())
        this.shadowDomAnchorDomObserver = new MutationObserver(() => this.maintainDisplay())
        this.shadowDomAnchor = DomUtils.elemOfHtml(`<div></div>`)
        this.shadowDomRoot = this.shadowDomAnchor.attachShadow({mode: 'closed'})

        if (params.styleUrl) {
            this.baseCss = await this.app.urlFetcher.fetchAsText(params.styleUrl, '1')
            this.shadowDomRoot.appendChild(DomUtils.elemOfHtml(`<style data-type="base">\n${this.baseCss}\n</style>`))
        }

        this.display = DomUtils.elemOfHtml('<div id="n3qD" class="client" dir="ltr"></div>')
        this.setDisplayVisible(this.isDisplayVisible)
        DomUtils.preventKeyboardEventBubbling(this.display)
        this.shadowDomRoot.append(this.display)

        const variant = Client.getVariant()
        if (variant !== 'extension') {
            this.appendToMe.append(this.shadowDomAnchor)
        }

        this.maintainDisplay()
    }

    private maintainDisplay(): void
    {
        if (Environment.isEmbedded()) {
            for (const elem of document.querySelectorAll('div[id="n3q"]')) {
                if (elem !== this.shadowDomAnchor) {
                    this.logger.logDebug('ContentApp.maintainDisplay: Extension shadow DOM root detected. Stopping embedded.')
                    this.app.stop()
                    return
                }
            }
        }
        this.appendToMeDomObserver?.disconnect()
        this.shadowDomAnchorDomObserver?.disconnect()

        // Move to end of body (prevent max z-index elements from rendering on top):
        if (Environment.isExtension() && this.appendToMe.lastElementChild !== this.shadowDomAnchor) {
            this.appendToMe.append(this.shadowDomAnchor)
        }

        // Reset anchor:
        for (const childElem of this.shadowDomAnchor.childNodes) {
            childElem.remove()
        }
        iter(this.shadowDomAnchor.attributes).forEach(attributeNode => this.shadowDomAnchor.removeAttribute(attributeNode.name))
        this.shadowDomAnchor.setAttribute('id', 'n3q')
        this.shadowDomAnchor.setAttribute('data-client-variant', Client.getVariant())

        // Use popover API to get on top of topmost page content:
        if (Config.get('system.displayPopupShadowDomAnchor')) {
            this.shadowDomAnchor.setAttribute('popover', 'manual')
            try {
                this.shadowDomAnchor['showPopover']?.()
            } catch (error) {
                // Already visible.
            }
        }

        // React to DOM changes:
        if (Config.get('system.displayProtectShadowDomAnchor')) {
            this.appendToMeDomObserver.observe(this.appendToMe, { childList: true })
            this.shadowDomAnchorDomObserver.observe(this.shadowDomAnchor, { childList: true, attributes: true })
        }
    }

}
