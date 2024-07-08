import { Config } from '../lib/Config';
import { ContentApp } from './ContentApp';
import { Participant } from './Participant';
import { DomUtils } from '../lib/DomUtils';
import { ChatUtils } from '../lib/ChatUtils';
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'
import { Room } from './Room'
import { RoomChatWindow } from './RoomChatWindow'
import { ItemException } from '../lib/ItemException'
import Fact = ItemException.Fact
import Reason = ItemException.Reason

export class PrivateChatWindow extends RoomChatWindow
{

    public constructor(app: ContentApp, private participant: Participant)
    {
        const room: Room = participant.getRoom()
        const chatChannel: ChatUtils.ChatChannel = {
            type: 'roomprivate',
            roomJid: room.getJid(),
            roomNick: participant.getRoomNick(),
        };
        super(app, room, chatChannel);
    }

    protected prepareMakeDom(): void
    {
        super.prepareMakeDom();
        this.titleText = this.app.translateText('PrivateChat.Private Chat with', 'Private Chat with') + ' ' + this.participant.getDisplayName();
    }

    protected async makeContent(): Promise<void>
    {
        await super.makeContent();
        if (Config.get('room.showPrivateChatInfoButton', false)) {
            const infoElem = DomUtils.elemOfHtml('<div class="n3q-base n3q-button n3q-chatwindow-clear" title="Info" data-translate="attr:title:Chatwindow text:Chatwindow">Info</div>');
            this.contentElem.appendChild(infoElem);
            PointerEventDispatcher.makeOpaqueDispatcher(this.app, infoElem).addUnmodifiedLeftClickListener(ev => this.sendVersionQuery());
        }
    }

    protected async sendChat(text: string): Promise<void>
    {
        const nick = this.participant.getRoomNick();
        const name = this.room.getMyParticipant()?.getDisplayName() ?? '';
        if (name.length === 0) {
            throw new ItemException(Fact.NotSent, Reason.InternalError, 'No user name');
        }
        this.room.sendPrivateChat(text, nick);
        this.addLine(nick + Date.now(), 'chat', this.app.getUserId(), name, '', text);
    }

    protected sendVersionQuery(): void
    {
        const nick = this.participant.getRoomNick();
        const participant = this.room.getParticipant(nick);
        participant?.fetchVersionInfo(this);
    }

    public updateObservableProperty(name: string, value: string): void
    {
        if (name === 'VersionInfo') {
            const json = JSON.parse(value);
            for (const key in json) {
                this.addLine(null, 'cmdResult', '', key, '', json[key]);
            }
        }
    }

}
