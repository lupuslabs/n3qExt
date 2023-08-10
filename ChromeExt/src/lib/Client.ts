import * as log from 'loglevel'
import { as } from './as';
import { Config } from './Config';
import { Environment } from './Environment';
import { Translator } from './Translator';
import { _Changes } from './_Changes';
import { Memory } from './Memory'
import { Utils } from './Utils'

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

    static async initDevConfig(): Promise<void>
    {
        try {
            const devConfigJson = await Memory.getLocal(Utils.localStorageKey_CustomConfig(), '{}');
            const devConfig = JSON.parse(devConfigJson);
            Config.setDevTree(devConfig);
        } catch (error) {
            log.info('Dev config initialization failed!', error);
        }
    }

    static initLog(): void
    {
        let debug = Environment.isDevelopment();
        log.setLevel(log.levels.INFO);
        if (debug) {
            log.setLevel(log.levels.DEBUG);
            // log.setLevel(log.levels.TRACE);
        }
    }

}
