import { ParticipantMenu } from './ParticipantMenu';

export class OtherParticipantMenu extends ParticipantMenu
{

    protected makeMenuTree(): void
    {
        let column = this.addColumn('interaction');
        column.addActionItem('privatevidconf', 'Private Videoconf', () => {
            this.participant.initiatePrivateVidconf(this.participant.getElem()).catch(error => this.app.onError(error));
        });
        column.addActionItem('privatechat', 'Private Chat', () => {
            this.participant.openPrivateChat(this.participant.getElem()).catch(error => this.app.onError(error));
        });
        column.addActionItem('greet', 'Greet', () => {
            this.participant.sendPoke('greet');
            this.participant.do('wave', false);
        });
        column.addActionItem('bye', 'Bye', () => {
            this.participant.sendPoke('bye');
            this.participant.do('wave', false);
        });
    }

}
