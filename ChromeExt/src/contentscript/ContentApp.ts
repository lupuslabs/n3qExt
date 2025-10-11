import log = require('loglevel')
import * as $ from 'jquery';
import * as jid from '@xmpp/jid';
import * as ltx from 'ltx';
import { as } from '../lib/as';
import { is } from '../lib/is';
import { AppWithDom } from '../lib/App'
import { ErrorWithData, Utils } from '../lib/Utils';
import {
    BackgroundErrorResponse,
    BackgroundMessage,
    BackgroundRequest, BackgroundResponse,
    TabRoomPresenceData,
    TabStats
} from '../lib/BackgroundMessage';
import { Panic } from '../lib/Panic';
import { Config } from '../lib/Config';
import { Memory } from '../lib/Memory';
import { Logger, LoglevelLogger } from '../lib/Logger'
import { AvatarGallery } from '../lib/AvatarGallery';
import { Translator, TranslationOpts } from '../lib/Translator';
import { Browser } from '../lib/Browser';
import {
    BackpackUpdateData,
    ContentMessage,
    ContentOpenInstantMessagesWindowMessage,
    ContentSetGuiModeMessage,
    ContentOpenBackpackItemInfo,
} from '../lib/ContentMessage';
import { Environment } from '../lib/Environment';
import { ItemProperties, Pid } from '../lib/ItemProperties';
import { BackpackUpdateEventData, OwnItemRepository } from './OwnItemRepository'
import { WeblinClientApi } from '../lib/WeblinClientApi';
import { PropertyStorage } from './PropertyStorage';
import { Room } from './Room';
import { VpiMappingResult, VpiResolver } from './VpiResolver';
import { SettingsWindow } from './SettingsWindow';
import { XmppWindow } from './XmppWindow';
import { ChangesWindow } from './ChangesWindow';
import { BackpackWindow } from './BackpackWindow';
import { PersonsWindow } from './PersonsWindow'
import { ItemExceptionToast, SimpleToast, Toast } from './Toast';
import { IframeApi } from './IframeApi';
import { ItemFrameContextFactory } from '../lib/ItemFrameContextFactory';
import { RandomNames } from '../lib/RandomNames';
import { Participant } from './Participant';
import { SimpleItemTransferController } from './SimpleItemTransferController';
import { ItemException } from '../lib/ItemException';
import { Entity } from './Entity';
import { Avatar } from './Avatar';
import { DomUtils } from '../lib/DomUtils';
import { DebugUtils } from './DebugUtils';
import { Client } from '../lib/Client';
import { WeblinClientPageApi } from '../lib/WeblinClientPageApi';
import { ChatUtils } from '../lib/ChatUtils';
import { ViewportEventDispatcher } from '../lib/ViewportEventDispatcher'
import { ContentToBackgroundCommunicator, ContentRequestHandler } from '../lib/ContentToBackgroundCommunicator'
import { BackgroundMessageUrlFetcher, UrlFetcher } from '../lib/UrlFetcher'
import { BadgesController } from './BadgesController'
import { PointerEventData } from '../lib/PointerEventData'
import { ContentPersonManager } from './ContentPersonManager'
import { ItemOverlays } from './ItemOverlays'
import { TabContentData } from './TabContentData'
import { ContentInstantMessageManager } from './ContentInstantMessageManager'
import { ContentThemeManager } from './ContentThemeManager'
import { ContentUiHelper } from './ContentUiHelper'
import { ContentAppDisplay } from './ContentAppDisplay'
import { ContentAppWindows } from './ContentAppWindows'
import { BackpackItemInfo } from './BackpackItemInfo'

export class ContentAppNotification
{
    static type_onTabChangeStay: string = 'onTabChangeStay';
    static type_onTabChangeLeave: string = 'onTabChangeLeave';
    static type_stopped: string = 'stopped';
    static type_restart: string = 'restart';
}

interface ContentAppNotificationCallback { (msg: any): void }
interface StanzaResponseHandler { (stanza: ltx.Element): void }

export type WindowStyle = 'window' | 'popup' | 'overlay';

export type ContentAppParams = {
    nickname?: string,
    avatar?: string,
    pageUrl?: string,
    x?: number,
    styleUrl?: string,
    startupRequests?: ReadonlyArray<BackgroundRequest>,
};

export class ContentApp extends AppWithDom
{
    private readonly backgroundCommunicator: ContentToBackgroundCommunicator;
    public readonly tabContentData: TabContentData;
    public readonly urlFetcher: UrlFetcher;
    private inCriticalErrorHandler: boolean = false;
    private isStopped: boolean = false;
    public readonly debugUtils: DebugUtils;
    public readonly logger: Logger = new LoglevelLogger('', '');
    public readonly uiHelper: ContentUiHelper;
    public readonly viewportEventDispatcher: ViewportEventDispatcher;
    public readonly display: ContentAppDisplay;
    public readonly windows: ContentAppWindows;
    public readonly themeManager: ContentThemeManager;
    public readonly itemFrameContexts: ItemFrameContextFactory;
    private dropzoneELem: null|HTMLElement = null;
    private isGuiEnabled: boolean = false;
    private isExclusiveWindowPopup: boolean = false;
    private exclusiveWindowId: null|string = null;
    private userId: string = '';
    private userName: string = '';
    private pageUrl: string;
    private presetPageUrl: string;
    private roomEnabled: boolean = true;
    private roomJid: string = '';
    private room: Room|null;
    private readonly propertyStorage: PropertyStorage = new PropertyStorage();
    private language = 'en-US';
    private babelfish: Translator;
    private vpi: VpiResolver;
    private xmppWindow: XmppWindow;
    private backpackWindow: null|BackpackWindow = null;
    private personsWindow: null|PersonsWindow = null;
    private simpleItemTransferController: undefined | SimpleItemTransferController;
    private settingsWindow: SettingsWindow;
    private stanzasResponses: { [stanzaId: string]: StanzaResponseHandler } = {};
    public readonly iframeApi: IframeApi;
    private readonly statusToPageSender: WeblinClientPageApi.ClientStatusToPageSender;
    private avatarGallery: AvatarGallery;
    private readonly toasts: Set<Toast> = new Set();
    private readonly itemDragTransparentCssClasses: Readonly<string[]> = ['backpack-item', 'badge', 'icon-wrap'];
    public readonly ownItems: OwnItemRepository
    private readonly itemOverlays: ItemOverlays
    public readonly personManager: ContentPersonManager;
    public readonly instantMessageManager: ContentInstantMessageManager;

    // private stayHereIsChecked: boolean = false;
    private backpackIsOpen: boolean = false;
    private personsIsOpen: boolean = false;
    private vidconfIsOpen: boolean = false;
    private chatIsOpen: boolean = false;
    private countRezzedItems: number = 0;

    // Getter

    public getPropertyStorage(): PropertyStorage { return this.propertyStorage; }
    public getShadowDomRoot(): ShadowRoot { return this.display.getShadowDomRoot(); }
    public getDisplay(): HTMLElement { return this.display.getDisplay(); }
    public getIsExclusiveWindowPopup(): boolean { return this.isExclusiveWindowPopup; }
    public setExclusiveWindowId(windowId: string): boolean
    {
        if (is.string(this.exclusiveWindowId)) {
            return false;
        }
        this.exclusiveWindowId = windowId;
        return true;
    }
    public getUserId(): string { return this.userId; }
    public getUserName(): string { return this.userName; }
    public getRoom(): Room|null { return this.room; }
    public getLanguage(): string { return this.language; }

