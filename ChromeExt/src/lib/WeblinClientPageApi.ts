import { WeblinClientApi } from './WeblinClientApi';
import { ContentApp } from '../contentscript/ContentApp';
import { Config } from './Config';

export namespace WeblinClientPageApi
{

    class ClientStatus
    {
        type = 'WeblinClient.ClientStatus';
        clientAvailable: boolean;

        public constructor(magic: string, clientAvailable: boolean)
        {
            this.clientAvailable = clientAvailable;
            this[magic] = true;
        }

    }

    export class ClientStatusApi {

        clientAvailable: boolean = false;
        messageHandlerInitialized: boolean = false;
        messageMagic: string;

        public constructor(app: ContentApp) {
            this.messageMagic = Config.get('iframeApi.messageMagicStatus', 'mxuqhdydey_clientStatus');
        }

        public sendClientAvailable(): void
        {
            this.clientAvailable = true;
            this.sendClientStatus();
        }
    
        public sendClientUnavailable(): void
        {
            this.clientAvailable = false;
            this.sendClientStatus();
        }

        private sendClientStatus(): void
        {
            if (!this.messageHandlerInitialized) {
                this.messageHandlerInitialized = true;
                window.addEventListener('message', (ev) => this.onMessage(ev.data));
            }
            const response = new ClientStatus(this.messageMagic, this.clientAvailable);
            window.postMessage(response, '*');
        }

        onMessage(message) {
            if (message[this.messageMagic] && message.type === 'WeblinClient.RequestClientStatus') {
                this.sendClientStatus();
            }
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
