import log = require('loglevel');
import { as } from '../lib/as'
import { RetryStrategyFactorGrowthMaker } from '../lib/RetryStrategy'
import { Config } from '../lib/Config'
import { BackgroundApp } from './BackgroundApp';
import { WebsocketConnection } from '../lib/WebsocketConnection'
import { WebsocketServerMessage as Message } from '../lib/WebsocketServerMessage'
import { Utils } from '../lib/Utils'

export class WebsocketManager
{
    private readonly app: BackgroundApp

    private readonly websocketControllerConfig: WebsocketConnection.Config = {
        getWebsocketUrl: () => as.String(Config.get('websocketServer.serviceUrl')),
        getUnreceivedResponseTimeoutSecs: () => as.Float(Config.get('websocketServer.unreceivedResponseTimeoutSecs'), 30),
        getHeartbeatSendIntervalSecs: () => as.Float(Config.get('websocketServer.heartbeatSendIntervalSecs'), 15),
        getHeartbeatTimeoutSecs: () => as.Float(Config.get('websocketServer.heartbeatTimeoutSecs'), 30),
        getWebsocketOpenRetryStrategy: () => new RetryStrategyFactorGrowthMaker(
            as.Float(Config.get('websocketServer.connectRetryStrategyFirstRetryDelaySecs'), 30),
            as.Float(Config.get('websocketServer.connectRetryStrategyDelayGrowthFactor'), 30),
            as.Float(Config.get('websocketServer.connectRetryStrategyRetryDelayMaxSecs'), 30)
        ).makeRetryStrategy(),
        logDebug: (msg, ...data) => this.logDebug(msg, ...data),
        logInfo:  (msg, ...data) => this.logInfo(msg, ...data),
        logError: (msg, ...data) => this.logError(msg, ...data),
        socketIsReadyHandler: () => this.handleWebsocketIsReady(),
        socketIsntReadyHandler: () => this.handleWebsocketIsntReady(),
        incommingRequestHandler: (request) => this.handleRequest(request),
        incommingNotificationHandler: (notification) => this.handleNotification(notification),
    }
    private lastServiceUrl: string = ''
    private websocketController: null|WebsocketConnection.Connection

    private isStopped: boolean = false
    private wantsToBeConnected: boolean = false
    private isReady: boolean = false

    public constructor(app: BackgroundApp)
    {
        this.app = app
    }

    public stop(): void
    {
        this.isStopped = true
        this.stopWebsocketController()
    }

    public onConfigUpdated(): void
    {
        if (this.isStopped) {
            return
        }
        const currentServiceUrl = this.websocketControllerConfig.getWebsocketUrl()
        const isServiceUrlChanged = currentServiceUrl !== this.lastServiceUrl
        this.lastServiceUrl = currentServiceUrl
        if (currentServiceUrl === '') {
            this.stopWebsocketController()
        } else if (isServiceUrlChanged || !this.wantsToBeConnected) {
            this.stopWebsocketController()
            this.startWebsocketController()
        }
    }

    public maintain(): void
    {
        if (!this.wantsToBeConnected) {
            return
        }
        this.websocketController?.maintain()
    }

    private stopWebsocketController(): void
    {
        this.isReady = false
        this.wantsToBeConnected = false
        this.websocketController?.stop()
        this.websocketController = null
    }

    private startWebsocketController(): void
    {
        if (this.isStopped || this.websocketController) {
            return
        }
        this.isReady = false
        this.wantsToBeConnected = true
        this.websocketController = new WebsocketConnection.Connection(this.websocketControllerConfig)
    }

    private handleWebsocketIsReady(): void {
        if (!this.wantsToBeConnected) {
            return
        }
        const userId: string = this.app.getUserId()
        const token: string = this.app.getUserToken()
        this.websocketController?.sendRequest(new Message.UserAuthRequest(Message.makeId(), userId, token))
            .then(response => {
                if (this.isReady || !this.wantsToBeConnected) {
                    this.logDebug('WebsocketManager.handleWebsocketIsReady: Ignored UserAuthRequest response because not connecting.', { response, userId })
                    return
                }
                if (response instanceof Message.UserAuthResponse) {
                    this.isReady = true
                    this.websocketController?.confirmWebsocketIsGood()
                    this.logInfo('WebsocketManager.handleWebsocketIsReady: UserAuthRequest accepted. Connection authenticated and ready.')
                    return
                }
                this.websocketController?.reconnectWebsocket()
                this.logInfo('WebsocketManager.handleWebsocketIsReady: UserAuthRequest denied.', { response, userId })
            })
            .then(() => this.maintain())
    }

    private handleWebsocketIsntReady(): void {
        if (!this.wantsToBeConnected) {
            return
        }
        this.isReady = false
        this.maintain()
    }

    private async handleRequest(request: Message.Request): Promise<Message.Response> {
        if (request instanceof Message.PingRequest) {
            return new Message.PingResponse(Message.makeId(), request.Id)
        }
        return new Message.ErrorResponse(
            Message.makeId(),
            request.Id,
            'Refused',
            'InvalidArgument',
            'Unknown request type!',
        )
    }

    private async handleNotification(notification: Message.Notification): Promise<void> {
        if (notification instanceof Message.ItemsNotification) {
            return this.handleItemsNotification(notification)
        }
        this.logDebug('WebsocketManager.handleNotification: Ignored unhandled notification.', notification)
    }

    private async handleItemsNotification(notification: Message.ItemsNotification): Promise<void> {
        if (notification.InventoryId !== this.app.getUserId()) {
            this.logInfo('WebsocketManager.handleNotification: ItemsNotification isn\'t for our backpack.', notification)
            return
        }
        if (!Utils.isBackpackEnabled()) {
            this.logInfo('WebsocketManager.handleNotification: Ignored ItemsNotification for our backpack because backpack is disabled.', notification)
            return
        }
        this.app.getBackpack().onItemUpdateFromProvider(notification.ItemsDeleted, notification.ItemsUpdatedOrCreated)
        this.logDebug('WebsocketManager.handleNotification: Updated backpack.', notification)
    }

    private logDebug(msg: string, ...data: any[]): void {
        if (Utils.logChannel('websocketServerConnection', false)) {
            log.debug(msg, ...data)
        }
    }

    private logInfo(msg: string, ...data: any[]): void {
        if (Utils.logChannel('websocketServerConnection', false)) {
            log.info(msg, ...data)
        }
    }

    private logError(msg: string, ...data: any[]): void {
        log.info(msg, ...data)
    }

}
