import log = require('loglevel')
import { Utils } from './Utils'
import { Config } from './Config'
import { is } from './is'
import {
    BackgroundErrorResponse, BackgroundRequest, BackgroundResponse,
    BackgroundMessagePipe,
    BackgroundRequestEnvelope, BackgroundResponseEnvelope, isBackgroundResponseEnvelope, BackgroundSuccessResponse,
} from './BackgroundMessage'

export interface BackgroundMessagePipeProvider
{
    addOnMessagePipeConnectHandler(onConnectHandler: (messagePipe: BackgroundMessagePipe) => void): void
}

export type BackgroundHeartbeatHandler = (tabId: number) => void
export type BackgroundRequestHandler = (tabId: number, message: BackgroundRequest) => Promise<BackgroundResponse>

type UnsentRequest = {
    requestEnvelope: BackgroundRequestEnvelope,
    responsePromiseResolver: (response: BackgroundResponse) => void,
    sendTimeoutTimeMs: number,
    responseTimeoutSecs: number,
}
type UnsentResponse = {
    responseEnvelope: BackgroundResponseEnvelope,
    sendTimeoutTimeMs: number,
}
type UnreceivedResponse = {
    requestEnvelope: BackgroundRequestEnvelope,
    responsePromiseResolver: (response: BackgroundResponse) => void,
    responseTimeoutTimeMs: number,
}

type TabData = {
    tabId: number,
    tabCookie: number,
    messagePipeOld: null|BackgroundMessagePipe, // Only kept for receiving messages to avoid a race when switching message pipes.
    messagePipe: null|BackgroundMessagePipe,
    unsentRequests: UnsentRequest[],
    unsentResponses: UnsentResponse[],
    unreceivedResponses: Map<number,UnreceivedResponse>, // messageId => unreceivedResponseData
    nextHeartbeatMs: number,
}

export class BackgroundToContentCommunicator
{
    private readonly messagePipeProvider: BackgroundMessagePipeProvider
    private readonly onMessagePipeConnectHandler: (messagePipe: BackgroundMessagePipe) => void
    private readonly heartbeatHandler: BackgroundHeartbeatHandler
    private readonly requestHandler: BackgroundRequestHandler

    private readonly tabs: Map<number,TabData> = new Map()
    private tabCookieLast: number = 0
    private running: boolean = false
    private lastOwnMessageId: number = 0

    public constructor(messagePipeProvider: BackgroundMessagePipeProvider, heartbeatHandler: BackgroundHeartbeatHandler, requestHandler: BackgroundRequestHandler) {
        this.messagePipeProvider = messagePipeProvider
        this.heartbeatHandler = heartbeatHandler
        this.requestHandler = requestHandler
        this.onMessagePipeConnectHandler = (messagePipe) => this.onContentMessagePipeConnection(messagePipe)

        // Must happen in first event loop cycle for browser to detect use of event listener in service worker:
        this.messagePipeProvider.addOnMessagePipeConnectHandler(this.onMessagePipeConnectHandler)
    }

    public start(): void
    {
        if (this.running) {
            return
        }
        if (Utils.logChannel('clientBackgroundMessagePipeManagement', true)) {
            log.info(`ExtensionBackgroundToContentCommunicator.start: Starting.`)
        }
        this.running = true
    }

    public stop(): void
    {
        if (!this.running) {
            return
        }
        if (Utils.logChannel('clientBackgroundMessagePipeManagement', true)) {
            log.info(`ExtensionBackgroundToContentCommunicator.stop: Stopping.`)
        }
        this.running = false
        for (const tabData of this.tabs.values()) {
            this.disconnectAndForgetTab(tabData)
        }
    }

    public forgetTab(tabId: number): void
    {
        const tabData = this.tabs.get(tabId) ?? null
        if (tabData) {
            this.disconnectAndForgetTab(tabData)
        }
    }

