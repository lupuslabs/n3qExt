import log = require('loglevel');
import { BackgroundMessagePipe, BackgroundRequestEnvelope, BackgroundResponseEnvelope } from './BackgroundMessage'
import { BackgroundMessagePipeProvider } from './BackgroundToContentCommunicator'
import { ContentMessagePipeProvider } from './ContentToBackgroundCommunicator'

export type PostMessageHandler = (message: BackgroundRequestEnvelope|BackgroundResponseEnvelope) => void

export class SamethreadMessagePipeEnd implements BackgroundMessagePipe
{
    private readonly postMessageHandler: PostMessageHandler
    private readonly onDisconnectHandlers: (() => void)[] = []
    private readonly messagesToSend: (BackgroundRequestEnvelope|BackgroundResponseEnvelope)[] = []
    private readonly onMessageHandlers: ((message: BackgroundRequestEnvelope|BackgroundResponseEnvelope) => void)[] = []

    public readonly contentTabId: number = 0

    public constructor(postMessageHandler: PostMessageHandler)
    {
        this.postMessageHandler = postMessageHandler
    }

    public addOnDisconnectHandler(handler: () => void): void
    {
        this.onDisconnectHandlers.push(handler)
    }

    public addOnMessageHandler(handler: (message: BackgroundRequestEnvelope|BackgroundResponseEnvelope) => void): void
    {
        this.onMessageHandlers.push(handler)
    }

    public postMessage(message: BackgroundRequestEnvelope|BackgroundResponseEnvelope): Promise<void>
    {
        return new Promise<void>(resolve => {
            this.postMessageHandler(message)
            resolve()
        })
    }

    public disconnect(): void
    {
        this.onDisconnectHandlers.forEach(handler => handler())
    }

    public handleMessage(message: BackgroundRequestEnvelope|BackgroundResponseEnvelope): void
    {
        this.messagesToSend.push(message);
        if (this.onMessageHandlers.length) {
            try {
                while (this.messagesToSend.length) {
                    const message = this.messagesToSend.shift()
                    this.onMessageHandlers.forEach(handler => handler(message))
                }
            } catch (error) {
                log.info('SameThreadMessagePipeEnd.handleMessage: handler failed!', error)
            }
        }
    }

}

export class SamethreadBackgroundMessagePipeProvider implements BackgroundMessagePipeProvider
{
    private readonly onConnectHandlers: ((pipe: BackgroundMessagePipe) => void)[] = []

    public constructor() { }

    public addOnMessagePipeConnectHandler(onConnectHandler: (pipe: BackgroundMessagePipe) => void): void
    {
        this.onConnectHandlers.push(onConnectHandler)
    }

    public handleNewMessagePipe(pipe: SamethreadMessagePipeEnd): void
    {
        this.onConnectHandlers.forEach(handler => handler(pipe))
    }

}

export class SamethreadContentMessagePipeProvider implements ContentMessagePipeProvider
{

    public readonly backgroundPipeProvider: SamethreadBackgroundMessagePipeProvider

    public constructor(backgroundPipeProvider: SamethreadBackgroundMessagePipeProvider) {
        this.backgroundPipeProvider = backgroundPipeProvider
    }

    connectNewBackroundMessagePipe(): BackgroundMessagePipe
    {
        let contentPipeEnd: SamethreadMessagePipeEnd
        let backgroundPipeEnd: SamethreadMessagePipeEnd
        const contentMessageForwarder: PostMessageHandler = (message) => {
            backgroundPipeEnd.handleMessage(message)
        }
        const backgroundMessageForwarder: PostMessageHandler = (message) => {
            contentPipeEnd.handleMessage(message)
        }
        contentPipeEnd = new SamethreadMessagePipeEnd(contentMessageForwarder)
        backgroundPipeEnd = new SamethreadMessagePipeEnd(backgroundMessageForwarder)
        try {
            this.backgroundPipeProvider.handleNewMessagePipe(backgroundPipeEnd)
        } catch (error) {
            log.info('SamethreadContentMessagePipeProvider.connectNewBackroundMessagePipe: backgroundPipeProvider.handleNewMessagePipe failed!', error)
        }
        return contentPipeEnd
    }

}