    public getMyParticipant(): undefined | Participant { return this.room?.getMyParticipant(); }
    public getMyBadgesDisplay(): null|BadgesController { return this.room?.getMyParticipant()?.getBadgesDisplay() ?? null; }

    public getItemDragTransparentCssClasses(): Readonly<string[]> { return this.itemDragTransparentCssClasses; }
    public getItemOverlays(): ItemOverlays { return this.itemOverlays; }
    public getBackpackWindow(): null|BackpackWindow { return this.backpackWindow; }

    public getAvatarGallery(): AvatarGallery { return this.avatarGallery; }

    /**
     * null before in a room and receiving first presence for local participant.
     */
    public getSimpleItemTransferController(): undefined | SimpleItemTransferController
    {
        if (is.nil(this.simpleItemTransferController)
            && !is.nil(this.getMyParticipant())) {
            this.simpleItemTransferController
                = new SimpleItemTransferController(this);
        }
        return this.simpleItemTransferController;
    }

    constructor(
        appendToMe: HTMLElement,
        private messageHandler: ContentAppNotificationCallback,
        contentCommunicatorFactory: (requestHandler: ContentRequestHandler) => ContentToBackgroundCommunicator,
    ) {
        super();
        this.tabContentData = new TabContentData(this);
        this.debugUtils = new DebugUtils(this);
        this.statusToPageSender = new WeblinClientPageApi.ClientStatusToPageSender(this);
        this.ownItems = new OwnItemRepository(this);
        this.uiHelper = new ContentUiHelper(this);
        this.display = new ContentAppDisplay(this, appendToMe);
        this.windows = new ContentAppWindows(this);
        this.themeManager = new ContentThemeManager(this);
        this.viewportEventDispatcher = new ViewportEventDispatcher(this);
        const requestHandler = request => this.onBackgroundRequest(request)
        this.backgroundCommunicator = contentCommunicatorFactory(requestHandler);
        this.urlFetcher = new BackgroundMessageUrlFetcher()
        this.itemOverlays = new ItemOverlays(this)
        this.personManager = new ContentPersonManager(this);
        this.instantMessageManager = new ContentInstantMessageManager(this);
        this.instantMessageManager.privateVidchatWindowOpenListeners.addListener(() => this.evaluateStayOnTabChange())
        this.instantMessageManager.privateVidchatWindowCloseListeners.addListener(() => this.evaluateStayOnTabChange())
        this.iframeApi = new IframeApi(this);
        this.itemFrameContexts = new ItemFrameContextFactory();
    }

    async start(params: ContentAppParams)
    {
        if (params && params.nickname) { await Memory.setLocal(Utils.localStorageKey_Nickname(), params.nickname); }
        if (params && params.avatar) { await Memory.setLocal(Utils.localStorageKey_Avatar(), params.avatar); }
        if (params && params.pageUrl) { this.presetPageUrl = params.pageUrl; }
        if (params && params.x) { await Memory.setLocal(Utils.localStorageKey_X(), params.x); }

        if (this.isStopped) {
            log.debug('ContentApp.start: Stopped while starting.');
            return;
        }
        BackgroundMessage.backgroundCommunicator = this.backgroundCommunicator;

        let tabContentData: [string,unknown][];
        try {
            const result = await BackgroundMessage.waitReady();
            tabContentData = result.tabContentData
        } catch (error) {
            this.onCriticalError(error);
            return;
        }

        const userId = await Memory.getLocal(Utils.localStorageKey_Id());
        if (!is.nonEmptyString(userId)) {
            this.onCriticalError(new Error('No user ID!'));
            return;
        }
        this.userId = userId;
        this.itemFrameContexts.setUserId(userId);
        {
            const userToken = as.String(await Memory.getLocal(Utils.localStorageKey_Token()));
            this.itemFrameContexts.setUserToken(userToken);
        }

        try {
            const config = await BackgroundMessage.getConfigTree(Config.onlineConfigName);
            Config.setOnlineTree(config);
        } catch (error) {
            this.onCriticalError(error);
            return;
        }

        try {
            const config = await BackgroundMessage.getConfigTree(Config.devConfigName);
            Config.setDevTree(config);
        } catch (error) {
            log.debug(error.message);
        }

        if (Utils.logChannel('contentStart', false)) {
            log.debug('ContentApp.start', 'static', Config.getStaticTree());
            log.debug('ContentApp.start', 'online', Config.getOnlineTree());
            log.debug('ContentApp.start', 'dev', Config.getDevTree());
        }

        Environment.NODE_ENV = Config.get('environment.NODE_ENV', null);

        const pageUrl = Browser.getCurrentPageUrl();
        if (this.isPageDisabledByUrlHash(pageUrl)) {
            log.info('ContentApp.start', 'disabled by URL hash');
            return;
        }
        if (this.isPageDisabledByDomainSuffix(pageUrl)) {
            log.info('ContentApp.start', 'disabled by domain suffix');
            return;
        }
        if (await this.isPageDisabledByBackgroundCheck(pageUrl)) {
            log.info('ContentApp.start', 'disabled by background check');
            return;
        }

        await Utils.sleep(as.Float(Config.get('vp.deferPageEnterSec', 1)) * 1000);
        if (this.isStopped) {
            log.debug('ContentApp.start: Stopped while starting.');
            this.stop();
            return;
        }

        this.language = Client.getUserLanguage()
        this.itemFrameContexts.setLanguageId(this.language)
        const translationTable = Config.get('i18n.translations', {})[this.language];
        const serviceUrl = Config.get('i18n.serviceUrl', '')
        this.babelfish = new Translator(translationTable, this.language, serviceUrl, this.urlFetcher);

        this.vpi = new VpiResolver(this.urlFetcher, Config);
        this.vpi.language = Translator.getShortLanguageCode(this.language);

        this.avatarGallery = new AvatarGallery();

        this.userName = await this.assertUserNickname();
        await this.assertUserAvatar();
        await this.assertSavedPosition();
        if (Panic.isOn) {
            this.stop();
            return;
        }

        try {
            await this.display.initDisplay(params);
            this.windows.init();
        } catch (error) {
            this.onCriticalError(error);
            return;
        }
        if (this.isStopped) {
            log.debug('ContentApp.start: Stopped by ContentAppDisplay.initDisplay while starting.');
            this.stop();
            return;
        }
        this.handle_extensionIsGuiEnabledChanged(this.isGuiEnabled);

        const startupRequests: ReadonlyArray<BackgroundRequest> = params.startupRequests ?? [];
        startupRequests.forEach(request => this.onBackgroundRequest(request).catch(error => this.onError(error)));

        this.tabContentData.changeListeners.addListener(() => this.onTabStatsChanged());
        this.tabContentData.initWithDataFromBackground(tabContentData);
        this.sendTabStatsToBackground(); // sendStateToBackground messages from background have been ignored till now.
        if (Utils.isBackpackEnabled()) {
            BackgroundMessage.requestBackpackState().catch(ex => this.onError(ex));
        }

        // this.enterPage();
        await this.checkPageUrlChanged();

        this.evaluateStayOnTabChange();
        if (this.roomJid !== '') {
            // this.stayHereIsChecked = as.Bool(await Memory.getLocal(Utils.localStorageKey_StayOnTabChange(this.roomJid)));
            this.backpackIsOpen = as.Bool(await Memory.getLocal(Utils.localStorageKey_BackpackIsOpen(this.roomJid)));
            this.personsIsOpen = as.Bool(await Memory.getLocal(Utils.localStorageKey_PersonsIsOpen(this.roomJid)));
            this.chatIsOpen = as.Bool(await Memory.getLocal(Utils.localStorageKey_ChatIsOpen(this.roomJid)));
            this.vidconfIsOpen = as.Bool(await Memory.getLocal(Utils.localStorageKey_VidconfIsOpen(this.roomJid)));

            this.reshowBackpackWindow();
            this.reshowPersonsWindow();
            this.reshowChatWindow();
            // this.reshowVidconfWindow(); // must be after enter
        }

        this.startCheckPageUrl();
        this.iframeApi.start();

        this.debugUtils.onAppStartComplete();
        this.statusToPageSender.sendClientActive();

        if (Panic.isOn) {
            this.stop();
            return;
        }
        if (this.isStopped) {
            log.debug('ContentApp.start: Stopped while starting.');
            this.stop();
        }
    }

