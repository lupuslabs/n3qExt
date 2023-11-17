import log = require('loglevel')
import { is } from './is'
import { Utils } from './Utils'
import { Config } from './Config'
import {
    BackgroundErrorResponse, BackgroundRequest, BackgroundResponse, BackgroundSuccessResponse,
    BackgroundRequestEnvelope, BackgroundResponseEnvelope, isBackgroundResponseEnvelope, BackgroundMessagePipe,
} from './BackgroundMessage'

export interface ContentMessagePipeProvider
{
    connectNewBackroundMessagePipe(): BackgroundMessagePipe
}

export type ContentRequestHandler = (message: BackgroundRequest) => Promise<BackgroundResponse>

type UnreceivedResponseData = {
    requestEnvelope: BackgroundRequestEnvelope,
    responsePromiseResolver: (response: BackgroundResponse) => void,
    responseTimeoutHandle: number,
}

export class ContentToBackgroundCommunicator
{
    private readonly contentMessagePipeProvider: ContentMessagePipeProvider
    private readonly requestHandler: ContentRequestHandler

    private messagePipeOld: null|BackgroundMessagePipe // Only kept for receiving messages to avoid a race when switching pipes.
    private messagePipe: null|BackgroundMessagePipe
    private messagePipeReopenTimeoutHandle: null|number
    private keepAliveRequestTimeoutHandle: null|number

    private unreceivedResponses: Map<number,UnreceivedResponseData> = new Map() // messageId => unreceivedResponseData
    private running: boolean = false
    private lastOwnMessageId: number = 0
    private lastMessageSentTimeMs: number = 0

    constructor(contentMessagePipeProvider: ContentMessagePipeProvider, requestHandler: ContentRequestHandler) {
        this.contentMessagePipeProvider = contentMessagePipeProvider
        this.requestHandler = requestHandler
    }

    public start(): void
    {
        if (this.running) {
            return
        }
        if (Utils.logChannel('clientBackgroundMessagePipeManagement', true)) {
            log.info('ExtensionContentToBackgroundCommunicator.start: Starting.')
        }
        this.running = true
        this.openNewMessagePipe()
    }

    public stop(): void
    {
        if (!this.running) {
            return
        }
        if (Utils.logChannel('clientBackgroundMessagePipeManagement', true)) {
            log.info('ExtensionContentToBackgroundCommunicator.stop: Stopping.')
        }
        this.cancelMessagePipeReopen()
        this.running = false
        this.messagePipeOld?.disconnect()
        this.messagePipeOld = null
        this.messagePipe?.disconnect()
        this.messagePipe = null
        for (const requestId of this.unreceivedResponses.keys()) {
            this.onResponseTimeout(requestId)
        }
    }

    public async sendRequest<T extends BackgroundSuccessResponse>(request: BackgroundRequest, responseTimeoutSecs?: null|number): Promise<T|BackgroundErrorResponse>
    {
        if (!this.running) {
            return new BackgroundErrorResponse('uninitialized', 'ExtensionContentToBackgroundCommunicator.sendRequest: Not started!')
        }

        const requestId = this.makeMsgId()
        const requestEnvelope: BackgroundRequestEnvelope = {
            requestId,
            requestTimeMs: Date.now(),
            request: Utils.prepareValForMessage(request),
        }
        responseTimeoutSecs ??= Config.get('system.clientBackgroundResponseTimeoutSec', 10)
        const timeoutMs = 1e3 * responseTimeoutSecs
        const responseTimeoutHandler = () => this.onResponseTimeout(requestId)
        const responsePromise: Promise<T> = new Promise((resolve) => {
            this.unreceivedResponses.set(requestId, {
                requestEnvelope,
                responseTimeoutHandle: window.setTimeout(responseTimeoutHandler, timeoutMs),
                responsePromiseResolver: <(response: BackgroundResponse) => void> resolve,
            })
            this.sendToBackground(requestEnvelope)
        })

        return responsePromise
    }

