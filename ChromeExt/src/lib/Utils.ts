import { xml } from '@xmpp/client';
import log = require('loglevel');
import { as } from './as';
import { Config } from './Config';
import { Environment } from './Environment';
import { ItemProperties } from './ItemProperties';

export class Point2D
{
    constructor(public x: number, public y: number) { }
}

export class Utils
{
    static localStorageKey_X(): string { return 'me.x'; }
    static localStorageKey_Active(): string { return 'me.active'; }
    // static localStorageKey_StayOnTabChange(roomJid: string): string { return 'room.' + roomJid + '.stayOnTabChange'; }
    static localStorageKey_BackpackIsOpen(roomJid: string): string { return 'room.' + roomJid + '.backpackIsOpen'; }
    static localStorageKey_VidconfIsOpen(roomJid: string): string { return 'room.' + roomJid + '.vidconfIsOpen'; }
    static localStorageKey_ChatIsOpen(roomJid: string): string { return 'room.' + roomJid + '.chatIsOpen'; }
    static localStorageKey_CustomConfig(): string { return 'dev.config'; }
    static localStorageKey_Id(): string { return 'me.id'; }
    static localStorageKey_Nickname(): string { return 'me.nickname'; }
    static localStorageKey_Avatar(): string { return 'me.avatar'; }
    static localStorageKey_BackpackPhase(): string { return 'backpack.phase'; }

    static isBackpackEnabled()
    {
        if (Environment.isExtension()) { return Config.get('backpack.enabled', false); }
        if (Environment.isEmbedded()) { return Config.get('backpack.embeddedEnabled', false); }
        return true;
    }
    
    static parseStringMap(s) {
        let o = {};
        let lines = s.split(' ');
        for (let i = 0; i < lines.length; i++) {
            let fields = lines[i].split('=', 2);
            if (fields.length === 1) {
                o[fields[0]] = '';
            } else if (fields.length === 2) {
                o[fields[0]] = fields[1];
            }
        }
        return o;
    }
    
    static logChannel(channel: string, defaultValue: boolean): boolean
    {
        if (Config.get('log.all', false)) { return true; }
        if (Config.get('log.' + channel, true)) { return true; }
        return defaultValue;
    }
    
    static makeGifExplicit(avatarId: string): string
    {
        let parts = avatarId.split('/');
        if (parts.length == 1) { return 'gif/002/' + avatarId; }
        else if (parts.length == 2) { return 'gif/' + avatarId; }
        return 'gif/' + avatarId;
    }

    static fixDuplicateGif(avatarUrl: string): string
    {
        if (avatarUrl.search('gif/gif/') > 0) {
            return avatarUrl.replace('gif/gif/', 'gif/');
        }
        return avatarUrl;
    }

    static getAvatarUrlFromAvatarId(avatarId: string): string
    {
        let avatarUrl = as.String(Config.get('avatars.animationsUrlTemplate', 'https://webex.vulcan.weblin.com/avatars/{id}/config.xml')).replace('{id}', Utils.makeGifExplicit(avatarId));
        avatarUrl = Utils.fixDuplicateGif(avatarUrl);
        return avatarUrl;
    }

    static jsObject2xmlObject(stanza: any): xml
    {
        let children = [];
        if (stanza.children != undefined) {
            stanza.children.forEach((child: any) =>
            {
                if (typeof child === typeof '') {
                    children.push(child);
                } else {
                    children.push(this.jsObject2xmlObject(child));
                }
            });
        }
        return xml(stanza.name, stanza.attrs, children);
    }

    static async sleep(ms: number): Promise<void>
    {
        ms = ms < 0 ? 0 : ms;
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private static randomStringChars = '0123456789abcdefghijklmnopqrstuvwxyz';
    static randomString(length: number): string
    {
        var maxIndex: number = Utils.randomStringChars.length - 1;
        var result = '';
        for (var i = length; i > 0; --i) {
            result += Utils.randomStringChars[Math.round(Math.random() * maxIndex)];
        }
        return result;
    }

    static randomInt(min: number, max: number): number
    {
        let f = Math.random() * (max - min) + min;
        f = Math.min(max - 0.001, f);
        f = Math.max(min, f);
        let i = Math.trunc(f);
        return i;
    }

    static pseudoRandomInt(min: number, max: number, key: string, suffix: string, mod: number): number
    {
        let hash = Utils.hash(key + suffix) % mod;
        let f = min + (max - min) / mod * hash;
        let i = Math.trunc(f);
        return i;
    }

    static hash(s: string): number
    {
        var hash = 0;
        if (s.length == 0) return 0;

        s += 'abcd';

        for (let i = 0; i < s.length; i++) {
            let char = s.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }

        return Math.abs(hash);
    }

    static base64Encode(s: string): string
    {
        return window.btoa(s);
    }

    static base64Decode(s: string): string
    {
        return window.atob(s);
    }

    static hasChromeStorage(): boolean
    {
        return (typeof chrome !== 'undefined' && typeof chrome.storage !== 'undefined');
    }

    static startsWith(pageUrl: string, prefixes: Array<string>)
    {
        for (let i = 0; i < prefixes.length; i++) {
            if (pageUrl.startsWith(prefixes[i])) {
                return true;
            }
        }

        return false;
    }

    static sortObjectByKey(o: any): any
    {
        return Object.keys(o).sort().reduce(
            (obj, key) =>
            {
                obj[key] = o[key];
                return obj;
            },
            {}
        );
    }

    static cloneObject(obj: any): any
    {
        let clone = {};
        return Object.assign(clone, obj);
    }
}
