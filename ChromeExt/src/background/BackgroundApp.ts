import log = require('loglevel');
import * as ltx from 'ltx';
import * as jid from '@xmpp/jid';
import { as } from '../lib/as';
import { Utils } from '../lib/Utils';
import { Config } from '../lib/Config';
import { Logger, LoglevelLogger } from '../lib/Logger'
import { CallableEventListeners, EventListeners } from '../lib/EventListeners'
import {
    BackgroundRequest,
    BackgroundErrorResponse,
    BackgroundMessage,
    BackgroundResponse,
    BackgroundSuccessResponse,
    BackgroundReadyResponse,
    FindBackpackItemPropertiesResponse,
    GetBackpackItemPropertiesResponse,
    IsBackpackItemResponse,
    ExecuteBackpackItemActionResponse,
    CreateBackpackItemResponse,
    ApplyItemToBackpackItemResponse,
    BackpackTransferCompleteResponse,
    BackpackTransferUnauthorizeResponse,
    BackpackTransferAuthorizeResponse,
    BackpackIsItemStillInRepoResponse,
    SendInstantMessageBackgroundRequest,
    GetChatHistoryResponse,
    IsTabDisabledResponse,
    NewChatMessageResponse,
    TabRoomPresenceData,
    PopupDefinition,
    GetItemsByInventoryItemIdsResponse,
    GetConfigTreeResponse,
    FetchUrlResponse,
    FetchUrlDataResponse,
} from '../lib/BackgroundMessage';
import { ItemProperties, Pid } from '../lib/ItemProperties';
import { ContentMessage } from '../lib/ContentMessage';
import { ItemException } from '../lib/ItemException';
import { ItemChangeOptions } from '../lib/ItemChangeOptions';
import { Memory } from '../lib/Memory';
import { ConfigUpdater } from './ConfigUpdater';
import { WebsocketManager } from './WebsocketManager';
import { XmppConnectionManager } from './XmppConnectionManager'
import { RoomPresenceManager } from './RoomPresenceManager';
import { Backpack } from './Backpack';
import { ItemAutorezzer } from './ItemAutorezzer'
import { Translator } from '../lib/Translator';
import { Environment } from '../lib/Environment';
import { Client } from '../lib/Client';
import { WeblinClientApi } from '../lib/WeblinClientApi';
import { ChatUtils } from '../lib/ChatUtils';
import { ChatHistoryStorage } from './ChatHistoryStorage';
import { is } from '../lib/is';
import { BrowserActionGui } from './BrowserActionGui';
import { BackgroundThemeManager } from './BackgroundThemeManager'
import { PopupManager } from './PopupManger'
import { DirectUrlFetcher, UrlFetcher } from '../lib/UrlFetcher'
import {
    BackgroundToContentCommunicator,
    BackgroundHeartbeatHandler,
    BackgroundRequestHandler,
    BackgroundTabHeartbeatHandler,
} from '../lib/BackgroundToContentCommunicator'
import { BackgroundFriendshipProposalManager } from './BackgroundFriendshipProposalManager'
import { BackgroundBrowserTab, BackgroundBrowserTabs } from './BackgroundBrowserTabs'
import { BackgroundInstantMessageManager } from './BackgroundInstantMessageManager'
import MessageSender = chrome.runtime.MessageSender
import { ExtensionMessage } from './ExtensionMessages'
import { BackgroundNewUserExperience } from './BackgroundNewUserExperience'

export type ContentCommunicatorFactory = (heartbeatHandler: BackgroundHeartbeatHandler, tabHeartbeatHandler: BackgroundTabHeartbeatHandler, requestHandler: BackgroundRequestHandler) => BackgroundToContentCommunicator

interface PointsActivity
{
    channel: string;
    n: number;
}

export class BackgroundApp
{
    private logger: Logger;
    private tabs: BackgroundBrowserTabs;
    private contentCommunicator: BackgroundToContentCommunicator;
    private urlFetcher: DirectUrlFetcher;
    private configUpdater: ConfigUpdater;
    private websocketManager: WebsocketManager;
    private xmppManager: XmppConnectionManager;
    private roomPresenceManager: RoomPresenceManager;
    private chatHistoryStorage: ChatHistoryStorage;
    private instantMessageManager: BackgroundInstantMessageManager;
    private browserActionGui: BrowserActionGui;
    private themeManager: BackgroundThemeManager;
    private popupManager: PopupManager;
    private backpack: Backpack;
    private itemAutorezzer: ItemAutorezzer;
    private friendshipProposalManager: BackgroundFriendshipProposalManager;
    private newUserExperience: BackgroundNewUserExperience;

    private callableBackgroundStopListeners: CallableEventListeners<void>;
    private callableBackgroundReadyListeners: CallableEventListeners<void>;

    private isFirstConfig: boolean = true;
    private isReady: boolean = false;
    private userId: string = '';
    private userToken: string = '';
    private language = 'en-US';
    private babelfish: Translator;

    private startupTime = Date.now();
    private readyAssertedCount = 0;
    private lastReadyAssertedTime = 0;

    private iqStanzaTabId: Map<string, number>;

    public constructor(contentCommunicatorFactory: ContentCommunicatorFactory) {
        const heartbeatHandler = () => this.maintain()
        const tabHeartbeatHandler = (tabId: number) => this.tabs.onTabHeartbeat(tabId)
        const requestHandler = (tabId: number, request: BackgroundRequest) => this.onContentRequest(tabId, request)
        this.contentCommunicator = contentCommunicatorFactory(heartbeatHandler, tabHeartbeatHandler, requestHandler);
        this.init();
    }

