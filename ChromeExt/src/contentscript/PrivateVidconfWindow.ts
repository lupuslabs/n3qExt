import 'webpack-jquery-ui';
import { ContentApp } from './ContentApp';
import { WindowOptions } from './Window';
import { VidconfWindow } from './VidconfWindow';
import { Participant } from './Participant';

export class PrivateVidconfWindow extends VidconfWindow
{
    constructor(app: ContentApp, private participant: Participant)
    {
        super(app);
    }

    async show(options: WindowOptions)
    {
        if (options.titleText == null) { options.titleText = this.app.translateText('PrivateVidconf.Private Videoconference with', 'Private Videoconference with') + ' ' + this.participant.getDisplayName(); }

        await super.show(options);
    }

}