    private sendToBackground(messageEnvelope: BackgroundRequestEnvelope|BackgroundResponseEnvelope, inResponseTo?: BackgroundRequestEnvelope): void
    {
        const isRequest = !messageEnvelope['response']
        if (isRequest) {
            const request = (<BackgroundRequestEnvelope>messageEnvelope).request
            const logChannel = request.type === 'ContentToBackgroundCommunicatorPing' ? 'clientBackgroundMessagePipeManagement' : 'clientBackgroundMessages'
            if (Utils.logChannel(logChannel, true)) {
                const logData = { type: request.type, request: request }
                const logMsg: string = 'ExtensionContentToBackgroundCommunicator.sendToBackground: Sending request.'
                log.info(logMsg, logData)
            }
        } else {
            if (Utils.logChannel('clientBackgroundMessages', true)) {
                const response = (<BackgroundResponseEnvelope>messageEnvelope).response
                const logData = { ok: response.ok, response: response }
                if (inResponseTo) {
                    const request = inResponseTo.request
                    logData['type'] = request.type
                    logData['inResponseTo'] = request
                }
                const logMsg: string = 'ExtensionContentToBackgroundCommunicator.sendToBackground: Sending response.'
                log.info(logMsg, logData)
            }
        }

        const messagePipe = this.messagePipe

        messagePipe.postMessage(messageEnvelope).catch(error => {
            const logMsg: string = 'ExtensionContentToBackgroundCommunicator.sendToBackground: messagePipe.postMessage failed!'
            log.info(logMsg, { messagePipe, messageEnvelope })
        })
        this.lastMessageSentTimeMs = Date.now()
    }

    private onMessageFromBackground(messageEnvelope: BackgroundRequestEnvelope|BackgroundResponseEnvelope): void
    {
        if (!is.object(messageEnvelope)) {
            const logMsg: string = 'ExtensionContentToBackgroundCommunicator.onMessageFromBackground: Ignored malformed message from background!'
            log.info(logMsg, { messageEnvelope })
            return
        }

        // Avoid being affected by timer throttling leading to one-minute delays when tab is invisible due to timeout chaining:
        // https://developer.chrome.com/blog/timer-throttling-in-chrome-88/
        this.sheduleBackgroundKeepaliveRequest()

        if (isBackgroundResponseEnvelope(messageEnvelope)) {
            this.handleResponseFromBackground(messageEnvelope)
        } else {
            this.handleRequestFromBackground(messageEnvelope)
        }
    }

    private handleResponseFromBackground(responseEnvelope: BackgroundResponseEnvelope): void
    {
        const unreceivedResponse = this.unreceivedResponses.get(responseEnvelope.requestId)

        if (is.nil(unreceivedResponse)) {
            // Not waiting for this response.
            if (Utils.logChannel('clientBackgroundMessagePipeManagement', true)) {
                const logMsg = 'ExtensionContentToBackgroundCommunicator.handleResponseFromBackground: Ignored unexpected response from background.'
                log.info(logMsg, { responseEnvelope })
            }
            return
        }
        const request = unreceivedResponse.requestEnvelope.request
        const response = responseEnvelope.response
        const logChannel = request.type === 'ContentToBackgroundCommunicatorPing' ? 'clientBackgroundMessagePipeManagement' : 'clientBackgroundMessages'
        if (Utils.logChannel(logChannel, true)) {
            const logMsg: string = 'ExtensionContentToBackgroundCommunicator.handleResponseFromBackground: Received response.'
            log.info(logMsg, { type: request.type, ok: response.ok, response, inResponseTo: request })
        }

        this.unreceivedResponses.delete(responseEnvelope.requestId)
        window.clearTimeout(unreceivedResponse.responseTimeoutHandle)
        unreceivedResponse.responsePromiseResolver(response)
    }

    private handleRequestFromBackground(request: BackgroundRequestEnvelope): void
    {
        if (Utils.logChannel('clientBackgroundMessages', true)) {
            const logMsg: string = 'ExtensionContentToBackgroundCommunicator.handleRequestFromBackground: Received request.'
            log.info(logMsg, { type: request.request.type, request: request.request })
        }
        if (!this.running) {
            if (Utils.logChannel('clientBackgroundMessagePipeManagement', true)) {
                const logMsg: string = `ExtensionContentToBackgroundCommunicator.handleRequestFromBackground: Ignoring message from background because this is stopped.`
                log.info(logMsg, { request })
            }
            return
        }

        this.requestHandler(request.request)
            .catch(error => BackgroundErrorResponse.ofError(error))
            .then((response: BackgroundResponse) => {
                if (!this.running) {
                    if (Utils.logChannel('clientBackgroundMessagePipeManagement', true)) {
                        const logMsg: string = `ExtensionContentToBackgroundCommunicator.handleRequestFromBackground: Discarding response to be sent to beckground because this is stopped.`
                        log.info(logMsg, { response, request })
                    }
                    return
                }
                this.sendToBackground({
                    requestId: request.requestId,
                    responseId: this.makeMsgId(),
                    response: Utils.prepareValForMessage(response),
                }, request)
            })
    }