    private init() {
        this.isFirstConfig = true;
        this.isReady = false;
        this.userId = '';
        this.userToken = '';
        this.iqStanzaTabId = new Map();

        this.callableBackgroundStopListeners = new CallableEventListeners('backgroundStop');
        this.callableBackgroundReadyListeners = new CallableEventListeners('backgroundReady');

        this.logger = new LoglevelLogger('', '');
        this.tabs = new BackgroundBrowserTabs(this);
        this.urlFetcher = new DirectUrlFetcher();
        this.configUpdater = new ConfigUpdater(this);
        this.websocketManager = new WebsocketManager(this);
        this.xmppManager = new XmppConnectionManager(this);
        this.roomPresenceManager = new RoomPresenceManager(this);
        this.chatHistoryStorage = new ChatHistoryStorage(this);
        this.instantMessageManager = new BackgroundInstantMessageManager(this);
        this.browserActionGui = new BrowserActionGui(this);
        this.popupManager = new PopupManager(this);
        this.backpack = new Backpack(this);
        this.themeManager = new BackgroundThemeManager(this);
        this.itemAutorezzer = new ItemAutorezzer(this);
        this.friendshipProposalManager = new BackgroundFriendshipProposalManager(this);
        this.newUserExperience = new BackgroundNewUserExperience(this);

        if ((typeof chrome !== 'undefined') && !!(chrome.runtime?.onMessageExternal ?? null)) {
            const handler = (request, sender, sendResponse) => this.onExternalMessage(request, sender, sendResponse)
            chrome.runtime.onMessageExternal.addListener(handler);
        }
    }

    public getLogger(): Logger { return this.logger; }

    public getLanguage(): string { return this.language; }

    public getUrlFetcher(): UrlFetcher
    {
        return this.urlFetcher;
    }

    public getBrowserTabs(): BackgroundBrowserTabs
    {
        return this.tabs;
    }

    public getBackgroundStopListeners(): EventListeners<void> {
        return this.callableBackgroundStopListeners;
    }

    public getBackgroundReadyListeners(): EventListeners<void> {
        return this.callableBackgroundReadyListeners;
    }

    public async start(): Promise<void>
    {
        this.isReady = false;

        await Client.initDevConfig()
        Environment.NODE_ENV = Config.get('environment.NODE_ENV', null);

        let firstStart = as.Int(await Memory.getLocal('client.firstStart'));
        if (firstStart === 0) {
            await Memory.setLocal('client.firstStart', Date.now());
        }
        let startCount = as.Int(await Memory.getLocal('client.startCount'));
        startCount++;
        await Memory.setLocal('client.startCount', startCount);

        await this.assertThatThereIsAUserId();
        await this.assertThatThereIsAUserToken();

        this.lastPointsSubmissionTime = Date.now();

        this.configUpdater.start(() => this.onConfigUpdated());

        this.tabs.tabContentStopListeners.addListener(tab => this.onBrowserTabContentAppStop(tab))
    }

    public getIsReady(): boolean
    {
        return this.isReady;
    }

    public getUserId(): string
    {
        let userId = this.userId ?? '';
        if (!userId.length) { throw new ItemException(ItemException.Fact.InternalError, ItemException.Reason.NoUserId); }
        return userId;
    }

    public getUserToken(): string
    {
        let userToken = this.userToken;
        if (!userToken.length) { throw new ItemException(ItemException.Fact.InternalError, ItemException.Reason.NoUserToken); }
        return userToken;
    }

    public getXmppResource(): null|string
    {
        return this.xmppManager.getXmppResource();
    }

    public getXmppJid(): null|jid.JID
    {
        return this.xmppManager.getXmppJid();
    }

    public getWebsocketManager(): WebsocketManager
    {
        return this.websocketManager;
    }

    public getChatHistoryStorage(): ChatHistoryStorage
    {
        return this.chatHistoryStorage;
    }

    public getInstantMessageManager(): BackgroundInstantMessageManager
    {
        return this.instantMessageManager;
    }

    public getBackpack(): Backpack
    {
        return this.backpack;
    }

    public getFriendshipProposalManager(): BackgroundFriendshipProposalManager
    {
        return this.friendshipProposalManager;
    }

    public async assertThatThereIsAUserId()
    {
        let uniqueId = as.String(await Memory.getLocal(Utils.localStorageKey_Id()));
        if (uniqueId === '') {
            uniqueId = 'mid' + Utils.randomString(30).toLowerCase();
            await Memory.setLocal(Utils.localStorageKey_Id(), uniqueId);
        }
        this.userId = uniqueId;
    }

    private async assertThatThereIsAUserToken()
    {
        let token = as.String(await Memory.getLocal(Utils.localStorageKey_Token()));
        if (token === '') {
            token = 'mto' + Utils.randomString(30).toLowerCase();
            await Memory.setLocal(Utils.localStorageKey_Token(), token);
        }
        this.userToken = token;
    }

    private onConfigUpdated(): void
    {
        (async () => {
            const isFirstConfig = this.isFirstConfig;
            this.isFirstConfig = false;
            if (isFirstConfig) {
                this.contentCommunicator.start();
            }

            this.language = Client.getUserLanguage()
            const translationTable = Config.get('i18n.translations', {})[this.language];
            this.babelfish = new Translator(translationTable, this.language, Config.get('i18n.serviceUrl', ''), this.urlFetcher);

            this.urlFetcher.setCacheLifetimeSecs(Config.get('httpCache.maxAgeSec', 3600));
            this.urlFetcher.setMaintenanceIntervalSecs(Config.get('httpCache.maintenanceIntervalSec', 60));

            this.browserActionGui.onConfigUpdated();
            if (isFirstConfig) {
                await this.roomPresenceManager.start();
            } else {
                this.roomPresenceManager.onUserSettingsChanged();
            }
            this.friendshipProposalManager.onConfigUpdated();
            this.websocketManager.onConfigUpdated();
            this.xmppManager.onConfigUpdated();
            this.maintain();

            this.sendToAllTabs({ type: ContentMessage.type_configChanged });
        })().catch(error => log.info(error));
    }

    public onXmppOnline(): void
    {
        if (!this.isReady && this.xmppManager.getIsConnected()) {
            this.isReady = true;
            if (Utils.logChannel('startup', true)) { log.info('BackgroundApp', 'isReady'); }
            this.callableBackgroundReadyListeners.callListeners();

            this.maintain();
        }
    }

