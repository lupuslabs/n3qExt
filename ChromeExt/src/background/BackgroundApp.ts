import log = require('loglevel');
import { client, xml, jid } from '@xmpp/client';
import { as } from '../lib/as';
import { ErrorWithData, Utils } from '../lib/Utils';
import { Config } from '../lib/Config';
import
{
    BackgroundErrorResponse,
    BackgroundItemExceptionResponse,
    BackgroundMessage,
    BackgroundResponse,
    BackgroundSuccessResponse,
    FindBackpackItemPropertiesResponse,
    GetBackpackItemPropertiesResponse,
    GetBackpackStateResponse,
    IsBackpackItemResponse,
    ExecuteBackpackItemActionResponse,
    CreateBackpackItemResponse,
    ApplyItemToBackpackItemResponse,
    BackpackTransferCompleteResponse,
    BackpackTransferUnauthorizeResponse,
    BackpackTransferAuthorizeResponse,
    BackpackIsItemStillInRepoResponse,
    GetChatHistoryResponse,
    NewChatMessageResponse,
} from '../lib/BackgroundMessage';
import { ItemProperties, Pid } from '../lib/ItemProperties';
import { ContentMessage } from '../lib/ContentMessage';
import { ItemException } from '../lib/ItemException';
import { ItemChangeOptions } from '../lib/ItemChangeOptions';
import { Memory } from '../lib/Memory';
import { ConfigUpdater } from './ConfigUpdater';
import { Backpack } from './Backpack';
import { Translator } from '../lib/Translator';
import { Environment } from '../lib/Environment';
import { Client } from '../lib/Client';
import { WeblinClientApi } from '../lib/WeblinClientApi';
import { LocalStorageItemProvider } from './LocalStorageItemProvider';
import { Chat, ChatMessage, isChat, isChatMessage } from '../lib/ChatMessage';
import { ChatHistoryStorage } from './ChatHistoryStorage';
import { is } from '../lib/is';

interface ILocationMapperResponse
{
    //    sMessage: string;
    sLocationURL: string;
}

interface PointsActivity
{
    channel: string;
    n: number;
}

export class BackgroundApp
{
    private xmpp: any;
    private xmppConnected = false;
    private xmppJid: string;
    private configUpdater: ConfigUpdater;
    private resource: string;
    private isReady: boolean = false;
    private backpack: Backpack = null;
    private xmppStarted = false;
    private babelfish: Translator;
    private chatHistoryStorage: ChatHistoryStorage;

    private startupTime = Date.now();
    private waitReadyCount = 0;
    private waitReadyTime = 0;
    private xmppConnectCount = 0;
    private stanzasOutCount = 0;
    private stanzasInCount = 0;

    private readonly stanzaQ: Array<xml> = [];
    private readonly roomJid2tabId: Map<string, Array<number>> = new Map<string, Array<number>>();
    private readonly fullJid2TabWhichSentUnavailable: Map<string, number> = new Map<string, number>();
    private readonly fullJid2TimerDeferredUnavailable: Map<string, number> = new Map<string, number>();
    private readonly fullJid2TimerDeferredAway: Map<string, { timer: number, awayStanza?: xml, availableStanza?: xml }> = new Map<string, { timer: number, awayStanza?: any, availableStanza?: any }>();
    private readonly iqStanzaTabId: Map<string, number> = new Map<string, number>();

    async start(): Promise<void>
    {
        this.isReady = false;

        {
            let devConfig = await Memory.getLocal(Utils.localStorageKey_CustomConfig(), '{}');
            try {
                let parsed = JSON.parse(devConfig);
                Config.setDevTree(parsed);
            } catch (error) {
                log.error('Parse dev config failed', error);
            }
        }

        Environment.NODE_ENV = Config.get('environment.NODE_ENV', null);

        let firstStart = await Memory.getLocal('client.firstStart', 0);
        if (firstStart == 0) {
            await Memory.setLocal('client.firstStart', Date.now());
        }
        let startCount = await Memory.getLocal('client.startCount', 0);
        startCount++;
        await Memory.setLocal('client.startCount', startCount);

        await this.migrateSyncToLocalBecauseItsConfusingConsideredThatItemsAreLocal();
        await this.assertThatThereIsAUserId();
        await this.assertThatThereIsAUserToken();

        let language: string = Translator.mapLanguage(navigator.language, lang => { return Config.get('i18n.languageMapping', {})[lang]; }, Config.get('i18n.defaultLanguage', 'en-US'));
        this.babelfish = new Translator(Config.get('i18n.translations', {})[language], language, Config.get('i18n.serviceUrl', ''));

        this.chatHistoryStorage = new ChatHistoryStorage(this);

        if (Environment.isExtension() && chrome.runtime.onMessage) {
            chrome.runtime.onMessage.addListener((message, sender, sendResponse) =>
            {
                return this.onRuntimeMessage(message, sender, sendResponse);
            });
        }

        if (Environment.isExtension() && chrome.browserAction && chrome.browserAction.onClicked) {
            chrome.browserAction.onClicked.addListener(async tab =>
            {
                await this.onBrowserActionClicked(tab.id);
            });
        }

        this.lastPointsSubmissionTime = Date.now();

        this.configUpdater = new ConfigUpdater(this);
        await this.configUpdater.getUpdate(() => this.onConfigUpdated());
        await this.configUpdater.startUpdateTimer(() => this.onConfigUpdated());
    }

    async getUserId(): Promise<string>
    {
        let userId = await Memory.getLocal(Utils.localStorageKey_Id(), '');
        if (userId == null || userId == '') { throw new ItemException(ItemException.Fact.InternalError, ItemException.Reason.NoUserId); }
        return userId;
    }

    async getUserToken(): Promise<string>
    {
        let userId = await Memory.getLocal(Utils.localStorageKey_Token(), '');
        if (userId == null || userId == '') { throw new ItemException(ItemException.Fact.InternalError, ItemException.Reason.NoUserToken); }
        return userId;
    }

    async assertThatThereIsAUserId()
    {
        let uniqueId = await Memory.getLocal(Utils.localStorageKey_Id(), '');
        if (uniqueId == '') {
            uniqueId = 'mid' + Utils.randomString(30).toLowerCase();
            await Memory.setLocal(Utils.localStorageKey_Id(), uniqueId);
        }
    }

    async assertThatThereIsAUserToken()
    {
        let token = await Memory.getLocal(Utils.localStorageKey_Token(), '');
        if (token == '') {
            token = 'mto' + Utils.randomString(30).toLowerCase();
            await Memory.setLocal(Utils.localStorageKey_Token(), token);
        }
    }

    async migrateSyncToLocalBecauseItsConfusingConsideredThatItemsAreLocal()
    {
        {
            let uniqueId = await Memory.getLocal(Utils.localStorageKey_Id(), '');
            if (uniqueId == '') {
                uniqueId = await Memory.getSync(Utils.localStorageKey_Id(), '');
                if (uniqueId != '') {
                    await Memory.setLocal(Utils.localStorageKey_Id(), uniqueId);
                    await Memory.deleteSync(Utils.localStorageKey_Id());
                }
            }
        }
        {
            let nickname = await Memory.getLocal(Utils.localStorageKey_Nickname(), '');
            if (nickname == '') {
                nickname = await Memory.getSync(Utils.localStorageKey_Nickname(), '');
                if (nickname != '') {
                    await Memory.setLocal(Utils.localStorageKey_Nickname(), nickname);
                    await Memory.deleteSync(Utils.localStorageKey_Nickname());
                }
            }
        }
        {
            let avatar = await Memory.getLocal(Utils.localStorageKey_Avatar(), '');
            if (avatar == '') {
                avatar = await Memory.getSync(Utils.localStorageKey_Avatar(), '');
                if (avatar != '') {
                    await Memory.setLocal(Utils.localStorageKey_Avatar(), avatar);
                    await Memory.deleteSync(Utils.localStorageKey_Avatar());
                }
            }
        }
    }

    async onConfigUpdated()
    {
        if (this.backpack == null) {
            if (Utils.isBackpackEnabled()) {
                this.backpack = new Backpack(this);
                await this.backpack.init();
            }
        }

        this.chatHistoryStorage.onUserConfigUpdate();

        if (!this.xmppStarted) {
            try {
                await this.startXmpp();
                this.xmppStarted = true;
            } catch (error) {
                throw error;
            }
        }

        if (!this.isReady) {
            this.isReady = true;
            if (Utils.logChannel('startup', true)) { log.info('BackgroundApp', 'isReady'); }
        }
    }

    stop(): void
    {
        this.configUpdater.stopUpdateTimer();

        // Does not work that way:
        // chrome.runtime?.onMessage.removeListener((message, sender, sendResponse) => { return this.onRuntimeMessage(message, sender, sendResponse); });

        // this.unsubscribeItemInventories();
        this.stopXmpp();
    }

    translateText(key: string, defaultText: string = null): string
    {
        return this.babelfish.translateText(key, defaultText);
    }

    // IPC