    public async sendRequest(tabId: number, request: BackgroundRequest, responseTimeoutSecs: null|number = null): Promise<BackgroundResponse>
    {
        if (!this.running) {
            const msg = 'ExtensionBackgroundToContentCommunicator.sendRequest: Not started!'
            return new BackgroundErrorResponse('error', msg, { request })
        }

        const tabData = this.getOrCreateTabData(tabId)
        const requestEnvelope: BackgroundRequestEnvelope = {
            requestId: this.makeMsgId(),
            requestTimeMs: Date.now(),
            request: Utils.prepareValForMessage(request),
        }
        let responsePromiseResolver;
        const responsePromise: Promise<BackgroundResponse> = new Promise((resolve) => { responsePromiseResolver = resolve })
        const sendTimeoutSecs = Config.get('system.clientBackgroundSendTimeoutSec', 10)
        const sendTimeoutTimeMs = Date.now() - 1e3 * sendTimeoutSecs
        responseTimeoutSecs ??= Config.get('system.clientBackgroundResponseTimeoutSec', 10)
        tabData.unsentRequests.push({
            requestEnvelope,
            responsePromiseResolver,
            sendTimeoutTimeMs,
            responseTimeoutSecs,
        })

        this.sendQueuedMessages(tabData)
        return responsePromise
    }

    private onMessageFromContent(tabId: number, message: BackgroundRequestEnvelope|BackgroundResponseEnvelope): void
    {
        if (!is.object(message)) {
            const logMsg: string = `ExtensionBackgroundToContentCommunicator.onMessageFromContent: Ignored malformed message from tab ${tabId}!`
            log.info(logMsg, { message })
            return
        }
        const tabData = this.tabs.get(tabId) ?? null
        if (!tabData) {
            const logMsg: string = `ExtensionBackgroundToContentCommunicator.onMessageFromContent: Ignored message from unknown tab ${tabId}!`
            log.info(logMsg, { message })
            return
        }

        if (isBackgroundResponseEnvelope(message)) {
            this.handleResponseFromContent(tabData, message)
        } else {
            this.handleRequestFromContent(tabData, message)
        }
    }

    private handleResponseFromContent(tabData: TabData, response: BackgroundResponseEnvelope): void
    {
        const unreceivedResponse = tabData.unreceivedResponses.get(response.requestId)

        if (!unreceivedResponse) {
            // Not waiting for this response.
            if (Utils.logChannel('clientBackgroundMessagePipeManagement', true)) {
                const logMsg: string = `ExtensionBackgroundToContentCommunicator.handleResponseFromContent: Ignored unexpected response from tab ${tabData.tabId}.`
                log.info(logMsg, { response })
            }
            this.sendQueuedMessages(tabData)
            return
        }

        tabData.unreceivedResponses.delete(response.requestId)
        unreceivedResponse.responsePromiseResolver(response.response)
        this.sendQueuedMessages(tabData)
    }

    private handleRequestFromContent(tabData: TabData, requestEnvelope: BackgroundRequestEnvelope): void
    {
        const tabId = tabData.tabId
        const tabCookie = tabData.tabCookie
        const requestId = requestEnvelope.requestId
        const request = requestEnvelope.request

        if (request.type === 'ContentToBackgroundCommunicatorPing') {
            this.enqueueResponse(tabId, tabCookie, requestId, new BackgroundSuccessResponse())
            this.sendQueuedMessages(tabData)
            return
        }

        if (!this.running) {
            const msg = 'ExtensionBackgroundToContentCommunicator.handleRequestFromContent: Not started!'
            const response = new BackgroundErrorResponse('error', msg, { request })
            if (Utils.logChannel('clientBackgroundMessagePipeManagement', true)) {
                const logMsg: string = `ExtensionBackgroundToContentCommunicator.handleRequestFromContent: Responding with error to message from tab ${tabId} because this is stopped.`
                log.info(logMsg, { request: requestEnvelope, response })
            }
            this.enqueueResponse(tabId, tabCookie, requestId, response)
            this.sendQueuedMessages(tabData)
            return
        }

        this.sendQueuedMessages(tabData)
        this.callHeartbeatHandler(tabData)
        this.requestHandler(tabId, requestEnvelope.request)
            .catch(error => BackgroundErrorResponse.ofError(error, { request }))
            .then((response: BackgroundResponse) => {
                this.enqueueResponse(tabId, tabCookie, requestId, response)
                this.sendQueuedMessages(tabData)
            })
    }