    public stop(): void
    {
        this.configUpdater.stop();
        this.tabs.getAllConnectedTabIds().forEach(tabId => this.tabs.onTabContentStop(tabId))

        this.contentCommunicator.stop()

        this.callableBackgroundStopListeners.callListeners();
        this.friendshipProposalManager.stop();
        this.itemAutorezzer.stop();
        this.websocketManager.stop();
        this.xmppManager.stop();
        this.roomPresenceManager.stop();
        this.instantMessageManager.stop();
        this.popupManager.stop();
    }

    public translateText(key: string, defaultText: string = null): string
    {
        return this.babelfish.translateText(key, defaultText);
    }

    // IPC

    private onBrowserTabContentAppStop(tab: BackgroundBrowserTab): void
    {
        this.roomPresenceManager.onTabUnavailable(tab.getTabId());
        this.contentCommunicator.forgetTab(tab.getTabId());
    }

    private async onContentRequest(tabId: number, request: BackgroundRequest): Promise<BackgroundResponse> {
        this.tabs.onTabContentConnected(tabId);
        switch (request.type) {

            case BackgroundMessage.test.name: {
                return this.handle_test();
            } break;

            case BackgroundMessage.fetchUrlAsText.name: {
                return await this.urlFetcher.fetchAsText(request.url, request.version)
                    .then(data => new FetchUrlResponse(data));
            } break;

            case BackgroundMessage.fetchUrlAsDataUrl.name: {
                return await this.urlFetcher.fetchAsDataUrl(request.url, request.version)
                    .then(data => new FetchUrlResponse(data));
            } break;

            case BackgroundMessage.fetchUrlJson.name: {
                return await this.urlFetcher.fetchJson(request.url)
                    .then(data => new FetchUrlDataResponse(data));
            } break;

            case BackgroundMessage.jsonRpc.name: {
                return this.handle_jsonRpc(request.url, request.json);
            } break;

            case BackgroundMessage.assertReady.name: {
                return this.handle_assertReady(tabId);
            } break;

            case BackgroundMessage.signalContentAppStopToBackground.name: {
                this.tabs.onTabContentStop(tabId);
                return new BackgroundSuccessResponse();
            } break;

            case BackgroundMessage.sendTabStatsToBackground.name: {
                this.tabs.onStatsFromTab(tabId, request.tabStats, request.tabContentData);
                return new BackgroundSuccessResponse();
            } break;

            case BackgroundMessage.getConfigTree.name: {
                return this.handle_getConfigTree(request.name);
            } break;

            case BackgroundMessage.sendStanza.name: {
                return this.handle_sendStanza(request.stanza, tabId);
            } break;

            case BackgroundMessage.sendRoomPos.name: {
                return this.handle_sendRoomPos(request.roomJid, request.posX);
            } break;

            case BackgroundMessage.sendRoomPresence.name: {
                return this.handle_sendRoomPresence(tabId, request.presenceData);
            } break;

            case BackgroundMessage.userSettingsChanged.name: {
                return this.handle_userSettingsChanged();
            } break;

            case BackgroundMessage.clientNotification.name: {
                return this.handle_clientNotification(tabId, request.target, request.data);
            } break;

            case BackgroundMessage.requestBackpackState.name: {
                return this.handle_requestBackpackState(tabId);
            } break;

            case BackgroundMessage.backpackIsItemStillInRepo.name: {
                return this.handle_backpackIsItemStillInRepo(request.itemId);
            } break;

            case BackgroundMessage.modifyBackpackItemProperties.name: {
                return this.handle_modifyBackpackItemProperties(request.itemId, request.changed, request.deleted, request.options);
            } break;

            case BackgroundMessage.loadWeb3BackpackItems.name: {
                return this.loadWeb3BackpackItems();
            } break;

            case BackgroundMessage.rezBackpackItem.name: {
                return this.handle_rezBackpackItem(request.itemId, request.roomJid, request.x, request.destination);
            } break;

            case BackgroundMessage.derezBackpackItem.name: {
                return this.handle_derezBackpackItem(request.itemId, request.roomJid, request.x, request.y);
            } break;

            case BackgroundMessage.deleteBackpackItem.name: {
                return this.handle_deleteBackpackItem(request.itemId, request.options);
            } break;

            case BackgroundMessage.isBackpackItem.name: {
                return this.handle_isBackpackItem(request.itemId);
            } break;

            case BackgroundMessage.getBackpackItemProperties.name: {
                return this.handle_getBackpackItemProperties(request.itemId);
            } break;

            case BackgroundMessage.findBackpackItemProperties.name: {
                return this.handle_findBackpackItemProperties(request.filterProperties);
            } break;

            case BackgroundMessage.executeBackpackItemAction.name: {
                return this.handle_executeBackpackItemAction(request.itemId, request.action, request.args, request.involvedIds);
            } break;

            case BackgroundMessage.executeBackpackItemActionOnGenericitem.name: {
                return this.handle_executeBackpackItemActionOnGenericitem(request.action, request.args, request.involvedIds);
            } break;

            case BackgroundMessage.getItemsByInventoryItemIds.name: {
                return this.handle_getItemsByInventoryItemIds(request.itemsToGet);
            } break;

            case BackgroundMessage.pointsActivity.name: {
                return this.handle_pointsActivity(request.channel, request.n);
            } break;

            case BackgroundMessage.applyItemToBackpackItem.name: {
                return this.handle_applyItemToBackpackItem(request.activeId, request.passiveId);
            } break;

            case BackgroundMessage.backpackTransferAuthorize.name: {
                return this.handle_backpackTransferAuthorize(request.itemId, request.duration);
            } break;

            case BackgroundMessage.backpackTransferUnauthorize.name: {
                return this.handle_backpackTransferUnauthorize(request.itemId);
            } break;

            case BackgroundMessage.backpackTransferComplete.name: {
                return this.handle_backpackTransferComplete(request.provider, request.senderInventoryId, request.senderItemId, request.transferToken);
            } break;

            case BackgroundMessage.createBackpackItem.name: {
                return this.handle_createBackpackItem(request.provider, request.auth, request.method, request.args);
            } break;

            case BackgroundMessage.handleNewChatMessage.name: {
                return this.handle_newChatMessage(request.chatChannel, request.chatMessage, request.deduplicate);
            } break;
            case BackgroundMessage.sendInstantMessage.name: {
                const { otherUserId, instantMessageType, text } = <SendInstantMessageBackgroundRequest>request;
                await this.instantMessageManager.sendInstantMessage(otherUserId, instantMessageType, text);
                return new BackgroundSuccessResponse();
            } break;
            case BackgroundMessage.getChatHistory.name: {
                return this.handle_getChatHistory(request.chatChannel);
            } break;

            case BackgroundMessage.deleteChatHistory.name: {
                return this.handle_deleteChatHistory(request.chatChannel, request.olderThanTime);
            } break;

            case BackgroundMessage.openOrFocusPopup.name: {
                return this.handle_openOrFocusPopup(request.popupDefinition);
            } break;

            case BackgroundMessage.closePopup.name: {
                return this.handle_closePopup(request.popupId);
            } break;

            case BackgroundMessage.isTabDisabled.name: {
                return this.handle_isTabDisabled(tabId, request.pageUrl);
            } break;

            case BackgroundMessage.setThemeState.name: {
                this.themeManager.onSetThemeStateFromContent(request);
                return new BackgroundSuccessResponse();
            } break;
            case BackgroundMessage.deleteThemes.name: {
                this.themeManager.onDeleteThemesFromContent(request);
                return new BackgroundSuccessResponse();
            } break;

            default: {
                throw new Error(`BackgroundApp.onContentRequest: Unhandled request from tab ${tabId}!`)
            } break;
        }
    }