    private async detectUserChange(): Promise<void>
    {
        const oldUserId = this.userId;
        if (oldUserId.length === 0) {
            return;
        }
        const userId = await Memory.getLocal(Utils.localStorageKey_Id());
        if (oldUserId === userId) {
            return;
        }
        log.info('ContentApp.handle_configChanged: User changed. Restarting.');
        this.messageHandler?.({ 'type': ContentAppNotification.type_restart });
    }

    private isPageDisabledByUrlHash(pageUrl: string): boolean
    {
        const parsedUrl = new URL(pageUrl);
        if (parsedUrl.hash.search('#n3qdisable') >= 0) {
            return true;
        }
        return false;
    }

    private isPageDisabledByDomainSuffix(pageUrl: string): boolean
    {
        const parsedUrl = new URL(pageUrl);
        const ignoredDomains: Array<string> = Config.get('vp.ignoredDomainSuffixes', []);
        for (const ignoredDomain of ignoredDomains) {
            if (parsedUrl.host.endsWith(ignoredDomain)) {
                return true;
            }
        }
        return false;
    }

    private async isPageDisabledByBackgroundCheck(pageUrl: string): Promise<boolean>
    {
        const isDisabled = await BackgroundMessage.isTabDisabled(pageUrl).catch(errorResponse => {
            this.onError(errorResponse);
            return true;
        });
        return isDisabled;
    }

    sleep(statusMessage: string)
    {
        log.debug('ContentApp.sleep');
        this.room?.sleep(statusMessage);
    }

    wakeup()
    {
        log.debug('ContentApp.wakeup');
        this.room?.wakeup();
    }

    stop()
    {
        this.isStopped = true;
        this.statusToPageSender.sendClientInactive();
        this.viewportEventDispatcher.stop();
        this.instantMessageManager.stop();
        this.iframeApi?.stop();
        this.stopCheckPageUrl();
        this.leaveRoom();
        this.themeManager.stop();
        this.windows.stop();
        this.display.stop();
        BackgroundMessage.signalContentAppStopToBackground()
            .catch(error => this.onError(error));
    }

    private sendTabStatsTimeoutHandle?: number = null;

    private onTabStatsChanged(): void
    {
        if (is.nil(this.sendTabStatsTimeoutHandle)) {
            const delaySecs = 1000 * as.Float(Config.get('system.sendTabStatsToBackgroundPageDelaySec'), 0.100);
            this.sendTabStatsTimeoutHandle = window.setTimeout(() => this.sendTabStatsToBackground(), delaySecs);
        }
    }

    public onToastVisible(toast: Toast): void
    {
        this.toasts.add(toast);
        this.onTabStatsChanged();
    }

    public onToastInvisible(toast: Toast): void
    {
        this.toasts.delete(toast);
        this.onTabStatsChanged();
    }

    private sendTabStatsToBackground(): void
    {
        this.sendTabStatsTimeoutHandle = null;
        if (this.isStopped || !this.tabContentData.getIsInitialized()) {
            return; // Stopped or not fully started up yet.
        }
        const isInRoom = this.room?.iAmAlreadyHere() ?? false;
        const roomUrl = this.room?.getDestination() ?? null;
        const roomJid = this.room?.getJid() ?? null;
        const participantIds = this.room?.getParticipantIds() ?? [];
        const participantCount = Math.max(0, participantIds.length - 1);
        const maxChatAgeSecs = as.Float(Config.get('system.tabStatsRecentChatAgeSecs'), 1.0);
        const hasNewGroupChat = (this.room?.getChatWindow().getUnreadUserMessageCount(maxChatAgeSecs) ?? 0) !== 0;
        const hasNewPrivateChat = this.instantMessageManager.getUnreadUserMessageCount(maxChatAgeSecs) !== 0;
        const toastCount = this.toasts.size;
        const stats: TabStats = { isInRoom, roomUrl, roomJid, participantCount, hasNewGroupChat, hasNewPrivateChat, toastCount };
        const tabContentData = this.tabContentData.getAll();
        BackgroundMessage.sendTabStatsToBackground(stats, tabContentData).catch(error => this.onError(error));
    }

    test(): void
    {
        // let frame = <HTMLIFrameElement>$('<iframe class="n3q-effect" style="position: fixed; width:100%; height: 100%; background-color: #ff0000; opacity: 20%;" src="https://localhost:5100/ItemFrame/Test" frameborder="0"></iframe>').get(0);
        // this.display.append(frame);
        this.getMyParticipant()?.showEffect('pulse');
    }

    navigate(url: string, target: string = '_top')
    {
        window.location.href = url;
    }

    playSound(fluteSound: any)
    {
    }

    getMyParticipantELem(): HTMLElement
    {
        return this.getMyParticipant()?.getElem();
    }

    getEntityByElem(elem: Element | null): Entity | null
    {
        if (!(elem instanceof HTMLElement)) {
            return null;
        }
        const entityId = Avatar.getEntityIdByAvatarElem(elem);
        if (entityId) {
            return this.getRoom()?.getParticipant(entityId) ?? this.getRoom()?.getItem(entityId);
        }
        return null;
    }

    reshowBackpackWindow(): void
    {
        if (this.backpackIsOpen) { this.showBackpackWindow(); }
    }
    showBackpackWindow(aboveElem?: HTMLElement): void
    {
        aboveElem = aboveElem ?? this.getMyParticipantELem();
        if (this.backpackWindow) {
            this.backpackWindow.close();
        } else if (Utils.isBackpackEnabled()) {
            this.setBackpackIsOpen(true);
            this.backpackWindow = new BackpackWindow(this);
            this.backpackWindow.show({
                'above': aboveElem,
                onClose: () => { this.backpackWindow = null; this.setBackpackIsOpen(false); }
            });
        }
    }

