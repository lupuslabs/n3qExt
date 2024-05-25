import log = require('loglevel');
import { as } from '../lib/as'
import { Utils } from '../lib/Utils'
import { Config } from '../lib/Config'
import { BackgroundApp } from './BackgroundApp';
import { WebsocketServerMessage as Message } from '../lib/WebsocketServerMessage'
import { ContentMessage, FriendshipProposalState, FriendshipProposalsState } from '../lib/ContentMessage'

export class BackgroundFriendshipProposalManager
{
    private readonly app: BackgroundApp

    private proposals: Map<string,FriendshipProposalState> = new Map();
    private cancelations: Set<string> = new Set();
    private stateMsgForContent: { type: string, data: FriendshipProposalsState }

    private isStopped: boolean = false

    public constructor(app: BackgroundApp)
    {
        this.app = app
        this.updateStateMsgForContent()
    }

    public stop(): void
    {
        this.isStopped = true
    }

    public onConfigUpdated(): void
    {
        if (this.isStopped) {
            return
        }

        if (!this.isFeatureEnabled()) {
            for (const { proposingUserId } of this.proposals.values()) {
                this.proposals.delete(proposingUserId)
                this.cancelations.add(proposingUserId)
            }
        }
    }

    public maintain(): void
    {
        if (this.isStopped) {
            return
        }
    }

    public onNewTab(tabId: number): void
    {
        this.app.sendToTab(tabId, this.stateMsgForContent)
    }

    public handleFriendshipProposalNotification(notification: Message.FriendshipProposalNotification): void {
        if (this.isStopped || !this.isFeatureEnabled()) {
            return
        }
        if (notification.OtherId !== this.app.getUserId()) {
            this.logInfo('WebsocketManager.handleFriendshipProposalNotification: FriendshipProposalNotification isn\'t for us.', notification)
            return
        }
        if (!Utils.isBackpackEnabled()) {
            this.logInfo('WebsocketManager.handleFriendshipProposalNotification: Ignored FriendshipProposalNotification because backpack is disabled.', notification)
            return
        }
        this.logDebug('WebsocketManager.handleFriendshipProposalNotification: Handling new status.', notification)

        const proposingUserId = notification.ActorId
        const statusOld = this.proposals.get(proposingUserId) ?? null
        const firstNotificationTime = statusOld?.firstNotificationTime ?? new Date()
        const proposingUserName = notification.ActorName
        const proposingUserImageUrl = notification.ActorImageUrl
        const statusNew: FriendshipProposalState = { proposingUserId, proposingUserName, proposingUserImageUrl, firstNotificationTime }
        if (!statusOld || statusOld.proposingUserName !== statusNew.proposingUserName || statusOld.proposingUserImageUrl !== statusNew.proposingUserImageUrl) {
            this.cancelations.delete(proposingUserId)
            this.proposals.set(proposingUserId, statusNew)
            this.updateStateMsgForContent()
            this.app.sendToAllTabs(this.stateMsgForContent)
        }
    }

    public handleFriendshipProposalCanceledNotification(notification: Message.FriendshipProposalCanceledNotification): void {
        if (this.isStopped || !this.isFeatureEnabled()) {
            return
        }
        if (notification.OtherId !== this.app.getUserId()) {
            this.logInfo('WebsocketManager.handleFriendshipProposalCanceledNotification: FriendshipProposalCanceledNotification isn\'t for us.', notification)
            return
        }
        this.logDebug('WebsocketManager.handleFriendshipProposalCanceledNotification: Handling new status.', notification)

        const proposingUserId = notification.ActorId
        if (this.proposals.has(proposingUserId)) {
            this.proposals.delete(proposingUserId)
            this.cancelations.add(proposingUserId)
            this.updateStateMsgForContent()
            this.app.sendToAllTabs(this.stateMsgForContent)
        }
    }

    private updateStateMsgForContent(): void
    {
        const type = ContentMessage.type_friendshipProposalsState
        const proposed = [...this.proposals.values()]
        const canceled = [...this.cancelations]
        this.stateMsgForContent = { type, data: { proposed, canceled } }
    }

    private isFeatureEnabled(): boolean
    {
        return as.Bool(Config.get('friendshipProposals.enabled'), true)
    }

    private logDebug(msg: string, ...data: any[]): void {
        if (Utils.logChannel('friendshipProposals', false)) {
            log.debug(msg, ...data)
        }
    }

    private logInfo(msg: string, ...data: any[]): void {
        if (Utils.logChannel('friendshipProposals', false)) {
            log.info(msg, ...data)
        }
    }

}
