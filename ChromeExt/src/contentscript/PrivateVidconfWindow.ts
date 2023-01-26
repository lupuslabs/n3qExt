import { ContentApp } from './ContentApp';
import { VidconfWindow } from './VidconfWindow';
import { Participant } from './Participant';

export class PrivateVidconfWindow extends VidconfWindow
{
    private readonly participant: Participant;

    public constructor(app: ContentApp, participant: Participant)
    {
        super(app);
        this.participant = participant;
    }

    protected prepareMakeDom(): void
    {
        super.prepareMakeDom();
        this.titleText = this.app.translateText('PrivateVidconf.Private Videoconference with', 'Private Videoconference with') + ' ' + this.participant.getDisplayName();
    }
}
