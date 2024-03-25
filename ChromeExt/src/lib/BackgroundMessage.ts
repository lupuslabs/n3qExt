import { ItemChangeOptions } from './ItemChangeOptions';
import { ItemException } from './ItemException';
import { ItemProperties, ItemPropertiesSet } from './ItemProperties';
import { ChatUtils } from './ChatUtils';
import { ContentToBackgroundCommunicator } from './ContentToBackgroundCommunicator'
import { Config } from './Config'
import { as } from './as'
import { is } from './is'

export type BackgroundRequest = {
    type: string,
    [p: string]: any,
}

export type TabStats = {
    participantCount:  number, // Other participants present in the same room.
    toastCount:        number, // Open toasts.
    hasNewGroupChat:   boolean, // Whether new chat messages/emotes occured.
    hasNewPrivateChat: boolean, // Whether new private chat messages occured.
};

export function makeZeroTabStats(): TabStats
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

interface BackgroundResponseOptionalProps {
    [p: string]: any,
}

export class BackgroundSuccessResponse implements BackgroundResponseOptionalProps
{
    public readonly ok: true = true

    constructor() { }
}

export class BackgroundErrorResponse implements BackgroundResponseOptionalProps
{
    public readonly ok: false = false
    public readonly status: string
    public readonly statusText: string
    public readonly stack?: string

    constructor(status: string, statusText: any, data?: {})
    {
        if (data) {
            Object.assign(this, data)
        }
        this.status = status.toLowerCase()
        this.statusText = statusText
    }

    public static ofError(error: unknown, data?: {}): BackgroundErrorResponse
    {
        error ??= {}
        data ??= {}

        if (error instanceof BackgroundErrorResponse) {
            Object.assign(error, data)
            return error
        }

        if (is.string(error)) {
            return new BackgroundErrorResponse('error', error, data)
        }

        const status = as.String(error['status'] ?? error['name'] ?? 'error')
        let statusText = as.String(error['statusText'] ?? error['message'] ?? 'Error!')
        const stack = error['stack']
        if (is.string(stack)) {
            data['stack'] = stack
        }

        if (ItemException.isInstance(error)) {
            const factId = error.fact ?? ItemException.Fact.UnknownError
            const reasonId = error.reason ?? ItemException.Reason.UnknownReason
            data['fact'] = factId
            data['reason'] = reasonId
            data['detail'] = error.detail
            const factStr = ItemException.Fact[factId]
            const reasonStr = ItemException.Reason[reasonId]
            const detailStr = error.detail ?? error.message
            statusText = `ItemException ${factStr} ${reasonStr} ${detailStr}`.trimEnd()
        }

        const mergedData = {}
        if (is.object(error)) {
            Object.assign(mergedData, error)
        }
        Object.assign(mergedData, data)
        return new BackgroundErrorResponse(status, statusText, mergedData)
    }
}

export type BackgroundResponse = BackgroundSuccessResponse|BackgroundErrorResponse

export class GetConfigTreeResponse extends BackgroundSuccessResponse
{
    constructor(public data: {}) { super(); }
}

export class FetchUrlResponse extends BackgroundSuccessResponse
{
    constructor(public data: string) { super(); }
}

export class FetchUrlDataResponse extends BackgroundSuccessResponse
{
    constructor(public data: any) { super(); }
}

export class BackpackIsItemStillInRepoResponse extends BackgroundSuccessResponse
{
    constructor(public result: boolean) { super(); }
}

export class IsBackpackItemResponse extends BackgroundSuccessResponse
{
    constructor(public isItem: boolean) { super(); }
}

export class GetBackpackItemPropertiesResponse extends BackgroundSuccessResponse
{
    constructor(public properties: ItemProperties) { super(); }
}

export class GetItemsByInventoryItemIdsResponse extends BackgroundSuccessResponse
{
    constructor(public items: ItemProperties[]) { super(); }
}