    private reshowPersonsWindow(): void
    {
        if (this.personsIsOpen) { this.setPersonsWindowOpen(true); }
    }
    public setPersonsWindowOpen(open: boolean): void
    {
        if (open && Utils.isBackpackEnabled()) {
            if (!this.personsWindow) {
                this.setPersonsIsOpen(true);
                this.personsWindow = new PersonsWindow(this);
                this.personsWindow.show({
                    'above': this.getMyParticipantELem(),
                    onClose: () => { this.personsWindow = null; this.setPersonsIsOpen(false); }
                });
            }
        } else {
            this.personsWindow?.close();
        }
    }

    reshowVidconfWindow(): void
    {
        if (this.vidconfIsOpen) { this.showVidconfWindow(); } // must be after enter
    }
    showVidconfWindow(aboveElem?: HTMLElement): void
    {
        const aboveElemM = aboveElem ?? this.getMyParticipantELem();
        const participant: Participant = this.getMyParticipant();
        if (participant) {
            const displayName = participant.getDisplayName();
            this.room.showVideoConference(aboveElemM, displayName);
        }
    }

    reshowChatWindow(): void
    {
        if (this.chatIsOpen) { this.room.showChatWindow(); }
    }
    toggleChatWindow(aboveElem?: HTMLElement): void
    {
        aboveElem = aboveElem ?? this.getMyParticipantELem();
        this.room.toggleChatWindow(aboveElem);
    }

    toggleBadgesEditMode(): void
    {
        const participant: Participant = this.getMyParticipant();
        if (participant) {
            const badges = participant.getBadgesDisplay();
            if (is.nil(badges)) {
                return;
            }
            if (badges.getIsInEditMode()) {
                badges.exitEditMode();
            } else {
                badges.enterEditMode();
            }
        }
    }

    showXmppWindow()
    {
        this.xmppWindow = new XmppWindow(this);
        this.xmppWindow.show({ onClose: () => { this.xmppWindow = null; } });
    }

    showChangesWindow()
    {
        new ChangesWindow(this).show({});
    }

    showSettings(aboveElem?: HTMLElement)
    {
        if (!this.settingsWindow) {
            aboveElem = aboveElem ?? this.getMyParticipantELem();
            this.settingsWindow = new SettingsWindow(this);
            this.settingsWindow.show({ 'above': aboveElem, onClose: () => { this.settingsWindow = null; } });
        }
    }

    // Stay on tab change

    setBackpackIsOpen(value: boolean): void
    {
        this.backpackIsOpen = value;
        this.evaluateStayOnTabChange();
        if (value) {
            /* await */ Memory.setLocal(Utils.localStorageKey_BackpackIsOpen(this.roomJid), value);
        } else {
            /* await */ Memory.deleteLocal(Utils.localStorageKey_BackpackIsOpen(this.roomJid));
        }
    }

    private setPersonsIsOpen(value: boolean): void
    {
        this.personsIsOpen = value;
        this.evaluateStayOnTabChange();
        if (value) {
            /* await */ Memory.setLocal(Utils.localStorageKey_PersonsIsOpen(this.roomJid), value);
        } else {
            /* await */ Memory.deleteLocal(Utils.localStorageKey_PersonsIsOpen(this.roomJid));
        }
    }

    setVidconfIsOpen(value: boolean): void
    {
        this.vidconfIsOpen = value;
        this.evaluateStayOnTabChange();
        if (value) {
            /* await */ Memory.setLocal(Utils.localStorageKey_VidconfIsOpen(this.roomJid), value);
        } else {
            /* await */ Memory.deleteLocal(Utils.localStorageKey_VidconfIsOpen(this.roomJid));
        }
    }

    setChatIsOpen(value: boolean): void
    {
        this.chatIsOpen = value; this.evaluateStayOnTabChange();
        if (value) {
            /* await */ Memory.setLocal(Utils.localStorageKey_ChatIsOpen(this.roomJid), value);
        } else {
            /* await */ Memory.deleteLocal(Utils.localStorageKey_ChatIsOpen(this.roomJid));
        }
    }

    // getStayHereIsChecked(): boolean
    // {
    //     return this.stayHereIsChecked;
    // }

    // toggleStayHereIsChecked(): void
    // {
    //     this.stayHereIsChecked = !this.stayHereIsChecked;

    //     if (this.stayHereIsChecked) {
    //         /* await */ Memory.setLocal(Utils.localStorageKey_StayOnTabChange(this.roomJid), this.stayHereIsChecked);
    //     } else {
    //         /* await */ Memory.deleteLocal(Utils.localStorageKey_StayOnTabChange(this.roomJid));
    //     }

    //     this.evaluateStayOnTabChange();
    // }

    incrementRezzedItems(name: string): void
    {
        this.countRezzedItems++;
        log.debug('ContentApp.incrementRezzedItems', name, this.countRezzedItems);
        this.evaluateStayOnTabChange();
    }
    decrementRezzedItems(name: string): void
    {
        this.countRezzedItems--;
        log.debug('ContentApp.decrementRezzedItems', name, this.countRezzedItems);
        if (this.countRezzedItems < 0) { this.countRezzedItems = 0; }
        this.evaluateStayOnTabChange();
    }

    private evaluateStayOnTabChange(): void
    {
        const stay = false
            || this.isExclusiveWindowPopup // Don't stop app when in popup mode.
            || as.Bool(Config.get('room.stayOnTabChange'))
            || this.backpackIsOpen
            || this.personsIsOpen
            || this.vidconfIsOpen
            || this.chatIsOpen
            // || this.stayHereIsChecked
            || this.instantMessageManager.isAnyPrivateVidconfWindowOpen()
            || this.countRezzedItems > 0
            ;
        if (stay) {
            this.messageHandler({ 'type': ContentAppNotification.type_onTabChangeStay });
        } else {
            this.messageHandler({ 'type': ContentAppNotification.type_onTabChangeLeave });
        }
    }

    // IPC

