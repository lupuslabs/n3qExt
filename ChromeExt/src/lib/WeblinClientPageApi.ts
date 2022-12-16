import { WeblinClientApi } from './WeblinClientApi';
import { ContentApp } from '../contentscript/ContentApp';
import { Config } from './Config';

export namespace WeblinClientPageApi
{

    export class ClientStatusToPageSender {

        clientActive: boolean = false;

        public constructor(app: ContentApp) {}

        public sendClientActive(): void
        {
            this.clientActive = true;
            this.sendClientStatus();
        }
    
        public sendClientInactive(): void
        {
            this.clientActive = false;
            this.sendClientStatus();
        }

        private sendClientStatus(): void
        {
            const response = new WeblinClientApi.ClientActiveMessage(this.clientActive);
            const magic = Config.get('iframeApi.messageMagic2Page', 'df7d86ozgh76_2pageApi');
            response[magic] = true;
            window.postMessage(response, '*');
        }

    }

    export class Request extends WeblinClientApi.Request
    {
        constructor(type: string, id: string)
        {
            super(type, id);
        }
    }
}
