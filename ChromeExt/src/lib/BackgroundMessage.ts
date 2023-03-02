import log = require('loglevel');
import { ItemChangeOptions } from './ItemChangeOptions';
import { ItemException } from './ItemException';
import { ItemProperties, ItemPropertiesSet } from './ItemProperties';
import { BackgroundApp } from '../background/BackgroundApp';
import { Environment } from './Environment';
import { Chat, ChatMessage } from './ChatMessage';
import { Utils } from './Utils'

export type TabStats = {
    participantCount:  number, // Other participants present in the same room.
    toastCount:        number, // Open toasts.
    hasNewGroupChat:   boolean, // Whether new chat messages/emotes occured.
    hasNewPrivateChat: boolean, // Whether new private chat messages occured.
};

export function MakeZeroTabStats(): TabStats
{
    return {
        toastCount: 0,
        participantCount: 0,
        hasNewGroupChat: false,
        hasNewPrivateChat: false,
    };
}

export type TabRoomPresenceData = {
    timestamp: string,
    roomJid: string,
    badges: string, // Todo: Move tracking to RoomPresenceManager.
    isAvailable: boolean,
    showAvailability: string,
    statusMessage: string,
};

export type PopupDefinition = {
    id: string,
    url: string,
    left?: number,
    top?: number,
    width?: number,
    height?: number,
}

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

export class BackpackIsItemStillInRepoResponse extends BackgroundSuccessResponse
{
    constructor(public result: boolean) { super(); }
}

export class IsBackpackItemResponse extends BackgroundResponse
{
    constructor(public isItem: boolean) { super(true); }
}

export class GetBackpackItemPropertiesResponse extends BackgroundResponse
{
    constructor(public properties: ItemProperties) { super(true); }
}

export class ExecuteBackpackItemActionResponse extends BackgroundResponse
{
    constructor(public result: ItemProperties) { super(true); }
}

export class BackpackTransferAuthorizeResponse extends BackgroundSuccessResponse
{
    constructor(public transferToken: string) { super(); }
}

export class BackpackTransferUnauthorizeResponse extends BackgroundSuccessResponse
{
    constructor() { super(); }
}

export class BackpackTransferCompleteResponse extends BackgroundSuccessResponse
{
    constructor(public properties: ItemProperties) { super(); }
}

export class ApplyItemToBackpackItemResponse extends BackgroundResponse
{
    constructor(public result: ItemProperties) { super(true); }
}

export class CreateBackpackItemResponse extends BackgroundResponse
{
    constructor(public properties: ItemProperties) { super(true); }
}

export class FindBackpackItemPropertiesResponse extends BackgroundResponse
{
    constructor(public propertiesSet: ItemPropertiesSet) { super(true); }
}

export class NewChatMessageResponse extends BackgroundSuccessResponse
{
    constructor(public keepChatMessage: boolean) { super(); }
}

export class GetChatHistoryResponse extends BackgroundSuccessResponse
{
    constructor(public chatHistory: ChatMessage[]) { super(); }
}

export class IsTabDisabledResponse extends BackgroundSuccessResponse
{
    constructor(public isDisabled: boolean) { super(); }
}

export class BackgroundMessage
{
    static background: BackgroundApp;

