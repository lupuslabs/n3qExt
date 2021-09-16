import log = require('loglevel');
import { client, xml, jid } from '@xmpp/client';
import { as } from '../lib/as';
import { Utils } from '../lib/Utils';
import { Config } from '../lib/Config';
import { BackgroundErrorResponse, BackgroundItemExceptionResponse, BackgroundMessage, BackgroundResponse, BackgroundSuccessResponse, CreateBackpackItemFromTemplateResponse, FindBackpackItemPropertiesResponse, GetBackpackItemPropertiesResponse, GetBackpackStateResponse, IsBackpackItemResponse } from '../lib/BackgroundMessage';
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
    private readonly httpCacheData: Map<string, string> = new Map<string, string>();
    private readonly httpCacheTime: Map<string, number> = new Map<string, number>();

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

        let language: string = Translator.mapLanguage(navigator.language, lang => { return Config.get('i18n.languageMapping', {})[lang]; }, Config.get('i18n.defaultLanguage', 'en-US'));
        this.babelfish = new Translator(Config.get('i18n.translations', {})[language], language, Config.get('i18n.serviceUrl', ''));

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

    async assertThatThereIsAUserId()
    {
        let uniqueId = await Memory.getLocal(Utils.localStorageKey_Id(), '');
        if (uniqueId == '') {
            uniqueId = 'mid' + Utils.randomString(30).toLowerCase();
            await Memory.setLocal(Utils.localStorageKey_Id(), uniqueId);
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

            case BackgroundMessage.fetchUrl.name: {
                return this.handle_fetchUrl(message.url, message.version, sendResponse);
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
                sendResponse(this.handle_pingBackground());
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

            case BackgroundMessage.addBackpackItem.name: {
                return this.handle_addBackpackItem(message.itemId, message.properties, message.options, sendResponse);
            } break;

            case BackgroundMessage.setBackpackItemProperties.name: {
                return this.handle_setBackpackItemProperties(message.itemId, message.properties, message.options, sendResponse);
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

            case BackgroundMessage.pointsActivity.name: {
                return this.handle_pointsActivity(message.channel, message.n, sendResponse);
            } break;

            case BackgroundMessage.createBackpackItemFromTemplate.name: {
                return this.handle_createBackpackItemFromTemplate(message.template, message.args, sendResponse);
            } break;

            default: {
                log.debug('BackgroundApp.onRuntimeMessage unhandled', message);
                sendResponse(new BackgroundErrorResponse('error', 'unhandled message type=' + message.type));
                return false;
            } break;
        }
    }

    maintainHttpCache(): void
    {
        if (Utils.logChannel('backgroundFetchUrlCache', true)) { log.info('BackgroundApp.maintainHttpCache'); }
        let cacheTimeout = Config.get('httpCache.maxAgeSec', 3600);
        let now = Date.now();
        let deleteKeys = new Array<string>();
        for (let key in this.httpCacheTime) {
            if (now - this.httpCacheTime[key] > cacheTimeout * 1000) {
                deleteKeys.push(key);
            }
        }

        deleteKeys.forEach(key =>
        {
            if (Utils.logChannel('backgroundFetchUrlCache', true)) { log.info('BackgroundApp.maintainHttpCache', (now - this.httpCacheTime[key]) / 1000, 'sec', 'delete', key); }
            delete this.httpCacheData[key];
            delete this.httpCacheTime[key];
        });
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

    lastCacheMaintenanceTime: number = 0;
    handle_fetchUrl(url: any, version: any, sendResponse: (response?: any) => void): boolean
    {
        let now = Date.now();
        let maintenanceIntervalSec = Config.get('httpCache.maintenanceIntervalSec', 60);
        if (now - this.lastCacheMaintenanceTime > maintenanceIntervalSec * 1000) {
            this.maintainHttpCache();
            this.lastCacheMaintenanceTime = now;
        }

        let key = version + url;
        let isCached = version != '_nocache' && this.httpCacheData[key] != undefined;

        if (isCached) {
            // log.debug('BackgroundApp.handle_fetchUrl', 'cache-age', (now - this.httpCacheTime[key]) / 1000, url, 'version=', version);
        } else {
            if (Utils.logChannel('backgroundFetchUrlCache', true)) { log.info('BackgroundApp.handle_fetchUrl', 'not-cached', url, 'version=', version); }
        }

        if (isCached) {
            sendResponse({ 'ok': true, 'data': this.httpCacheData[key] });
        } else {
            try {
                fetch(url, { cache: 'reload' })
                    .then(httpResponse =>
                    {
                        // log.debug('BackgroundApp.handle_fetchUrl', 'httpResponse', url, httpResponse);
                        if (httpResponse.ok) {
                            return httpResponse.text();
                        } else {
                            throw { 'ok': false, 'status': httpResponse.status, 'statusText': httpResponse.statusText };
                        }
                    })
                    .then(text =>
                    {
                        if (version == '_nocache') {
                            //dont cache
                        } else if (text == '') {
                            this.httpCacheData[key] = text;
                            this.httpCacheTime[key] = 0;
                        } else {
                            this.httpCacheData[key] = text;
                            this.httpCacheTime[key] = now;
                        }
                        let response = { 'ok': true, 'data': text };
                        if (Utils.logChannel('backgroundFetchUrl', true)) { log.info('BackgroundApp.handle_fetchUrl', 'response', url, text.length, response); }
                        sendResponse(response);
                    })
                    .catch(ex =>
                    {
                        log.debug('BackgroundApp.handle_fetchUrl', 'catch', url, ex);
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
                log.debug('BackgroundApp.handle_fetchUrl', 'exception', url, error);
                sendResponse({ 'ok': false, 'status': error.status, 'statusText': error.statusText });
            }
        }
        return false;
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

    handle_setBackpackItemProperties(itemId: string, properties: ItemProperties, options: ItemChangeOptions, sendResponse: (response?: any) => void): boolean
    {
        if (this.backpack) {
            this.backpack.setItemProperties(itemId, properties, options)
                .then(() => { sendResponse(new BackgroundSuccessResponse()); })
                .catch(ex => { sendResponse(new BackgroundItemExceptionResponse(ex)); });
            return true;
        } else {
            sendResponse(new BackgroundItemExceptionResponse(new ItemException(ItemException.Fact.NotChanged, ItemException.Reason.ItemsNotAvailable)));
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
                let props = this.backpack.getItemProperties(itemId);
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
                .then(() => { sendResponse(new BackgroundSuccessResponse()); })
                .catch(ex => { sendResponse(new BackgroundItemExceptionResponse(ex)); });
            return true;
        } else {
            sendResponse(new BackgroundItemExceptionResponse(new ItemException(ItemException.Fact.NotChanged, ItemException.Reason.ItemsNotAvailable)));
        }
        return false;
    }

    private lastPointsSubmissionTime: number = 0;
    private pointsActivities: Array<PointsActivity> = [];
    handle_pointsActivity(channel: string, n: number, sendResponse: (response?: any) => void): boolean
    {
        if (this.backpack) {
            if (Config.get('points.enabled', false)) {
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
            // If no backpack, then silently ignore points activity so that the content script does not have to know that points are implemented thru backpack            
            // } else {
            //     sendResponse(new BackgroundItemExceptionResponse(new ItemException(ItemException.Fact.NotChanged, ItemException.Reason.ItemsNotAvailable)));
        }
        sendResponse(new BackgroundSuccessResponse());
        return false;
    }

    handle_createBackpackItemFromTemplate(template: string, args: ItemProperties, sendResponse: (response?: any) => void): boolean
    {
        if (this.backpack) {
            this.backpack.createItemByTemplate(template, args)
                .then(item => { sendResponse(new CreateBackpackItemFromTemplateResponse(item.getProperties())); })
                .catch(ex => { sendResponse(new BackgroundItemExceptionResponse(ex)); });
            return true;
        } else {
            sendResponse(new BackgroundItemExceptionResponse(new ItemException(ItemException.Fact.NotChanged, ItemException.Reason.ItemsNotAvailable)));
        }
        return false;
    }

    // manage stanza from 2 tabId mappings

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

    private readonly fullJid2PresenceList: Map<string, Map<string, any>> = new Map<string, Map<string, any>>();

    presenceStateAddPresence(roomJid: string, participantNick: string, stanza: any): void
    {
        let roomPresences = this.fullJid2PresenceList.get(roomJid);
        if (roomPresences) { } else {
            roomPresences = new Map<string, any>();
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

    presenceStateRemoveRoom(roomJid: string): void
    {
        if (this.fullJid2PresenceList.has(roomJid)) {
            this.fullJid2PresenceList.delete(roomJid);
        }
    }

    getPresenceStateOfRoom(roomJid: string): Map<string, any>
    {
        let roomPresences = this.fullJid2PresenceList.get(roomJid);
        if (roomPresences) {
            return roomPresences;
        }
        return new Map<string, any>();
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
        roomPresences.forEach((stanza, key) =>
        {
            window.setTimeout(() =>
            {
                ContentMessage.sendMessage(tabId, { 'type': ContentMessage.type_recvStanza, 'stanza': stanza });
            }, 1);
        });
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

    private async recvStanza(stanza: xml)
    {
        this.stanzasInCount++;

        let isConnectionPresence = false;
        {
            if (stanza.name == 'presence') {
                isConnectionPresence = stanza.attrs.from && (jid(stanza.attrs.from).getResource() == this.resource);
            }
            if (!isConnectionPresence) {
                if (Utils.logChannel('backgroundTraffic', true)) { log.info('BackgroundApp.recvStanza', stanza, as.String(stanza.attrs.type, stanza.name == 'presence' ? 'available' : 'normal'), 'to=', stanza.attrs.to, 'from=', stanza.attrs.from); }

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

        if (stanza.name == 'iq') {
            if (stanza.attrs) {
                let stanzaType = stanza.attrs.type;
                let stanzaId = stanza.attrs.id;
                if (stanzaType == 'result' && stanzaId) {
                    let tabId = this.iqStanzaTabId[stanzaId];
                    if (tabId) {
                        delete this.iqStanzaTabId[stanzaId];
                        ContentMessage.sendMessage(tabId, { 'type': ContentMessage.type_recvStanza, 'stanza': stanza });
                    }
                }

                if (stanzaType == 'get' && stanzaId) {
                    await this.onIqGet(stanza);
                }
            }
        }

        if (stanza.name == 'message') {
            let from = jid(stanza.attrs.from);
            let room = from.bare().toString();

            let tabIds = this.getRoomJid2TabIds(room);
            if (tabIds) {
                for (let i = 0; i < tabIds.length; i++) {
                    let tabId = tabIds[i];
                    ContentMessage.sendMessage(tabId, { 'type': ContentMessage.type_recvStanza, 'stanza': stanza });
                }
            }
        }

        if (stanza.name == 'presence') {
            let from = jid(stanza.attrs.from);
            let room = from.bare().toString();
            let nick = from.getResource();

            if (nick != '') {
                if (as.String(stanza.attrs['type'], 'available') == 'available') {
                    if (!isConnectionPresence) {
                        this.presenceStateAddPresence(room, nick, stanza);
                    }
                } else {
                    this.presenceStateRemovePresence(room, nick);
                }

                let unavailableTabId: number = -1;
                if (stanza.attrs && stanza.attrs['type'] == 'unavailable') {
                    unavailableTabId = this.fullJid2TabWhichSentUnavailable[from];
                    if (unavailableTabId) {
                        delete this.fullJid2TabWhichSentUnavailable[from];
                    }
                }

                if (unavailableTabId >= 0) {
                    ContentMessage.sendMessage(unavailableTabId, { 'type': ContentMessage.type_recvStanza, 'stanza': stanza });
                    this.removeRoomJid2TabId(room, unavailableTabId);
                    if (Utils.logChannel('room2tab', true)) { log.info('BackgroundApp.recvStanza', 'removing room2tab mapping', room, '=>', unavailableTabId, 'now:', this.roomJid2tabId); }
                } else {
                    let tabIds = this.getRoomJid2TabIds(room);
                    if (tabIds) {
                        for (let i = 0; i < tabIds.length; i++) {
                            let tabId = tabIds[i];
                            ContentMessage.sendMessage(tabId, { 'type': ContentMessage.type_recvStanza, 'stanza': stanza });
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
                        // queryResponse.append(xml('LastActivity', {}, 'xx'));
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

    private lastPingTime: number = 0;
    handle_pingBackground(): BackgroundResponse
    {
        if (Utils.logChannel('pingBackground', true)) { log.info('BackgroundApp.handle_pingBackground'); }
        try {
            let now = Date.now();
            if (now - this.lastPingTime > 10000) {
                this.lastPingTime = now;
                this.sendPresence();
            }
            return new BackgroundSuccessResponse();
        } catch (error) {
            return new BackgroundErrorResponse('error', error);
        }
    }

    // 

    handle_log(pieces: any): BackgroundResponse
    {
        log.debug(...pieces);
        return new BackgroundSuccessResponse();
    }

    handle_userSettingsChanged(): BackgroundResponse
    {
        log.debug('BackgroundApp.handle_userSettingsChanged');
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

        this.pointsActivities = [];

        if (this.backpack) {
            if (Config.get('points.enabled', false)) {
                let points = await this.backpack.getOrCreatePointsItem();
                if (points) {
                    let itemId = as.String(points.getProperties()[Pid.Id], '');
                    if (itemId != '') {
                        this.backpack.executeItemAction(itemId, 'Points.ChannelValues', consolidated, [itemId], true)
                    }
                }
            }
        }
    }

    handle_test(): any
    {
    }

}
