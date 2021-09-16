import log = require('loglevel');
import { Utils } from './Utils';

export class Memory
{
    private static sessionConfig: any = {};
    private static localConfig: any = {};

    static getSession(key: string, defaultValue: any): any
    {
        if (this.sessionConfig[key]) {
            return this.sessionConfig[key];
        }
        return defaultValue;
    }

    static setSession(key: string, value: any): void
    {
        this.sessionConfig[key] = value;
    }

    static async getSync(key: string, defaultValue: any): Promise<any>
    {
        if (Utils.hasChromeStorage()) {
            return new Promise((resolve, reject) =>
            {
                chrome.storage.sync.get([key], result =>
                {
                    if (result[key] != undefined) {
                        resolve(result[key]);
                    } else {
                        resolve(defaultValue);
                    }
                });
            });
        } else {
            return Memory.getLocal(key, defaultValue);
        }
    }

    static async setSync(key: string, value: any): Promise<void>
    {
        if (Utils.hasChromeStorage()) {
            return new Promise((resolve, reject) =>
            {
                let dict = {};
                dict[key] = value;
                chrome.storage.sync.set(dict, () =>
                {
                    resolve();
                });
            });
        } else {
            return Memory.setLocal(key, value);
        }
    }

    static async deleteSync(key: string): Promise<void>
    {
        if (Utils.hasChromeStorage()) {
            return new Promise((resolve, reject) =>
            {
                chrome.storage.sync.remove(key, () =>
                {
                    resolve();
                });
            });
        }
    }

    static async getLocal(key: string, defaultValue: any): Promise<any>
    {
        return new Promise(resolve =>
        {
            if (Utils.hasChromeStorage()) {
                chrome.storage.local.get([key], result =>
                {
                    if (result[key] != undefined) {
                        resolve(result[key]);
                    } else {
                        resolve(defaultValue);
                    }
                });
            } else if (window.localStorage) {
                let value = window.localStorage.getItem(key);
                if (value) {
                    resolve(value);
                } else {
                    resolve(defaultValue);
                }
            } else {
                if (Memory.localConfig[key]) {
                    resolve(Memory.localConfig[key]);
                } else {
                    resolve(defaultValue);
                }
            }
        });
    }

    static async setLocal(key: string, value: any): Promise<void>
    {
        return new Promise(resolve =>
        {
            let dict = {};
            dict[key] = value;
            if (Utils.hasChromeStorage()) {
                chrome.storage.local.set(dict, () =>
                {
                    resolve();
                });
            } else if (window.localStorage) {
                window.localStorage.setItem(key, value);
                resolve();
            } else {
                Memory.localConfig[key] = value;
                resolve();
            }
        });
    }

    static async deleteLocal(key: string): Promise<void>
    {
        return new Promise(resolve =>
        {
            if (Utils.hasChromeStorage()) {
                chrome.storage.local.remove(key, () =>
                {
                    resolve();
                });
            } else if (window.localStorage) {
                window.localStorage.removeItem(key);
                resolve();
            } else if (Memory.localConfig[key]) {
                delete Memory.localConfig[key];
                resolve();
            }
        });
    }
}