    private enqueueResponse(tabId: number, tabCookie: number, requestId: number, response: BackgroundResponse): void
    {
        const tabData = this.tabs.get(tabId) ?? null
        if (tabData?.tabCookie !== tabCookie) { // Tab might have gone away or reinitialized/navigated.
            return;
        }
        const sendTimeoutSecs = Config.get('system.clientBackgroundSendTimeoutSec', 10)
        const sendTimeoutTimeMs = Date.now() - 1e3 * sendTimeoutSecs
        tabData.unsentResponses.push({
            responseEnvelope: {
                requestId,
                responseId: this.makeMsgId(),
                response: Utils.prepareValForMessage(response),
            },
            sendTimeoutTimeMs,
        })
    }

    private sendQueuedMessages(tabData: TabData): void
    {
        if (!tabData.messagePipe) {
            return
        }

        while (tabData.unsentResponses.length) {
            const unsentResponse = tabData.unsentResponses.shift()
            tabData.messagePipe.postMessage(unsentResponse.responseEnvelope).catch(error => {
                const logMsg: string = `ExtensionBackgroundToContentCommunicator.sendQueuedMessages: messagePipe.postMessage failed!`
                log.info(logMsg, { tabData })
            })
        }

        while (tabData.unsentRequests.length) {
            const unsentRequest = tabData.unsentRequests.shift()
            tabData.unreceivedResponses.set(unsentRequest.requestEnvelope.requestId, {
                requestEnvelope: unsentRequest.requestEnvelope,
                responsePromiseResolver: unsentRequest.responsePromiseResolver,
                responseTimeoutTimeMs: Date.now() + 1e3 * unsentRequest.responseTimeoutSecs,
            })
            tabData.messagePipe.postMessage(unsentRequest.requestEnvelope).catch(error => {
                const logMsg: string = `ExtensionBackgroundToContentCommunicator.sendQueuedMessages: messagePipe.postMessage failed!`
                log.info(logMsg, { tabData })
            })
        }

        this.handleTimeouts(tabData)
    }

    private handleTimeouts(tabData: TabData, forgettingTab: boolean = false): void
    {
        const tabId = tabData.tabId
        const nowMs = Date.now()
        const logDebugMsgs = Utils.logChannel('clientBackgroundMessagePipeManagement', true)
        const cancelMsgStatus: string = forgettingTab ? 'canceled' : 'timeout'
        const cancelMsgReason: string = forgettingTab ? 'forgetting tab.' : 'of timeout!'
        const unsentCancelGuard = function<T extends UnsentRequest|UnsentResponse>(unsentMessage: undefined|T): boolean {
            return unsentMessage && (forgettingTab || unsentMessage.sendTimeoutTimeMs < nowMs)
        }

        while (unsentCancelGuard(tabData.unsentRequests[0])) {
            const unsentRequest = tabData.unsentRequests.shift()
            const msg: string = `ExtensionBackgroundToContentCommunicator.handleTimeouts: Discarding unsent request for tab ${tabId} because ${cancelMsgReason}`
            if (!forgettingTab || logDebugMsgs) {
                log.info(msg, { unsentRequest })
            }
            unsentRequest.responsePromiseResolver(new BackgroundErrorResponse(cancelMsgStatus, msg))
        }

        while (unsentCancelGuard(tabData.unsentResponses[0])) {
            const unsentResponse = tabData.unsentResponses.shift()
            if (!forgettingTab || logDebugMsgs) {
                const msg: string = `ExtensionBackgroundToContentCommunicator.handleTimeouts: Discarding unsent response for tab ${tabId} because ${cancelMsgReason}`
                log.info(msg, { cancelAll: forgettingTab, tabId, unsentResponse })
            }
        }

        for (const [requestId, unreceivedResponse] of tabData.unreceivedResponses.entries()) {
            if (forgettingTab || unreceivedResponse.responseTimeoutTimeMs < nowMs) {
                tabData.unreceivedResponses.delete(requestId)
                const msg = `ExtensionBackgroundToContentCommunicator.handleTimeouts: Response for message ${requestId} assumed to never come from tab ${tabId} because ${cancelMsgReason}.`
                if (logDebugMsgs) {
                    log.info(msg, { cancelAll: forgettingTab, tabId, unreceivedResponse })
                }
                unreceivedResponse.responsePromiseResolver(new BackgroundErrorResponse(cancelMsgStatus, msg))
            }
        }
    }

