import log = require('loglevel');
import { ItemChangeOptions } from './ItemChangeOptions';
import { ItemException } from './ItemException';
import { ItemProperties, ItemPropertiesSet } from './ItemProperties';
import { BackgroundApp } from '../background/BackgroundApp';
import { Environment } from './Environment';

export class BackgroundResponse
{
    constructor(public ok: boolean, public status?: string, public statusText?: string, public ex?: ItemException) { }
}

export class BackgroundSuccessResponse extends BackgroundResponse
{
    constructor() { super(true); }
}

export class BackgroundEmptyResponse extends BackgroundResponse
{
    constructor() { super(true); }
}

export class BackgroundErrorResponse extends BackgroundResponse
{
    constructor(public status: string, public statusText: string) { super(false, status, statusText); }
}

export class BackgroundItemExceptionResponse extends BackgroundResponse
{
    constructor(public ex: ItemException) { super(false, 'error', ItemException.Fact[ex.fact] + ' ' + ItemException.Reason[ex.reason] + ' ' + (ex.detail ?? ''), ex); }
}

export class FetchUrlResponse extends BackgroundResponse
{
    constructor(public data: string) { super(true); }
}

export class GetBackpackStateResponse extends BackgroundResponse
{
    constructor(public items: { [id: string]: ItemProperties; }) { super(true); }
}

export class IsBackpackItemResponse extends BackgroundResponse
{
    constructor(public isItem: boolean) { super(true); }
}

export class GetBackpackItemPropertiesResponse extends BackgroundResponse
{
    constructor(public properties: ItemProperties) { super(true); }
}

export class CreateBackpackItemFromTemplateResponse extends BackgroundResponse
{
    constructor(public properties: ItemProperties) { super(true); }
}

export class FindBackpackItemPropertiesResponse extends BackgroundResponse
{
    constructor(public propertiesSet: ItemPropertiesSet) { super(true); }
}

export class BackgroundMessage
{
    static background: BackgroundApp;

    static sendMessage(message: any): Promise<any>
    {
        return new Promise((resolve, reject) =>
        {
            try {
                if (Environment.isEmbedded()) {
                    if (BackgroundMessage.background) {
                        BackgroundMessage.background.onDirectRuntimeMessage(message, response =>
                        {
                            resolve(response);
                        });
                    } else {
                        window.parent.postMessage(message, '*');
                        resolve({});
                    }
                } else {
                    chrome.runtime?.sendMessage(message, response =>
                    {
                        resolve(response);
                    });
                }
            } catch (error) {
                reject(error);
            }
        });
    }

    static sendMessageCheckOk(message: any): Promise<any>
    {
        return new Promise((resolve, reject) =>
        {
            try {
                if (BackgroundMessage.background) {
                    BackgroundMessage.background.onDirectRuntimeMessage(message, response =>
                    {
                        if (response.ok) {
                            resolve(response);
                        } else {
                            reject(response.ex);
                        }
                    });
                } else {
                    chrome.runtime?.sendMessage(message, response =>
                    {
                        if (response.ok) {
                            resolve(response);
                        } else {
                            reject(response.ex);
                        }
                    });
                }
            } catch (error) {
                reject(error);
            }
        });
    }

    static test(): Promise<void>
    {
        return BackgroundMessage.sendMessage({ 'type': BackgroundMessage.test.name });
    }

    static jsonRpc(url: string, jsonBodyData: any): Promise<FetchUrlResponse>
    {
        return BackgroundMessage.sendMessage({ 'type': BackgroundMessage.jsonRpc.name, 'url': url, 'json': jsonBodyData });
    }

    static fetchUrl(url: string, version: string): Promise<FetchUrlResponse>
    {
        return BackgroundMessage.sendMessage({ 'type': BackgroundMessage.fetchUrl.name, 'url': url, 'version': version });
    }

    static waitReady(): Promise<any>
    {
        return BackgroundMessage.sendMessage({ 'type': BackgroundMessage.waitReady.name });
    }

    static getConfigTree(name: string): Promise<any>
    {
        return BackgroundMessage.sendMessage({ 'type': BackgroundMessage.getConfigTree.name, 'name': name });
    }

    static sendStanza(stanza: any): Promise<void>
    {
        return BackgroundMessage.sendMessage({ 'type': BackgroundMessage.sendStanza.name, 'stanza': stanza });
    }

    static pingBackground(): Promise<void>
    {
        return BackgroundMessage.sendMessage({ 'type': BackgroundMessage.pingBackground.name });
    }

    static userSettingsChanged(): Promise<void>
    {
        return BackgroundMessage.sendMessage({ 'type': BackgroundMessage.userSettingsChanged.name });
    }

    static clientNotification(target: string, data: any): Promise<void>
    {
        return BackgroundMessage.sendMessage({ 'type': BackgroundMessage.clientNotification.name, 'target': target, 'data': data });
    }

    static log(...pieces: any): Promise<void>
    {
        return BackgroundMessage.sendMessage({ 'type': BackgroundMessage.log.name, 'pieces': pieces });
    }