    private async onBrowserActionClicked(tabId: number): Promise<void>
    {
        let state = !as.Bool(await Memory.getLocal(Utils.localStorageKey_Active(), false), false);
        await Memory.setLocal(Utils.localStorageKey_Active(), state);
        chrome.browserAction.setIcon({ path: '/assets/' + (state ? 'icon.png' : 'iconDisabled.png') });
        chrome.browserAction.setTitle({ title: this.translateText('Extension.' + (state ? 'Disable' : 'Enable')) });
        ContentMessage.sendMessage(tabId, { 'type': ContentMessage.type_extensionActiveChanged, 'data': { 'state': state } });
    }

    onDirectRuntimeMessage(message: any, sendResponse: (response?: any) => void)
    {
        const sender = { tab: { id: 0 } };
        this.onRuntimeMessage(message, sender, sendResponse);
    }

    private onRuntimeMessage(message, sender/*: chrome.runtime.MessageSender*/, sendResponse: (response?: any) => void): boolean
    {
        switch (message.type) {
            case BackgroundMessage.test.name: {
                sendResponse(this.handle_test());
                return false;
            } break;

            case BackgroundMessage.wakeup.name: {
                sendResponse(this.handle_wakeup());
                return false;
            } break;

            case BackgroundMessage.fetchUrl.name: {
                return this.handle_fetchUrl(message.url, message.version, sendResponse);
            } break;

            case BackgroundMessage.fetchUrlAsDataUrl.name: {
                return this.handle_fetchUrlAsDataUrl(message.url, message.version, sendResponse);
            } break;

            case BackgroundMessage.jsonRpc.name: {
                return this.handle_jsonRpc(message.url, message.json, sendResponse);
            } break;

            case BackgroundMessage.waitReady.name: {
                return this.handle_waitReady(sendResponse);
            } break;

            case BackgroundMessage.getConfigTree.name: {
                sendResponse(this.handle_getConfigTree(message.name));
                return false;
            } break;

            case BackgroundMessage.sendStanza.name: {
                sendResponse(this.handle_sendStanza(message.stanza, sender.tab.id));
                return false;
            } break;

            case BackgroundMessage.pingBackground.name: {
                sendResponse(this.handle_pingBackground(sender));
                return false;
            } break;

            case BackgroundMessage.log.name: {
                sendResponse(this.handle_log(message.pieces));
                return false;
            } break;

            case BackgroundMessage.userSettingsChanged.name: {
                sendResponse(this.handle_userSettingsChanged());
                return false;
            } break;

            case BackgroundMessage.clientNotification.name: {
                sendResponse(this.handle_clientNotification(sender.tab.id, message.target, message.data));
                return false;
            } break;

            case BackgroundMessage.getBackpackState.name: {
                return this.handle_getBackpackState(sendResponse);
            } break;

            case BackgroundMessage.backpackIsItemStillInRepo.name: {
                return this.handle_backpackIsItemStillInRepo(message.itemId, sendResponse);
            } break;

            case BackgroundMessage.addBackpackItem.name: {
                return this.handle_addBackpackItem(message.itemId, message.properties, message.options, sendResponse);
            } break;

            case BackgroundMessage.modifyBackpackItemProperties.name: {
                return this.handle_modifyBackpackItemProperties(message.itemId, message.changed, message.deleted, message.options, sendResponse);
            } break;

            case BackgroundMessage.loadWeb3BackpackItems.name: {
                return this.loadWeb3BackpackItems(sendResponse);
            } break;

            case BackgroundMessage.rezBackpackItem.name: {
                return this.handle_rezBackpackItem(message.itemId, message.roomJid, message.x, message.destination, message.options, sendResponse);
            } break;

            case BackgroundMessage.derezBackpackItem.name: {
                return this.handle_derezBackpackItem(message.itemId, message.roomJid, message.x, message.y, message.changed, message.deleted, message.options, sendResponse);
            } break;

            case BackgroundMessage.deleteBackpackItem.name: {
                return this.handle_deleteBackpackItem(message.itemId, message.options, sendResponse);
            } break;

            case BackgroundMessage.isBackpackItem.name: {
                return this.handle_isBackpackItem(message.itemId, sendResponse);
            } break;

            case BackgroundMessage.getBackpackItemProperties.name: {
                return this.handle_getBackpackItemProperties(message.itemId, sendResponse);
            } break;

            case BackgroundMessage.findBackpackItemProperties.name: {
                return this.handle_findBackpackItemProperties(message.filterProperties, sendResponse);
            } break;

            case BackgroundMessage.executeBackpackItemAction.name: {
                return this.handle_executeBackpackItemAction(message.itemId, message.action, message.args, message.involvedIds, sendResponse);
            } break;

            case BackgroundMessage.getItemsByInventoryItemIds.name: {
                return this.handle_getItemsByInventoryItemIds(message.itemsToGet, sendResponse);
            } break;

            case BackgroundMessage.pointsActivity.name: {
                return this.handle_pointsActivity(message.channel, message.n, sendResponse);
            } break;

            case BackgroundMessage.applyItemToBackpackItem.name: {
                return this.handle_applyItemToBackpackItem(message.activeId, message.passiveId, sendResponse);
            } break;

            case BackgroundMessage.backpackTransferAuthorize.name: {
                return this.handle_backpackTransferAuthorize(message.itemId, message.duration, sendResponse);
            } break;

            case BackgroundMessage.backpackTransferUnauthorize.name: {
                return this.handle_backpackTransferUnauthorize(message.itemId, sendResponse);
            } break;

            case BackgroundMessage.backpackTransferComplete.name: {
                return this.handle_backpackTransferComplete(message.provider,
                    message.senderInventoryId, message.senderItemId, message.transferToken, sendResponse);
            } break;

            case BackgroundMessage.createBackpackItem.name: {
                return this.handle_createBackpackItem(message.provider, message.auth, message.method, message.args, sendResponse);
            } break;

            case BackgroundMessage.handleNewChatMessage.name: {
                return this.handle_newChatMessage(message.chat, message.chatMessage, message.deduplicate, sendResponse);
            } break;

            case BackgroundMessage.getChatHistory.name: {
                return this.handle_getChatHistory(message.chat, sendResponse);
            } break;

            case BackgroundMessage.deleteChatHistory.name: {
                return this.handle_deleteChatHistory(message.chat, message.olderThanTime, sendResponse);
            } break;

            default: {
                log.debug('BackgroundApp.onRuntimeMessage unhandled', message);
                sendResponse(new BackgroundErrorResponse('error', 'unhandled message type=' + message.type));
                return false;
            } break;
        }
    }

    private readonly httpCacheData: Map<string, {response: Response, blob: Blob, responseTimeUsecs: number}> = new Map();
    private readonly httpCacheRequests: Map<string, Array<{resolve: (blob: Blob) => void, reject: (error: any) => void}>> = new Map();
    private lastCacheMaintenanceTime: number = 0;

    checkMaintainHttpCache(): void
    {
        let now = Date.now();
        let maintenanceIntervalSec = Config.get('httpCache.maintenanceIntervalSec', 60);
        if (now - this.lastCacheMaintenanceTime > maintenanceIntervalSec * 1000) {
            this.maintainHttpCache();
            this.lastCacheMaintenanceTime = now;
        }
    }

    maintainHttpCache(): void
    {
        if (Utils.logChannel('backgroundFetchUrlCache', true)) { log.info('BackgroundApp.maintainHttpCache'); }
        let cacheTimeout = Config.get('httpCache.maxAgeSec', 3600);
        let now = Date.now();
        for (const [key, {responseTimeUsecs}] of this.httpCacheData) {
            if (now - responseTimeUsecs > cacheTimeout * 1000) {
                if (Utils.logChannel('backgroundFetchUrlCache', true)) {
                    log.info('BackgroundApp.maintainHttpCache', (now - responseTimeUsecs) / 1000, 'sec', 'delete', key);
                }
                this.httpCacheData.delete(key);
            }
        }
    }

    private async fetchJSON(url: string): Promise<any>
    {
        if (Utils.logChannel('backgroundFetchUrl', true)) { log.info('BackgroundApp.fetchJSON', url); }

        return new Promise((resolve, reject) =>
        {
            $
                .getJSON(url, data => resolve(data))
                .fail(reason => reject(null));
        });
    }

    fetchUrl(url: string, version: string): Promise<Blob>
    {
        this.checkMaintainHttpCache();
        return new Promise<Blob>((resolve, reject) => {
            let key = version + url;

            const cachedEntry = version === '_nocache' ? null : this.httpCacheData.get(key);
            if (!is.nil(cachedEntry)) {
                // log.debug('BackgroundApp.handle_fetchUrl', 'cache-age', (now - cachedEntry.responseTimeUsecs) / 1000, url, 'version=', version);
                resolve(cachedEntry.blob);
                return;
            }
            if (Utils.logChannel('backgroundFetchUrlCache', true)) { log.info('BackgroundApp.handle_fetchUrl', 'not-cached', url, 'version=', version); }

            let requests = this.httpCacheRequests.get(key) ?? [];
            const triggerFetch = requests.length === 0;
            requests.push({resolve, reject});
            this.httpCacheRequests.set(key, requests);

            if (triggerFetch) {
                this.fetchUrlFromServer(key, url, version);
            }
        });
    }

