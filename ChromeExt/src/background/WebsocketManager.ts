import { as } from '../lib/as'
import type { Logger } from '../lib/Logger';
import { RetryStrategyFactorGrowthMaker } from '../lib/RetryStrategy'
import { Config } from '../lib/Config'
import { BackgroundApp } from './BackgroundApp';
import { WebsocketConnection } from '../lib/WebsocketConnection'
import { WebsocketMessage as Message } from '../lib/WebsocketMessage'
import { Utils } from '../lib/Utils'

export class WebsocketManager
{
    private readonly app: BackgroundApp
    private readonly log: Logger

    private readonly websocketControllerConfig: WebsocketConnection.Config
    private lastServiceUrl: string = ''
    private websocketController: null|WebsocketConnection.Connection

    private isStopped: boolean = false
    private wantsToBeConnected: boolean = false
    private isReady: boolean = false

    public constructor(app: BackgroundApp)
    {
        this.app = app
        this.log = app.getLogger().getSubLogger('websocketConnection', 'Websocket:')
        this.websocketControllerConfig = {
            getWebsocketUrl: () => as.String(Config.get('websocket.serviceUrl')),
            getUnreceivedResponseTimeoutSecs: () => as.Float(Config.get('websocket.unreceivedResponseTimeoutSecs'), 30),
            getHeartbeatSendIntervalSecs: () => as.Float(Config.get('websocket.heartbeatSendIntervalSecs'), 15),
            getHeartbeatTimeoutSecs: () => as.Float(Config.get('websocket.heartbeatTimeoutSecs'), 30),
            getWebsocketOpenRetryStrategy: () => new RetryStrategyFactorGrowthMaker(
                as.Float(Config.get('websocket.connectRetryStrategyFirstRetryDelaySecs'), 30),
                as.Float(Config.get('websocket.connectRetryStrategyDelayGrowthFactor'), 30),
                as.Float(Config.get('websocket.connectRetryStrategyRetryDelayMaxSecs'), 30)
            ).makeRetryStrategy(),
            log: this.log,
            getLogPingMessages: () => Utils.logChannel('websocketConnectionPings', false),
            socketIsReadyHandler: () => this.handleWebsocketIsReady(),
            socketIsntReadyHandler: () => this.handleWebsocketIsntReady(),
            incomingRequestHandler: (request) => this.handleRequest(request),
            incomingNotificationHandler: (notification) => this.handleNotification(notification),
        }
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

    public async sendRequest(message: Message.Request): Promise<Message.Response> {
        if (!this.isReady) {
            return new Message.ErrorResponse(Message.makeId(), message.Id, 'InternalError', 'NetworkProblem', 'Websocket not ready.')
        }
        return this.websocketController!.sendRequest(message)
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
                    this.log.logDebug('WebsocketManager.handleWebsocketIsReady: Ignored UserAuthRequest response because not connecting.', { response, userId })
                    return
                }
                if (response instanceof Message.UserAuthResponse) {
                    this.isReady = true
                    this.websocketController?.confirmWebsocketIsGood()
                    this.log.logInfo('WebsocketManager.handleWebsocketIsReady: UserAuthRequest accepted. Connection authenticated and ready.')
                    this.app.getWebsocketRoomManager().onWebsocketReady();
                    return
                }
                this.websocketController?.reconnectWebsocket()
                this.log.logInfo('WebsocketManager.handleWebsocketIsReady: UserAuthRequest denied.', { response, userId })
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
        if (notification instanceof Message.RoomItemsNotification) {
            return this.app.getWebsocketRoomManager().handleRoomItemsNotification(notification);
        }
        if (notification instanceof Message.ItemsNotification) {
            return this.handleItemsNotification(notification)
        }
        if (notification instanceof Message.InstantMessageNotification) {
            return this.app.getInstantMessageManager().handleInstantMessageNotification(notification)
        }
        if (notification instanceof Message.FriendshipProposalNotification) {
            return this.app.getFriendshipProposalManager().handleFriendshipProposalNotification(notification)
        }
        if (notification instanceof Message.FriendshipProposalCanceledNotification) {
            return this.app.getFriendshipProposalManager().handleFriendshipProposalCanceledNotification(notification)
        }
        this.log.logDebug('WebsocketManager.handleNotification: Ignored unhandled notification.', { notification })
    }

    private async handleItemsNotification(notification: Message.ItemsNotification): Promise<void> {
        if (notification.InventoryId !== this.app.getUserId()) {
            this.log.logInfo('WebsocketManager.handleItemsNotification: ItemsNotification isn\'t for our backpack.', { notification })
            return
        }
        if (!Utils.isBackpackEnabled()) {
            this.log.logInfo('WebsocketManager.handleItemsNotification: Ignored ItemsNotification for our backpack because backpack is disabled.', { notification })
            return
        }
        await this.app.getBackpack().onItemUpdateFromProvider(notification.ItemsDeleted, notification.ItemsUpdatedOrCreated)
        this.log.logDebug('WebsocketManager.handleItemsNotification: Updated backpack.', { notification })
    }
}