    private onContentMessagePipeConnection(messagePipe: BackgroundMessagePipe): void {
        const tabId = messagePipe.contentTabId ?? null
        if (tabId === null) {
            log.info('ExtensionBackgroundToContentCommunicator.onContentMessagePipeConnection: Incomming message pipe has no sender tab ID - ignored.', { messagePipe })
            return
        }
        const tabData = this.getOrCreateTabData(tabId)

        if (tabData.messagePipe) {
            if (tabData.messagePipeOld) {
                if (Utils.logChannel('clientBackgroundMessagePipeManagement', true)) {
                    log.info(`ExtensionBackgroundToContentCommunicator.onContentMessagePipeConnection: Diconnecting old message pipe of tab ${tabId} to make room for current message pipe.`)
                }
                tabData.messagePipeOld.disconnect()
            }
            tabData.messagePipeOld = tabData.messagePipe
        }

        messagePipe.addOnDisconnectHandler(() => this.onContentMessagePipeDisconnect(messagePipe))
        messagePipe.addOnMessageHandler((message) => this.onMessageFromContent(tabId, message))
        tabData.messagePipe = messagePipe
        if (Utils.logChannel('clientBackgroundMessagePipeManagement', true)) {
            log.info(`ExtensionBackgroundToContentCommunicator.onContentMessagePipeConnection: New current message pipe for tab ${tabId} connected.`, { messagePipe })
        }

        this.sendQueuedMessages(tabData)
        this.callHeartbeatHandler(tabData)
    }

    private onContentMessagePipeDisconnect(messagePipe: BackgroundMessagePipe): void
    {
        const tabId = messagePipe.contentTabId ?? null
        if (tabId === null) {
            log.info('ExtensionBackgroundToContentCommunicator.onContentMessagePipeDisconnect: Disconnected message pipe has no sender tab ID - ignored.', { messagePipe })
            return
        }
        const tabData = this.tabs.get(tabId) ?? null
        if (messagePipe === tabData.messagePipeOld) {
            if (Utils.logChannel('clientBackgroundMessagePipeManagement', true)) {
                log.info(`ExtensionBackgroundToContentCommunicator.onContentMessagePipeDisconnect: Old message pipe of tab ${tabId} diconnected.`)
            }
            tabData.messagePipeOld = null
            return
        }
        if (messagePipe === tabData.messagePipe) {
            if (Utils.logChannel('clientBackgroundMessagePipeManagement', true)) {
                log.info(`ExtensionBackgroundToContentCommunicator.onContentMessagePipeDisconnect: Current message pipe of tab ${tabId} diconnected!`)
            }
            tabData.messagePipe = null
            return
        }
    }

    private callHeartbeatHandler(tabData: TabData): void
    {
        // Rate-limit heartbeats for performance reasons and to reduce log spamming:
        const nowMs = Date.now()
        if (tabData.nextHeartbeatMs > nowMs) {
            return;
        }
        const heartbeetIntervalSecs = Config.get('system.clientBackgroundKeepaliveMessageIntervalSec', 10)
        const heartbeetIntervalMs = 1e3 / 2 * heartbeetIntervalSecs
        tabData.nextHeartbeatMs = nowMs + heartbeetIntervalMs;

        try {
            this.heartbeatHandler(tabData.tabId)
        } catch (error) {
            log.info('ExtensionBackgroundToContentCommunicator.callHeartbeatHandler: heartbeatHandler failed!', { error, tabData })
        }
    }

    private getOrCreateTabData(tabId: number): TabData
    {
        let tabData = this.tabs.get(tabId) ?? null
        if (!tabData) {
            this.tabCookieLast++
            tabData = {
                tabId,
                tabCookie: this.tabCookieLast,
                messagePipeOld: null,
                messagePipe: null,
                unsentRequests: [],
                unsentResponses: [],
                unreceivedResponses: new Map(),
                nextHeartbeatMs: 0,
            }
            this.tabs.set(tabId, tabData)
        }
        return tabData
    }

    private disconnectAndForgetTab(tabData: TabData): void
    {
        tabData.messagePipeOld?.disconnect()
        tabData.messagePipeOld = null
        tabData.messagePipe?.disconnect()
        tabData.messagePipe = null
        this.handleTimeouts(tabData, true)
        this.tabs.delete(tabData.tabId)
    }

    private makeMsgId(): number
    {
        this.lastOwnMessageId ++
        return this.lastOwnMessageId
    }

}
