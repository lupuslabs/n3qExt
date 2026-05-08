import { is } from '../lib/is'
import { as } from '../lib/as'
import { iter } from '../lib/Iter'
import { ErrorWithData, Utils } from '../lib/Utils'
import { CallableEventListeners, EventListeners } from '../lib/EventListeners'
import { PersonData } from '../lib/ItemProperties'
import { Config } from '../lib/Config'
import { Memory } from '../lib/Memory'
import { ContentApp } from './ContentApp'
import { ChatUtils } from '../lib/ChatUtils'
import { SimpleToast, Toast } from './Toast'
import { BackgroundMessage } from '../lib/BackgroundMessage'
import { InstantMessagesWindow } from './InstantMessagesWindow'
import { PrivateVidconfWindow } from './PrivateVidconfWindow'
import { TranslationOpts } from '../lib/Translator'

export class ContentInstantMessageManager
{
    private readonly app: ContentApp
    private isStopped: boolean = false
    private readonly imWindows: Map<string,InstantMessagesWindow> = new Map() // Key is otherUserId
    private readonly openImWindows: Set<string> = new Set() // Element is otherUserId

    private readonly openPrivateVidconfWindows: Map<string,PrivateVidconfWindow> = new Map() // Key is otherUserId
    private readonly openPrivateVidconfInviteToasts: Map<string,Toast> = new Map() // Key is otherUserId
    private readonly openPrivateVidconfDeclineToasts: Map<string,Toast> = new Map() // Key is otherUserId
    private readonly privateVidconfSecrets: Map<string,string> = new Map()
    private readonly callablePrivateVidchatWindowOpenListeners: CallableEventListeners<void> = new CallableEventListeners<void>('privateVidchatWindowOpen')
    private readonly callablePrivateVidchatWindowCloseListeners: CallableEventListeners<void> = new CallableEventListeners<void>('privateVidchatWindowClose')
    public readonly privateVidchatWindowOpenListeners: EventListeners<void>
    public readonly privateVidchatWindowCloseListeners: EventListeners<void>

    constructor(app: ContentApp)
    {
        this.app = app
        this.privateVidchatWindowOpenListeners = this.callablePrivateVidchatWindowOpenListeners
        this.privateVidchatWindowCloseListeners = this.callablePrivateVidchatWindowCloseListeners
        app.tabContentData.initListeners.addListener(() => this.onTabContentDataInit())
    }

    public isFeatureEnabled(): boolean
    {
        return as.Bool(Config.get('instantMessages.enabled'), true)
    }

    public getUnreadUserMessageCount(maxAgeSecs: number): number
    {
        const foldFun = (count: number, imWindow: InstantMessagesWindow) => count + imWindow.getUnreadUserMessageCount(maxAgeSecs)
        return iter(this.imWindows.values()).fold(0, foldFun)
    }

    public initiatePrivateVidconf(otherUserInfo: PersonData): void
    {
        if (this.isStopped || !this.isFeatureEnabled()) {
            return
        }
        (async() => {
            const otherUserId = otherUserInfo.userId
            if (this.openPrivateVidconfInviteToasts.has(otherUserId)) {
                this.openPrivateVidconfInviteToasts.get(otherUserId)?.close()
                this.openPrivateVidconfInviteToasts.delete(otherUserId)
            } else {
                const vidconfId = await this.getPrivateVidconfId(otherUserInfo)
                const inviteData: ChatUtils.VidconfInviteData = {vidconfId}
                await BackgroundMessage.sendInstantMessage(otherUserInfo.userId, 'vidconfInvite', JSON.stringify(inviteData))
            }
            this.openPrivateVidconfWindow(otherUserInfo)
        })().catch(error => this.app.onError(error))
    }

    public declinePrivateVidconf(otherUserInfo: PersonData)
    {
        if (this.isStopped || !this.isFeatureEnabled()) {
            return
        }
        BackgroundMessage.sendInstantMessage(otherUserInfo.userId, 'vidconfDecline', '{}')
            .catch(error => this.app.onError(error))
    }

