import { iter } from '../lib/Iter'
import { Config } from '../lib/Config'
import { ContentApp } from './ContentApp'
import { ChatUtils } from '../lib/ChatUtils'
import { ChatWindow } from './ChatWindow'
import { SimpleToast, Toast } from './Toast'
import { PersonData } from '../lib/ItemProperties'
import { BackgroundMessage, BackgroundRequest, PopupDefinition } from '../lib/BackgroundMessage'
import { Utils } from '../lib/Utils'
import { ContentMessage, ContentOpenInstantMessagesWindowMessage, ContentSetGuiModeMessage } from '../lib/ContentMessage'

export class InstantMessagesWindow extends ChatWindow
{
    protected readonly otherUserId: string
    protected otherUser: Readonly<PersonData>
    protected unreadMessageToast: null|Toast = null
    protected unreadMessageToastMessageId: string = ''

    public constructor(app: ContentApp, otherUser: Readonly<PersonData>)
    {
        const chatChannel: ChatUtils.ChatChannel = {
            type: 'instantMessage',
            roomJid: otherUser.userId,
            roomNick: '',
        }
        super(app, chatChannel)
        this.otherUserId = otherUser.userId
        this.otherUser = otherUser

        this.windowCssClasses.push('instantmessageswindow')
        this.titleText = 'Private Chat with {other}';
        this.titleTextId = 'PrivateChat.Private Chat with';
        this.titleTextReplacements.set('{other}', () => this.getUserInfo(this.otherUserId).userName);
    }

    public getOtherPersonData(): Readonly<PersonData>
    {
        return this.otherUser
    }

    protected async makeContent(): Promise<void>
    {
        await super.makeContent()
    }

    protected onVisible(): void
    {
        super.onVisible()
        this.app.instantMessageManager.onInstantMessagesWindowOpen(this.otherUserId)
    }

    protected onInvisible(): void
    {
        super.onInvisible()
        this.app.instantMessageManager.onInstantMessagesWindowClose(this.otherUserId)
    }

    protected onViewportVisible(): void
    {
        super.onViewportVisible()
        this.updateUnreadMessageToast()
    }

    protected makeUndockPopupDefinition(): PopupDefinition
    {
        const popupId = `InstantMessages:${this.otherUserId}`
        const setGuiRequest: ContentSetGuiModeMessage = {
            type: ContentMessage.type_setGuiMode, mode: 'popupWindow',
        }
        const openImRequest: ContentOpenInstantMessagesWindowMessage = {
            type: ContentMessage.type_openInstantMessagesWindow, otherPerson: this.otherUser,
        }
        const startupRequests: BackgroundRequest[] = [setGuiRequest, openImRequest]
        const startupRequestsArg = encodeURIComponent(JSON.stringify(startupRequests))
        const popupDefinition: PopupDefinition = {
            id: popupId,
            url: '/assets/popupApp.html?startupRequests=' + startupRequestsArg,
            top: Config.get('instantMessages.undockedTop', 100),
            left: Config.get('instantMessages.undockedLeft', 100),
            height: Config.get('instantMessages.undockedHeight', 400),
            width: Config.get('instantMessages.undockedWidth', 600),
            allowContentApp: true,
        }
        return popupDefinition
    }

    protected storeChatMessage(chatMessage: ChatUtils.ChatMessage): void
    {
        super.storeChatMessage(chatMessage)
        this.updateUnreadMessageToast()
    }

    protected async sendChat(text: string): Promise<void> {
        await BackgroundMessage.sendInstantMessage(this.chatChannel.roomJid, 'chat', text)
    }