export class ExecuteBackpackItemActionResponse extends BackgroundSuccessResponse
{
    constructor(public result: ItemProperties) { super(); }
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

export class ApplyItemToBackpackItemResponse extends BackgroundSuccessResponse
{
    constructor(public result: ItemProperties) { super(); }
}

export class CreateBackpackItemResponse extends BackgroundSuccessResponse
{
    constructor(public properties: ItemProperties) { super(); }
}

export class FindBackpackItemPropertiesResponse extends BackgroundSuccessResponse
{
    constructor(public propertiesSet: ItemPropertiesSet) { super(); }
}

export class NewChatMessageResponse extends BackgroundSuccessResponse
{
    constructor(public keepChatMessage: boolean) { super(); }
}

export class GetChatHistoryResponse extends BackgroundSuccessResponse
{
    constructor(public chatHistory: ChatUtils.ChatMessage[]) { super(); }
}

export class IsTabDisabledResponse extends BackgroundSuccessResponse
{
    constructor(public isDisabled: boolean) { super(); }
}

export class BackgroundMessage
{
    public static backgroundCommunicator: ContentToBackgroundCommunicator;

    private static sendMessage<T extends BackgroundSuccessResponse>(message: BackgroundRequest): Promise<T|BackgroundErrorResponse>
    {
        return BackgroundMessage.backgroundCommunicator.sendRequest<T>(message);
    }

    /**
     * @throws BackgroundErrorResponse
     */
    private static async sendMessageCheckOk<T extends BackgroundSuccessResponse>(message: any): Promise<T>
    {
        const response = await BackgroundMessage.sendMessage<T>(message)
        if (!response.ok) {
            throw response;
        }
        return response;
    }

    static async test(): Promise<void>
    {
        const request = { type: BackgroundMessage.test.name }
        await BackgroundMessage.sendMessageCheckOk(request)
    }

    static async waitReady(): Promise<void>
    {
        let checksLeft = Config.get('system.clientBackgroundWaitReadyChecksMax', 100)
        const checkIntervalSecs = Config.get('system.clientBackgroundWaitReadyCheckIntervalSec', 1)
        const checkIntervalMs = 1e3 * checkIntervalSecs

        let resultResolve
        let resultReject
        const promise: Promise<void> = new Promise((resolve, reject) => {
            [resultResolve, resultReject] = [resolve, reject]
        });

        const checkFun = (): Promise<BackgroundResponse> => BackgroundMessage.assertReady()
            .then(() => new BackgroundSuccessResponse())
            .catch(ErrorResponse => ErrorResponse)
        const loopFun = async () => {
            const result = await checkFun()
            if (result.ok) {
                resultResolve()
                return
            }
            checksLeft--
            if (checksLeft <= 0) {
                resultReject(result)
                return
            }
            window.setTimeout(loopFun, checkIntervalMs)
        }
        loopFun()
        return promise
    }

    static async assertReady(): Promise<void>
    {
        // This is the first request to be handled by the background, which might or might not be still initializing.
        await BackgroundMessage.sendMessageCheckOk({ type: BackgroundMessage.assertReady.name })
    }

    static async jsonRpc(url: string, jsonBodyData: any): Promise<string>
    {
        const request = { type: BackgroundMessage.jsonRpc.name, 'url': url, 'json': jsonBodyData }
        const response = await BackgroundMessage.sendMessageCheckOk<FetchUrlResponse>(request)
        return response.data
    }

    static async fetchUrlAsText(url: string, version: string): Promise<string>
    {
        const request = { type: BackgroundMessage.fetchUrlAsText.name, 'url': url, 'version': version }
        const response = await BackgroundMessage.sendMessageCheckOk<FetchUrlResponse>(request)
        return response.data
    }

    static async fetchUrlAsDataUrl(url: string, version: string): Promise<string>
    {
        const request = { type: BackgroundMessage.fetchUrlAsDataUrl.name, 'url': url, 'version': version }
        const response = await BackgroundMessage.sendMessageCheckOk<FetchUrlResponse>(request)
        return response.data
    }