    private onReceiveVidconfMessage(otherUserInfo: PersonData, message: ChatUtils.ChatMessage): void
    {
        switch (message.type) {
            case 'vidconfInvite': {
                this.handleVidconfInviteMessage(otherUserInfo, message)
            } break
            case 'vidconfDecline': {
                this.onReceiveVidconfDecline(otherUserInfo, message)
            } break
            default: {
                this.app.onError(new ErrorWithData('Unhandled private video conference message type!', {otherUserInfo, message}))
            } break
        }
    }

    private handleVidconfInviteMessage(otherUserInfo: PersonData, message: ChatUtils.ChatMessage): void
    {
        const otherUserId = otherUserInfo.userId
        if (!message.isUnread) {
            this.openPrivateVidconfInviteToasts.get(otherUserId)?.close()
            this.openPrivateVidconfInviteToasts.delete(otherUserId)
            return
        }

        const inviteData = ChatUtils.parseVidconfInviteData(message.text)
        this.privateVidconfSecrets.set(otherUserInfo.userId, inviteData.vidconfId)
        const vidconfIdKey = this.getPrivateVidconfSecretMemoryKey(otherUserInfo)
        Memory.setLocal(vidconfIdKey, inviteData.vidconfId).catch(error => this.app.onError(error))

        if (this.openPrivateVidconfWindows.has(otherUserId) || this.openPrivateVidconfInviteToasts.has(otherUserId)) {
            return
        }
        try {
            // Todo: Check for docked-out window already being open.

            const toastDuration = as.Float(Config.get('room.privateVidconfToastDurationSec'), 60)
            const translateOpts: TranslationOpts = {replacements: [
                ['{otherUserName}', otherUserInfo.userName],
                ['{messageTime}', Utils.dateOfUtcString(message.timestamp).toLocaleTimeString()],
            ]}
            const toastId = `privatevidconf.invite.${otherUserId}`
            const toastType = `privatevidconf.invite`
            const title = this.app.translateText('PrivateVidconf.inviteToastTitle', translateOpts)
            const text = this.app.translateText('PrivateVidconf.inviteToastMessage', translateOpts)
            const toast = new SimpleToast(this.app, toastId, toastDuration, toastType, title, text)
            toast.setIcon(otherUserInfo.userImageUrl, 10, 64, 64)
            const onCloseAction = () => {
                this.openPrivateVidconfInviteToasts.delete(otherUserId)
                this.getOrCreateImWindow(otherUserId).markMessagesAsReadByType('vidconfInvite')
            }
            toast.setDefaultAction(onCloseAction)
            toast.addClosingActionButton('Accept', () => {onCloseAction(); this.openPrivateVidconfWindow(otherUserInfo)})
            toast.addClosingActionButton('Decline', () => {onCloseAction(); this.declinePrivateVidconf(otherUserInfo)})
            toast.setDontShow(false)
            toast.show()
            this.openPrivateVidconfInviteToasts.set(otherUserId, toast)
        } catch (error) {
            this.app.onError(error)
        }
    }

