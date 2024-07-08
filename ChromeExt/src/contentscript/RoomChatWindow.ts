import { ChatUtils } from '../lib/ChatUtils'
import { ContentApp } from './ContentApp';
import { ChatWindow } from './ChatWindow';
import { Room } from './Room'

export class RoomChatWindow extends ChatWindow
{
    protected room: Room;

    public constructor(app: ContentApp, room: Room, chatChannel?: ChatUtils.ChatChannel)
    {
        chatChannel ??= {
            type:     'roompublic',
            roomJid:  room.getJid(),
            roomNick: '',
        };
        super(app, chatChannel);

        this.room = room;
    }

    protected async sendChat(text: string): Promise<void>
    {
        this.room.sendGroupChat(text);
    }

}
