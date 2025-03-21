import { Menu } from './Menu';
import { ContentApp } from './ContentApp';
import { Participant } from './Participant';

export abstract class ParticipantMenu extends Menu
{

    protected participant: Participant;

    public constructor(app: ContentApp, participant: Participant)
    {
        super(app, 'participant');
        this.participant = participant;
    }

    public onItemUserDone(): void {
        this.participant.closeMenu();
    }

    public close(): void
    {
        super.close();
        this.items = [];
    }

    protected render()
    {
        this.makeMenuTree();
        super.render();
    }

    protected abstract makeMenuTree(): void;

}
