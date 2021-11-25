import * as $ from 'jquery';
import 'webpack-jquery-ui';
import { as } from '../lib/as';
import { Utils } from '../lib/Utils';
import { Config } from '../lib/Config';
import { ContentApp } from './ContentApp';
import { ChatWindow } from './ChatWindow';
import { WindowOptions } from './Window';
import { Participant } from './Participant';

export class PrivateChatWindow extends ChatWindow
{
    constructor(app: ContentApp, private participant: Participant)
    {
        super(app, participant.getRoom());
    }

    async show(options: WindowOptions)
    {
        if (options.titleText == null) { options.titleText = this.app.translateText('PrivateChat.Private Chat with', 'Private Chat with') + ' ' + this.participant.getDisplayName(); }

        await super.show(options);

        if (Config.get('room.showPrivateChatInfoButton', false)) {
            const infoElem = <HTMLElement>$('<div class="n3q-base n3q-button n3q-chatwindow-clear" title="Info" data-translate="attr:title:Chatwindow text:Chatwindow">Info</div>').get(0);
            $(this.contentElem).append(infoElem);
            $(infoElem).on('click', ev =>
            {
                this.sendVersionQuery();
            });
        }
    }

    protected sendChat(): void
    {
        const text: string = as.String($(this.chatinInputElem).val(), '');
        if (text !== '') {

            const nick = this.participant.getRoomNick();

            const name = this.room.getParticipant(this.room.getMyNick()).getDisplayName();

            this.room?.sendPrivateChat(text, nick);

            this.addLine(nick + Date.now(), name, text);

            $(this.chatinInputElem)
                .val('')
                .focus()
                ;
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
                this.addLine(Utils.randomString(10), key, json[key]);
            }
        }
    }
}