    static async fetchUrlJson(url: string): Promise<any>
    {
        const request = { type: BackgroundMessage.fetchUrlJson.name, 'url': url }
        const response = await BackgroundMessage.sendMessageCheckOk<FetchUrlDataResponse>(request)
        return response.data
    }

    static async signalContentAppStartToBackground(): Promise<void>
    {
        const request = { type: BackgroundMessage.signalContentAppStartToBackground.name }
        await BackgroundMessage.sendMessageCheckOk(request)
    }

    static async signalContentAppStopToBackground(): Promise<void>
    {
        const request = { type: BackgroundMessage.signalContentAppStopToBackground.name }
        await BackgroundMessage.sendMessageCheckOk(request)
    }

    static async sendTabStatsToBackground(data: TabStats): Promise<void>
    {
        const request = { type: BackgroundMessage.sendTabStatsToBackground.name, data }
        await BackgroundMessage.sendMessageCheckOk(request)
    }

    static async getConfigTree(name: string): Promise<any>
    {
        const request = { type: BackgroundMessage.getConfigTree.name, 'name': name }
        const response = await BackgroundMessage.sendMessageCheckOk<GetConfigTreeResponse>(request)
        return response.data
    }

    static async sendStanza(stanza: any): Promise<void>
    {
        const request = { type: BackgroundMessage.sendStanza.name, 'stanza': stanza }
        await BackgroundMessage.sendMessageCheckOk(request)
    }

    static async sendRoomPos(roomJid: string, posX: number): Promise<void>
    {
        const request = { type: BackgroundMessage.sendRoomPos.name, roomJid, posX }
        await BackgroundMessage.sendMessageCheckOk(request)
    }

    static async sendRoomPresence(presenceData: TabRoomPresenceData): Promise<void>
    {
        const request = { type: BackgroundMessage.sendRoomPresence.name, presenceData }
        await BackgroundMessage.sendMessageCheckOk(request)
    }

    static async userSettingsChanged(): Promise<void>
    {
        const request = { type: BackgroundMessage.userSettingsChanged.name }
        await BackgroundMessage.sendMessageCheckOk(request)
    }

    static async clientNotification(target: string, data: any): Promise<void>
    {
        const request = { type: BackgroundMessage.clientNotification.name, 'target': target, 'data': data }
        await BackgroundMessage.sendMessageCheckOk(request)
    }

    static async pointsActivity(channel: string, n: number): Promise<void>
    {
        const request = { type: BackgroundMessage.pointsActivity.name, 'channel': channel, 'n': n }
        await BackgroundMessage.sendMessageCheckOk(request)
    }

    static async requestBackpackState(): Promise<void>
    {
        const request = { type: BackgroundMessage.requestBackpackState.name }
        await BackgroundMessage.sendMessageCheckOk(request)
    }

    static async backpackIsItemStillInRepo(itemId: string): Promise<boolean>
    {
        const request = { type: BackgroundMessage.backpackIsItemStillInRepo.name, itemId: itemId }
        const response = await BackgroundMessage.sendMessageCheckOk<BackpackIsItemStillInRepoResponse>(request)
        return response.result
    }

    static async modifyBackpackItemProperties(itemId: string, changed: ItemProperties, deleted: Array<string>, options: ItemChangeOptions): Promise<void>
    {
        const request = { type: BackgroundMessage.modifyBackpackItemProperties.name, itemId: itemId, 'changed': changed, 'deleted': deleted, 'options': options }
        await BackgroundMessage.sendMessageCheckOk(request)
    }

    static async loadWeb3BackpackItems(): Promise<void>
    {
        const request = { type: BackgroundMessage.loadWeb3BackpackItems.name }
        await BackgroundMessage.sendMessageCheckOk(request)
    }

