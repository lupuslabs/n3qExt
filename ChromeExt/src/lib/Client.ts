import * as log from 'loglevel'
import { is } from './is'
import { as } from './as';
import { Config } from './Config';
import { Environment } from './Environment';
import { Translator } from './Translator';
import { _Changes } from './_Changes';
import { Memory } from './Memory'
import { Utils, ErrorWithData } from './Utils'

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
            const devConfigJson = await Client.loadDevConfigJson();
            const devConfig = JSON.parse(devConfigJson);
            if (is.object(devConfig)) {
                Config.setDevTree(devConfig);
            }
        } catch (error) {
            log.info('Dev config initialization failed!', error);
        }
    }

    static async loadDevConfigJson(): Promise<string>
    {
        try {
            return as.String(await Memory.getLocal(Utils.localStorageKey_CustomConfig()), '{}');
        } catch (error) {
            log.info('Dev config loading failed!', error);
            return '{}';
        }
    }

    static async saveDevConfigJson(configJson: string): Promise<void>
    {
        try {
            await Memory.setLocal(Utils.localStorageKey_CustomConfig(), configJson);
        } catch (error) {
            log.info('Dev config save failed!', error);
        }
        await Client.initDevConfig();
    }

    public static readonly userConfigKeys: ReadonlyArray<string> = [
        Utils.localStorageKey_Id(),
        Utils.localStorageKey_Token(),
        Utils.localStorageKey_Nickname(),
        Utils.localStorageKey_LastWorkingNickname(),
        Utils.localStorageKey_Avatar(),
        Utils.localStorageKey_CustomConfig(),
    ];

    public static async loadUserConfigJson(): Promise<null|string>
    {
        const data = {userConfigVersion: 1};
        try {
            for (const key of Client.userConfigKeys) {
                const value = await Memory.getLocal(key);
                if (!is.nil(value)) {
                    data[key] = value;
                }
            }
            return JSON.stringify(data);
        } catch (error) {
            throw new ErrorWithData('User config data loading failed!', {error});
        }
    }

    public static async saveUserConfigJson(configJson: string): Promise<void>
    {
        let data = null;
        try {
            data = JSON.parse(configJson);
        } catch (error) {
            throw new ErrorWithData('User config decode failed!', {error, configJson});
        }
        if (data?.['userConfigVersion'] !== 1) {
            throw new ErrorWithData('Decoded user config does not contain 1 in userConfigVersion field!', {data, configJson});
        }
        try {
            for (const key of Client.userConfigKeys) {
                const value = data[key];
                if (!is.nil(value)) {
                    await Memory.setLocal(key, value);
                }
            }
        } catch (error) {
            throw new ErrorWithData('User config save failed!', {error, data, configJson});
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
