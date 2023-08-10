import { BackgroundMessagePipe, BackgroundRequestEnvelope, BackgroundResponseEnvelope } from './BackgroundMessage'
import { BackgroundMessagePipeProvider } from './BackgroundToContentCommunicator'
import { ContentMessagePipeProvider } from './ContentToBackgroundCommunicator'

type Port = chrome.runtime.Port

export class PortMessagePipe implements BackgroundMessagePipe
{
    private readonly port: Port
    public readonly contentTabId: number

    public constructor(port: Port)
    {
        this.port = port
        this.contentTabId = port.sender?.tab?.id ?? 0
    }

    public addOnDisconnectHandler(handler: () => void): void
    {
        this.port.onDisconnect.addListener((port: Port) => handler())
    }

    public addOnMessageHandler(handler: (message: BackgroundRequestEnvelope|BackgroundResponseEnvelope) => void): void
    {
        this.port.onMessage.addListener(message => handler(message))
    }

    public async postMessage(message: BackgroundRequestEnvelope|BackgroundResponseEnvelope): Promise<void>
    {
        this.port.postMessage(message)
    }

    public disconnect(): void
    {
        this.port.disconnect()
    }

}

export class PortBackgroundMessagePipeProvider implements BackgroundMessagePipeProvider
{

    public constructor() { }

    public addOnMessagePipeConnectHandler(onConnectHandler: (pipe: BackgroundMessagePipe) => void): void
    {
        chrome.runtime.onConnect.addListener((port: Port) => onConnectHandler(new PortMessagePipe(port)))
    }

}

export class PortContentMessagePipeProvider implements ContentMessagePipeProvider
{

    public constructor() { }

    connectNewBackroundMessagePipe(): BackgroundMessagePipe
    {
        return new PortMessagePipe(chrome.runtime.connect())
    }

}
