import { RetryStrategy } from './RetryStrategy'
import { WebsocketMessage as Message } from './WebsocketMessage'

export namespace WebsocketConnection {

    export type IncommingRequestHandler = (request: Message.Request) => Promise<Message.Response>
    export type IncommingNotificationHandler = (notification: Message.Notification) => Promise<void>

    export type Config = {
        readonly getWebsocketUrl: () => string,
        readonly getUnreceivedResponseTimeoutSecs: () => number,
        readonly getHeartbeatSendIntervalSecs: () => number,
        readonly getHeartbeatTimeoutSecs: () => number,
        readonly getWebsocketOpenRetryStrategy: () => RetryStrategy,
        readonly logDebug: (msg: string, ...data: any[]) => void
        readonly logInfo: (msg: string, ...data: any[]) => void
        readonly logError: (msg: string, ...data: any[]) => void
        readonly getLogPingMessages: () => boolean
        readonly socketIsReadyHandler: () => void,
        readonly socketIsntReadyHandler: () => void,
        readonly incommingRequestHandler: IncommingRequestHandler,
        readonly incommingNotificationHandler: IncommingNotificationHandler,
    }

    type UnreceivedResponseData = {
        readonly responseHandler: (response: Message.Response) => void,
        readonly requestDt: Date,
    }

    export class Connection {
        private readonly config: Config

        private readonly websocketOpenHandler: (ev: Event) => void = ev => this.onWebsocketOpen(ev)
        private readonly websocketCloseHandler: (ev: CloseEvent) => void = ev => this.onWebsocketClose(ev)
        private readonly websocketErrorHandler: (ev: Event) => void = ev => this.onWebsocketError(ev)
        private readonly websocketMessageHandler: (ev: MessageEvent) => void = ev => this.onWebsocketMessage(ev)

        private isStopped: boolean = false
        private websocketOpenRetryStrategy: RetryStrategy
        private websocket: null|WebSocket
        private websocketIsOpening: boolean = false
        private websocketIsReady: boolean = false

        private unreceivedResponses: Map<string,UnreceivedResponseData> = new Map()

        private nextHeartbeat: Date = new Date()
        private heartbeatReceiveTimeout: Date = new Date()

        public constructor(config: Config) {
            this.config = config
            this.websocketOpenRetryStrategy = this.config.getWebsocketOpenRetryStrategy()
            this.maintain()
        }

        public stop(): void {
            this.isStopped = true
            this.closeWebsocket()
        }

        public maintain(): void {
            if (this.isStopped) {
                return
            }
            const now = new Date()
            if (this.websocketIsReady) {
                if (now > this.heartbeatReceiveTimeout) {
                    this.closeWebsocket()
                    return
                }
                if (now > this.nextHeartbeat) {
                    this.scheduleNextHeartbeatSend()
                    this.sendRequest(new Message.PingRequest(Message.makeId())).then(() => {})
                }
                this.detectTimedoutMessages(now)
                return
            }
            if (this.websocketIsOpening) {
                return
            }
            if (this.websocketOpenRetryStrategy.getNoTriesLeft()) {
                return
            }
            if (this.websocketOpenRetryStrategy.getTryNow(now.valueOf())) {
                this.openWebsocket()
                return
            }
        }

        public confirmWebsocketIsGood(): void {
            if (!this.websocketIsReady) {
                return
            }
            this.websocketOpenRetryStrategy = this.config.getWebsocketOpenRetryStrategy()
        }

        public reconnectWebsocket(): void {
            if (this.isStopped) {
                return
            }
            this.closeWebsocket()
        }

        public async sendRequest(message: Message.Request): Promise<Message.Response> {
            const response = this.sendMessage(message)
            if (response) {
                return response
            }
            const requestDt = new Date()
            const promise: Promise<Message.Response> = new Promise((resolve, _reject) => {
                this.unreceivedResponses.set(message.Id, { responseHandler: resolve, requestDt })
            })
            return promise
        }

        private sendMessage(message: Message.Message): null|Message.Response {
            if (!this.websocketIsReady) {
                return new Message.ErrorResponse(
                    Message.makeId(),
                    message.Id,
                    'InternalError',
                    'NetworkProblem',
                    'Websocket not ready.',
                )
            }
            try {
                this.websocket!.send(message.toJson())
            } catch (error) {
                this.config.logInfo('WebsocketConnection.sendMessage: Sending message failed.', error)
                return new Message.ErrorResponse(
                    Message.makeId(),
                    message.Id,
                    'InternalError',
                    'NetworkProblem',
                    'Websocket send failed!',
                )
            }
            if (this.isMessageToBeLogged(message)) {
                this.config.logDebug('WebsocketConnection.sendMessage: Sent message.', message)
            }
            this.scheduleNextHeartbeatSend()
            return null
        }

        private scheduleNextHeartbeatSend(): void {
            const time = new Date()
            time.setSeconds(time.getSeconds() + this.config.getHeartbeatSendIntervalSecs())
            this.nextHeartbeat = time
        }

        private scheduleHeartbeatReceiveTimeout(): void {
            const time = new Date()
            time.setSeconds(time.getSeconds() + this.config.getHeartbeatTimeoutSecs())
            this.heartbeatReceiveTimeout = time
        }