    fetchUrlFromServer(key: string, url: string, version: string): void
    {
        (async () => {
            let response: Response;
            try {
                response = await fetch(url, { cache: 'reload' });
            } catch (error) {
                const msg = 'fetchUrlFromServer.fetchUrlFromServer: fetch failed!';
                throw new ErrorWithData(msg, {});
            }
            // log.debug('BackgroundApp.fetchUrlFromServer', 'httpResponse', url, response);
            if (!response.ok) {
                const msg = 'fetchUrlFromServer.fetchUrlFromServer: Fetch resulted in error response.';
                throw new ErrorWithData(msg, {response});
            }

            let blob: Blob;
            try {
                blob = await response.blob();
            } catch (error) {
                const msg = 'fetchUrlFromServer.fetchUrlFromServer: text retrieval failed!';
                throw new ErrorWithData(msg, {response});
            }

            if (version !== '_nocache') {
                let responseTimeUsecs = blob.size === 0
                    ? 0 // Empty response is to be deleted on next maintenance.
                    : Date.now(); // Nonempty response is to be deleted after configured cache timeout.
                this.httpCacheData.set(key, {response, blob, responseTimeUsecs});
            }
            
            if (Utils.logChannel('backgroundFetchUrl', true)) {
                log.info('BackgroundApp.fetchUrlFromServer', 'response', url, blob.size, response);
            }
            for (const {resolve} of this.httpCacheRequests.get(key) ?? []) {
                resolve(blob);
            }
            this.httpCacheRequests.delete(key);
        })().catch(error => {
            log.debug('BackgroundApp.handle_fetchUrl', 'exception', url, error);
            for (const {reject} of this.httpCacheRequests.get(key) ?? []) {
                reject(error);
            }
            this.httpCacheRequests.delete(key);
        });
    }

    handle_fetchUrl(url: unknown, version: unknown, sendResponse: (response?: any) => void): boolean
    {
        (async () => {
            if (!is.string(url)) {
                const error = new ErrorWithData('BackgroundApp.handle_fetchUrl: url is not a string!', {url, version});
                log.debug('BackgroundApp.handle_fetchUrl', 'exception', error);
                throw error;
            }
            if (!is.string(version)) {
                const error = new ErrorWithData('BackgroundApp.handle_fetchUrl: version is not a string!', {url, version});
                log.debug('BackgroundApp.handle_fetchUrl', 'exception', error);
                throw error;
            }
            const blob = await this.fetchUrl(url, version);

            const fileReader = new FileReader();
            let text: string;
            try {
                fileReader.readAsText(blob);
                text = await new Promise<string>(resolve => {
                    fileReader.onload = event => {
                        resolve(<string>event.target.result); // readAsDataURL always provides a string.
                    };
                });
            } catch (error) {
                const msg = 'fetchUrlFromServer.handle_fetchUrl: Blob decoding failed!';
                throw new ErrorWithData(msg, {blob});
            }

            sendResponse({ 'ok': true, 'data': text });
        })().catch(ex => {
            log.debug('BackgroundApp.handle_fetchUrl', 'catch', url, ex);
            const status = String(ex.data?.response?.status ?? ex.name ?? 'Error');
            const statusText = ex.data?.response?.statusText ?? `ex.message ${url}`;
            sendResponse({ 'ok': false, 'status': status, 'statusText': statusText });
        });
        return true;
    }

    handle_fetchUrlAsDataUrl(url: any, version: any, sendResponse: (response?: any) => void): boolean
    {
        (async () => {
            if (!is.string(url)) {
                const error = new ErrorWithData('BackgroundApp.handle_fetchUrlAsDataUrl: url is not a string!', {url, version});
                log.debug('BackgroundApp.handle_fetchUrl', 'exception', error);
                throw error;
            }
            if (!is.string(version)) {
                const error = new ErrorWithData('BackgroundApp.handle_fetchUrlAsDataUrl: version is not a string!', {url, version});
                log.debug('BackgroundApp.handle_fetchUrl', 'exception', error);
                throw error;
            }
            const blob = await this.fetchUrl(url, version);

            const fileReader = new FileReader();
            let dataUrl: string;
            try {
                fileReader.readAsDataURL(blob);
                dataUrl = await new Promise<string>(resolve => {
                    fileReader.onload = event => {
                        resolve(<string>event.target.result); // readAsDataURL always provides a string.
                    };
                });
            } catch (error) {
                const msg = 'fetchUrlFromServer.handle_fetchUrlAsDataUrl: Blob decoding failed!';
                throw new ErrorWithData(msg, {blob});
            }

            sendResponse({ 'ok': true, 'data': dataUrl });
        })().catch(ex => {
            log.debug('BackgroundApp.handle_fetchUrlAsDataUrl', 'catch', url, ex);
            const status = String(ex.data?.response?.status ?? ex.name ?? 'Error');
            const statusText = ex.data?.response?.statusText ?? `ex.message ${url}`;
            sendResponse({ 'ok': false, 'status': status, 'statusText': statusText });
        });
        return true;
    }

    handle_jsonRpc(url: string, postBody: any, sendResponse: (response?: any) => void): boolean
    {
        try {
            fetch(url, {
                method: 'POST',
                cache: 'reload',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(postBody),
                redirect: 'error'
            })
                .then(httpResponse =>
                {
                    // log.debug('BackgroundApp.handle_jsonRpc', 'httpResponse', url, postBody, httpResponse);
                    if (httpResponse.ok) {
                        return httpResponse.text();
                    } else {
                        throw { 'ok': false, 'status': httpResponse.status, 'statusText': httpResponse.statusText };
                    }
                })
                .then(text =>
                {
                    let response = { 'ok': true, 'data': text };
                    if (Utils.logChannel('backgroundJsonRpc', true)) { log.info('BackgroundApp.handle_jsonRpc', 'response', url, postBody, text.length, response); }
                    sendResponse(response);
                })
                .catch(ex =>
                {
                    log.debug('BackgroundApp.handle_jsonRpc', 'catch', url, ex);
                    let status = ex.status;
                    if (!status) { status = ex.name; }
                    if (!status) { status = 'Error'; }
                    let statusText = ex.statusText;
                    if (!statusText) { statusText = ex.message + ' ' + url; }
                    if (!statusText) { if (ex.toString) { statusText = ex.toString() + ' ' + url; } }
                    sendResponse({ 'ok': false, 'status': status, 'statusText': statusText });
                });
            return true;
        } catch (error) {
            log.debug('BackgroundApp.handle_jsonRpc', 'exception', url, error);
            sendResponse({ 'ok': false, 'status': error.status, 'statusText': error.statusText });
        }
        return false;
    }

    handle_waitReady(sendResponse: (response?: any) => void): boolean
    {
        if (Utils.logChannel('contentStart', true)) { log.info('BackgroundApp.handle_waitReady'); }
        let sendResponseIsAsync = false;
        this.waitReadyCount++;
        this.waitReadyTime = Date.now();

        if (this.isReady) {
            sendResponse({});
            return sendResponseIsAsync;
        }

        sendResponseIsAsync = true;
        let pollTimer = setInterval(() =>
        {
            if (this.isReady) {
                clearInterval(pollTimer);
                sendResponse({});
            }
        }, 100);
        return sendResponseIsAsync;
    }

    handle_getConfigTree(name: any): any
    {
        if (Utils.logChannel('contentStart', true)) { log.info('BackgroundApp.handle_getConfigTree', name, this.isReady); }
        switch (as.String(name, Config.onlineConfigName)) {
            case Config.devConfigName: return Config.getDevTree();
            case Config.onlineConfigName: return Config.getOnlineTree();
            case Config.staticConfigName: return Config.getStaticTree();
        }
        return Config.getOnlineTree();
    }

    handle_getSessionConfig(key: string): any
    {
        let response = {};
        try {
            let value = Config.get(key, undefined);
            if (value != undefined) {
                response[key] = value;
            }
        } catch (error) {
            log.debug('BackgroundApp.handle_getSessionConfig', error);
        }

        log.debug('BackgroundApp.handle_getSessionConfig', key, 'response', response);
        return response;
    }

    handle_setSessionConfig(key: string, value: string): any
    {
        log.debug('BackgroundApp.handle_setSessionConfig', key, value);
        try {
            Memory.setSession(key, value);
        } catch (error) {
            log.debug('BackgroundApp.handle_setSessionConfig', error);
        }
    }

    handle_getBackpackState(sendResponse: (response?: any) => void): boolean
    {
        if (this.backpack) {
            let items = this.backpack.getItems();
            sendResponse(new GetBackpackStateResponse(items));
        } else {
            sendResponse(new BackgroundItemExceptionResponse(new ItemException(ItemException.Fact.NoItemsReceived, ItemException.Reason.ItemsNotAvailable)));
        }
        return false;
    }

    handle_backpackIsItemStillInRepo(itemId: string, sendResponse: (response?: any) => void): boolean
    {
        if (!this.backpack) {
            const error = new ItemException(ItemException.Fact.NotExecuted, ItemException.Reason.ItemsNotAvailable);
            sendResponse(new BackgroundItemExceptionResponse(error));
            return false;
        }
        this.backpack.isItemStillInRepo(itemId)
            .then(result => sendResponse(new BackpackIsItemStillInRepoResponse(result)))
            .catch(ex => sendResponse(new BackgroundItemExceptionResponse(ex)));
        return true;
    }

