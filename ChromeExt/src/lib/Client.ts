import { as } from './as';
import { Config } from './Config';
import { Environment } from './Environment';
import { Translator } from './Translator';
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

    static getUserLanguage(): string
    {
        let navLang = as.String(Config.get('i18n.overrideBrowserLanguage', ''));
        if (navLang === '') {
            navLang = navigator.language;
        }

        const language = Translator.mapLanguage(navLang, lang => { return Config.get('i18n.languageMapping', {})[lang]; }, Config.get('i18n.defaultLanguage', 'en-US'));

        return language;
    }
}