    private async onBackgroundRequest(message: BackgroundRequest): Promise<BackgroundResponse> {
        if (this.isStopped) {
            return BackgroundErrorResponse.ofError('ContentApp has been stopped.');
        }
        try {
            switch (message.type) {

                case ContentMessage.type_sendStateToBackground: {
                    this.detectUserChange().catch(error => log.info(error));
                    this.handle_sendStateToBackground();
                } break;

                case ContentMessage.type_configChanged: {
                    this.detectUserChange().catch(error => log.info(error));
                    this.handle_configChanged();
                } break;

                case ContentMessage.type_themes: {
                    this.themeManager.onThemesFromBackground(message);
                } break;

                case ContentMessage.type_recvStanza: {
                    this.handle_recvStanza(message.stanza);
                } break;

                case ContentMessage.type_xmppIo: {
                    if (this.xmppWindow) {
                        const label = message.direction === 'in' ? '_IN_' : 'OUT';
                        const stanza: ltx.Element = Utils.jsObject2xmlObject(message.stanza);
                        const stanzaText = stanza.toString();
                        this.xmppWindow.showLine(label, stanzaText);
                    }
                } break;

                case ContentMessage.type_clientNotification: {
                    this.handle_clientNotification(message.data);
                } break;

                case ContentMessage.type_extensionIsGuiEnabledChanged: {
                    this.handle_extensionIsGuiEnabledChanged(message?.data?.isGuiEnabled);
                } break;

                case ContentMessage.type_onBackpackUpdate: {
                    const { itemsHide, itemsShowOrSet } = <BackpackUpdateData> message.data;
                    this.onBackpackUpdate(itemsHide, itemsShowOrSet)
                } break;

                case ContentMessage.type_chatMessagePersisted: {
                    const chatChannel: ChatUtils.ChatChannel = message.data.chatChannel;
                    const chatMessage: ChatUtils.ChatMessage = message.data.chatMessage;
                    this.getRoom()?.onChatMessagePersisted(chatChannel, chatMessage);
                    this.instantMessageManager.onChatMessagePersisted(chatChannel, chatMessage);
                } break;
                case ContentMessage.type_chatHistoryDeleted: {
                    const deletions: {chatChannel: ChatUtils.ChatChannel, olderThanTime: string}[] = message.data.deletions;
                    this.getRoom()?.onChatHistoryDeleted(deletions);
                    this.instantMessageManager.onChatHistoryDeleted(deletions);
                } break;
                case ContentMessage.type_unreadChatChannels: {
                    const unreadChannels: ChatUtils.ChatChannel[] = message.data.unreadChatChannels;
                    this.instantMessageManager.onUnreadChatChannels(unreadChannels);
                } break;

                case ContentMessage.type_friendshipProposalsState: {
                    this.personManager.onStateFromBackground(message.data);
                } break;

                case ContentMessage.type_setGuiMode: {
                    this.handle_setGuiMode(<ContentSetGuiModeMessage> message);
                } break;
                case ContentMessage.type_openInstantMessagesWindow: {
                    const otherPerson = (<ContentOpenInstantMessagesWindowMessage> message).otherPerson;
                    this.instantMessageManager.openInstantMessagesWindow(otherPerson);
                } break;
                case ContentMessage.type_openPersonsWindow: {
                    this.setPersonsWindowOpen(true);
                } break;
                case ContentMessage.type_openBackpackItemInfo: {
                    const {itemId, withDebugInfo} = <ContentOpenBackpackItemInfo> message
                    const backpackUpdateHandler = (_: BackpackUpdateEventData) => {
                        this.ownItems.backpackUpdateListeners.removeListener(backpackUpdateHandler)
                        const itemInfo = new BackpackItemInfo(this, itemId, withDebugInfo, () => window.close())
                        itemInfo.show({top: 0, left: 0})
                    }
                    this.ownItems.backpackUpdateListeners.addListener(backpackUpdateHandler)
                } break;
            }
        } catch (error) {
            this.onError(error)
            return BackgroundErrorResponse.ofError(error);
        }
        return { ok: true };
    }

    private onBackpackUpdate(itemsHide: ReadonlyArray<Readonly<ItemProperties>>, itemsShowOrSet: ReadonlyArray<Readonly<ItemProperties>>): void
    {
        this.ownItems.onBackpackUpdate(itemsHide, itemsShowOrSet)
    }

    handle_sendStateToBackground(): void
    {
        this.room?.sendStateToBackground();
        this.sendTabStatsToBackground();
    }

    handle_configChanged(): void
    { (async () => {
        await BackgroundMessage.getConfigTree(Config.onlineConfigName)
            .then(config => Config.setOnlineTree(config))
            .catch (error => log.debug(error.message));
        await BackgroundMessage.getConfigTree(Config.devConfigName)
            .then(config => Config.setDevTree(config))
            .catch (error => log.debug(error.message));
        await this.assertUserNickname()
            .then(name => { this.userName = name; })
            .catch (error => log.debug(error.message));
        this.room?.onUserSettingsChanged();
        this.instantMessageManager.onUserSettingsChanged();
    })() }

    handle_recvStanza(jsStanza: unknown): void
    {
        const stanza: ltx.Element = Utils.jsObject2xmlObject(jsStanza);
        if (Utils.logChannel('contentTraffic', false)) {
            log.debug('ContentApp.recvStanza', stanza, as.String(stanza.attrs.type, stanza.name === 'presence' ? 'available' : 'normal'), 'to=', stanza.attrs.to, 'from=', stanza.attrs.from);
        }

        switch (stanza.name) {
            case 'presence': this.onPresence(stanza); break;
            case 'message': this.onMessage(stanza); break;
            case 'iq': this.onIq(stanza); break;
        }
        this.onTabStatsChanged();
    }

    handle_clientNotification(request: WeblinClientApi.ClientNotificationRequest): any
    {
        const type = request.type;
        const title = as.String(request.title);
        const text = as.String(request.text);
        const iconType = as.String(request.iconType, WeblinClientApi.ClientNotificationRequest.defaultIcon);
        let durationSecs = as.Float(Config.get(`toast.durationSecByType.${type}`));
        if (durationSecs === 0) {
            durationSecs = as.Float(Config.get('client.notificationToastDurationSec'), 30);
        }
        const hasDontShowAgainOption = as.Bool(Config.get(`toast.hasDontShowAgainOptionByType.${type}`, true));
        const links = request.links;
        const toast = new SimpleToast(this, type, durationSecs, iconType, title, text);
        toast.setDontShow(hasDontShowAgainOption);
        if (links) {
            links.forEach(link =>
            {
                toast.actionButton(link.text, () =>
                {
                    if (link.href.startsWith('client:')) {
                        const cmd = link.href.substring('client:'.length);
                        switch (cmd) {
                            case 'toggleBackpack': {
                                this.showBackpackWindow();
                            } break;
                            case 'openSettings': {
                                this.showSettings();
                            } break;
                        }
                    } else {
                        document.location.href = link.href;
                    }
                });
            });
        }
        toast.show(() => { });
    }

    handle_extensionIsGuiEnabledChanged(isGuiEnabled: unknown): void
    {
        this.isGuiEnabled = as.Bool(isGuiEnabled, true);
        this.display.setDisplayVisible(this.isGuiEnabled);
        if (this.isGuiEnabled) {
            this.wakeup();
        } else {
            this.sleep('GuiHidden');
        }
    }

    private handle_setGuiMode(message: ContentSetGuiModeMessage): void
    {
        switch (message.mode) {
            default:
            case 'full': {
                this.roomEnabled = true;
                this.isExclusiveWindowPopup = false;
            } break;
            case 'popupWindow': {
                this.roomEnabled = false;
                this.isExclusiveWindowPopup = true;
                this.handle_extensionIsGuiEnabledChanged(true);
            } break;
        }
        if (this.roomEnabled) {
            this.startCheckPageUrl();
        } else {
            this.stopCheckPageUrl();
            this.leaveRoom();
        }
    }

