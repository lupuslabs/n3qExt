import { ParticipantMenu } from './ParticipantMenu';
import * as privateVideoConferenceIconUrl from '../assets/icons/mdi_monitor-eye.svg';
import * as privateChatIconUrl from '../assets/icons/ri_chat-private-line.svg';
import * as greetIconUrl from '../assets/icons/mdi_human-greeting.svg';
import * as byeIconUrl from '../assets/icons/bye-32.png';

export class OtherParticipantMenu extends ParticipantMenu
{

    protected makeMenuTree(): void
    {
        let column = this.addColumn('interaction');
        column.addActionItem('privateVideoConference', privateVideoConferenceIconUrl, 'Private Videoconf', () => {
            this.participant.initiatePrivateVidconf(this.participant.getElem()).catch(error => this.app.onError(error));
        });
        column.addActionItem('privateChat', privateChatIconUrl, 'Private Chat', () => {
            this.participant.openPrivateChat();
        });
        column.addActionItem('greet', greetIconUrl, 'Greet', () => {
            this.participant.sendPoke('greet');
            this.participant.do('wave', false);
        });
        column.addActionItem('bye', byeIconUrl, 'Bye', () => {
            this.participant.sendPoke('bye');
            this.participant.do('wave', false);
        });
    }

}