    static sendMessage(message: any): Promise<any>
    {
        return new Promise((resolve, reject) =>
        {
            try {
                message = Utils.prepareValForMessage(message);
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
                message = Utils.prepareValForMessage(message);
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
                            if (response.ex) {
                                reject(response.ex);
                            } else {
                                reject(response);
                            }
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

    static wakeup(): Promise<boolean>
    {
        return BackgroundMessage.sendMessage({ 'type': BackgroundMessage.wakeup.name });
    }

    static jsonRpc(url: string, jsonBodyData: any): Promise<FetchUrlResponse>
    {
        return BackgroundMessage.sendMessage({ 'type': BackgroundMessage.jsonRpc.name, 'url': url, 'json': jsonBodyData });
    }

    static fetchUrl(url: string, version: string): Promise<FetchUrlResponse>
    {
        return BackgroundMessage.sendMessage({ 'type': BackgroundMessage.fetchUrl.name, 'url': url, 'version': version });
    }

    static fetchUrlAsDataUrl(url: string, version: string): Promise<FetchUrlResponse>
    {
        return BackgroundMessage.sendMessage({ 'type': BackgroundMessage.fetchUrlAsDataUrl.name, 'url': url, 'version': version });
    }

    static waitReady(): Promise<any>
    {
        return BackgroundMessage.sendMessage({ 'type': BackgroundMessage.waitReady.name });
    }

    static signalContentAppStartToBackground(): Promise<void>
    {
        return BackgroundMessage.sendMessage({ 'type': BackgroundMessage.signalContentAppStartToBackground.name });
    }

    static signalContentAppStopToBackground(): Promise<void>
    {
        return BackgroundMessage.sendMessage({ 'type': BackgroundMessage.signalContentAppStopToBackground.name });
    }

    static sendTabStatsToBackground(data: TabStats): Promise<void>
    {
        return BackgroundMessage.sendMessage({ 'type': BackgroundMessage.sendTabStatsToBackground.name, data });
    }

    static getConfigTree(name: string): Promise<any>
    {
        return BackgroundMessage.sendMessage({ 'type': BackgroundMessage.getConfigTree.name, 'name': name });
    }

    static sendStanza(stanza: any): Promise<void>
    {
        return BackgroundMessage.sendMessage({ 'type': BackgroundMessage.sendStanza.name, 'stanza': stanza });
    }

    static sendRoomPos(roomJid: string, posX: number): Promise<void>
    {
        return BackgroundMessage.sendMessage({ 'type': BackgroundMessage.sendRoomPos.name, roomJid, posX });
    }

    static sendRoomPresence(presenceData: TabRoomPresenceData): Promise<void>
    {
        return BackgroundMessage.sendMessage({ 'type': BackgroundMessage.sendRoomPresence.name, presenceData });
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

    static async backpackIsItemStillInRepo(itemId: string): Promise<boolean>
    {
        const msg = {
            'type': BackgroundMessage.backpackIsItemStillInRepo.name,
            'itemId': itemId,
        };
        const response = await BackgroundMessage.sendMessageCheckOk(msg);
        return (<BackpackIsItemStillInRepoResponse>response).result;
    }

    static addBackpackItem(itemId: string, properties: ItemProperties, options: ItemChangeOptions): Promise<void>
    {
        return BackgroundMessage.sendMessageCheckOk({ 'type': BackgroundMessage.addBackpackItem.name, 'itemId': itemId, 'properties': properties, 'options': options });
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

    static applyItemToBackpackItem(activeId: string, passiveId: string): Promise<ItemProperties>
    {
        return new Promise(async (resolve, reject) =>
        {
            try {
                let response = await BackgroundMessage.sendMessageCheckOk({ 'type': BackgroundMessage.applyItemToBackpackItem.name, 'activeId': activeId, 'passiveId': passiveId });
                resolve((<ApplyItemToBackpackItemResponse>response).result);
            } catch (error) {
                reject(error);
            }
        });
    }

    static async backpackTransferAuthorize(itemId: string, duration: number): Promise<string>
    {
        const msg = {
            'type': BackgroundMessage.backpackTransferAuthorize.name,
            'itemId': itemId,
            'duration': duration,
        };
        const response = await BackgroundMessage.sendMessageCheckOk(msg);
        return (<BackpackTransferAuthorizeResponse>response).transferToken;
    }

    static async backpackTransferUnauthorize(itemId: string): Promise<void>
    {
        const msg = {
            'type': BackgroundMessage.backpackTransferUnauthorize.name,
            'itemId': itemId,
        };
        await BackgroundMessage.sendMessageCheckOk(msg);
    }

    static async backpackTransferComplete(
        provider: string, senderInventoryId: string, senderItemId: string, transferToken: string
    ): Promise<ItemProperties>
    {
        const msg = {
            'type': BackgroundMessage.backpackTransferComplete.name,
            'provider': provider,
            'senderInventoryId': senderInventoryId,
            'senderItemId': senderItemId,
            'transferToken': transferToken,
        };
        const response = await BackgroundMessage.sendMessageCheckOk(msg);
        return (<BackpackTransferCompleteResponse>response).properties;
    }

    static createBackpackItem(provider: string, auth: string, method: string, args: ItemProperties): Promise<ItemProperties>
    {
        return new Promise(async (resolve, reject) =>
        {
            try {
                let response = await BackgroundMessage.sendMessageCheckOk({ 'type': BackgroundMessage.createBackpackItem.name, 'provider': provider, 'auth': auth, 'method': method, 'args': args });
                resolve((<CreateBackpackItemResponse>response).properties);
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

    static executeBackpackItemAction(itemId: string, action: string, args: any, involvedIds: Array<string>): Promise<ItemProperties>
    {
        return new Promise(async (resolve, reject) =>
        {
            try {
                let response = await BackgroundMessage.sendMessageCheckOk({ 'type': BackgroundMessage.executeBackpackItemAction.name, 'itemId': itemId, 'action': action, 'args': args, 'involvedIds': involvedIds });
                resolve((<ExecuteBackpackItemActionResponse>response).result);
            } catch (error) {
                reject(error);
            }
        });
    }

    static getItemsByInventoryItemIds(itemsToGet: ItemProperties[]): Promise<ItemProperties[]>
    {
        const request = { 'type': BackgroundMessage.getItemsByInventoryItemIds.name, itemsToGet };
        return BackgroundMessage.sendMessageCheckOk(request).then(response => <ItemProperties[]>(response.items));
    }

    static handleNewChatMessage(chat: Chat, chatMessage: ChatMessage, deduplicate: boolean): Promise<boolean>
    {
        return new Promise((resolve, reject) => {
            BackgroundMessage.sendMessageCheckOk({
                'type': BackgroundMessage.handleNewChatMessage.name, chat, chatMessage, deduplicate,
            })
            .then(response => resolve(response.keepChatMessage))
            .catch(error => reject(error));
        });
    }

    static getChatHistory(chat: Chat): Promise<ChatMessage[]>
    {
        return new Promise((resolve, reject) => {
            BackgroundMessage.sendMessageCheckOk({'type': BackgroundMessage.getChatHistory.name, chat})
            .then(response => resolve(response.chatHistory))
            .catch(error => reject(error));
        });
    }

    static deleteChatHistory(chat: Chat, olderThanTime: string): Promise<void>
    {
        return BackgroundMessage.sendMessageCheckOk({
            'type': BackgroundMessage.deleteChatHistory.name, chat, olderThanTime,
        });
    }

    static openOrFocusPopup(popupDefinition: PopupDefinition): Promise<void>
    {
        return BackgroundMessage.sendMessageCheckOk({
            'type': BackgroundMessage.openOrFocusPopup.name, popupDefinition,
        });
    }

    static closePopup(popupId: string): Promise<void>
    {
        return BackgroundMessage.sendMessageCheckOk({
            'type': BackgroundMessage.closePopup.name, popupId,
        });
    }

    static isTabDisabled(pageUrl: string): Promise<boolean>
    {
        return new Promise(async (resolve, reject) =>
        {
            try {
                let response = await BackgroundMessage.sendMessageCheckOk({ 'type': BackgroundMessage.isTabDisabled.name, 'pageUrl': pageUrl });
                resolve((<IsTabDisabledResponse>response).isDisabled);
            } catch (error) {
                reject(error);
            }
        });
    }

}