    private async checkPageUrlChanged()
    {
        try {
            let pageUrl = this.presetPageUrl ?? Browser.getCurrentPageUrl();

            const strippedUrlPrefixes = Config.get('vp.strippedUrlPrefixes', []);
            const notStrippedUrlPrefixes = Config.get('vp.notStrippedUrlPrefixes', []);
            for (let i = 0; i < strippedUrlPrefixes.length; i++) {
                if (pageUrl.startsWith(strippedUrlPrefixes[i]) && !Utils.startsWith(pageUrl, notStrippedUrlPrefixes)) {
                    pageUrl = pageUrl.substring(strippedUrlPrefixes[i].length);
                    if (!pageUrl.startsWith('https://')) {
                        pageUrl = 'https://' + pageUrl;
                    }
                }
            }

            const newSignificatParts = pageUrl ? this.getSignificantUrlParts(pageUrl) : '';
            const oldSignificatParts = this.pageUrl ? this.getSignificantUrlParts(this.pageUrl) : '';
            if (newSignificatParts === oldSignificatParts) { return }

            if (Utils.logChannel('urlMapping', false)) { log.info('Page changed', this.pageUrl, ' => ', pageUrl); }
            this.pageUrl = pageUrl;

            const mappingResult = await this.vpiMap(pageUrl);
            const newRoomJid = mappingResult.roomJid;
            const newDestinationUrl = mappingResult.destinationUrl;

            if (newRoomJid === this.roomJid) {
                this.room?.setPageUrl(pageUrl);
                log.debug('ContentApp.checkPageUrlChanged', 'Same room', pageUrl, ' => ', this.roomJid);
                return;
            }

            this.leaveRoom();

            if (newRoomJid !== '') {
                this.enterRoom(newRoomJid, pageUrl, newDestinationUrl);
                if (Config.get('points.enabled', false)) {
                    BackgroundMessage.pointsActivity(Pid.PointsChannelNavigation, 1)
                        .catch(error => { log.info('ContentApp.checkPageUrlChanged', error); });
                }
            }

            this.roomJid = newRoomJid;
            if (Utils.logChannel('urlMapping', false)) { log.info('Mapped', pageUrl, ' => ', this.roomJid); }

        } catch (error) {
            log.info(error);
        }
    }

    private getSignificantUrlParts(url: string): string
    {
        const parsedUrl = new URL(url);
        return parsedUrl.host + parsedUrl.pathname + parsedUrl.search;
    }

    public async vpiMap(url: string): Promise<VpiMappingResult>
    {
        return await this.vpi.map(url);
    }

    private checkPageUrlTimer: number;
    private startCheckPageUrl(): void
    {
        this.stopCheckPageUrl();
        if (!this.roomEnabled) {
            return;
        }
        const checkPageUrlSec = as.Float(Config.get('room.checkPageUrlSec'), 5);
        this.checkPageUrlTimer = window.setTimeout(async () =>
        {
            await this.checkPageUrlChanged();
            this.checkPageUrlTimer = undefined;
            this.startCheckPageUrl();
        }, checkPageUrlSec * 1000);
    }

    private stopCheckPageUrl(): void
    {
        if (this.checkPageUrlTimer) {
            clearTimeout(this.checkPageUrlTimer);
            this.checkPageUrlTimer = undefined;
        }
    }

    public static getRoomJidFromLocationUrl(locationUrl: string): string
    {
        try {
            if (locationUrl != '') {
                const url = new URL(locationUrl);
                return url.pathname;
            }
        } catch (error) {
            log.debug('ContentApp.getRoomJidFromLocationUrl', error, 'locationUrl', locationUrl);
        }
        return '';
    }

    // async enterRoomByPageUrl(pageUrl: string): Promise<void>
    // {
    //     try {
    //         const vpi = new VpiResolver(BackgroundMessage, Config);
    //         vpi.language = Translator.getShortLanguageCode(this.babelfish.getLanguage());

    //         this.locationUrl = await vpi.map(pageUrl);
    //         log.debug('Mapped', pageUrl, ' => ', this.locationUrl);

    //         const roomJid = ContentApp.getRoomJidFromLocationUrl(this.locationUrl);
    //         this.enterRoom(roomJid, pageUrl);

    //     } catch (error) {
    //         log.info(error);
    //     }
    // }

    private async enterRoom(roomJid: string, pageUrl: string, roomDestination: string): Promise<void>
    {
        this.leaveRoom();
        if (!this.roomEnabled) {
            return;
        }

        this.room = new Room(this, roomJid, pageUrl, roomDestination);
        if (Utils.logChannel('urlMapping', false)) { log.info('ContentApp.enterRoom', roomJid); }

        await this.room.enter().catch(error => this.onError(error));
        this.handle_extensionIsGuiEnabledChanged(this.isGuiEnabled);
    }

    private leaveRoom(): void
    {
        if (this.room) {
            if (Utils.logChannel('urlMapping', false)) { log.info('ContentApp.leaveRoom', this.room.getJid()); }

            this.room.leave();
            this.room = null;
        }
    }

    private onPresence(stanza: ltx.Element): void
    {
        let isHandled = false;

        const from = jid(stanza.attrs.from);
        const roomOrUser = from.bare().toString();

        if (!isHandled) {
            if (this.room) {
                if (roomOrUser === this.room.getJid()) {
                    this.room.onPresence(stanza);
                    isHandled = true;
                }
            }
        }
    }

    onMessage(stanza: ltx.Element): void
    {
        const from = jid(stanza.attrs.from);
        const roomOrUser = from.bare().toString();

        if (roomOrUser === this.room?.getJid()) {
            this.room?.onMessage(stanza);
        }
    }

    onIq(stanza: ltx.Element): void
    {
        const id = stanza.attrs.id;
        if (id) {
            if (this.stanzasResponses[id]) {
                this.stanzasResponses[id](stanza);
                delete this.stanzasResponses[id];
            }
        }
    }

    sendStanza(
        stanza: ltx.Element,
        stanzaId: string = null,
        responseHandler: StanzaResponseHandler = null,
    ): void
    {
        if (Utils.logChannel('contentTraffic', false)) {
            const stanzaAttrsText = as.String(
                stanza.attrs.type,
                stanza.name === 'presence' ? 'available' : 'normal');
            log.debug('ContentApp.sendStanza',
                stanza, stanzaAttrsText, 'to=', stanza.attrs.to);
        }
        (async () =>
        {
            if (stanzaId && responseHandler) {
                this.stanzasResponses[stanzaId] = responseHandler;
            }
            await BackgroundMessage.sendStanza(stanza);
        })().catch(error =>
        {
            error.stanza = stanza;
            this.onCriticalError(error);
        });
    }

    sendRoomPresence(presenceData: TabRoomPresenceData): void
    {
        if (Utils.logChannel('contentTraffic', false)) {
            log.debug('ContentApp.sendPresence', presenceData);
        }
        BackgroundMessage.sendRoomPresence(presenceData).catch(error => this.onError(error));
    }

    // Error handling

    public onError(error: unknown): void
    {
        // Log to info channel only so it doesn't appear on extensions page.
        // Logging error directly lets browser apply source maps to show actual files and lines in trace.
        // Logging error as property of an anonymous object allows inspection of additional properties of error.
        log.info(error, { error });

        if (ItemException.isInstance(error)) {
            const duration = as.Float(Config.get('room.errorToastDurationSec'));
            new ItemExceptionToast(this, duration, error).show();
        }
    }