    static async rezBackpackItem(itemId: string, roomJid: string, x: number, destination: string, options: ItemChangeOptions): Promise<void>
    {
        const request = { type: BackgroundMessage.rezBackpackItem.name, itemId: itemId, 'roomJid': roomJid, 'x': x, 'destination': destination, 'options': options }
        await BackgroundMessage.sendMessageCheckOk(request)
    }

    static async derezBackpackItem(itemId: string, roomJid: string, x: number, y: number, changed: ItemProperties, deleted: Array<string>, options: ItemChangeOptions): Promise<void>
    {
        const request = { type: BackgroundMessage.derezBackpackItem.name, itemId: itemId, 'roomJid': roomJid, 'x': x, 'y': y, 'changed': changed, 'deleted': deleted, 'options': options }
        await BackgroundMessage.sendMessageCheckOk(request)
    }

    static async deleteBackpackItem(itemId: string, options: ItemChangeOptions): Promise<void>
    {
        const request = { type: BackgroundMessage.deleteBackpackItem.name, itemId: itemId, 'options': options }
        await BackgroundMessage.sendMessageCheckOk(request)
    }

    static async isBackpackItem(itemId: string): Promise<boolean>
    {
        const request = { type: BackgroundMessage.isBackpackItem.name, itemId: itemId }
        const response = await BackgroundMessage.sendMessageCheckOk<IsBackpackItemResponse>(request)
        return response.isItem
    }

    static async getBackpackItemProperties(itemId: string): Promise<ItemProperties>
    {
        const request = { type: BackgroundMessage.getBackpackItemProperties.name, itemId: itemId }
        const response = await BackgroundMessage.sendMessageCheckOk<GetBackpackItemPropertiesResponse>(request)
        return response.properties
    }

    static async applyItemToBackpackItem(activeId: string, passiveId: string): Promise<ItemProperties>
    {
        const request = { type: BackgroundMessage.applyItemToBackpackItem.name, activeId, passiveId }
        const response = await BackgroundMessage.sendMessageCheckOk<ApplyItemToBackpackItemResponse>(request)
        return response.result
    }

    static async backpackTransferAuthorize(itemId: string, duration: number): Promise<string>
    {
        const request = {
            type: BackgroundMessage.backpackTransferAuthorize.name,
            itemId: itemId,
            'duration': duration,
        };
        const response = await BackgroundMessage.sendMessageCheckOk<BackpackTransferAuthorizeResponse>(request);
        return response.transferToken;
    }

    static async backpackTransferUnauthorize(itemId: string): Promise<void>
    {
        const request = {
            type: BackgroundMessage.backpackTransferUnauthorize.name,
            itemId: itemId,
        };
        await BackgroundMessage.sendMessageCheckOk(request);
    }

    static async backpackTransferComplete(provider: string, senderInventoryId: string, senderItemId: string, transferToken: string): Promise<ItemProperties>
    {
        const request = {
            type: BackgroundMessage.backpackTransferComplete.name,
            provider: provider,
            senderInventoryId: senderInventoryId,
            senderItemId: senderItemId,
            transferToken: transferToken,
        };
        const response = await BackgroundMessage.sendMessageCheckOk<BackpackTransferCompleteResponse>(request);
        return response.properties;
    }

    static async createBackpackItem(provider: string, auth: string, method: string, args: ItemProperties): Promise<ItemProperties>
    {
        const request = { type: BackgroundMessage.createBackpackItem.name, provider, auth, method, args }
        const response = await BackgroundMessage.sendMessageCheckOk<CreateBackpackItemResponse>(request);
        return response.properties
    }

    static async findBackpackItemProperties(filterProperties: ItemProperties): Promise<ItemPropertiesSet>
    {
        const request = { type: BackgroundMessage.findBackpackItemProperties.name, filterProperties }
        const response = await BackgroundMessage.sendMessageCheckOk<FindBackpackItemPropertiesResponse>(request);
        return response.propertiesSet
    }