    static pointsActivity(channel: string, n: number): Promise<void>
    {
        return BackgroundMessage.sendMessageCheckOk({ 'type': BackgroundMessage.pointsActivity.name, 'channel': channel, 'n': n });
    }

    static getBackpackState(): Promise<GetBackpackStateResponse>
    {
        return BackgroundMessage.sendMessage({ 'type': BackgroundMessage.getBackpackState.name });
    }

    static addBackpackItem(itemId: string, properties: ItemProperties, options: ItemChangeOptions): Promise<void>
    {
        return BackgroundMessage.sendMessageCheckOk({ 'type': BackgroundMessage.addBackpackItem.name, 'itemId': itemId, 'properties': properties, 'options': options });
    }

    static setBackpackItemProperties(itemId: string, properties: ItemProperties, options: ItemChangeOptions): Promise<void>
    {
        return BackgroundMessage.sendMessageCheckOk({ 'type': BackgroundMessage.setBackpackItemProperties.name, 'itemId': itemId, 'properties': properties, 'options': options });
    }

    static modifyBackpackItemProperties(itemId: string, changed: ItemProperties, deleted: Array<string>, options: ItemChangeOptions): Promise<void>
    {
        return BackgroundMessage.sendMessageCheckOk({ 'type': BackgroundMessage.modifyBackpackItemProperties.name, 'itemId': itemId, 'changed': changed, 'deleted': deleted, 'options': options });
    }

    static loadWeb3BackpackItems(): Promise<void>
    {
        return BackgroundMessage.sendMessageCheckOk({ 'type': BackgroundMessage.loadWeb3BackpackItems.name });
    }

    static rezBackpackItem(itemId: string, roomJid: string, x: number, destination: string, options: ItemChangeOptions): Promise<void>
    {
        return BackgroundMessage.sendMessageCheckOk({ 'type': BackgroundMessage.rezBackpackItem.name, 'itemId': itemId, 'roomJid': roomJid, 'x': x, 'destination': destination, 'options': options });
    }

    static derezBackpackItem(itemId: string, roomJid: string, x: number, y: number, changed: ItemProperties, deleted: Array<string>, options: ItemChangeOptions): Promise<void>
    {
        return BackgroundMessage.sendMessageCheckOk({ 'type': BackgroundMessage.derezBackpackItem.name, 'itemId': itemId, 'roomJid': roomJid, 'x': x, 'y': y, 'changed': changed, 'deleted': deleted, 'options': options });
    }

    static deleteBackpackItem(itemId: string, options: ItemChangeOptions): Promise<void>
    {
        return BackgroundMessage.sendMessageCheckOk({ 'type': BackgroundMessage.deleteBackpackItem.name, 'itemId': itemId, 'options': options });
    }

    static isBackpackItem(itemId: string): Promise<boolean>
    {
        return new Promise(async (resolve, reject) =>
        {
            try {
                let response = await BackgroundMessage.sendMessageCheckOk({ 'type': BackgroundMessage.isBackpackItem.name, 'itemId': itemId });
                resolve((<IsBackpackItemResponse>response).isItem);
            } catch (error) {
                reject(error);
            }
        });
    }

    static getBackpackItemProperties(itemId: string): Promise<ItemProperties>
    {
        return new Promise(async (resolve, reject) =>
        {
            try {
                let response = await BackgroundMessage.sendMessageCheckOk({ 'type': BackgroundMessage.getBackpackItemProperties.name, 'itemId': itemId });
                resolve((<GetBackpackItemPropertiesResponse>response).properties);
            } catch (error) {
                reject(error);
            }
        });
    }

    static createBackpackItemFromTemplate(template: string, args: ItemProperties): Promise<ItemProperties>
    {
        return new Promise(async (resolve, reject) =>
        {
            try {
                let response = await BackgroundMessage.sendMessageCheckOk({ 'type': BackgroundMessage.createBackpackItemFromTemplate.name, 'template': template, 'args': args });
                resolve((<CreateBackpackItemFromTemplateResponse>response).properties);
            } catch (error) {
                reject(error);
            }
        });
    }

    static findBackpackItemProperties(filterProperties: ItemProperties): Promise<ItemPropertiesSet>
    {
        return new Promise(async (resolve, reject) =>
        {
            try {
                let response = await BackgroundMessage.sendMessageCheckOk({ 'type': BackgroundMessage.findBackpackItemProperties.name, 'filterProperties': filterProperties });
                resolve((<FindBackpackItemPropertiesResponse>response).propertiesSet);
            } catch (error) {
                reject(error);
            }
        });
    }

    static executeBackpackItemAction(itemId: string, action: string, args: any, involvedIds: Array<string>): Promise<void>
    {
        return BackgroundMessage.sendMessageCheckOk({ 'type': BackgroundMessage.executeBackpackItemAction.name, 'itemId': itemId, 'action': action, 'args': args, 'involvedIds': involvedIds });
    }

}