        private closeWebsocket(): void {
            this.config.logDebug('WebsocketConnection.closeWebsocket: Closing websocket.')
            this.websocketIsOpening = false
            this.websocketIsReady = false
            this.websocket?.removeEventListener('open', this.websocketOpenHandler)
            this.websocket?.removeEventListener('close', this.websocketCloseHandler)
            this.websocket?.removeEventListener('error', this.websocketErrorHandler)
            this.websocket?.removeEventListener('message', this.websocketMessageHandler)
            const readyState = this.websocket?.readyState ?? 3; // 3 is disconnected.
            if (readyState === 0 || readyState === 1) { // 0 is connecting, 1 is connected.
                try {
                    this.websocket?.close()
                } catch (error) {
                    this.config.logDebug('WebsocketConnection.closeWebsocket: Closing websocket failed.', error)
                }
            }
            this.websocket = null
            for (const [requestId, { responseHandler }] of this.unreceivedResponses.entries()) {
                this.unreceivedResponses.delete(requestId)
                responseHandler(new Message.ErrorResponse(
                    Message.makeId(), requestId, 'UnknownError', 'UnknownReason',
                    'Websocket disconnected! Message might have been processed or not.',
                ))
            }
        }

        private openWebsocket(): void {
            if (this.isStopped) {
                return
            }
            const url = this.config.getWebsocketUrl()
            this.config.logDebug('WebsocketConnection.openWebsocket: Opening websocket.', { url })
            try {
                this.websocket = new WebSocket(url)
            } catch (error) {
                this.config.logError('WebsocketConnection.openWebsocket: Websocket creation failed.', error)
                return
            }
            this.websocket.addEventListener('open', this.websocketOpenHandler)
            this.websocket.addEventListener('close', this.websocketCloseHandler)
            this.websocket.addEventListener('error', this.websocketErrorHandler)
            this.websocket.addEventListener('message', this.websocketMessageHandler)
            this.websocketIsOpening = true
        }

        private detectTimedoutMessages(now: Date): void {
            const timedoutDt = new Date(now)
            timedoutDt.setUTCSeconds(timedoutDt.getUTCSeconds() - this.config.getUnreceivedResponseTimeoutSecs())
            for (const [requestId, { responseHandler, requestDt }] of this.unreceivedResponses.entries()) {
                if (requestDt < timedoutDt) {
                    this.unreceivedResponses.delete(requestId)
                    responseHandler(new Message.ErrorResponse(
                        Message.makeId(), requestId, 'UnknownError', 'UnknownReason',
                        'No response received in time! Message might have been processed or not.',
                    ))
                }
            }
        }

        private onWebsocketOpen(ev: Event): void {
            if (this.isStopped) {
                return
            }
            this.config.logInfo('WebsocketConnection.onWebsocketOpen: Websocket open.', ev)
            this.scheduleNextHeartbeatSend()
            this.scheduleHeartbeatReceiveTimeout()
            this.websocketIsReady = true
            this.config.socketIsReadyHandler()
        }

        private onWebsocketClose(ev: CloseEvent): void {
            if (this.isStopped) {
                return
            }
            this.config.logInfo('WebsocketConnection.onWebsocketClose: Websocket closed.', ev)
            this.closeWebsocket()
            this.config.socketIsntReadyHandler()
        }

        private onWebsocketError(ev: Event): void {
            if (this.isStopped) {
                return
            }
            this.config.logInfo('WebsocketConnection.onWebsocketError: Websocket error.', ev)
        }

        private onWebsocketMessage(ev: MessageEvent): void {
            if (!this.websocketIsReady) {
                return
            }
            this.scheduleHeartbeatReceiveTimeout()
            const messageJson: string = ev.data

            let messageData: {[p: string]: any}
            try {
                messageData = JSON.parse(messageJson)
            } catch (error) {
                this.config.logError('WebsocketConnection.onWebsocketMessage: Received invalid JSON from websocket!', error, { messageJson })
                return
            }

            let message: Message.Message
            try {
                message = Message.OfObject(messageData)
            } catch (error) {
                this.config.logError('WebsocketConnection.onWebsocketMessage: Received invalid message from websocket!', error, { messageData })
                return
            }

            if (this.isMessageToBeLogged(message)) {
                this.config.logDebug('WebsocketConnection.onWebsocketMessage: Received message from websocket.', message)
            }

            if (message instanceof Message.Response) {
                const record = this.unreceivedResponses.get(message.RequestId)
                this.unreceivedResponses.delete(message.RequestId)
                record?.responseHandler(message)
            } else if (message instanceof Message.Request) {
                this.config.incommingRequestHandler(message)
                    .catch((error: Error) => new Message.ErrorResponse(
                        Message.makeId(),
                        message.Id,
                        'InternalError',
                        'InternalError',
                        error.message,
                    )).then(response => {
                        this.sendMessage(response)
                    })
            } else if (message instanceof Message.Notification) {
                this.config.incommingNotificationHandler(message)
                    .catch((error: Error) => this.config.logError('WebsocketConnection.onWebsocketMessage: Notification processing failed!', error, message))
            }
        }

        private isMessageToBeLogged(message: Message.Message): boolean
        {
            return !(message instanceof Message.PingRequest || message instanceof Message.PingResponse) || this.config.getLogPingMessages()
        }

    }

}