    static async executeBackpackItemAction(itemId: string, action: string, args: any, involvedIds: Array<string>): Promise<ItemProperties>
    {
        const request = { type: BackgroundMessage.executeBackpackItemAction.name, itemId, action, args, involvedIds }
        const response = await BackgroundMessage.sendMessageCheckOk<ExecuteBackpackItemActionResponse>(request);
        return response.result
    }

    static async executeBackpackItemActionOnGenericitem(action: string, args: {[p: string]: any}, involvedIds: Array<string> = []): Promise<ItemProperties>
    {
        const request = { type: BackgroundMessage.executeBackpackItemActionOnGenericitem.name, action, args, involvedIds }
        const response = await BackgroundMessage.sendMessageCheckOk<ExecuteBackpackItemActionResponse>(request);
        return response.result
    }

    static async getItemsByInventoryItemIds(itemsToGet: ItemProperties[]): Promise<ItemProperties[]>
    {
        const request = { type: BackgroundMessage.getItemsByInventoryItemIds.name, itemsToGet }
        const response = await BackgroundMessage.sendMessageCheckOk<GetItemsByInventoryItemIdsResponse>(request)
        return response.items
    }

    static async handleNewChatMessage(chatChannel: ChatUtils.ChatChannel, chatMessage: ChatUtils.ChatMessage, deduplicate: boolean): Promise<boolean>
    {
        const request = { type: BackgroundMessage.handleNewChatMessage.name, chatChannel, chatMessage, deduplicate }
        const response = await BackgroundMessage.sendMessageCheckOk<NewChatMessageResponse>(request)
        return response.keepChatMessage
    }

    static async getChatHistory(chatChannel: ChatUtils.ChatChannel): Promise<ChatUtils.ChatMessage[]>
    {
        const request = { type: BackgroundMessage.getChatHistory.name, chatChannel }
        const response = await BackgroundMessage.sendMessageCheckOk<GetChatHistoryResponse>(request)
        return response.chatHistory
    }

    static async deleteChatHistory(chatChannel: ChatUtils.ChatChannel, olderThanTime: string): Promise<void>
    {
        const request = { type: BackgroundMessage.deleteChatHistory.name, chatChannel, olderThanTime }
        await BackgroundMessage.sendMessageCheckOk(request)
    }

    static async openOrFocusPopup(popupDefinition: PopupDefinition): Promise<void>
    {
        const request = { type: BackgroundMessage.openOrFocusPopup.name, popupDefinition, }
        await BackgroundMessage.sendMessageCheckOk(request)
    }

    static async closePopup(popupId: string): Promise<void>
    {
        const request = { type: BackgroundMessage.closePopup.name, popupId }
        await BackgroundMessage.sendMessageCheckOk(request)
    }

    static async isTabDisabled(pageUrl: string): Promise<boolean>
    {
        const request = { type: BackgroundMessage.isTabDisabled.name, 'pageUrl': pageUrl }
        const response = await BackgroundMessage.sendMessageCheckOk<IsTabDisabledResponse>(request)
        return response.isDisabled
    }

}

//------------------------------------------------------------------------------
// For use by content/background communicator implementations

export interface BackgroundMessagePipe
{
    readonly contentTabId: number
    addOnDisconnectHandler(handler: () => void): void
    addOnMessageHandler(handler: (message: BackgroundRequestEnvelope|BackgroundResponseEnvelope) => void): void
    postMessage(message: BackgroundRequestEnvelope|BackgroundResponseEnvelope): Promise<void> // Message is guaranteed to be sent asynchronously.
    disconnect(): void
}

export type BackgroundRequestEnvelope = {
    requestId: number,
    requestTimeMs: number,
    request: BackgroundRequest,
}

export type BackgroundResponseEnvelope = {
    responseId: number,
    requestId: number,
    response: BackgroundResponse,
}

export function isBackgroundResponseEnvelope(message: BackgroundRequestEnvelope|BackgroundResponseEnvelope): message is BackgroundResponseEnvelope
{
    return !is.nil(message['responseId'])
}