    private onExternalMessage(message: unknown, sender: MessageSender, sendResponse: (response: unknown) => void): void
    {
        if (is.string(sender.id)) {
            return this.onExtensionMessage(message, sender.id, sendResponse)
        }
        const error = new Error(`BackgroundApp.onExternalRequest: Unhandled external request!`)
        sendResponse(error)
    }

    private onExtensionMessage(message: unknown, extensionId: string, sendResponse: (response: unknown) => void): void
    {
        switch (message?.['type']) {

            case ExtensionMessage.type_ExtensionThemesNotification: {
                sendResponse(this.themeManager.onThemesFromExtension(extensionId, message));
            } break;

            default: {
                const error = new Error(`BackgroundApp.onExternalRequest: Unhandled external request!`)
                sendResponse(error)
            } break;
        }
    }

    private async handle_jsonRpc(url: string, postBody: any): Promise<FetchUrlResponse|BackgroundErrorResponse>
    {
        const httpResponse = await fetch(url, {
            method: 'POST',
            cache: 'reload',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(postBody),
            redirect: 'error'
        });
        // log.debug('BackgroundApp.handle_jsonRpc', 'httpResponse', url, postBody, httpResponse);
        if (!httpResponse.ok) {
            return new BackgroundErrorResponse(as.String(httpResponse.status), httpResponse.statusText);
        }
        const data = await httpResponse.text();
        const response = new FetchUrlResponse(data);
        if (Utils.logChannel('backgroundJsonRpc', true)) {
            log.info('BackgroundApp.handle_jsonRpc', 'response', url, postBody, data.length, response);
        }
        return response;
    }

    private async handle_assertReady(tabId: number): Promise<BackgroundReadyResponse|BackgroundErrorResponse>
    {
        if (Utils.logChannel('contentStart', true)) {
            log.info('BackgroundApp.handle_assertReady');
        }
        if (this.isReady) {
            this.lastReadyAssertedTime = Date.now();
            this.readyAssertedCount++;
            const tabContentData = [...this.tabs.getTab(tabId).getContentData().entries()];
            return new BackgroundReadyResponse(tabContentData);
        }
        return new BackgroundErrorResponse('uninitialized', 'Not ready yet.');
    }

    private async handle_getConfigTree(name: any): Promise<GetConfigTreeResponse>
    {
        if (Utils.logChannel('contentStart', true)) {
            log.info('BackgroundApp.handle_getConfigTree', name, this.isReady);
        }
        switch (as.String(name, Config.onlineConfigName)) {
            case Config.devConfigName: return new GetConfigTreeResponse(Config.getDevTree());
            case Config.onlineConfigName: return new GetConfigTreeResponse(Config.getOnlineTree());
            case Config.staticConfigName: return new GetConfigTreeResponse(Config.getStaticTree());
        }
        return new GetConfigTreeResponse(Config.getOnlineTree());
    }

    private handle_requestBackpackState(tabId: number): BackgroundSuccessResponse
    {
        if (!Utils.isBackpackEnabled()) {
            throw new ItemException(ItemException.Fact.NoItemsReceived, ItemException.Reason.ItemsNotAvailable);
        }
        this.backpack.sendAllOwnItemsToTab(tabId);
        return new BackgroundSuccessResponse();
    }

    private async handle_backpackIsItemStillInRepo(itemId: string): Promise<BackpackIsItemStillInRepoResponse>
    {
        if (!Utils.isBackpackEnabled()) {
            throw new ItemException(ItemException.Fact.NotExecuted, ItemException.Reason.ItemsNotAvailable);
        }
        const itemStillInRepo = await this.backpack.isItemStillInRepo(itemId);
        return new BackpackIsItemStillInRepoResponse(itemStillInRepo);
    }

    private async handle_modifyBackpackItemProperties(itemId: string, changed: ItemProperties, deleted: Array<string>, options: ItemChangeOptions): Promise<BackgroundSuccessResponse>
    {
        if (!Utils.isBackpackEnabled()) {
            throw new ItemException(ItemException.Fact.NotChanged, ItemException.Reason.ItemsNotAvailable);
        }
        await this.backpack.modifyItemProperties(itemId, changed, deleted, options);
        return new BackgroundSuccessResponse();
    }