    handle_addBackpackItem(itemId: string, properties: ItemProperties, options: ItemChangeOptions, sendResponse: (response?: any) => void): boolean
    {
        if (this.backpack) {
            this.backpack.addItem(itemId, properties, options)
                .then(() => { sendResponse(new BackgroundSuccessResponse()); })
                .catch(ex => { sendResponse(new BackgroundItemExceptionResponse(ex)); });
            return true;
        } else {
            sendResponse(new BackgroundItemExceptionResponse(new ItemException(ItemException.Fact.NotAdded, ItemException.Reason.ItemsNotAvailable)));
        }
        return false;
    }

    handle_modifyBackpackItemProperties(itemId: string, changed: ItemProperties, deleted: Array<string>, options: ItemChangeOptions, sendResponse: (response?: any) => void): boolean
    {
        if (this.backpack) {
            this.backpack.modifyItemProperties(itemId, changed, deleted, options)
                .then(() => { sendResponse(new BackgroundSuccessResponse()); })
                .catch(ex => { sendResponse(new BackgroundItemExceptionResponse(ex)); });
            return true;
        } else {
            sendResponse(new BackgroundItemExceptionResponse(new ItemException(ItemException.Fact.NotChanged, ItemException.Reason.ItemsNotAvailable)));
        }
        return false;
    }

    loadWeb3BackpackItems(sendResponse: (response?: any) => void): boolean
    {
        if (this.backpack) {
            this.backpack.loadWeb3Items()
                .then(() => { sendResponse(new BackgroundSuccessResponse()); })
                .catch(ex => { sendResponse(new BackgroundItemExceptionResponse(ex)); });
            return true;
        } else {
            sendResponse(new BackgroundItemExceptionResponse(new ItemException(ItemException.Fact.NotChanged, ItemException.Reason.ItemsNotAvailable)));
        }
        return false;
    }

    handle_rezBackpackItem(itemId: string, room: string, x: number, destination: string, options: ItemChangeOptions, sendResponse: (response?: any) => void): boolean
    {
        if (this.backpack) {
            this.backpack.rezItem(itemId, room, x, destination, options)
                .then(() => { sendResponse(new BackgroundSuccessResponse()); })
                .catch(ex => { sendResponse(new BackgroundItemExceptionResponse(ex)); });
            return true;
        } else {
            sendResponse(new BackgroundItemExceptionResponse(new ItemException(ItemException.Fact.NotRezzed, ItemException.Reason.ItemsNotAvailable)));
        }
        return false;
    }

    handle_derezBackpackItem(itemId: string, roomJid: string, x: number, y: number, changed: ItemProperties, deleted: Array<string>, options: ItemChangeOptions, sendResponse: (response?: any) => void): boolean
    {
        if (this.backpack) {
            this.backpack.derezItem(itemId, roomJid, x, y, changed, deleted, options)
                .then(() => { sendResponse(new BackgroundSuccessResponse()); })
                .catch(ex => { sendResponse(new BackgroundItemExceptionResponse(ex)); });
            return true;
        } else {
            sendResponse(new BackgroundItemExceptionResponse(new ItemException(ItemException.Fact.NotRezzed, ItemException.Reason.ItemsNotAvailable)));
        }
        return false;
    }

    handle_deleteBackpackItem(itemId: string, options: ItemChangeOptions, sendResponse: (response?: any) => void): boolean
    {
        if (this.backpack) {
            this.backpack.deleteItem(itemId, options)
                .then(() => { sendResponse(new BackgroundSuccessResponse()); })
                .catch(ex => { sendResponse(new BackgroundItemExceptionResponse(ex)); });
            return true;
        } else {
            sendResponse(new BackgroundItemExceptionResponse(new ItemException(ItemException.Fact.NotDeleted, ItemException.Reason.ItemsNotAvailable)));
        }
        return false;
    }

    handle_isBackpackItem(itemId: string, sendResponse: (response?: any) => void): boolean
    {
        if (this.backpack) {
            let isItem = this.backpack.isItem(itemId);
            sendResponse(new IsBackpackItemResponse(isItem));
        } else {
            sendResponse(new IsBackpackItemResponse(false));
        }
        return false;
    }

    handle_getBackpackItemProperties(itemId: string, sendResponse: (response?: any) => void): boolean
    {
        if (this.backpack) {
            try {
                let props = this.backpack.getRepositoryItemProperties(itemId);
                sendResponse(new GetBackpackItemPropertiesResponse(props));
            } catch (iex) {
                sendResponse(new BackgroundItemExceptionResponse(iex));
            }
        } else {
            sendResponse(new BackgroundItemExceptionResponse(new ItemException(ItemException.Fact.UnknownError, ItemException.Reason.ItemsNotAvailable)));
        }
        return false;
    }

    handle_findBackpackItemProperties(filterProperties: ItemProperties, sendResponse: (response?: any) => void): boolean
    {
        if (this.backpack) {
            let items = this.backpack.findItems(props =>
            {
                let match = true;
                for (let pid in filterProperties) {
                    if (props[pid] != filterProperties[pid]) { match = false; }
                }
                return match;
            });
            let propertiesSet = {};
            for (let i = 0; i < items.length; i++) {
                let item = items[i];
                let itemId = item.getProperties()[Pid.Id];
                propertiesSet[itemId] = item.getProperties();
            }
            sendResponse(new FindBackpackItemPropertiesResponse(propertiesSet));
        } else {
            sendResponse(new BackgroundItemExceptionResponse(new ItemException(ItemException.Fact.UnknownError, ItemException.Reason.ItemsNotAvailable)));
        }
        return false;
    }

    handle_executeBackpackItemAction(itemId: string, action: string, args: any, involvedIds: Array<string>, sendResponse: (response?: any) => void): boolean
    {
        if (this.backpack) {
            this.backpack.executeItemAction(itemId, action, args, involvedIds, false)
                .then(result => { sendResponse(new ExecuteBackpackItemActionResponse(result)); })
                .catch(ex => { sendResponse(new BackgroundItemExceptionResponse(ex)); });
            return true;
        } else {
            sendResponse(new BackgroundItemExceptionResponse(new ItemException(ItemException.Fact.NotChanged, ItemException.Reason.ItemsNotAvailable)));
        }
        return false;
    }

    handle_getItemsByInventoryItemIds(itemsToGet: ItemProperties[], sendResponse: (response?: any) => void): boolean
    {
        if (this.backpack) {
            this.backpack.getItemsByInventoryItemIds(itemsToGet)
            .then(items => sendResponse({ok: true, items}))
            .catch(error => {
                sendResponse({ok: false, 'ex': Utils.prepareValForMessage({error, itemsToGet})});
            });
        } else {
            const error = new Error('Items subsystem diabled!');
            sendResponse({ok: false, 'ex': Utils.prepareValForMessage({error, itemsToGet})});
        }
        return true;
    }

    private lastPointsSubmissionTime: number = 0;
    private pointsActivities: Array<PointsActivity> = [];
    handle_pointsActivity(channel: string, n: number, sendResponse: (response?: any) => void): boolean
    {
        if (this.backpack) {
            if (Config.get('points.enabled', false)) {

                if (this.isPointsActivityIgnoredBecauseNeedsPause(channel)) {
                    sendResponse(new BackgroundErrorResponse('error', 'Points activity ' + channel + ' needs pause'));
                    return;
                }

                this.pointsActivities.push({ channel: channel, n: n });

                let now = Date.now();
                let submissionIntervalSec = Config.get('points.submissionIntervalSec', 300);
                if (now - this.lastPointsSubmissionTime > submissionIntervalSec * 1000) {
                    this.lastPointsSubmissionTime = now;
                    this.submitPoints()
                        .then(() => { sendResponse(new BackgroundSuccessResponse()); })
                        .catch(ex => { sendResponse(new BackgroundItemExceptionResponse(ex)); });
                    return true;
                }
            }
        }
        sendResponse(new BackgroundSuccessResponse());
        return false;
    }

    private pointsActivitiesTimes: Map<string, number> = new Map<string, number>();
    isPointsActivityIgnoredBecauseNeedsPause(channel: string): boolean
    {
        let ignore = false;

        let lastTimeThisChannel = 0;
        if (this.pointsActivitiesTimes.has(channel)) {
            lastTimeThisChannel = this.pointsActivitiesTimes.get(channel);
            const delayNeededSec = as.Float(Config.get('points.delays', 5.0), 5.0);
            const sinceLastTimeSec = (Date.now() - lastTimeThisChannel) / 1000;
            ignore = sinceLastTimeSec < delayNeededSec;
        }
        if (!ignore) {
            this.pointsActivitiesTimes.set(channel, Date.now());
        }

        return ignore;
    }