    private onReceiveVidconfDecline(otherUserInfo: PersonData, message: ChatUtils.ChatMessage): void
    {
        const otherUserId = otherUserInfo.userId
        if (!message.isUnread) {
            this.openPrivateVidconfDeclineToasts.get(otherUserId)?.close()
            this.openPrivateVidconfDeclineToasts.delete(otherUserId)
            return
        }
        try {
            const toastDuration = as.Float(Config.get('room.privateVidconfToastDurationSec'), 60)
            const translateOpts: TranslationOpts = {replacements: [
                ['{otherUserName}', otherUserInfo.userName],
                ['{messageTime}', Utils.dateOfUtcString(message.timestamp).toLocaleTimeString()],
            ]}
            const toastId = `privatevidconf.decline`
            const toastType = `privatevidconf.decline`
            const title = this.app.translateText('PrivateVidconf.declineToastTitle', translateOpts)
            const text = this.app.translateText('PrivateVidconf.declineToastMessage', translateOpts)
            const toast = new SimpleToast(this.app, toastId, toastDuration, toastType, title, text)
            toast.setIcon(otherUserInfo.userImageUrl, 10, 64, 64)
            const onCloseAction = () => {
                this.openPrivateVidconfDeclineToasts.delete(otherUserId)
                this.getOrCreateImWindow(otherUserId).markMessagesAsReadByType('vidconfDecline')
            }
            toast.setDefaultAction(onCloseAction)
            toast.show()
            this.openPrivateVidconfDeclineToasts.set(otherUserId, toast)
        } catch (error) {
            this.app.onError(error)
        }
    }

    public openPrivateVidconfWindow(otherUserInfo: PersonData): void
    {
        if (this.isStopped || !this.isFeatureEnabled()) {
            return
        }
        (async() => {
            const otherUserId = otherUserInfo.userId
            this.getOrCreateImWindow(otherUserId).markMessagesAsReadByType('vidconfInvite')
            if (this.openPrivateVidconfWindows.has(otherUserId)) {
                return
            }

            const vidconfId = await this.getPrivateVidconfId(otherUserInfo)
            const vidconfRoomId = `-private-${vidconfId}`
            const urlTemplate = as.String(Config.get('room.vidconfUrl'), 'https://video.weblin.io/Vidconf?room=weblin{room}&name={name}');
            const url = urlTemplate
                .replace('{room}', encodeURIComponent(vidconfRoomId))
                .replace('{name}', encodeURIComponent(this.app.getUserName()))
            const privateVidconfWindow = new PrivateVidconfWindow(this.app, url, otherUserInfo)

            const aboveElem = this.app.getRoom()?.getParticipantByUserId(otherUserId)?.getElem() ?? null
            privateVidconfWindow.show({
                anchor: aboveElem,
                undocked: true,
                onClose: () => {
                    this.openPrivateVidconfWindows.delete(otherUserId)
                    this.callablePrivateVidchatWindowCloseListeners.callListeners()
                },
            })
            this.openPrivateVidconfWindows.set(otherUserId, privateVidconfWindow)
            this.callablePrivateVidchatWindowOpenListeners.callListeners()
        })().catch(error => this.app.onError(error))
    }

    public isAnyPrivateVidconfWindowOpen(): boolean
    {
        return this.openPrivateVidconfWindows.size !== 0
    }

    public stop(): void
    {
        this.isStopped = true
    }

    public onUserSettingsChanged(): void
    {
        if (this.isStopped || !this.isFeatureEnabled()) {
            return
        }
    }

    public onChatMessagePersisted(chatChannel: ChatUtils.ChatChannel, chatMessage: ChatUtils.ChatMessage): void
    {
        if (this.isStopped || !this.isFeatureEnabled() || chatChannel.type !== 'instantMessage') {
            return
        }
        const imWindow = this.getOrCreateImWindow(chatChannel.roomJid)
        imWindow.onChatMessagePersisted(chatChannel, chatMessage)
        if (chatChannel.roomJid !== this.app.getUserId() && ChatUtils.isVidconfMessageType(chatMessage.type)) {
            this.onReceiveVidconfMessage(imWindow.getOtherPersonData(), chatMessage)
        }
    }

    public onChatHistoryDeleted(deletions: {chatChannel: ChatUtils.ChatChannel, olderThanTime: string}[]): void
    {
        if (this.isStopped || !this.isFeatureEnabled()) {
            return
        }
        for (const { chatChannel, olderThanTime } of deletions) {
            if (chatChannel.type === 'instantMessage') {
                this.imWindows.get(chatChannel.roomJid)?.onChatHistoryDeleted([{ chatChannel, olderThanTime }])
            }
        }
    }