    private async loadWeb3BackpackItems(): Promise<BackgroundSuccessResponse>
    {
        if (!Utils.isBackpackEnabled()) {
            throw new ItemException(ItemException.Fact.NotChanged, ItemException.Reason.ItemsNotAvailable);
        }
        await this.backpack.loadWeb3Items();
        return new BackgroundSuccessResponse();
    }

    private async handle_rezBackpackItem(itemId: string, room: string, x: number, destination: string): Promise<BackgroundSuccessResponse>
    {
        if (!Utils.isBackpackEnabled()) {
            throw new ItemException(ItemException.Fact.NotRezzed, ItemException.Reason.ItemsNotAvailable);
        }
        await this.backpack.rezItem(itemId, room, x, destination);
        return new BackgroundSuccessResponse();
    }

    private async handle_derezBackpackItem(itemId: string, roomJid: string, x: number, y: number): Promise<BackgroundSuccessResponse>
    {
        if (!Utils.isBackpackEnabled()) {
            throw new ItemException(ItemException.Fact.NotRezzed, ItemException.Reason.ItemsNotAvailable);
        }
        await this.backpack.derezItem(itemId, roomJid, x, y);
        return new BackgroundSuccessResponse();
    }

    private async handle_deleteBackpackItem(itemId: string, options: ItemChangeOptions): Promise<BackgroundSuccessResponse>
    {
        if (!Utils.isBackpackEnabled()) {
            throw new ItemException(ItemException.Fact.NotDeleted, ItemException.Reason.ItemsNotAvailable);
        }
        await this.backpack.deleteItem(itemId, options);
        return new BackgroundSuccessResponse();
    }

    private handle_isBackpackItem(itemId: string): IsBackpackItemResponse
    {
        if (!Utils.isBackpackEnabled()) {
            return new IsBackpackItemResponse(false);
        }
        const isItem = this.backpack.isItem(itemId);
        return new IsBackpackItemResponse(isItem);
    }

    private handle_getBackpackItemProperties(itemId: string): GetBackpackItemPropertiesResponse
    {
        if (!Utils.isBackpackEnabled()) {
            throw new ItemException(ItemException.Fact.UnknownError, ItemException.Reason.ItemsNotAvailable);
        }
        const props = this.backpack.getItem(itemId);
        return new GetBackpackItemPropertiesResponse(props);
    }

    private handle_findBackpackItemProperties(filterProperties: ItemProperties): FindBackpackItemPropertiesResponse
    {
        if (!Utils.isBackpackEnabled()) {
            throw new ItemException(ItemException.Fact.UnknownError, ItemException.Reason.ItemsNotAvailable);
        }
        const guardFun = (props: ItemProperties): boolean => {
            for (const pid in filterProperties) {
                if (props[pid] !== filterProperties[pid]) {
                    return false;
                }
            }
            return true;
        };
        const items = this.backpack.findItems(guardFun);
        const propertiesSet = {};
        for (const item of items) {
            propertiesSet[ItemProperties.getId(item)] = item;
        }
        return new FindBackpackItemPropertiesResponse(propertiesSet);
    }

    private async handle_executeBackpackItemAction(itemId: string, action: string, args: any, involvedIds: Array<string>): Promise<ExecuteBackpackItemActionResponse>
    {
        if (!Utils.isBackpackEnabled()) {
            throw new ItemException(ItemException.Fact.NotChanged, ItemException.Reason.ItemsNotAvailable);
        }
        const result = await this.backpack.executeItemAction(itemId, action, args, involvedIds, false);
        return new ExecuteBackpackItemActionResponse(result);
    }

    private async handle_executeBackpackItemActionOnGenericitem(action: string, args: any, involvedIds: Array<string>): Promise<ExecuteBackpackItemActionResponse>
    {
        if (!Utils.isBackpackEnabled()) {
            throw new ItemException(ItemException.Fact.NotChanged, ItemException.Reason.ItemsNotAvailable);
        }
        const result = await this.backpack.executeItemActionOnGenericitem(action, args, involvedIds, true);
        return new ExecuteBackpackItemActionResponse(result);
    }

    private async handle_getItemsByInventoryItemIds(itemsToGet: ItemProperties[]): Promise<GetItemsByInventoryItemIdsResponse>
    {
        if (!Utils.isBackpackEnabled()) {
            throw new ItemException(ItemException.Fact.UnknownError, ItemException.Reason.ItemsNotAvailable);
        }
        const items = await this.backpack.getItemsByInventoryItemIds(itemsToGet);
        return new GetItemsByInventoryItemIdsResponse(items);
    }

    private lastPointsSubmissionTime: number = 0;
    private pointsActivities: Array<PointsActivity> = [];
    private async handle_pointsActivity(channel: string, n: number): Promise<BackgroundResponse>
    {
        if (!Utils.isBackpackEnabled() || !Config.get('points.enabled', false)) {
            return new BackgroundSuccessResponse();
        }
        if (this.isPointsActivityIgnoredBecauseNeedsPause(channel)) {
            return new BackgroundErrorResponse('error', 'Points activity ' + channel + ' needs pause');
        }

        this.pointsActivities.push({ channel, n });
        const now = Date.now();
        const submissionIntervalSec = Config.get('points.submissionIntervalSec', 300);
        if (now - this.lastPointsSubmissionTime > submissionIntervalSec * 1000) {
            this.lastPointsSubmissionTime = now;
            await this.submitPoints();
        }
        return new BackgroundSuccessResponse();
    }

    private pointsActivitiesTimes: Map<string, number> = new Map<string, number>();
    private isPointsActivityIgnoredBecauseNeedsPause(channel: string): boolean
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

    private async handle_applyItemToBackpackItem(activeId: string, passiveId: string): Promise<ApplyItemToBackpackItemResponse>
    {
        if (!Utils.isBackpackEnabled()) {
            throw new ItemException(ItemException.Fact.NotChanged, ItemException.Reason.ItemsNotAvailable);
        }
        const result = await this.backpack.applyItemToItem(activeId, passiveId);
        return new ApplyItemToBackpackItemResponse(result);
    }

