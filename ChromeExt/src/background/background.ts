import log = require('loglevel')
import { Environment } from '../lib/Environment'
import { ContentCommunicatorFactory, BackgroundApp } from './BackgroundApp'
import { BackgroundToContentCommunicator } from '../lib/BackgroundToContentCommunicator'
import { PortBackgroundMessagePipeProvider } from '../lib/PortMessagePipe'
import { Client } from '../lib/Client'

Client.initLog()
const isDevelopment = Environment.isDevelopment()
console.debug('weblin.io Background', { isDevelopment })

function applyFirefoxCorsWorkaround() {
    // Only needed because CORS is erroneously applied to extension-triggered requests.
    const ownOriginPrefix = chrome.runtime.getURL('') // Example: 'moz-extension://5f5c8df9-ac08-4002-b427-7a1669aa9e7f/'
    if (!ownOriginPrefix.startsWith('moz-extension://')) {
        return
    }
    log.info('BackgroundApp.applyFirefoxCorsWorkaround: Activating response header mangling to avoid CORS problems.', { ownOriginPrefix })

    const responseHeaderFixer = details => {
        let responseHeaders = details.responseHeaders.map(({ name, value }) => ({ name, value }))
        const originUrl = details.originUrl ?? ''

        // Prevent site CORS from crippling our injected frames:
        if (!originUrl.length) {
            for (const o of responseHeaders) {
                if (o.name.toLowerCase() === 'content-security-policy') {
                    o.value = o.value.replace(/(^|; *)(child-src|frame-src) [^;]+;/ig, '$1$2 *;')
                }
            }
        }

        // Prevent CORS from blocking our background page requests:
        if (originUrl.startsWith(ownOriginPrefix)) {
            responseHeaders = responseHeaders.filter(o => o.name.toLowerCase() !== 'access-control-allow-origin')
            responseHeaders.push({ name: 'Access-Control-Allow-Origin', value: '*' })
        }

        return { responseHeaders }
    }
    const filter = { urls: ['<all_urls>'] }
    const options: browser.webRequest.OnHeadersReceivedOptions[] = ['blocking', 'responseHeaders']
    browser.webRequest.onHeadersReceived.addListener(responseHeaderFixer, filter, options)
}
applyFirefoxCorsWorkaround()

const communicatorMaker: ContentCommunicatorFactory = (heartbeatHandler, requestHandler) => {
    const messagePipeProvider = new PortBackgroundMessagePipeProvider()
    return new BackgroundToContentCommunicator(messagePipeProvider, heartbeatHandler, requestHandler)
}
// Must happen in first event loop cycle for browser to detect use of event listeners in background service
// worker or the worker will not be restarted on coresponding incomming events if it stops for any reason:
const app = new BackgroundApp(communicatorMaker)

app.start().catch(error => {
    log.info('BackgroundApp.start failed!', error)
})
