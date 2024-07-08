import { iter } from '../lib/Iter'
import { ContentApp } from './ContentApp'
import { ChatUtils } from '../lib/ChatUtils'
import { ChatWindow } from './ChatWindow'
import { SimpleToast, Toast } from './Toast'
import { PersonData } from '../lib/ItemProperties'
import { BackgroundMessage } from '../lib/BackgroundMessage'
import { Utils } from '../lib/Utils'

export class InstantMessagesWindow extends ChatWindow
{
    protected readonly otherUserId: string
    protected unreadMessageToast: null|Toast = null
    protected unreadMessageToastMessageId: string = ''

    public constructor(app: ContentApp, otherUserId: string)
    {
        const chatChannel: ChatUtils.ChatChannel = {
            type: 'instantMessage',
            roomJid: otherUserId,
            roomNick: '',
        }
        super(app, chatChannel)
        this.otherUserId = otherUserId
    }

    protected prepareMakeDom(): void
    {
        super.prepareMakeDom()
        const otherPersonData = this.getUserInfo(this.chatChannel.roomJid)
        this.titleText = this.app.translateText('PrivateChat.Private Chat with', 'Private Chat with') + ' ' + otherPersonData.userName
    }

    protected async makeContent(): Promise<void>
    {
        await super.makeContent()
    }

    protected onVisible(): void
    {
        super.onVisible()
        this.app.getInstantMessageManager().onInstantMessagesWindowOpen(this.otherUserId)
    }

    protected onInvisible(): void
    {
        super.onInvisible()
        this.app.getInstantMessageManager().onInstantMessagesWindowClose(this.otherUserId)
    }

    protected onViewportVisible(): void
    {
        super.onViewportVisible()
        this.updateUnreadMessageToast()
    }

    protected storeChatMessage(chatMessage: ChatUtils.ChatMessage): void
    {
        super.storeChatMessage(chatMessage)
        this.updateUnreadMessageToast()
    }

    protected async sendChat(text: string): Promise<void> {
        await BackgroundMessage.sendInstantMessage(this.chatChannel.roomJid, text)
    }

    private getUserInfo(userId: string): PersonData
    {
        const userData: null|PersonData = this.app.getPersonManager().getPersonDataOrNull(userId)
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
        return this.app.getPersonManager().getDummyPersonData(userId)
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
        const openChatButtonAction = () => this.show({})
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