    private async handle_backpackTransferAuthorize(itemId: string, duration: number): Promise<BackpackTransferAuthorizeResponse>
    {
        if (!Utils.isBackpackEnabled()) {
            throw new ItemException(ItemException.Fact.NotExecuted, ItemException.Reason.ItemsNotAvailable);
        }
        const transferToken = await this.backpack.transferAuthorize(itemId, duration);
        return new BackpackTransferAuthorizeResponse(transferToken);
    }

    private async handle_backpackTransferUnauthorize(itemId: string): Promise<BackpackTransferUnauthorizeResponse>
    {
        if (!Utils.isBackpackEnabled()) {
            throw new ItemException(ItemException.Fact.NotExecuted, ItemException.Reason.ItemsNotAvailable);
        }
        await this.backpack.transferUnauthorize(itemId);
        return new BackpackTransferUnauthorizeResponse();
    }

    private async handle_backpackTransferComplete(provider: string, senderInventoryId: string, senderItemId: string, transferToken: string): Promise<BackpackTransferCompleteResponse>
    {
        if (!Utils.isBackpackEnabled()) {
            throw new ItemException(ItemException.Fact.NotExecuted, ItemException.Reason.ItemsNotAvailable);
        }
        const itemId = await this.backpack.transferComplete(provider, senderInventoryId, senderItemId, transferToken);
        const itemProps = this.backpack.getItem(itemId);
        return new BackpackTransferCompleteResponse(itemProps);
    }

    private async handle_createBackpackItem(provider: string, auth: string, method: string, args: ItemProperties): Promise<CreateBackpackItemResponse>
    {
        if (!Utils.isBackpackEnabled()) {
            throw new ItemException(ItemException.Fact.NotChanged, ItemException.Reason.ItemsNotAvailable);
        }
        const itemProps = await this.backpack.createItem(provider, auth, method, args);
        return new CreateBackpackItemResponse(itemProps);
    }

    public async handle_newChatMessage(chatChannel: ChatUtils.ChatChannel, chatMessage: ChatUtils.ChatMessage, deduplicate: boolean): Promise<NewChatMessageResponse>
    {
        const deletionsByRoomJid = await this.chatHistoryStorage.maintain(new Date());
        this.sendChatHistoryDeletionsToTabs(deletionsByRoomJid);
        const { createdOrUpdated, messageCurrent } = await this.chatHistoryStorage.storeChatMessage(chatChannel, chatMessage, deduplicate);
        if (createdOrUpdated || messageCurrent.isUnread) {
            this.sendPersistedChatMessageToTabs(chatChannel, messageCurrent);
        }
        return new NewChatMessageResponse(createdOrUpdated, messageCurrent);
    }

    private async handle_getChatHistory(chatChannel: ChatUtils.ChatChannel): Promise<GetChatHistoryResponse>
    {
        const deletionsByRoomJid = await this.chatHistoryStorage.maintain(new Date());
        this.sendChatHistoryDeletionsToTabs(deletionsByRoomJid);
        const chatMessages = await this.chatHistoryStorage.getChatHistoryByChatChannel(chatChannel);
        return new GetChatHistoryResponse(chatMessages);
    }

    private async handle_deleteChatHistory(chatChannel: ChatUtils.ChatChannel, olderThanTime: string): Promise<BackgroundSuccessResponse>
    {
        const deletionsByRoomJid = await this.chatHistoryStorage.maintain(new Date());
        await this.chatHistoryStorage.deleteOldChatHistoryByChatChannelOlderThanTime(chatChannel, olderThanTime);
        const tabRoomJid = chatChannel.type === 'instantMessage' ? '' : chatChannel.roomJid;
        const jidEntries = deletionsByRoomJid.get(tabRoomJid) ?? [];
        jidEntries.push({chatChannel, olderThanTime});
        deletionsByRoomJid.set(tabRoomJid, jidEntries);
        this.sendChatHistoryDeletionsToTabs(deletionsByRoomJid);
        return new BackgroundSuccessResponse();
    }

    private handle_openOrFocusPopup(popupDefinition: PopupDefinition): BackgroundSuccessResponse
    {
        this.popupManager.openOrFocusPopup(popupDefinition);
        return new BackgroundSuccessResponse();
    }

    private handle_closePopup(popupId: string): BackgroundSuccessResponse
    {
        this.popupManager.closePopup(popupId);
        return new BackgroundSuccessResponse();
    }

    private handle_isTabDisabled(tabId: number, pageUrl: string): IsTabDisabledResponse
    {
        const isDisabled = this.popupManager.isTabDisabled(tabId);
        return new IsTabDisabledResponse(isDisabled);
    }

    private sendPersistedChatMessageToTabs(chatChannel: ChatUtils.ChatChannel, chatMessage: ChatUtils.ChatMessage): void
    {
        const message = { type: ContentMessage.type_chatMessagePersisted, data: {chatChannel, chatMessage} };
        if (chatChannel.type === 'instantMessage') {
            this.sendToAllTabs(message);
        } else {
            this.sendToTabsForRoom(chatChannel.roomJid, message);
        }
    }

    private sendChatHistoryDeletionsToTabs(deletionsByRoomJid: Map<string,{chatChannel: ChatUtils.ChatChannel, olderThanTime: string}[]>): void
    {
        for (const [roomJid, deletions] of deletionsByRoomJid) {
            const message = { type: ContentMessage.type_chatHistoryDeleted, data: {deletions} };
            if (roomJid.length === 0) {
                this.sendToAllTabs(message);
            } else {
                this.sendToTabsForRoom(roomJid, message);
            }
        }
    }

    private getRoomJid2TabIds(roomJid: string): number[]
    {
        return this.roomPresenceManager.getTabIdsByRoomJid(roomJid);
    }

