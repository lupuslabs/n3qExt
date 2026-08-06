import { iter } from '../lib/Iter'
import { ContentApp } from './ContentApp'
import { ChatUtils } from '../lib/ChatUtils'
import { ChatWindow } from './ChatWindow'
import { SimpleToast, Toast } from './Toast'
import { PersonData } from '../lib/ItemProperties'
import { BackgroundMessage, BackgroundRequest, PopupDefinition } from '../lib/BackgroundMessage'
import { DomUtils } from '../lib/DomUtils'
import { TranslationOpts } from '../lib/Translator'
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

    protected makeVidconfButton(): null|HTMLElement
    {
        const action = () => this.app.instantMessageManager.initiatePrivateVidconf(this.otherUser)
        return this.app.uiHelper.makeDefaultTextButton('open-vidconf-button', 'Menu.Private Videoconf', null, action);
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
            ...this.makeUndockPopupDefaultGeometry('instantMessages.'),
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

    protected makeMessageTextHtmlElement(message: ChatUtils.ChatMessage): [string[], HTMLElement]
    {
        if (message.type === 'vidconfInvite') {
            return this.makePrivateVidconfInviteMessageTextHtmlElement(message)
        }
        if (message.type === 'vidconfDecline') {
            return this.makePrivateVidconfdeclineMessageTextHtmlElement(message)
        }
        return super.makeMessageTextHtmlElement(message)
    }

    protected makePrivateVidconfInviteMessageTextHtmlElement(message: ChatUtils.ChatMessage): [string[], HTMLElement]
    {
        const translateOpts: TranslationOpts = {replacements: [['{otherUserName}', this.otherUser.userName]]}
        const text = this.app.translateText('PrivateChat.PrivateVidconfInviteMessage', translateOpts)
        const textElem = DomUtils.elemOfHtml(`<span class="text"></span>`)
        const linkNode = DomUtils.elemOfHtml(`<a class="link"></a>`)
        linkNode.setAttribute('title', this.app.translateText('PrivateChat.PrivateVidconfInviteMessageLinkTooltip', translateOpts))
        linkNode.addEventListener('click', _ => this.app.instantMessageManager.openPrivateVidconfWindow(this.otherUser))
        linkNode.textContent = text
        const pNode = document.createElement('p')
        pNode.append(linkNode)
        textElem.append(pNode)
        return [[], textElem];
    }

    protected makePrivateVidconfdeclineMessageTextHtmlElement(message: ChatUtils.ChatMessage): [string[], HTMLElement]
    {
        const translateOpts: TranslationOpts = {replacements: [['{otherUserName}', this.otherUser.userName]]}
        const text = this.app.translateText('PrivateChat.PrivateVidconfDeclineMessage', translateOpts)
        const textElem = DomUtils.elemOfHtml(`<span class="text"></span>`)
        const pNode = document.createElement('p')
        pNode.textContent = text
        textElem.append(pNode)
        return [[], textElem];
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
        const relevantMessages = iter(this.unreadChatMessages)
            .filter(msg => ChatUtils.isUserChatMessageType(msg.type))
            .toArray()
        const lastMessage = relevantMessages[relevantMessages.length - 1] ?? null
        if (!lastMessage) {
            this.hideUnreadMessageToast()
            return
        }
        if (lastMessage.id === this.unreadMessageToastMessageId) {
            return
        }
        this.hideUnreadMessageToast()
        this.showUnreadMessageToast(lastMessage, relevantMessages.length)
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

        const translateOpts: TranslationOpts = {replacements: [
            ['{otherUserName}', personData.userName],
            ['{unreadMessageCount}', String(unreadMessageCount)],
            ['{lastUnreadMessageTime}', this.app.uiHelper.formatTimeOrDatetimeForHuman(lastMessage.timestamp)],
            ['{lastUnreadMessageText}', this.prepareMessageTextForToast(lastMessage.text)],
        ]}

        const toastId = `newInstantMessage.${userId}`
        const type = 'question'
        const title = this.app.translateText('PrivateChat.newMessageToastTitle', translateOpts)
        const text = this.app.translateText('PrivateChat.newMessageToastText', translateOpts)
        const toast = new SimpleToast(this.app, toastId, 0, type, title, text)
        toast.setIcon(personData.userImageUrl, 10, 64, 64)

        const openChatButtonText = this.app.translateText('PrivateChat.newMessageToastOpenChatWindowButtonLabel', translateOpts)
        const openChatButtonAction = () => {
            const options = { undocked: this.app.getIsExclusiveWindowPopup() }
            this.show(options)
        }
        toast.addClosingActionButton(openChatButtonText, openChatButtonAction)

        const markAsReadButtonText = this.app.translateText('PrivateChat.newMessageToastMarkAsReadButtonLabel', translateOpts)
        const markAsReadButtonAction = () => {
            this.markMessageAsRead(lastMessage)
        }
        toast.addClosingActionButton(markAsReadButtonText, markAsReadButtonAction)

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
            .join('\n')
        if (shortText === text) {
            return shortText
        }
        return `${shortText}\n⋯`
    }

}
