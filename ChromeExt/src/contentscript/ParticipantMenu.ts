import { RootMenu } from './Menu';
import { ContentApp } from './ContentApp';
import { Participant } from './Participant';

export abstract class ParticipantMenu extends RootMenu
{

    protected participant: Participant;
    
    public constructor(app: ContentApp, participant: Participant)
    {
        super(app, 'avatar');
        this.participant = participant;
    }

    public onUserDone(): void {
        this.participant.closeMenu();
    }

    public close(): void
    {
        super.close();
        this.columns = [];
    }

    protected render()
    {
        this.makeMenuTree();
        super.render();
    }

    protected abstract makeMenuTree(): void;

}
