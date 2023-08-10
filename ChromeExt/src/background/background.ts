import log = require('loglevel')
import { Environment } from '../lib/Environment'
import { ContentCommunicatorFactory, BackgroundApp } from './BackgroundApp'
import { BackgroundToContentCommunicator } from '../lib/BackgroundToContentCommunicator'
import { PortBackgroundMessagePipeProvider } from '../lib/PortMessagePipe'
import { Client } from '../lib/Client'

Client.initLog()
const isDevelopment = Environment.isDevelopment()
console.debug('weblin.io Background', { isDevelopment })

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
