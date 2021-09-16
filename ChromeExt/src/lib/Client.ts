import { Config } from './Config';
import { Environment } from './Environment';
import { _Changes } from './_Changes';

export class Client
{
    static getDetails(): any
    {
        return {
            'client': Config.get('client.name', 'weblin.io'),
            'clientVariant': this.getVariant(),
            'clientVersion': this.getVersion(),
            'design': Config.get('design.name', ''),
            'designVersion': Config.get('design.version', ''),
        };
    }

    static getVersion(): string
    {
        return _Changes.data[0][0];
    }

    static getVariant(): string
    {
        return Environment.isEmbedded() ? 'embedded' : (Environment.isExtension() ? 'extension' : '');
    }
}