    public onCriticalError(error: Error): void
    {
        if (this.inCriticalErrorHandler) {
            return;
        }
        this.inCriticalErrorHandler = true;

        const stoppedWhileStarting = this.isStopped;
        if (stoppedWhileStarting) {
            log.debug('ContentApp.start: Stopped while starting.');
        } else {
            this.onError(error);
        }
        this.stop();
        if (!stoppedWhileStarting) {
            Panic.now();
        }

        this.inCriticalErrorHandler = false;
    }

    // Window management

    public static LayerBelowEntities = 20;
    public static LayerEntity = 30;
    public static LayerEntityContent = 31;
    public static LayerEntityTooltip = 32;
    public static LayerAboveEntities = 45;
    public static LayerPageOverlay = 46;
    public static LayerWindow = 50;
    public static LayerWindowContent = 51;
    public static LayerPopup = 60;
    public static LayerToast = 70;
    public static LayerDrag = 99;
    public static LayerEffect = 100;
    public static LayerMenu = 110;
    private static layerSize = 10 * 1000 * 1000;
    private frontIndex: { [layer: number]: number; } = {};
    toFront(elem: HTMLElement, layer: number | string)
    {
        let layerInt: number;
        if (is.string(layer)) {
            layerInt = as.Int(ContentApp[layer], ContentApp.LayerBelowEntities);
        } else {
            layerInt = as.Int(layer, ContentApp.LayerBelowEntities);
        }
        this.incrementFrontIndex(layerInt);
        const absoluteIndex = this.getFrontIndex(layerInt);
        elem.style.zIndex = '' + absoluteIndex;
        //log.debug('ContentApp.toFront', absoluteIndex, elem.className);
    }
    incrementFrontIndex(layer: number)
    {
        if (this.frontIndex[layer]) {
            this.frontIndex[layer]++;
        } else {
            this.frontIndex[layer] = 1;
        }
    }
    getFrontIndex(layer: number)
    {
        return this.frontIndex[layer] + layer * ContentApp.layerSize;
    }
    isFront(elem: HTMLElement, layer: number)
    {
        return as.Int(elem.style.zIndex) === this.getFrontIndex(layer);
    }

    public setDropzoneVisibility(isVisible: boolean, isHighlighted: boolean = false): void
    {
        if (!isVisible) {
            this.dropzoneELem?.remove()
            this.dropzoneELem = null
            return
        }
        if (is.nil(this.dropzoneELem)) {
            this.dropzoneELem = DomUtils.elemOfHtml('<div class="dropzone"></div>')
            this.getDisplay()?.append(this.dropzoneELem)
            this.toFront(this.dropzoneELem, ContentApp.LayerBelowEntities)
        }
        DomUtils.setElemClassPresent(this.dropzoneELem, 'hilite', isHighlighted)
    }

    public getIsDropTargetInDropzone(ev: PointerEventData): boolean
    {
        return ev.dropTarget?.classList.contains('dropzone') ?? false
    }

    // i18n

    translateText(key: string, defaultTextOrOptions?: null|string|TranslationOpts): string
    {
        return this.babelfish.translateText(key, defaultTextOrOptions);
    }

    translateElem(elem: HTMLElement): void
    {
        this.babelfish.translateElem(elem);
    }

    // Dont show this message again management

    localStorage_DontShowNotice_KeyPrefix: string = 'dontShowNotice.';

    async isDontShowNoticeType(type: string): Promise<boolean>
    {
        return as.Bool(await Memory.getLocal(this.localStorage_DontShowNotice_KeyPrefix + type));
    }

    async setDontShowNoticeType(type: string, value: boolean): Promise<void>
    {
        await Memory.setLocal(this.localStorage_DontShowNotice_KeyPrefix + type, value);
    }

    // my nickname

    private async assertUserNickname(): Promise<string>
    {
        try {
            let nickname = as.String(await Memory.getLocal(Utils.localStorageKey_Nickname()));
            if (nickname === '') {
                nickname = RandomNames.getRandomNickname();
                await Memory.setLocal(Utils.localStorageKey_Nickname(), nickname);
            }
            return nickname;
        } catch (error) {
            this.onCriticalError(error);
        }
    }

    public getUserNickname(): string
    {
        return this.userName;
    }

    // my avatar

    async assertUserAvatar()
    {
        try {
            await this.avatarGallery.getAvatarFromLocalMemory();
        } catch (error) {
            this.onCriticalError(error);
        }
    }

    async getUserAvatar(): Promise<string>
    {
        try {
            return (await this.avatarGallery.getAvatarFromLocalMemory()).id;
        } catch (error) {
            log.info(error);
            return '004/pinguin';
        }
    }

    // my x

    async assertSavedPosition()
    {
        try {
            let x = as.Int(await Memory.getLocal(Utils.localStorageKey_X()), -1);
            if (x < 0) {
                x = Utils.randomInt(as.Int(Config.get('room.randomEnterPosXMin', 400)), as.Int(Config.get('room.randomEnterPosXMax', 700)));
                await this.savePosition(x);
            }
        } catch (error) {
            log.info(error);
        }
    }

    async savePosition(x: number): Promise<void>
    {
        try {
            await Memory.setLocal(Utils.localStorageKey_X(), x);
        } catch (error) {
            log.info(error);
        }
    }

    async getSavedPosition(): Promise<number>
    {
        let x = 0;

        try {
            x = as.Int(await Memory.getLocal(Utils.localStorageKey_X()), -1);
        } catch (error) {
            log.info(error);
        }

        if (x <= 0) {
            x = this.getDefaultPosition(this.userName);
        }

        return x;
    }

    getDefaultPosition(key: string = null): number
    {
        let pos: number;
        let width = this.display.getDisplay()?.offsetWidth ?? null;
        if (!width) { width = 500; }
        if (key) {
            pos = Utils.pseudoRandomInt(250, width - 80, key, '', 7237);
        } else {
            pos = Utils.randomInt(250, width - 80);
        }
        return pos;
    }

    // Item helpers

    public setItemBackpackPosition(itemId: string, newX: number, newY: number): void
    {
        const item = this.ownItems.getItemById(itemId)
        if (!item) {
            return // Item got deleted
        }
        const newXStr = Math.round(newX).toString()
        const newYStr = Math.round(newY).toString()
        const oldXStr: undefined|string = item[Pid.InventoryX]
        const oldYStr: undefined|string = item[Pid.InventoryY]
        if (oldXStr === newXStr && oldYStr === newYStr) {
            return
        }

        // Simulate change locally:
        this.onBackpackUpdate([], [{
            ...item,
            [Pid.InventoryX]: newXStr,
            [Pid.InventoryY]: newYStr,
        }])

        BackgroundMessage.modifyBackpackItemProperties(
            itemId,
            {
                [Pid.InventoryX]: newXStr,
                [Pid.InventoryY]: newYStr,
            },
            [],
            { }
        ).catch(error => {
            this.onError(error)

            // Undo local change if not overwritten by concurrent change:
            const item = this.ownItems.getItemById(itemId)
            if (item && item[Pid.InventoryX] === newXStr && item[Pid.InventoryY] === newYStr) {
                this.onBackpackUpdate([], [{
                    ...item,
                    [Pid.InventoryX]: oldXStr,
                    [Pid.InventoryY]: oldYStr,
                }])
            }

        })
    }

