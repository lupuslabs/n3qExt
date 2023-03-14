import { is } from '../lib/is';
import { as } from '../lib/as';
import { Config } from '../lib/Config';
import { ContentApp } from './ContentApp';
import { ChatWindow } from './ChatWindow';
import { Participant } from './Participant';
import { DomUtils } from '../lib/DomUtils';
import { ChatUtils } from '../lib/ChatUtils';
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'

export class PrivateChatWindow extends ChatWindow
{

    public constructor(app: ContentApp, private participant: Participant)
    {
        super(app, participant);
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

    protected sendChat(): void
    {
        const text: string = as.String(this.chatinInputElem.value);
        if (text !== '') {

            const nick = this.participant.getRoomNick();

            const name = this.room.getMyParticipant()?.getDisplayName();
            if (!is.nil(name)) {
                this.room.sendPrivateChat(text, nick);

                this.addLine(nick + Date.now(), 'chat', name, text);

                this.chatinInputElem.value = '';
                this.chatinInputElem.focus();
            }
        }
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
                this.addLine(null, 'cmdResult', key, json[key]);
            }
        }
    }

    protected giveMessageToChatOut(chatMessage: ChatUtils.ChatMessage): void
    {
        // Don't give message to chatout. Private chat shows up in private chat window only.
    }

}