    handle_applyItemToBackpackItem(activeId: string, passiveId: string, sendResponse: (response?: any) => void): boolean
    {
        if (this.backpack) {
            this.backpack.applyItemToItem(activeId, passiveId)
                .then(result => { sendResponse(new ApplyItemToBackpackItemResponse(result)); })
                .catch(ex => { sendResponse(new BackgroundItemExceptionResponse(ex)); });
            return true;
        } else {
            sendResponse(new BackgroundItemExceptionResponse(new ItemException(ItemException.Fact.NotChanged, ItemException.Reason.ItemsNotAvailable)));
        }
        return false;
    }

    handle_backpackTransferAuthorize(itemId: string, duration: number, sendResponse: (response?: any) => void): boolean
    {
        if (!this.backpack) {
            const error = new ItemException(ItemException.Fact.NotExecuted, ItemException.Reason.ItemsNotAvailable);
            sendResponse(new BackgroundItemExceptionResponse(error));
            return false;
        }
        this.backpack.transferAuthorize(itemId, duration)
            .then(transferToken => sendResponse(new BackpackTransferAuthorizeResponse(transferToken)))
            .catch(ex => sendResponse(new BackgroundItemExceptionResponse(ex)));
        return true;
    }

    handle_backpackTransferUnauthorize(itemId: string, sendResponse: (response?: any) => void): boolean
    {
        if (!this.backpack) {
            const error = new ItemException(ItemException.Fact.NotExecuted, ItemException.Reason.ItemsNotAvailable);
            sendResponse(new BackgroundItemExceptionResponse(error));
            return false;
        }
        this.backpack.transferUnauthorize(itemId)
            .then(() => sendResponse(new BackpackTransferUnauthorizeResponse()))
            .catch(ex => sendResponse(new BackgroundItemExceptionResponse(ex)));
        return true;
    }

    handle_backpackTransferComplete(
        provider: string, senderInventoryId: string, senderItemId: string, transferToken: string,
        sendResponse: (response?: any) => void,
    ): boolean
    {
        if (!this.backpack) {
            const error = new ItemException(ItemException.Fact.NotExecuted, ItemException.Reason.ItemsNotAvailable);
            sendResponse(new BackgroundItemExceptionResponse(error));
            return false;
        }
        this.backpack.transferComplete(provider, senderInventoryId, senderItemId, transferToken)
            .then(itemId =>
            {
                const itemProps = this.backpack.getItem(itemId).getProperties();
                sendResponse(new BackpackTransferCompleteResponse(itemProps));
            }).catch(ex => sendResponse(new BackgroundItemExceptionResponse(ex)));
        return true;
    }

    handle_createBackpackItem(provider: string, auth: string, method: string, args: ItemProperties, sendResponse: (response?: any) => void): boolean
    {
        if (this.backpack) {
            this.backpack.createItem(provider, auth, method, args)
                .then(props => { sendResponse(new CreateBackpackItemResponse(props)); })
                .catch(ex => { sendResponse(new BackgroundItemExceptionResponse(ex)); });
            return true;
        } else {
            sendResponse(new BackgroundItemExceptionResponse(new ItemException(ItemException.Fact.NotChanged, ItemException.Reason.ItemsNotAvailable)));
        }
        return false;
    }

    handle_newChatMessage(
        chat: unknown, chatMessage: unknown, deduplicate: unknown, sendResponse: (response: any) => void,
    ): boolean {
        if (!isChat(chat)) {
            const error = new Error('chat is not a Chat object!');
            sendResponse({'ok': false,
                'ex': Utils.prepareValForMessage({error, chat, chatMessage, deduplicate})});
        } else if (!isChatMessage(chatMessage)) {
            const error = new Error('chatMessage is not a ChatMesage object!');
            sendResponse({'ok': false,
                'ex': Utils.prepareValForMessage({error, chat, chatMessage, deduplicate})});
        } else if (!is.boolean(deduplicate)) {
            const error = new Error('deduplicate is not a boolean!');
            sendResponse({'ok': false,
                'ex': Utils.prepareValForMessage({error, chat, chatMessage, deduplicate})});
        } else {
            (async () => {
                const deletionsByRoomJid = await this.chatHistoryStorage.maintain(new Date());
                this.sendChatHistoryDeletionsToTabs(deletionsByRoomJid);
                const keepChatMessage = await this.chatHistoryStorage.storeChatRecord(chat, chatMessage, deduplicate);
                sendResponse(new NewChatMessageResponse(keepChatMessage));
                if (keepChatMessage) {
                    this.sendPersistedChatMessageToTabs(chat, chatMessage);
                }
            })().catch(error => sendResponse({'ok': false, 'ex': Utils.prepareValForMessage(error)}));
            return true;
        }
        return false;
    }

    handle_getChatHistory(chat: unknown, sendResponse: (response: any) => void): boolean
    {
        if (!isChat(chat)) {
            const error = new Error('chat is not a Chat object!');
            sendResponse({'ok': false, 'ex': Utils.prepareValForMessage({error, chat})});
        } else {
            (async () => {
                const deletionsByRoomJid = await this.chatHistoryStorage.maintain(new Date());
                this.sendChatHistoryDeletionsToTabs(deletionsByRoomJid);
                const chatMessages = await this.chatHistoryStorage.getChatHistoryByChat(chat);
                sendResponse(new GetChatHistoryResponse(chatMessages));
            })().catch(error => sendResponse({'ok': false, 'ex': Utils.prepareValForMessage(error)}));
            return true;
        }
        return false;
    }

    handle_deleteChatHistory(chat: unknown, olderThanTime: unknown, sendResponse: (response: any) => void): boolean
    {
        if (!isChat(chat)) {
            const error = new Error('chat is not a Chat object!');
            sendResponse({'ok': false, 'ex': Utils.prepareValForMessage({error, chat, olderThanTime})});
        } else if (!is.string(olderThanTime)) {
            const error = new Error('olderThan is not a UTC datetime string!');
            sendResponse({'ok': false, 'ex': Utils.prepareValForMessage({error, chat, olderThanTime})});
        } else {
            (async () => {
                const deletionsByRoomJid = await this.chatHistoryStorage.maintain(new Date());
                await this.chatHistoryStorage.deleteOldChatHistoryByChatOlderThanTime(chat, olderThanTime);
                const jidEntries = deletionsByRoomJid.get(chat.roomJid) ?? [];
                jidEntries.push({chat, olderThanTime});
                deletionsByRoomJid.set(chat.roomJid, jidEntries);
                this.sendChatHistoryDeletionsToTabs(deletionsByRoomJid);
                sendResponse(new BackgroundSuccessResponse());
            })().catch(error => sendResponse({'ok': false, 'ex': Utils.prepareValForMessage(error)}));
            return true;
        }
        return false;
    }

    sendPersistedChatMessageToTabs(chat: Chat, chatMessage: ChatMessage): void
    {
        const tabIds = this.getRoomJid2TabIds(chat.roomJid) ?? [];
        for (const tabId of tabIds) {
            this.sendToTab(tabId, ContentMessage.type_chatMessagePersisted, {chat, chatMessage});
        }
    }

    sendChatHistoryDeletionsToTabs(deletionsByRoomJid: Map<string,{chat: Chat, olderThanTime: string}[]>): void
    {
        for (const [roomJid, deletions] of deletionsByRoomJid) {
            const tabIds = this.getRoomJid2TabIds(roomJid) ?? [];
            for (const tabId of tabIds) {
                this.sendToTab(tabId, ContentMessage.type_chatHistoryDeleted, {deletions});
            }
        }
    }

    addRoomJid2TabId(room: string, tabId: number): void
    {
        let tabIds = this.getRoomJid2TabIds(room);
        if (!tabIds) {
            tabIds = new Array<number>();
            this.roomJid2tabId[room] = tabIds;
        }
        if (!tabIds.includes(tabId)) {
            tabIds.push(tabId);
        }
    }

    removeRoomJid2TabId(room: string, tabId: number): void
    {
        let tabIds = this.getRoomJid2TabIds(room);
        if (tabIds) {
            const index = tabIds.indexOf(tabId, 0);
            if (index > -1) {
                tabIds.splice(index, 1);
                if (tabIds.length == 0) {
                    delete this.roomJid2tabId[room];
                }
            }
        }
    }

    getRoomJid2TabIds(room: string): Array<number>
    {
        return this.roomJid2tabId[room];
    }

    hasRoomJid2TabId(room: string, tabId: number): boolean
    {
        var tabIds = this.getRoomJid2TabIds(room);
        if (tabIds) {
            return tabIds.includes(tabId);
        }
        return false;
    }

    // hasRoomJid2(room: string): boolean
    // {
    //     var tabIds = this.getRoomJid2TabIds(room);
    //     if (tabIds) {
    //         return true;
    //     }
    //     return false;
    // }

    getAllTabIds(): Array<number>
    {
        let tabIds = [];
        for (let room in this.roomJid2tabId) {
            let roomTabIds = this.roomJid2tabId[room];
            for (let i = 0; i < roomTabIds.length; i++) {
                let tabId = roomTabIds[i];
                if (!tabIds.includes(tabId)) {
                    tabIds.push(tabId);
                }
            }
        }
        return tabIds;
    }

    // keep room state

    private readonly fullJid2PresenceList = new Map<string, Map<string, xml>>();

