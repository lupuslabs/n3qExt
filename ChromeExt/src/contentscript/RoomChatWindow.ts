import { Config } from '../lib/Config'
import { ChatUtils } from '../lib/ChatUtils'
import { ContentApp } from './ContentApp'
import { ChatWindow } from './ChatWindow'
import { Room } from './Room'
import { BackgroundMessage, BackgroundRequest, PopupDefinition } from '../lib/BackgroundMessage'
import { ContentMessage, ContentSetGuiModeMessage, ContentEnterRoomMessage } from '../lib/ContentMessage'

export class RoomChatWindow extends ChatWindow
{
    protected room: Room

    public constructor(app: ContentApp, room: Room, chatChannel?: ChatUtils.ChatChannel)
    {
        chatChannel ??= {
            type: 'roompublic',
            roomJid: room.getJid(),
            roomNick: '',
        }
        super(app, chatChannel)

        this.room = room

        this.windowCssClasses.push('roomchatwindow')

        this.titleText = 'Chat - {room}';
        this.titleTextId = app.getIsExclusiveWindowPopup() ? 'RoomChat.RoomChatTitleWhenUndocked' : 'RoomChat.RoomChatTitle';
        this.titleTextReplacements.set('{room}', () => room.getPageUrl());
    }

    protected makeExtraHeaderButtons(lineElem: HTMLElement): void
    {
        if (this.app.getIsExclusiveWindowPopup()) {
            const pageUrl = this.room.getPageUrl()
            const roomUrl = this.room.getDestination()
            const onClickFun = () => {
                BackgroundMessage.focusOrOpenTab(pageUrl, roomUrl).catch(error => this.app.onError(error))
            }
            const button = this.app.uiHelper.makeDefaultTextButton(
                'go-to-page-button', 'RoomChat.GoToPage', 'Go to page', onClickFun,
            )
            lineElem.appendChild(button)
        }
    }

    protected makeUndockPopupDefinition(): PopupDefinition
    {
        const popupId = `RoomChat:${this.chatChannel.roomJid}`
        const setGuiRequest: ContentSetGuiModeMessage = {
            type: ContentMessage.type_setGuiMode, mode: 'popupWindow',
        }
        const enterRoomRequest: ContentEnterRoomMessage = {
            type: ContentMessage.type_enterRoom, pageUrl: this.room.getPageUrl(), showChatWindow: true,
        }
        const startupRequests: BackgroundRequest[] = [setGuiRequest, enterRoomRequest]
        const startupRequestsArg = encodeURIComponent(JSON.stringify(startupRequests))
        const popupDefinition: PopupDefinition = {
            id: popupId,
            url: '/assets/popupApp.html?startupRequests=' + startupRequestsArg,
            ...this.makeUndockPopupDefaultGeometry('roomChat.'),
            allowContentApp: true,
        }
        return popupDefinition
    }

    protected async sendChat(text: string): Promise<void>
    {
        this.room.sendGroupChat(text)
    }

}
