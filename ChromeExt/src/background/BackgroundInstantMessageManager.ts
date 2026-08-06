import log = require('loglevel')
import { as } from '../lib/as'
import { Utils } from '../lib/Utils'
import { Config } from '../lib/Config'
import { ChatUtils } from '../lib/ChatUtils'
import { BackgroundApp } from './BackgroundApp';
import { WebsocketMessage as WsMessage } from '../lib/WebsocketMessage'
import { ItemException } from '../lib/ItemException'
import { BackgroundBrowserTab } from './BackgroundBrowserTabs'
import { ContentMessage } from '../lib/ContentMessage'

import InstantMessageType = ChatUtils.InstantMessageType
import isInstantMessageType = ChatUtils.isInstantMessageType

export class BackgroundInstantMessageManager
{
    private readonly app: BackgroundApp

    private isStopped: boolean = false

    public constructor(app: BackgroundApp)
    {
        this.app = app
        this.app.getBrowserTabs().tabContentReadyListeners.addListener(tab => this.sendUnreadChannelsToTab(tab))
    }

    public stop(): void
    {
        this.isStopped = true
    }

    public maintain(): void
    {
        if (this.isStopped || !this.isFeatureEnabled()) {
            return
        }
    }

    public async sendInstantMessage(otherUserId: string, type: InstantMessageType, text: string): Promise<void>
    {
        if (this.isStopped || !this.isFeatureEnabled()) {
            throw new ItemException(ItemException.Fact.NotExecuted, ItemException.Reason.NotStarted, 'Not ready or feature disabled.')
        }
        this.logDebug('Sending instant message to server.', { otherUserId, type, text })
        const response = await this.app.getWebsocketManager().sendRequest(new WsMessage.SendInstantMessageRequest(WsMessage.makeId(), otherUserId, type, text))
        if (!(response instanceof WsMessage.SendInstantMessageOkResponse)) {
            throw new ItemException(ItemException.Fact.InternalError, ItemException.Reason.InternalError, 'Invalid response from server.')
        }
        const userId: string = this.app.getUserId()
        const chatChannel: ChatUtils.ChatChannel = {
            type: 'instantMessage',
            roomJid: otherUserId,
            roomNick: '',
        }
        const chatMessage: ChatUtils.ChatMessage = {
            timestamp: Utils.utcStringOfDate(response.Time),
            isUnread: false,
            id: response.InstantMessageId,
            type,
            authorUserId: userId,
            authorName: '',
            authorImageUrl: '',
            text: text,
        }
        this.app.handle_newChatMessage(chatChannel, chatMessage, false)
            .catch(error => this.logError('', error, { chatChannel, chatMessage }))
    }

    public handleInstantMessageNotification(notification: WsMessage.InstantMessageNotification): void
    {
        if (this.isStopped || !this.isFeatureEnabled()) {
            return
        }
        this.sendMessageReceivedConfirmation(notification) // Message is resent and blocks the queue until confirmed.

        if (notification.RecipientUserId !== this.app.getUserId()) {
            this.logError('Instant message isn\'t for us.', notification)
            return
        }
        this.logDebug('Handling instant message.', notification)

        const chatChannel: ChatUtils.ChatChannel = {
            type: 'instantMessage',
            roomJid: notification.AuthorUserId,
            roomNick: '',
        }

        let messageType: string = notification.InstantMessageType
        if (messageType.length === 0) {
            messageType = 'chat'
        }
        if (!isInstantMessageType(messageType)) {
            this.logError('Instant message isn\'t of supported type.', notification)
            return
        }

        const messageId = notification.InstantMessageId
        const chatMessage: ChatUtils.ChatMessage = {
            timestamp: Utils.utcStringOfDate(notification.Time),
            isUnread: true,
            id: messageId,
            type: messageType,
            authorUserId: notification.AuthorUserId,
            authorName: notification.AuthorName,
            authorImageUrl: notification.AuthorImageUrl,
            text: notification.InstantMessage,
        }

        this.app.handle_newChatMessage(chatChannel, chatMessage, false)
            .catch(error => this.logError('', error, {chatChannel, chatMessage}))
    }

    private sendMessageReceivedConfirmation(notification: WsMessage.InstantMessageNotification): void {
        const socketMsg = new WsMessage.InstantMessageHasBeenReceivedRequest(WsMessage.makeId(), notification.InstantMessageId)
        this.app.getWebsocketManager().sendRequest(socketMsg)
            .catch(error =>this.logError('', error, {notification}))
    }

    private sendUnreadChannelsToTab(tab: BackgroundBrowserTab): void
    {
        (async () => {
            const channelsGetLimit = Math.max(1, as.Int(Config.get('instantMessages.unreadChatChannelsToSendToNewTabs')))
            const unreadChatChannels = await this.app.getChatHistoryStorage().getUnreadChatChannelsByType('instantMessage', channelsGetLimit)
            if (unreadChatChannels.length === 0) {
                return
            }
            const messageForTab = {
                type: ContentMessage.type_unreadChatChannels,
                data: { unreadChatChannels },
            }
            tab.sendMessage(messageForTab)
        })().catch(error => this.logError('InstantMessages: sendUnreadChannelsToTab failed!', error))
    }

    public isFeatureEnabled(): boolean
    {
        return as.Bool(Config.get('instantMessages.enabled'), true)
    }

    private logDebug(msg: string, ...data: any[]): void {
        if (Utils.logChannel('instantMessages', false)) {
            log.info(`InstantMessages: ${msg}`, ...data)
        }
    }

    private logError(msg: string, ...data: any[]): void {
        log.info(`InstantMessages: ${msg}`, ...data)
    }

}