    presenceStateAddPresence(roomJid: string, participantNick: string, stanza: xml): void
    {
        let roomPresences = this.fullJid2PresenceList.get(roomJid);
        if (roomPresences) { } else {
            roomPresences = new Map<string, xml>();
            this.fullJid2PresenceList.set(roomJid, roomPresences);
        }
        roomPresences.set(participantNick, stanza);
    }

    presenceStateRemovePresence(roomJid: string, participantNick: string): void
    {
        let roomPresences = this.fullJid2PresenceList.get(roomJid);
        if (roomPresences) {
            if (roomPresences.has(participantNick)) {
                roomPresences.delete(participantNick);
            }

            if (roomPresences.size == 0) {
                this.fullJid2PresenceList.delete(roomJid);
            }
        }
    }

    presenceStateGetPresence(roomJid: string, participantNick: string): xml
    {
        let roomPresences = this.fullJid2PresenceList.get(roomJid);
        if (roomPresences) {
            if (roomPresences.has(participantNick)) {
                return roomPresences.get(participantNick);
            }
        }
        return null;
    }

    presenceStateRemoveRoom(roomJid: string): void
    {
        if (this.fullJid2PresenceList.has(roomJid)) {
            this.fullJid2PresenceList.delete(roomJid);
        }
    }

    getPresenceStateOfRoom(roomJid: string): Map<string, xml>
    {
        let roomPresences = this.fullJid2PresenceList.get(roomJid);
        if (roomPresences) {
            return roomPresences;
        }
        return new Map<string, xml>();
    }

    // send/recv stanza

    handle_sendStanza(stanza: any, tabId: number): BackgroundResponse
    {
        // log.debug('BackgroundApp.handle_sendStanza', stanza, tabId);

        try {
            let xmlStanza: xml = Utils.jsObject2xmlObject(stanza);
            let send = true;

            if (this.backpack) {
                xmlStanza = this.backpack.stanzaOutFilter(xmlStanza);
                if (xmlStanza == null) { return; }
            }

            if (xmlStanza.name == 'presence') {
                let to = xmlStanza.attrs.to;
                let toJid = jid(to);
                let room = toJid.bare().toString();
                let nick = toJid.getResource();

                if (as.String(xmlStanza.attrs['type'], 'available') == 'available') {
                    if (this.isDeferredUnavailable(to)) {
                        this.cancelDeferredUnavailable(to);
                        send = false;
                    }
                    this.replayPresenceToTab(room, tabId);
                    if (!this.hasRoomJid2TabId(room, tabId)) {
                        this.addRoomJid2TabId(room, tabId);
                        if (Utils.logChannel('room2tab', true)) { log.info('BackgroundApp.handle_sendStanza', 'adding room2tab mapping', room, '=>', tabId, 'now:', this.roomJid2tabId); }
                    }
                    if (send) {
                        send = this.deferPresenceToPreferShowAvailableOverAwayBecauseQuickSuccessionIsProbablyTabSwitch(to, xmlStanza);
                    }
                } else { // unavailable
                    let tabIds = this.getRoomJid2TabIds(room);
                    if (tabIds) {
                        let simulateLeave = false;
                        if (tabIds.includes(tabId)) {
                            if (tabIds.length > 1) {
                                simulateLeave = true;
                            }
                            this.removeRoomJid2TabId(room, tabId);
                            if (simulateLeave) {
                                send = false;
                                this.simulateUnavailableToTab(to, tabId);
                            }
                        }
                    }
                    if (send) {
                        if (Config.get('xmpp.deferUnavailableSec', 0) > 0) {
                            this.deferUnavailable(to);
                            send = false;
                        } else {
                            this.fullJid2TabWhichSentUnavailable[to] = tabId;
                        }
                    }
                    if (send) {
                        this.presenceStateRemoveRoom(room);
                    }
                }
            }

            if (xmlStanza.name == 'iq') {
                if (xmlStanza.attrs) {
                    let stanzaType = xmlStanza.attrs.type;
                    let stanzaId = xmlStanza.attrs.id;
                    if ((stanzaType == 'get' || stanzaType == 'set') && stanzaId) {
                        this.iqStanzaTabId[stanzaId] = tabId;
                    }
                }
            }

            if (send) {
                this.sendStanza(xmlStanza);
            }

        } catch (error) {
            log.debug('BackgroundApp.handle_sendStanza', error);
        }
    }

    presenceIndicatesAway(stanza: xml)
    {
        let showNode = stanza.getChild('show');
        if (showNode) {
            let show = showNode.getText();
            switch (show) {
                case 'away':
                case 'xa':
                case 'dnd':
                    return true;
                    break;
            }
        }
        return false;
    }

    replayPresenceToTab(roomJid: string, tabId: number)
    {
        let roomPresences = this.getPresenceStateOfRoom(roomJid);
        for (let [nick, stanza] of roomPresences) {
            window.setTimeout(() =>
            {
                ContentMessage.sendMessage(tabId, { 'type': ContentMessage.type_recvStanza, 'stanza': stanza });
            }, 1);
        }
    }

    //private deferredReplayPresenceToAvoidManyConsecutivePresencesTimer = new Map<string, number>();

    async replayPresence(roomJid: string, participantNick: string)
    {
        let stanza = this.presenceStateGetPresence(roomJid, participantNick);
        if (stanza !== null) {
            stanza.attrs._replay = true;
            await this.recvStanza(stanza);
        }

        // const timerKey = roomJid + '/' + participantNick;
        // if (!this.deferredReplayPresenceToAvoidManyConsecutivePresencesTimer.has(timerKey)) {

        //     const timer = window.setTimeout(async () =>
        //     {
        //         this.deferredReplayPresenceToAvoidManyConsecutivePresencesTimer.delete(timerKey);

        //         let stanza = this.presenceStateGetPresence(roomJid, participantNick);
        //         if (stanza !== null) {
        //             stanza.attrs._replay = true;
        //             await this.recvStanza(stanza);
        //         }
        //     }, Config.get('itemCache.deferReplayPresenceSec', 0.3) * 1000);

        //     this.deferredReplayPresenceToAvoidManyConsecutivePresencesTimer.set(timerKey, timer);
        // }
    }

    simulateUnavailableToTab(from: string, unavailableTabId: number)
    {
        let stanza = xml('presence', { type: 'unavailable', 'from': from, 'to': this.xmppJid });
        window.setTimeout(() =>
        {
            ContentMessage.sendMessage(unavailableTabId, { 'type': ContentMessage.type_recvStanza, 'stanza': stanza });
        }, 100);
    }

    deferUnavailable(to: string)
    {
        if (this.fullJid2TimerDeferredUnavailable[to]) {
            // wait for it
        } else {
            if (Utils.logChannel('backgroundPresenceManagement', true)) { log.info('BackgroundApp.deferUnavailable'); }
            this.fullJid2TimerDeferredUnavailable[to] = window.setTimeout(() =>
            {
                if (Utils.logChannel('backgroundPresenceManagement', true)) { log.info('BackgroundApp.deferUnavailable', 'execute deferred'); }
                delete this.fullJid2TimerDeferredUnavailable[to];
                let stanza = xml('presence', { type: 'unavailable', 'to': to });
                this.sendStanza(stanza);
                let roomJid = jid(to);
                let room = roomJid.bare().toString();
                this.presenceStateRemoveRoom(room);
            }, Config.get('xmpp.deferUnavailableSec', 2.0) * 1000);
        }
    }

    isDeferredUnavailable(to: string)
    {
        if (this.fullJid2TimerDeferredUnavailable[to]) {
            return true;
        }
        return false;
    }

    cancelDeferredUnavailable(to: string)
    {
        let timer = this.fullJid2TimerDeferredUnavailable[to];
        if (timer) {
            if (Utils.logChannel('backgroundPresenceManagement', true)) { log.info('BackgroundApp.cancelDeferredUnavailable'); }
            window.clearTimeout(timer);
            delete this.fullJid2TimerDeferredUnavailable[to];
        }
    }

    deferPresenceToPreferShowAvailableOverAwayBecauseQuickSuccessionIsProbablyTabSwitch(to: string, stanza: xml): boolean
    {
        let deferred = true;

        let deferRecord = this.fullJid2TimerDeferredAway[to];
        if (deferRecord) {
            // 
        } else {
            deferRecord = {};
            this.fullJid2TimerDeferredAway[to] = deferRecord;
        }

        if (this.presenceIndicatesAway(stanza)) {
            if (Utils.logChannel('backgroundPresenceManagement', true)) { log.info('BackgroundApp.deferAway', 'record', 'away'); }
            deferRecord.awayStanza = stanza;
        } else {
            if (Utils.logChannel('backgroundPresenceManagement', true)) { log.info('BackgroundApp.deferAway', 'record', 'available'); }
            deferRecord.availableStanza = stanza;
        }

        if (deferRecord.timer == null) {
            deferRecord.timer = window.setTimeout(() =>
            {
                let logWhich = 'none';
                let logTotal = 0;
                let stanza: xml = null;
                if (deferRecord.awayStanza) {
                    logTotal++;
                    logWhich = 'away';
                    stanza = deferRecord.awayStanza;
                }
                if (deferRecord.availableStanza) {
                    logTotal++;
                    logWhich = 'available';
                    stanza = deferRecord.availableStanza;
                }
                if (Utils.logChannel('backgroundPresenceManagement', true)) { log.info('BackgroundApp.deferAway', 'execute deferred', logWhich, 'of', logTotal); }
                delete this.fullJid2TimerDeferredAway[to];
                if (stanza) {
                    this.sendStanza(stanza);
                }
            }, Config.get('xmpp.deferAwaySec', 0.2) * 1000);
        }

        return !deferred;
    }

