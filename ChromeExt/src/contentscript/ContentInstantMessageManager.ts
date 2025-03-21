import { is } from '../lib/is'
import { as } from '../lib/as'
import { iter } from '../lib/Iter'
import { Config } from '../lib/Config'
import { ContentApp } from './ContentApp'
import { ChatUtils } from '../lib/ChatUtils'
import { InstantMessagesWindow } from './InstantMessagesWindow'
import { ErrorWithData } from '../lib/Utils'
import { PersonData } from '../lib/ItemProperties'

export class ContentInstantMessageManager
{
    private readonly app: ContentApp
    private isStopped: boolean = false
    private readonly imWindows: Map<string,InstantMessagesWindow> = new Map()
    private readonly openImWindows: Set<string> = new Set()

    constructor(app: ContentApp)
    {
        this.app = app
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
        this.getOrCreateImWindow(chatChannel.roomJid).onChatMessagePersisted(chatChannel, chatMessage)
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
        window.show({ above: participantElem })
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

}
