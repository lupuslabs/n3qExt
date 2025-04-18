import { ContentApp } from './ContentApp'
import { VidconfWindow } from './VidconfWindow'
import { PersonData } from '../lib/ItemProperties'

export class PrivateVidconfWindow extends VidconfWindow
{
    public constructor(app: ContentApp, url: string, otherUserInfo: PersonData)
    {
        super(app, url);
        this.titleText = 'Private Videoconference with {other}'
        this.titleTextId = 'PrivateVidconf.Private Videoconference with'
        this.titleTextReplacements.set('{other}', () => otherUserInfo.userName)
        this.popupId = 'user.vidconfUndocked:' + otherUserInfo.userId
    }
}