    public sendStanza(stanza: xml): void
    {
        this.stanzasOutCount++;
        if (!this.xmppConnected) {
            this.stanzaQ.push(stanza);
        } else {
            this.sendStanzaUnbuffered(stanza);
        }
    }

    private sendStanzaUnbuffered(stanza: xml): void
    {
        try {
            this.logStanzaButNotBasicConnectionPresence(stanza);

            this.xmpp.send(stanza);
        } catch (error) {
            log.debug('BackgroundApp.sendStanza', error.message ?? '');
        }
    }

    private logStanzaButNotBasicConnectionPresence(stanza: xml)
    {
        let isConnectionPresence = false;
        if (stanza.name == 'presence') {
            isConnectionPresence = (!stanza.attrs || !stanza.attrs.to || jid(stanza.attrs.to).getResource() == this.resource);
        }
        if (!isConnectionPresence) {
            if (Utils.logChannel('backgroundTraffic', true)) { log.info('BackgroundApp.sendStanza', stanza, as.String(stanza.attrs.type, stanza.name == 'presence' ? 'available' : 'normal'), 'to=', stanza.attrs.to); }

            // if (stanza.name == 'presence' && as.String(stanza.type, 'available') == 'available') {
            //     let vpNode = stanza.getChildren('x').find(stanzaChild => (stanzaChild.attrs == null) ? false : stanzaChild.attrs.xmlns === 'vp:props');
            //     if (vpNode) {
            //         let xmppNickname = jid(stanza.attrs.to).getResource();
            //         let vpNickname = as.String(vpNode.attrs.Nickname, '');
            //         log.debug('send ########', xmppNickname, vpNickname);
            //         if (xmppNickname != vpNickname) {
            //             log.debug('send ########', xmppNickname, '-x-', vpNickname);
            //         }
            //     }
            // }
        }
    }

    private sendPresence()
    {
        this.sendStanza(xml('presence'));
        // this.sendStanza(xml('presence').append(xml('x', { xmlns: 'http://jabber.org/protocol/muc' })));
    }

    private async recvStanza(xmlStanza: xml)
    {
        this.stanzasInCount++;

        let isConnectionPresence = false;
        {
            if (xmlStanza.name == 'presence') {
                isConnectionPresence = xmlStanza.attrs.from && (jid(xmlStanza.attrs.from).getResource() == this.resource);
            }
            if (!isConnectionPresence) {
                const isReplay = as.Bool(xmlStanza.attrs._replay, false);
                if (!isReplay) {
                    if (Utils.logChannel('backgroundTraffic', true)) { log.info('BackgroundApp.recvStanza', xmlStanza, as.String(xmlStanza.attrs.type, xmlStanza.name == 'presence' ? 'available' : 'normal'), 'to=', xmlStanza.attrs.to, 'from=', xmlStanza.attrs.from); }
                }

                // if (stanza.name == 'presence' && as.String(stanza.type, 'available') == 'available') {
                //     let vpNode = stanza.getChildren('x').find(stanzaChild => (stanzaChild.attrs == null) ? false : stanzaChild.attrs.xmlns === 'vp:props');
                //     if (vpNode) {
                //         let xmppNickname = jid(stanza.attrs.from).getResource();
                //         let vpNickname = as.String(vpNode.attrs.Nickname, '');
                //         log.debug('recv ########', xmppNickname, vpNickname);
                //         if (xmppNickname != vpNickname) {
                //             log.debug('recv ########', xmppNickname, '-x-', vpNickname);
                //         }
                //     }
                // }
            }
        }

        if (this.backpack) {
            xmlStanza = await this.backpack.stanzaInFilter(xmlStanza);
            if (xmlStanza == null) { return; }
        }

        if (xmlStanza.name == 'iq') {
            if (xmlStanza.attrs) {
                let stanzaType = xmlStanza.attrs.type;
                let stanzaId = xmlStanza.attrs.id;
                if (stanzaType == 'result' && stanzaId) {
                    let tabId = this.iqStanzaTabId[stanzaId];
                    if (tabId) {
                        delete this.iqStanzaTabId[stanzaId];
                        ContentMessage.sendMessage(tabId, { 'type': ContentMessage.type_recvStanza, 'stanza': xmlStanza });
                    }
                }

                if (stanzaType == 'get' && stanzaId) {
                    await this.onIqGet(xmlStanza);
                }
            }
        }

        if (xmlStanza.name == 'message') {
            let from = jid(xmlStanza.attrs.from);
            let room = from.bare().toString();

            let tabIds = this.getRoomJid2TabIds(room);
            if (tabIds) {
                for (let i = 0; i < tabIds.length; i++) {
                    let tabId = tabIds[i];
                    ContentMessage.sendMessage(tabId, { 'type': ContentMessage.type_recvStanza, 'stanza': xmlStanza });
                }
            }
        }

        if (xmlStanza.name == 'presence') {
            let from = jid(xmlStanza.attrs.from);
            let room = from.bare().toString();
            let nick = from.getResource();

            if (nick != '') {
                if (as.String(xmlStanza.attrs['type'], 'available') == 'available') {
                    if (!isConnectionPresence) {
                        this.presenceStateAddPresence(room, nick, xmlStanza);
                    }
                } else {
                    this.presenceStateRemovePresence(room, nick);
                }

                let unavailableTabId: number = -1;
                if (xmlStanza.attrs && xmlStanza.attrs['type'] == 'unavailable') {
                    unavailableTabId = this.fullJid2TabWhichSentUnavailable[from];
                    if (unavailableTabId) {
                        delete this.fullJid2TabWhichSentUnavailable[from];
                    }
                }

                if (unavailableTabId >= 0) {
                    ContentMessage.sendMessage(unavailableTabId, { 'type': ContentMessage.type_recvStanza, 'stanza': xmlStanza });
                    this.removeRoomJid2TabId(room, unavailableTabId);
                    if (Utils.logChannel('room2tab', true)) { log.info('BackgroundApp.recvStanza', 'removing room2tab mapping', room, '=>', unavailableTabId, 'now:', this.roomJid2tabId); }
                } else {
                    let tabIds = this.getRoomJid2TabIds(room);
                    if (tabIds) {
                        for (let i = 0; i < tabIds.length; i++) {
                            let tabId = tabIds[i];
                            ContentMessage.sendMessage(tabId, { 'type': ContentMessage.type_recvStanza, 'stanza': xmlStanza });
                        }
                    }
                }
            } // nick
        }
    }

    async onIqGet(stanza: any): Promise<void>
    {
        let versionQuery = stanza.getChildren('query').find(stanzaChild => (stanzaChild.attrs == null) ? false : stanzaChild.attrs.xmlns === 'jabber:iq:version');
        if (versionQuery) {
            await this.onIqGetVersion(stanza);
        }
    }

    async onIqGetVersion(stanza: any): Promise<void>
    {
        if (stanza.attrs) {
            let id = stanza.attrs.id;
            if (id) {
                let versionQuery = stanza.getChildren('query').find(stanzaChild => (stanzaChild.attrs == null) ? false : stanzaChild.attrs.xmlns === 'jabber:iq:version');
                if (versionQuery) {
                    let queryResponse = xml('query', { xmlns: 'jabber:iq:version', });

                    queryResponse.append(xml('name', {}, Config.get('client.name', '_noname')))
                    queryResponse.append(xml('version', {}, Client.getVersion()))

                    let verbose = false;
                    let auth = as.String(versionQuery.attrs.auth, '');
                    if (auth != '' && auth == Config.get('xmpp.verboseVersionQueryWeakAuth', '')) {
                        verbose = true;
                    }
                    if (verbose) {
                        if (!Config.get('xmpp.sendVerboseVersionQueryResponse', false)) {
                            verbose = false;
                        }
                    }
                    if (verbose) {
                        let now = Date.now();
                        let firstStart = await Memory.getLocal('client.firstStart', 0);
                        let startCount = await Memory.getLocal('client.startCount', 0);
                        let userId = await Memory.getLocal(Utils.localStorageKey_Id(), '');
                        let itemCount = this.backpack != null ? this.backpack.getItemCount() : -1;
                        let rezzedItemCount = this.backpack != null ? this.backpack.getRezzedItemCount() : -1;
                        let points = -1
                        let pointsItems = this.backpack?.findItems(props => as.Bool(props[Pid.PointsAspect], false));
                        if (pointsItems.length > 0) { points = as.Int(pointsItems[0].getProperties()[Pid.PointsTotal], -1); }

                        queryResponse.append(xml('Variant', {}, Client.getVariant()))
                        queryResponse.append(xml('Language', {}, navigator.language))
                        queryResponse.append(xml('IsDevelopment', {}, as.String(Environment.isDevelopment())));
                        queryResponse.append(xml('Id', {}, userId));
                        queryResponse.append(xml('SecSinceFirstStart', {}, Math.round((now - firstStart) / 1000)));
                        queryResponse.append(xml('SecSinceStart', {}, Math.round((now - this.startupTime) / 1000)));
                        queryResponse.append(xml('SecSincePage', {}, Math.round((now - this.waitReadyTime) / 1000)));
                        queryResponse.append(xml('Startups', {}, startCount));
                        queryResponse.append(xml('ContentStartups', {}, this.waitReadyCount));
                        queryResponse.append(xml('XmppConnects', {}, this.xmppConnectCount));
                        queryResponse.append(xml('StanzasOut', {}, this.stanzasOutCount));
                        queryResponse.append(xml('StanzasIn', {}, this.stanzasInCount));
                        queryResponse.append(xml('ItemCount', {}, itemCount));
                        queryResponse.append(xml('RezzedItemCount', {}, rezzedItemCount));
                        queryResponse.append(xml('Points', {}, points));
                        queryResponse.append(xml('OldPoints', {}, JSON.stringify(await this.getOldPoints())));
                    }

                    if (Config.get('xmpp.versionQueryShareOs', false)) {
                        queryResponse.append(xml('os', {}, navigator.userAgent));
                    }

                    let response = xml('iq', { type: 'result', 'id': id, 'to': stanza.attrs.from }).append(queryResponse);
                    this.sendStanza(response);
                }

            }
        }
    }