    // send/recv stanza

    private handle_sendStanza(stanza: any, tabId: number): BackgroundResponse
    {
        // log.debug('BackgroundApp.handle_sendStanza', stanza, tabId);

        let xmlStanza: ltx.Element = Utils.jsObject2xmlObject(stanza);

        if (Utils.isBackpackEnabled()) {
            xmlStanza = this.backpack.stanzaOutFilter(xmlStanza);
            if (xmlStanza == null) { return; }
        }

        if (xmlStanza.name === 'iq') {
            if (xmlStanza.attrs) {
                let stanzaType = xmlStanza.attrs.type;
                let stanzaId = xmlStanza.attrs.id;
                if ((stanzaType === 'get' || stanzaType === 'set') && stanzaId) {
                    this.iqStanzaTabId.set(stanzaId, tabId);
                }
            }
        }

        this.sendStanza(xmlStanza);

        return new BackgroundSuccessResponse();
    }

    private handle_sendRoomPos(roomJid: string, posX: number): BackgroundResponse
    {
        this.roomPresenceManager.updateRoomPos(roomJid, posX);
        return new BackgroundSuccessResponse();
    }

    private handle_sendRoomPresence(tabId: number, presenceData: TabRoomPresenceData): BackgroundResponse
    {
        this.roomPresenceManager.sendTabRoomPresence(tabId, presenceData);
        return new BackgroundSuccessResponse();
    }

    public sendRoomPresence(roomJid: string): void
    {
        this.roomPresenceManager.sendRoomPresence(roomJid);
    }

    public replayPresence(roomJid: string, participantResource: string): void
    {
        this.roomPresenceManager.replayReceivedRoomPresenceStanza(roomJid, participantResource);
    }

    public sendStanza(stanza: ltx.Element): void
    {
        this.xmppManager.sendStanza(stanza);
    }

    public recvStanza(xmlStanza: ltx.Element)
    {
        const isError = xmlStanza.attrs.type === 'error';
        if (isError) {
            log.info('BackgroundApp.recvStanza: Stanza is an error.', { xmlStanza });
        }

        let fromJid: null|jid.JID;
        try {
            fromJid = jid(xmlStanza.attrs.from);
        } catch (error) {
            fromJid = null;
        }
        const isPresence = fromJid && xmlStanza.name === 'presence';
        const isConnectionPresence = isPresence && fromJid?.getResource() === this.getXmppResource();
        const isRoomPresence = isPresence && !isConnectionPresence;

        if (isRoomPresence) {
            this.roomPresenceManager.onReceivedRoomPresenceStanza(xmlStanza);
        }

        if (xmlStanza.name === 'iq') {
            const stanzaType = xmlStanza.attrs.type;
            const stanzaId = xmlStanza.attrs.id;
            if (stanzaType === 'result' && stanzaId) {
                const tabId = this.iqStanzaTabId.get(stanzaId);
                if (tabId) {
                    this.iqStanzaTabId.delete(stanzaId);
                    this.sendToTab(tabId, { 'type': ContentMessage.type_recvStanza, 'stanza': xmlStanza });
                }
            }

            if (stanzaType === 'get' && stanzaId) {
                this.onIqGet(xmlStanza).catch(error => log.info('BackgroundApp.recvStanza: onIqGet failed!', { error }));
            }
        }

        if (fromJid && xmlStanza.name === 'message') {
            let roomJid = fromJid.bare().toString();
            const message = { 'type': ContentMessage.type_recvStanza, 'stanza': xmlStanza };
            this.sendToTabsForRoom(roomJid, message);
        }
    }

    public async onIqGet(stanza: ltx.Element): Promise<void>
    {
        const versionQuery = stanza.getChild('query', 'jabber:iq:version');
        if (versionQuery) {
            await this.onIqGetVersion(stanza);
        }
    }

    private async onIqGetVersion(stanza: ltx.Element): Promise<void>
    {
        if (stanza.attrs) {
            const id = stanza.attrs.id;
            if (id) {
                const versionQuery = stanza.getChild('query', 'jabber:iq:version');
                if (versionQuery) {
                    const response = new ltx.Element('iq', { type: 'result', 'id': id, 'to': stanza.attrs.from });
                    const queryResponse = response.c('query', { xmlns: 'jabber:iq:version', });

                    queryResponse.c('name', {}).t(Config.get('client.name', '_noname'));
                    queryResponse.c('version', {}).t(Client.getVersion());

                    let verbose = false;
                    const auth = as.String(versionQuery.attrs.auth, '');
                    if (auth !== '' && auth === Config.get('xmpp.verboseVersionQueryWeakAuth', '')) {
                        verbose = true;
                    }
                    if (verbose) {
                        if (!Config.get('xmpp.sendVerboseVersionQueryResponse', false)) {
                            verbose = false;
                        }
                    }
                    if (verbose) {
                        const now = Date.now();
                        const firstStart = as.Int(await Memory.getLocal('client.firstStart'));
                        const startCount = as.Int(await Memory.getLocal('client.startCount'));
                        const userId = as.String(await Memory.getLocal(Utils.localStorageKey_Id()));
                        const xmppStats = this.xmppManager.getStats();
                        const backpack = Utils.isBackpackEnabled() ? this.backpack : null;
                        const itemCount = backpack?.getItemCount() ?? -1;
                        const rezzedItemCount = backpack?.getRezzedItemCount() ?? -1;
                        let points = -1
                        const pointsItem = backpack?.getPointsItem() ?? null;
                        if (pointsItem) { points = as.Int(pointsItem[Pid.PointsTotal], -1); }

                        queryResponse.c('Variant').t(Client.getVariant());
                        queryResponse.c('Language').t(navigator.language);
                        queryResponse.c('IsDevelopment').t(as.String(Environment.isDevelopment()));
                        queryResponse.c('Id').t(userId);
                        queryResponse.c('SecSinceFirstStart').t(as.String(Math.round((now - firstStart) / 1000)));
                        queryResponse.c('SecSinceStart').t(as.String(Math.round((now - this.startupTime) / 1000)));
                        queryResponse.c('SecSincePage').t(as.String(Math.round((now - this.lastReadyAssertedTime) / 1000)));
                        queryResponse.c('Startups').t(as.String(startCount));
                        queryResponse.c('ContentStartups').t(as.String(this.readyAssertedCount));
                        queryResponse.c('XmppConnects').t(as.String(xmppStats.xmppConnectCount));
                        queryResponse.c('StanzasOut').t(as.String(xmppStats.stanzasOutCount));
                        queryResponse.c('StanzasIn').t(as.String(xmppStats.stanzasInCount));
                        queryResponse.c('ItemCount').t(as.String(itemCount));
                        queryResponse.c('RezzedItemCount').t(as.String(rezzedItemCount));
                        queryResponse.c('Points').t(as.String(points));
                    }

                    if (Config.get('xmpp.versionQueryShareOs', false)) {
                        queryResponse.c('os', {}).t(navigator.userAgent);
                    }

                    this.sendStanza(response);
                }

            }
        }
    }