    private onDisconnectedFromBackground(messagePipe: BackgroundMessagePipe): void
    {
        if (messagePipe === this.messagePipeOld) {
            if (Utils.logChannel('clientBackgroundMessagePipeManagement', true)) {
                log.info('ExtensionContentToBackgroundCommunicator.onDisconnectedFromBackground: Old messagePipe diconnected.')
            }
            this.messagePipeOld = null
        } else if (messagePipe === this.messagePipe) {
            const msg = 'ExtensionContentToBackgroundCommunicator.onDisconnectedFromBackground: Current messagePipe diconnected!'
            const lastMessageSentTime = new Date(this.lastMessageSentTimeMs).toString()
            log.info(msg, { lastMessageSentTime })
            this.messagePipe = null
        }

        if (!this.messagePipe) {
            this.openNewMessagePipe()
        }
    }

    private openNewMessagePipe(): void
    {
        this.cancelMessagePipeReopen()
        this.cancelBackgroundKeepaliveRequest()

        if (this.messagePipe) {
            if (this.messagePipeOld) {
                if (Utils.logChannel('clientBackgroundMessagePipeManagement', true)) {
                    log.info('ExtensionContentToBackgroundCommunicator.openNewMessagePipe: Closing old messagePipe.')
                }
                this.messagePipeOld.disconnect()
            }
            this.messagePipeOld = this.messagePipe
            this.messagePipe = null
        }

        const newPipeMs = 1e3 * Config.get('system.clientBackgroundMessagePipeReopenIntervalSec', 10)
        this.messagePipeReopenTimeoutHandle = window.setTimeout(() => this.openNewMessagePipe(), newPipeMs)

        if (Utils.logChannel('clientBackgroundMessagePipeManagement', true)) {
            const msg = 'ExtensionContentToBackgroundCommunicator.openNewMessagePipe: Opening new messagePipe.'
            const lastMessageSentTime = new Date(this.lastMessageSentTimeMs).toString()
            log.info(msg, { lastMessageSentTime })
        }
        const messagePipe = this.contentMessagePipeProvider.connectNewBackroundMessagePipe()
        messagePipe.addOnDisconnectHandler(() => this.onDisconnectedFromBackground(messagePipe))
        messagePipe.addOnMessageHandler(msg => this.onMessageFromBackground(msg))
        this.messagePipe = messagePipe
        this.sendBackgroundKeepaliveRequest()
    }

    private cancelMessagePipeReopen(): void
    {
        this.cancelBackgroundKeepaliveRequest()
        if (!is.nil(this.messagePipeReopenTimeoutHandle)) {
            window.clearTimeout(this.messagePipeReopenTimeoutHandle)
            this.messagePipeReopenTimeoutHandle = null
        }
    }

    private onResponseTimeout(requestId: number): void
    {
        const unreceivedResponseData = this.unreceivedResponses.get(requestId)
        if (is.nil(unreceivedResponseData)) {
            return
        }

        this.unreceivedResponses.delete(requestId)
        window.clearTimeout(unreceivedResponseData.responseTimeoutHandle)
        const msg = 'ExtensionContentToBackgroundCommunicator.onResponseTimeout: Response didn\'t arrive in time!'
        if (Utils.logChannel('clientBackgroundMessagePipeManagement', true)) {
            log.info(msg, {unreceivedResponseData})
        }
        unreceivedResponseData.responsePromiseResolver(new BackgroundErrorResponse('error', msg))
    }

    private cancelBackgroundKeepaliveRequest(): void
    {
        if (!is.nil(this.keepAliveRequestTimeoutHandle)) {
            window.clearTimeout(this.keepAliveRequestTimeoutHandle)
            this.keepAliveRequestTimeoutHandle = null
        }
    }

    private sheduleBackgroundKeepaliveRequest(): void
    {
        if (this.keepAliveRequestTimeoutHandle || !this.running || !this.messagePipe) {
            return
        }
        const keepaliveSender = () => this.sendBackgroundKeepaliveRequest()
        const keepaliveSecs = Config.get('system.clientBackgroundKeepaliveMessageIntervalSec', 10)
        this.keepAliveRequestTimeoutHandle = window.setTimeout(keepaliveSender, 1e3 * keepaliveSecs)
    }

    private sendBackgroundKeepaliveRequest(): void
    {
        this.cancelBackgroundKeepaliveRequest()
        if (!this.running || !this.messagePipe) {
            return
        }
        this.sendRequest({type: 'ContentToBackgroundCommunicatorPing'}).then(response => {
            // Nothing to do.
        })
    }

    private makeMsgId(): number
    {
        this.lastOwnMessageId ++
        return this.lastOwnMessageId
    }

}