    private getUserInfo(userId: string): Readonly<PersonData>
    {
        const userData: PersonData = this.getRawUserInfo(userId)
        if (userId !== this.otherUserId) {
            return userData
        }

        if (userData.userName.length === 0) {
            userData.userName = this.otherUser.userName
        }
        if (userData.userImageUrl.length === 0) {
            userData.userImageUrl = this.otherUser.userImageUrl
        }
        const otherUserChanged = false
            || userData.userName !== this.otherUser.userName
            || userData.userImageUrl !== this.otherUser.userImageUrl
            || userData.ownFriendStatus !== this.otherUser.ownFriendStatus
        this.otherUser = userData
        if (otherUserChanged) {
            this.otherUserChanged()
        }

        return userData
    }

    private getRawUserInfo(userId: string): PersonData
    {
        const userData: null|PersonData = this.app.personManager.getPersonDataOrNull(userId)
        if (userData) {
            return userData
        }
        const lastMessage: null|ChatUtils.ChatMessage = iter(this.chatMessages.reverse())
            .filter(message => message.authorUserId === userId)
            .getNext()
        if (lastMessage) {
            return {
                userId,
                userName: lastMessage.authorName,
                userImageUrl: lastMessage.authorImageUrl,
                ownPersonItem: null,
                ownFriendStatus: 'No',
            }
        }
        if (userId === this.otherUserId) {
            return this.otherUser
        }
        return this.app.personManager.getDummyPersonData(userId)
    }

    private otherUserChanged(): void
    {

    }

    private updateUnreadMessageToast(): void
    {
        if (this.getVisibility()) {
            this.hideUnreadMessageToast()
            return
        }
        const lastMessage = iter(this.unreadUserChatMessages.reverse()).getNext()
        if (!lastMessage) {
            this.hideUnreadMessageToast()
            return
        }
        if (lastMessage.id === this.unreadMessageToastMessageId) {
            return
        }
        this.hideUnreadMessageToast()
        this.showUnreadMessageToast(lastMessage, this.unreadUserChatMessages.length())
    }

    private hideUnreadMessageToast(): void
    {
        this.unreadMessageToast?.close()
        this.unreadMessageToast = null
        this.unreadMessageToastMessageId = ''
    }

    private showUnreadMessageToast(lastMessage: ChatUtils.ChatMessage, unreadMessageCount: number): void
    {
        const userId = this.chatChannel.roomJid
        const personData = this.getUserInfo(userId)

        const textReplacements: [string,string][] = [
            ['{otherUserName}', personData.userName],
            ['{unreadMessageCount}', String(unreadMessageCount)],
            ['{lastUnreadMessageTime}', Utils.dateOfUtcString(lastMessage.timestamp).toLocaleTimeString()],
            ['{lastUnreadMessageText}', this.prepareMessageTextForToast(lastMessage.text)],
        ]

        const toastId = `newInstantMessage.${userId}`
        const type = 'question'
        const title = this.translateText(textReplacements, 'PrivateChat.newMessageToastTitle')
        const text = this.translateText(textReplacements, 'PrivateChat.newMessageToastText')
        const toast = new SimpleToast(this.app, toastId, 0, type, title, text)
        toast.setIcon(personData.userImageUrl, 10, 64, 64)

        const openChatButtonText = this.translateText(textReplacements, 'PrivateChat.newMessageToastOpenChatWindowButtonLabel')
        const openChatButtonAction = () => {
            const options = { undocked: this.app.getWindowSizingMode() !== 'normal' }
            this.show(options)
        }
        toast.addClosingActionButton(openChatButtonText, openChatButtonAction)

        toast.setDontShow(false)
        this.unreadMessageToast = toast
        this.unreadMessageToastMessageId = lastMessage.id
        toast.show()
    }

    private prepareMessageTextForToast(text: string): string
    {
        const shortText = iter(text.split('\n'))
            .map(line => line.trim())
            .filter(line => line.length !== 0)
            .limit(3)
            .toString('\n')
        if (shortText === text) {
            return shortText
        }
        return `${shortText}\n⋯`
    }

    private translateText(textReplacements: [string,string][], textId: string): string
    {
        let text = this.app.translateText(textId)
        for (const [key, replacement] of textReplacements) {
            text = text.replace(key, replacement)
        }
        return text
    }

}
