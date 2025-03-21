import { ContentApp } from './ContentApp'
import { VidconfWindow } from './VidconfWindow'
import { Participant } from './Participant'

export class PrivateVidconfWindow extends VidconfWindow
{
    public constructor(app: ContentApp, participant: Participant)
    {
        super(app);
        this.titleText = 'Private Videoconference with {other}'
        this.titleTextId = 'PrivateVidconf.Private Videoconference with'
        this.titleTextReplacements.set('{other}', () => participant.getDisplayName())
        this.popupId = 'user.vidconfUndocked:' + participant.getUserId()
    }
}
