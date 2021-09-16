import * as $ from 'jquery';
import 'webpack-jquery-ui';
import log = require('loglevel');
import { as } from '../lib/as';
import { Utils } from '../lib/Utils';
import { Config } from '../lib/Config';
import { Environment } from '../lib/Environment';
import { ContentApp } from './ContentApp';
import { VidconfWindow } from './VidconfWindow';
import { Participant } from './Participant';

export class PrivateVidconfWindow extends VidconfWindow
{
    constructor(app: ContentApp, private participant: Participant)
    {
        super(app);
    }

    async show(options: any)
    {
        if (options.titleText == null) { options.titleText = this.app.translateText('PrivateVidconf.Private Videoconference with', 'Private Videoconference with') + ' ' + this.participant.getDisplayName(); }

        await super.show(options);
    }

}