    // Message to all tabs

    public sendToAllTabs(message: { type: string, [p: string]: any })
    {
        this.tabs.getAllConnectedTabIds().forEach(tabId => this.sendToTab(tabId, message));
    }

    public sendToAllTabsExcept(exceptTabId: number, message: { type: string, [p: string]: any })
    {
        this.tabs.getAllConnectedTabIds().filter(tabId => tabId !== exceptTabId).forEach(tabId => this.sendToTab(tabId, message));
    }

    public sendToTab(tabId: number, message: { type: string, [p: string]: any }): void
    {
        this.contentCommunicator.sendRequest(tabId, message).then(response => {
            if (!response.ok && (<BackgroundErrorResponse>response).status !== 'uninitialized') {
                const msg = `BackgroundApp.sendToTab: Request to tab ${tabId} failed!`
                log.info(msg, { message, response });
            }
        });
    }

    public sendToTabsForRoom(room: string, message: { type: string, [p: string]: any }): void
    {
        this.getRoomJid2TabIds(room).forEach(tabId => this.sendToTab(tabId, message));
    }

    // Heartbeat from content

    private maintain(): void
    {
        if (Utils.logChannel('pingBackground', true)) {
            log.info('BackgroundApp.maintain', { isReady: this.isReady });
        }
        this.themeManager.maintain()
        this.popupManager.maintain()
        this.configUpdater.maintain() // Required to detect XMPP server change.
        this.backpack.maintain(Utils.isBackpackEnabled());
        this.itemAutorezzer.maintain()
        this.friendshipProposalManager.maintain()
        this.websocketManager.maintain()
        this.xmppManager.maintain()
        this.instantMessageManager.maintain()
    }

    //

    public handle_userSettingsChanged(): BackgroundResponse
    {
        log.debug('BackgroundApp.handle_userSettingsChanged');
        (async () => {

            // Restart background if user ID or token changed:
            const oldUserId = this.userId;
            const oldUserToken = this.userToken;
            await this.assertThatThereIsAUserId();
            await this.assertThatThereIsAUserToken();
            if (oldUserId !== this.userId || oldUserToken !== this.userToken) {
                log.info('BackgroundApp.handle_userSettingsChanged: User credentials changed. Restarting.');
                this.stop();
                this.init();
                await this.start();
                return;
            }

            await Client.initDevConfig();
            this.onConfigUpdated();
        })().catch(error => log.info('BackgroundApp.handle_userSettingsChanged', error));
        return new BackgroundSuccessResponse();
    }

    private handle_clientNotification(tabId: number, target: string, data: any): BackgroundResponse
    {
        if (target === 'currentTab') {
            this.sendToTab(tabId, { type: ContentMessage.type_clientNotification, data });
        } else if (target === 'notCurrentTab') {
            this.sendToAllTabsExcept(tabId, { type: ContentMessage.type_clientNotification, data });
            // } else if (target === 'activeTab') {
        } else {
            this.sendToAllTabs({ type: ContentMessage.type_clientNotification, data });
        }
        return new BackgroundSuccessResponse();
    }

    private async submitPoints()
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

        if (!Utils.isBackpackEnabled() || !Config.get('points.enabled', false)) {
            return;
        }
        let itemId = this.backpack.getPointsItem()?.[Pid.Id] ?? null;
        if (is.nil(itemId)) {
            return;
        }
        try {
            const result = await this.backpack.executeItemAction(itemId, 'Points.ChannelValues', args, [itemId], true);
            const autoClaimed = as.Bool(result[Pid.AutoClaimed], false);
            if (autoClaimed) {
                this.showToastInAllTabs(
                    'You Got Activity Points',
                    'Your activity points have been claimed automatically',
                    'PointsAutoClaimed',
                    WeblinClientApi.ClientNotificationRequest.iconType_notice,
                    [],
                );
            }
            const showClaimReminder = as.Bool(result[Pid.ShowClaimReminder], false);
            if (showClaimReminder) {
                this.showToastInAllTabs(
                    'You Can Claim Activity Points',
                    'Activity points can be claimed',
                    'PointsClaimReminder',
                    WeblinClientApi.ClientNotificationRequest.iconType_notice,
                    [{ text: 'Open backpack', 'href': 'client:toggleBackpack' }],
                );
            }
        } catch (error) {
            log.info('BackgroundApp.submitPoints', error);
        }
    }

    public showToastInAllTabs(title: string, text: string, type: string, iconType: string, links: any): void
    {
        let data = new WeblinClientApi.ClientNotificationRequest(WeblinClientApi.ClientNotificationRequest.type, '');
        data.title = title;
        data.text = text;
        data.type = type;
        data.iconType = iconType;
        data.links = links;
        this.sendToAllTabs({ type: ContentMessage.type_clientNotification, data });
    }

    private async handle_test(): Promise<BackgroundResponse>
    {
        return new BackgroundSuccessResponse();
    }
}
