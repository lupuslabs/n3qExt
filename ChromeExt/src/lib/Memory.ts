import { is } from './is'
import { Utils } from './Utils';

export class Memory
{
    private static readonly localConfig: Map<string,unknown> = new Map();

    static async getLocal(key: string): Promise<unknown>
    {
        if (Utils.hasChromeStorage()) {
            return new Promise(resolve => chrome.storage.local.get([key], result => {
                if (chrome.runtime.lastError) {
                    console.log('Memory.getLocal: chrome.storage.local.get failed!', {key}, chrome.runtime.lastError)
                }
                resolve(result[key])
            }));
        }
        if (window.localStorage) {
            let value = window.localStorage.getItem(key);
            if (!is.nil(value)) {
                try {
                    value = JSON.parse(value);
                } catch (_error) {
                    // On parse error return whatever came from storage.
                }
            }
            return value;
        }
        return Memory.localConfig.get(key);
    }

    static async setLocal(key: string, value: unknown): Promise<void>
    {
        if (Utils.hasChromeStorage()) {
            return new Promise<void>(resolve => chrome.storage.local.set({[key]: value}, () => {
                if (chrome.runtime.lastError) {
                    console.log('Memory.setLocal: chrome.storage.local.set failed!', {key}, chrome.runtime.lastError)
                }
                resolve()
            }));
        }
        if (window.localStorage) {
            const serializedValue = JSON.stringify(value);
            window.localStorage.setItem(key, serializedValue);
            return;
        }
        Memory.localConfig.set(key, value);
    }

    static async deleteLocal(key: string): Promise<void>
    {
        if (Utils.hasChromeStorage()) {
            return new Promise<void>(resolve => chrome.storage.local.remove(key, () => {
                if (chrome.runtime.lastError) {
                    console.log('Memory.deleteLocal: chrome.storage.local.remove failed!', {key}, chrome.runtime.lastError)
                }
                resolve()
            }));
        }
        if (window.localStorage) {
            window.localStorage.removeItem(key);
            return;
        }
        Memory.localConfig.delete(key);
    }
}
