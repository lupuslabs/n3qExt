import * as $ from 'jquery';
import 'webpack-jquery-ui';
import log = require('loglevel');
import { as } from '../lib/as';
import { Utils } from '../lib/Utils';
import { Config } from '../lib/Config';
import { Environment } from '../lib/Environment';
import { ContentApp } from './ContentApp';
import { ChatWindow } from './ChatWindow';
import { Participant } from './Participant';

export class PrivateChatWindow extends ChatWindow
{
    constructor(app: ContentApp, private participant: Participant)
    {
        super(app, participant.getRoom());
    }

    async show(options: any)
    {
        if (options.titleText == null) { options.titleText = this.app.translateText('PrivateChat.Private Chat with', 'Private Chat with') + ' ' + this.participant.getDisplayName(); }

        await super.show(options);

        if (Config.get('room.showPrivateChatInfoButton', false)) {
            let infoElem = <HTMLElement>$('<div class="n3q-base n3q-button n3q-chatwindow-clear" title="Info" data-translate="attr:title:Chatwindow text:Chatwindow">Info</div>').get(0);
            $(this.contentElem).append(infoElem);
            $(infoElem).on('click', ev =>
            {
                this.sendVersionQuery();
            });
        }
    }

    protected sendChat(): void
    {
        var text: string = as.String($(this.chatinInputElem).val(), '');
        if (text != '') {

            let nick = this.participant.getRoomNick();

            let name = this.room.getParticipant(this.room.getMyNick()).getDisplayName();

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
        let nick = this.participant.getRoomNick();
        let participant = this.room.getParticipant(nick);
        participant?.fetchVersionInfo(this);
    }

    public updateObservableProperty(name: string, value: string): void
    {
        if (name == 'VersionInfo') {
            let nick = this.participant.getRoomNick();
            let displayName = this.participant.getDisplayName();
            let json = JSON.parse(value);
            for (let key in json) {
                this.addLine(Utils.randomString(10), key, json[key]);
            }
        }
    }
}