    // xmpp

    private async getOldPoints(): Promise<any>
    {
        const itemIds = await Memory.getLocal(LocalStorageItemProvider.BackpackIdsKey, []);
        if (itemIds != null && Array.isArray(itemIds)) {
            for (let i = 0; i < itemIds.length; i++) {
                const itemId = itemIds[i];
                const props = await Memory.getLocal(LocalStorageItemProvider.BackpackPropsPrefix + itemId, null);
                if (props != null || typeof props == 'object') {
                    if (as.Bool(props[Pid.PointsAspect], false)) {
                        return { PointsTotal: as.Int(props[Pid.PointsTotal], -1), PointsCurrent: as.Int(props[Pid.PointsCurrent], -1) };
                    }
                }
            }
        }
        return {};
    }

    // xmpp

    private async startXmpp()
    {
        this.resource = Utils.randomString(15);

        let xmppUser = await Memory.getSync('xmpp.user', undefined);
        if (xmppUser == undefined) { xmppUser = Config.get('xmpp.user', ''); }

        let xmppPass = await Memory.getSync('xmpp.pass', undefined);
        if (xmppPass == undefined) { xmppPass = Config.get('xmpp.pass', ''); }

        try {
            var conf = {
                service: Config.get('xmpp.service', 'wss://xmpp.vulcan.weblin.com/xmpp-websocket'),
                domain: Config.get('xmpp.domain', 'xmpp.vulcan.weblin.com'),
                resource: this.resource,
                username: xmppUser,
                password: xmppPass,
            };
            if (conf.username == '' || conf.password == '') {
                throw 'Missing xmpp.user or xmpp.pass';
            }
            this.xmpp = client(conf);

            this.xmpp.on('error', (err: any) =>
            {
                log.info('BackgroundApp xmpp.on.error', err);
            });

            this.xmpp.on('offline', () =>
            {
                log.info('BackgroundApp xmpp.on.offline');
                this.xmppConnected = false;
            });

            this.xmpp.on('online', (address: any) =>
            {
                if (Utils.logChannel('startup', true)) { log.info('BackgroundApp xmpp.on.online', address); }

                this.xmppJid = address;

                this.sendPresence();

                this.xmppConnectCount++;
                this.xmppConnected = true;

                while (this.stanzaQ.length > 0) {
                    let stanza = this.stanzaQ.shift();
                    this.sendStanzaUnbuffered(stanza);
                }
            });

            this.xmpp.on('stanza', (stanza: xml) => this.recvStanza(stanza));

            this.xmpp.start().catch(log.info);
        } catch (error) {
            log.info(error);
        }
    }

    private stopXmpp()
    {
        //hw todo
    }

    // Message to all tabs

    sendToAllTabs(type: string, data: any)
    {
        try {
            let tabIds = this.getAllTabIds();
            if (tabIds) {
                for (let i = 0; i < tabIds.length; i++) {
                    let tabId = tabIds[i];
                    ContentMessage.sendMessage(tabId, { 'type': type, 'data': data });
                }
            }
        } catch (error) {
            //
        }
    }

    sendToAllTabsExcept(exceptTabId: number, type: string, data: any)
    {
        try {
            let tabIds = this.getAllTabIds();
            if (tabIds) {
                for (let i = 0; i < tabIds.length; i++) {
                    let tabId = tabIds[i];
                    if (tabId != exceptTabId) {
                        ContentMessage.sendMessage(tabId, { 'type': type, 'data': data });
                    }
                }
            }
        } catch (error) {
            //
        }
    }

    sendToTab(tabId: number, type: string, data: any)
    {
        try {
            ContentMessage.sendMessage(tabId, { 'type': type, 'data': data });
        } catch (error) {
            //
        }
    }

    sendToTabsForRoom(room: string, message: any)
    {
        try {
            let tabIds = this.getRoomJid2TabIds(room);
            if (tabIds) {
                for (let i = 0; i < tabIds.length; i++) {
                    let tabId = tabIds[i];
                    ContentMessage.sendMessage(tabId, message);
                }
            }
        } catch (error) {
            //
        }
    }

    // Keep connection alive

    private presencePingTime: number = 0;
    handle_pingBackground(sender: any): BackgroundResponse
    {
        let now = Date.now();
        if (Utils.logChannel('pingBackground', true)) { log.info('BackgroundApp.handle_pingBackground', { tabid: sender?.tab?.id, now: now / 1000, lastPingTime: this.presencePingTime / 1000 }); }
        try {
            if (now - this.presencePingTime > 30000) {
                this.presencePingTime = now;
                this.sendPresence();
            }
            return new BackgroundSuccessResponse();
        } catch (error) {
            return new BackgroundErrorResponse('error', error);
        }
    }

    // 

    handle_wakeup(): boolean
    {
        return true;
    }

    handle_log(pieces: any): BackgroundResponse
    {
        log.debug(...pieces);
        return new BackgroundSuccessResponse();
    }

    handle_userSettingsChanged(): BackgroundResponse
    {
        log.debug('BackgroundApp.handle_userSettingsChanged');
        this.chatHistoryStorage?.onUserConfigUpdate();
        this.sendToAllTabs(ContentMessage.type_userSettingsChanged, {});
        return new BackgroundSuccessResponse();
    }

    handle_clientNotification(tabId: number, target: string, data: any): BackgroundResponse
    {
        if (target == 'currentTab') {
            this.sendToTab(tabId, ContentMessage.type_clientNotification, data);
        } else if (target == 'notCurrentTab') {
            this.sendToAllTabsExcept(tabId, ContentMessage.type_clientNotification, data);
            // } else if (target == 'activeTab') {
        } else {
            this.sendToAllTabs(ContentMessage.type_clientNotification, data);
        }
        return new BackgroundSuccessResponse();
    }

    async submitPoints()
    {
        let consolidated: { [channel: string]: number } = {};

        for (let i = 0; i < this.pointsActivities.length; i++) {
            let activity = this.pointsActivities[i];
            if (consolidated[activity.channel]) {
                consolidated[activity.channel] = consolidated[activity.channel] + activity.n;
            } else {
                consolidated[activity.channel] = activity.n;
            }
        }

        let args: { [pid: string]: string } = {};
        for (let key in consolidated) {
            args[key] = as.String(consolidated[key], '');
        }

        this.pointsActivities = [];

        if (this.backpack) {
            if (Config.get('points.enabled', false)) {
                let points = await this.backpack.getOrCreatePointsItem();
                if (points) {
                    let itemId = as.String(points.getProperties()[Pid.Id], '');
                    if (itemId != '') {
                        try {
                            const result = await this.backpack.executeItemAction(itemId, 'Points.ChannelValues', args, [itemId], true);
                            const autoClaimed = as.Bool(result[Pid.AutoClaimed], false);
                            if (autoClaimed) {
                                this.showToastInAllTabs(
                                    'You Got Activity Points',
                                    'Your activity points have been claimed automatically',
                                    'PointsAutoClaimed',
                                    'notice',
                                    [{ text: 'Open backpack', 'href': 'client:toggleBackpack' }],
                                );
                            }
                        } catch (error) {
                            log.info('BackgroundApp.submitPoints', error);
                        }
                    }
                }
            }
        }
    }

    showToastInAllTabs(title: string, text: string, type: string, iconType: string, links: any): void
    {
        let data = new WeblinClientApi.ClientNotificationRequest(WeblinClientApi.ClientNotificationRequest.type, '');
        data.title = title;
        data.text = text;
        data.type = type;
        data.iconType = iconType;
        data.links = links;
        this.sendToAllTabs(ContentMessage.type_clientNotification, data);
    }

    handle_test(): any
    {
    }
}
