import log = require('loglevel')
import './contentscript.scss'
import * as $ from 'jquery'
import { Panic } from '../lib/Panic'
import { Config } from '../lib/Config'
import { Environment } from '../lib/Environment'
import { Client } from '../lib/Client'
import { ContentApp, ContentAppNotification } from './ContentApp'
import { ContentMessage } from '../lib/ContentMessage'
import { ContentRequestHandler, ContentToBackgroundCommunicator } from '../lib/ContentToBackgroundCommunicator'
import { PortContentMessagePipeProvider } from '../lib/PortMessagePipe'
import { BackgroundRequest, BackgroundResponse, BackgroundErrorResponse, BackgroundSuccessResponse } from '../lib/BackgroundMessage'

// This prevents the site and everyone else (including us) from processing focus events directed at our GUI:
// Listeners need to be registered before listeners of site for maximum reliability.
function preventAnyEventInterferenceIfEventIsForUs(ev: Event): void
{
    if (ev.target instanceof Element && ev.target.id === 'n3q') {
        ev.stopImmediatePropagation() // No further event propagation - not to site-registered listener nor our own.
    }
}
window.addEventListener('focusin', ev => preventAnyEventInterferenceIfEventIsForUs(ev), {capture: true})
window.addEventListener('focusout', ev => preventAnyEventInterferenceIfEventIsForUs(ev), {capture: true})
window.addEventListener('focus', ev => preventAnyEventInterferenceIfEventIsForUs(ev), {capture: true})
window.addEventListener('blur', ev => preventAnyEventInterferenceIfEventIsForUs(ev), {capture: true})

$(async function ()
{
    Client.initLog()
    const isDevelopment = Environment.isDevelopment()
    const visibilityState = document.visibilityState
    console.debug('weblin.io Content', { isDevelopment, visibilityState })

    await Client.initDevConfig()

    let contentCommunicator: ContentToBackgroundCommunicator
    let contentRequestFromBackgroundHandler: null|ContentRequestHandler = null
    let contentApp: ContentApp = null
    let onTabChangeStay = false

    const onRequestFromBackground = async(request: BackgroundRequest): Promise<BackgroundResponse> => {
        if (contentApp) {
            if (contentRequestFromBackgroundHandler) {
                return contentRequestFromBackgroundHandler(request)
            }
            return new BackgroundErrorResponse('uninitialized', 'ContentApp not ready yet.')
        }
        if (request.type === ContentMessage.type_extensionActiveChanged) {
            if (request.data?.['state']) {
                activateContent()
            }
            return new BackgroundSuccessResponse()
        }
        return new BackgroundErrorResponse('uninitialized', 'ContentApp not initialized yet.')
    }
    const messagePipeProvider = new PortContentMessagePipeProvider()
    contentCommunicator = new ContentToBackgroundCommunicator(messagePipeProvider, onRequestFromBackground)
    contentCommunicator.start() // This turns the heartbeat on so background is kept alive even when content is actually disabled.
    const backgroundCommunicatorFactoryForApp = (contentRequestHandler: ContentRequestHandler) => {
        contentRequestFromBackgroundHandler = contentRequestHandler
        return contentCommunicator
    }

    function activateContent()
    {
        if (contentApp) {
            contentApp.wakeup()
            return
        }
        log.debug('Contentscript.activateContent')

        let styleUrl
        try {
            styleUrl = chrome.runtime.getURL('contentscript.css')
        } catch(error) {
            log.debug('Contentscript.activateContent: Extension gone.', { error })
            return
        }

        const domAppContainer = document.querySelector('body')
        const appMsgHandler = msg => {
            log.debug('Contentscript msg', msg.type)
            switch (msg.type) {
                case ContentAppNotification.type_onTabChangeStay: {
                    onTabChangeStay = true
                } break
                case ContentAppNotification.type_onTabChangeLeave: {
                    onTabChangeStay = false
                } break
                case ContentAppNotification.type_stopped: {
                    deactivateContent()
                } break
                case ContentAppNotification.type_restart: {
                    restartContent()
                } break
            }
        }
        contentApp = new ContentApp(domAppContainer, appMsgHandler, backgroundCommunicatorFactoryForApp)
        contentApp.start({ styleUrl }).catch(error => log.error(error))
    }

    function deactivateContent()
    {
        if (contentApp) {
            log.debug('Contentscript.deactivateContent')
            contentApp.stop()
            contentApp = null
            contentRequestFromBackgroundHandler = null
        }
    }

    function restartContent()
    {
        log.debug('Contentscript.restartContent')
        new Promise(resolve => setTimeout(resolve, 100))
            .then(() => deactivateContent())
            .then(() => new Promise(resolve => setTimeout(resolve, 100)))
            .then(() => activateContent())
    }

    function onVisibilitychange()
    {
        const visibilityState = document.visibilityState
        log.debug('Contentscript.onVisibilitychange', { visibilityState })
        if (visibilityState !== 'hidden') {
            if (visibilityState !== 'visible') {
                $('body').append($('<div style="position:fixed;right:0;bottom:0;width:100px;height:100px;background-color:red;"></div>'))
            }
            activateContent()
        } else {
            if (onTabChangeStay) {
                contentApp?.sleep('TabInvisible') // see Config.translations
            } else {
                deactivateContent()
            }
        }
    }

    Panic.onNow(() =>
    {
        if (contentApp) {
            if (Config.get('environment.reloadPageOnPanic', false)) {
                document.location.reload()
            } else {
                log.debug('Contentscript.onUnload')
                contentApp.onUnload()
                contentApp = null
                contentRequestFromBackgroundHandler = null
            }
        }
    })

    window.addEventListener('unload', deactivateContent)
    window.addEventListener('visibilitychange', () => onVisibilitychange())
    onVisibilitychange()
})