    public onUnreadChatChannels(unreadChatChannels: ChatUtils.ChatChannel[]): void
    {
        if (this.isStopped || !this.isFeatureEnabled()) {
            return
        }
        iter(unreadChatChannels)
            .filter(channel => channel.type === 'instantMessage')
            .forEach(channel => this.getOrCreateImWindow(channel.roomJid))
    }

    public onInstantMessagesWindowOpen(otherUserId: string): void
    {
        this.openImWindows.add(otherUserId)
        this.updateTabContentData()
    }

    public onInstantMessagesWindowClose(otherUserId: string): void
    {
        this.openImWindows.delete(otherUserId)
        this.updateTabContentData()
    }

    public openInstantMessagesWindow(otherUser: string|Readonly<PersonData>): void
    {
        if (this.isStopped || !this.isFeatureEnabled()) {
            return
        }
        const window = this.getOrCreateImWindow(otherUser)
        if (window.isOpen()) {
            return
        }
        const otherUserId = window.getOtherPersonData().userId
        const participantElem = this.app.getRoom()?.getParticipantByUserId(otherUserId)?.getElem() ?? null
        window.show({ anchor: participantElem })
    }

    public closeInstantMessagesWindow(otherUserId: string): void
    {
        const window = this.imWindows.get(otherUserId)
        if (!window?.isOpen()) {
            return
        }
        window.close()
    }

    public toggleInstantMessageWindow(otherUserId: string): void
    {
        if (otherUserId.length === 0) {
            return
        }
        if (this.imWindows.get(otherUserId)?.isOpen()) {
            this.closeInstantMessagesWindow(otherUserId)
        } else {
            this.openInstantMessagesWindow(otherUserId)
        }
    }

    private onTabContentDataInit(): void
    {
        const openImWindowUserIds = this.app.tabContentData.get('openImWindowUserIds') ?? []
        if (!is.array(openImWindowUserIds, is.string)) {
            this.app.onError(new ErrorWithData('TabContentData contains invalid data for key openImWindowUserIds!', { openImWindowUserIds }))
            return
        }
        for (const otherUserId of openImWindowUserIds) {
            this.openInstantMessagesWindow(otherUserId)
        }
    }

    private updateTabContentData(): void
    {
        this.app.tabContentData.set('openImWindowUserIds', [...this.openImWindows])
    }

    private getOrCreateImWindow(otherUser: string|Readonly<PersonData>): InstantMessagesWindow
    {
        if (is.string(otherUser)) {
            const personMgr = this.app.personManager
            otherUser = personMgr.getPersonDataOrNull(otherUser) ?? personMgr.getDummyPersonData(otherUser)
        }

        const otherUserId = otherUser.userId
        let imWindow: null|InstantMessagesWindow = this.imWindows.get(otherUserId) ?? null
        if (!imWindow) {
            imWindow = new InstantMessagesWindow(this.app, otherUser)
            this.imWindows.set(otherUserId, imWindow)
        }
        return imWindow
    }

    private getPrivateVidconfSecretMemoryKey(otherUserInfo: PersonData): string
    {
        return `client.vidconfSecret.${otherUserInfo.userId}`
    }

    private async getPrivateVidconfId(otherUserInfo: PersonData): Promise<string>
    {
        const cachedVidconfId = this.privateVidconfSecrets.get(otherUserInfo.userId) ?? null
        if (is.string(cachedVidconfId)) {
            return cachedVidconfId
        }
        const vidconfIdKey = this.getPrivateVidconfSecretMemoryKey(otherUserInfo)
        const storedVidconfId = as.String(await Memory.getLocal(vidconfIdKey))
        if (is.nonEmptyString(storedVidconfId)) {
            return storedVidconfId
        }
        const newVidconfId = Utils.randomString(10)
        this.privateVidconfSecrets.set(otherUserInfo.userId, newVidconfId)
        await Memory.setLocal(vidconfIdKey, newVidconfId)
        return newVidconfId
    }

}