    public rezItemInCurrentRoom(itemId: string, x: number): void
    {
        const room = this.getRoom();
        if (room) {
            this.rezItem(itemId, room.getJid(), x, room.getDestination());
        }
    }

    public rezItem(itemId: string, room: string, x: number, destination: string): void
    {
        x = Math.round(x);
        this.rezItemAsync(itemId, room, x, destination)
            .catch (ex => this.onError(ErrorWithData.ofError(ex, 'Caught error!', { itemId: itemId })));
    }

    private async rezItemAsync(itemId: string, room: string, x: number, destination: string): Promise<void>
    {
        if (Utils.logChannel('backpackWindow', true)) { log.info('BackpackWindow.rezItemAsync', itemId, 'to', room); }
        const props = await BackgroundMessage.getBackpackItemProperties(itemId);

        if (as.Bool(props[Pid.ClaimAspect])) {
            if (await this.getRoom().propsClaimYieldsToExistingClaim(props)) {
                throw new ItemException(ItemException.Fact.ClaimFailed, ItemException.Reason.ItemMustBeStronger, this.getRoom()?.getPageClaimItem()?.getDisplayName());
            }
        }

        if (as.Bool(props[Pid.AutorezAspect])) {
            await BackgroundMessage.modifyBackpackItemProperties(itemId, { [Pid.AutorezIsActive]: 'true' }, [], { });
        }

        const moveInsteadOfRez = as.Bool(props[Pid.IsRezzed]) && props[Pid.RezzedLocation] === room;
        if (moveInsteadOfRez) {
            await this.moveRezzedItemAsync(itemId, x);
        } else {
            if (as.Bool(props[Pid.IsRezzed])) {
                await this.derezItemAsync(itemId);
            }
            await BackgroundMessage.rezBackpackItem(itemId, room, x, destination);
        }
    }

    /**
     * Triggers the derezzing of the item with
     * or without setting a new backpack position.
     */
    public derezItem(
        itemId: string,
        xNew?: undefined | number,
        yNew?: undefined | number,
    ): void
    {
        const roomItem = this.room.getItemByItemId(itemId);
        if (!is.nil(roomItem)) {
            roomItem.beginDerez();
        }
        this.derezItemAsync(itemId, xNew, yNew
        ).catch(error =>
        {
            this.onError(ErrorWithData.ofError(
                error, 'ContentApp.derezItemAsync failed!', { itemId: itemId, xNew: xNew, yNew: yNew }));
        }).finally(() =>
        {
            const roomItem = this.room.getItemByItemId(itemId);
            if (!is.nil(roomItem)) {
                roomItem.endDerez();
            }
        });
    }

    /**
     * Derezzes the item with or without setting a new backpack position.
     *
     * Async version allowing direct reaction to errors.
     */
    public async derezItemAsync(
        itemId: string,
        xNew?: undefined | number,
        yNew?: undefined | number,
    ): Promise<void>
    {
        const props = await BackgroundMessage.getBackpackItemProperties(itemId);
        const roomJid = props[Pid.RezzedLocation];
        const [x, y] = [xNew ?? -1, yNew ?? -1];
        if (Utils.logChannel('items')) {
            log.info('ContentApp.derezItemAsync', 'itemId', itemId, 'roomJid', roomJid);
        }
        await BackgroundMessage.derezBackpackItem(itemId, roomJid, x, y);
    }

    /**
     * Triggers the moving of a rezzed item on the same page.
     */
    public moveRezzedItem(itemId: string, xNew: number): void
    {
        this.moveRezzedItemAsync(itemId, xNew
        ).catch(error =>
        {
            this.onError(ErrorWithData.ofError(
                error, 'ContentApp.moveRezzedItemAsync failed!', { itemId: itemId, xNew: xNew }));
        });
    }

    /**
     * Moves a rezzed item on the same page.
     *
     * Async version allowing direct reaction to errors.
     */
    public async moveRezzedItemAsync(itemId: string, xNew: number): Promise<void>
    {
        if (Utils.logChannel('items')) {
            log.info('ContentApp.moveRezzedItemAsync', 'itemId', itemId, 'xNew', xNew);
        }
        await BackgroundMessage.modifyBackpackItemProperties(itemId, { [Pid.RezzedX]: as.String(xNew) }, [], {});
    }

    public deleteItemAsk(
        itemId: string,
        onDeleted?: (itemId: string) => void,
        onCanceled?: (itemId: string) => void,
        onFailed?: (itemId: string) => void, // For cleanups. Defaults to onCanceled.
    ): void {
        try {
            const props = this.ownItems.getItemById(itemId);
            if (!props) {
                (onFailed ?? onCanceled)?.(itemId);
                return;
            }
            const onYes = () => this.deleteItem(props, onDeleted, onFailed ?? onCanceled);
            const onNo = () => onCanceled?.(itemId);

            if (ItemProperties.getIsPerson(props)) {
                this.personManager.showPersonActionConfirmationToast(
                    ItemProperties.getPersonData(props),
                    'Person.forgetPersonToastTitle',
                    'Person.forgetPersonToastText',
                    'person.forget', false,
                    'Person.forgetPersonToastConfirmButtonLabel', onYes,
                    'Person.forgetPersonToastCancelButtonLabel', onNo,
                    onNo,
                );
                return;
            }

            const itemName = props[Pid.Label] ?? props[Pid.Template];
            const duration = Config.get('backpack.deleteToastDurationSec', 1000);
            const text = this.translateText('ItemLabel.' + itemName) + '\n' + itemId;
            const toast = new SimpleToast(
                this, 'backpack-reallyDelete', duration, 'question', 'Really delete?', text);
            toast.setDefaultAction(onNo);
            toast.addClosingActionButton('Yes, delete item', onYes);
            toast.addClosingActionButton('No, keep it', onNo);
            toast.setDontShow(false);
            toast.show(onNo);
        } catch (error) {
            this.onError(ErrorWithData.ofError(error, 'Toast preparation failed!', { itemId: itemId }));
        }
    }

    public deleteItem(
        props: ItemProperties,
        onDeleted?: (itemId: string) => void,
        onFailed?: (itemId: string) => void, // For cleanups.
    ): void
    {
        const itemId = props[Pid.Id];
        if (Utils.logChannel('items')) {
            log.info('ContentApp.deleteItem', itemId);
        }
        (async () =>
        {
            await BackgroundMessage.deleteBackpackItem(itemId, {});
            if (as.Bool(props[Pid.AvatarAspect]) || as.Bool(props[Pid.NicknameAspect])) {
                this.getRoom()?.sendPresence();
            }
            onDeleted?.(itemId);
        })().catch(error =>
        {
            this.onError(ErrorWithData.ofError(error, 'Error caught!', { itemId: itemId }));
            onFailed?.(itemId);
        });
    }

    // CORS-rules-evading content retrieval:

    async fetchUrlAsDataUrl(url: null|string): Promise<string>
    {
        url ??= '';
        if (!is.nonEmptyString(url) || url.startsWith('data:')) {
            return url;
        }
        try {
            const data = await this.urlFetcher.fetchAsDataUrl(url, '');
            return data;
        } catch (errorResponse) {
            this.onError(new ErrorWithData('BackgroundMessage.fetchUrl failed!', { url, errorResponse }));
            return url;
        }
    }

}
