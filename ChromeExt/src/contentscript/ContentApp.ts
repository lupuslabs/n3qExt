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
import { AvatarGallery } from '../lib/AvatarGallery';
import { Translator } from '../lib/Translator';
import { Browser } from '../lib/Browser';
import { BackpackUpdateData, ContentMessage } from '../lib/ContentMessage';
import { Environment } from '../lib/Environment';
import { ItemProperties, Pid } from '../lib/ItemProperties';
import { WeblinClientApi } from '../lib/WeblinClientApi';
import { PropertyStorage } from './PropertyStorage';
import { Room } from './Room';
import { VpiMappingResult, VpiResolver } from './VpiResolver';
import { SettingsWindow } from './SettingsWindow';
import { XmppWindow } from './XmppWindow';
import { ChangesWindow } from './ChangesWindow';
import { BackpackWindow } from './BackpackWindow';
import { ItemExceptionToast, SimpleToast, Toast } from './Toast';
import { IframeApi } from './IframeApi';
import { RandomNames } from '../lib/RandomNames';
import { Participant } from './Participant';
import { SimpleItemTransferController } from './SimpleItemTransferController';
import { ItemException } from '../lib/ItemException';
import { Entity } from './Entity';
import { Avatar } from './Avatar';
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher';
import { DomUtils } from '../lib/DomUtils';
import ButtonId = DomUtils.ButtonId
import ModifierKeyId = DomUtils.ModifierKeyId
import { DebugUtils } from './DebugUtils';
import { Client } from '../lib/Client';
import { WeblinClientPageApi } from '../lib/WeblinClientPageApi';
import { ChatUtils } from '../lib/ChatUtils';
import { ViewportEventDispatcher } from '../lib/ViewportEventDispatcher'
import { ContentToBackgroundCommunicator, ContentRequestHandler } from '../lib/ContentToBackgroundCommunicator'
import { BackgroundMessageUrlFetcher, UrlFetcher } from '../lib/UrlFetcher'
import * as windowCloseIconDataUrl from '../assets/icons/carbon_close-outline.svg';
import * as popupCloseIconDataUrl from '../assets/icons/ci-close-small.svg';
import { BadgesController } from './BadgesController'
import { PointerEventData } from '../lib/PointerEventData'
import { WeblinClientIframeApi } from '../lib/WeblinClientIframeApi'

interface ILocationMapperResponse
{
    //    sMessage: string;
    sLocationURL: string;
}

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
};

export class ContentApp extends AppWithDom
{
    private readonly backgroundCommunicator: ContentToBackgroundCommunicator;
    private readonly urlFetcher: UrlFetcher;
    private params: ContentAppParams;
    private isStopped: boolean = false;
    private debugUtils: DebugUtils;
    private appendToMe: HTMLElement
    private appendToMeDomObserver: null|MutationObserver;
    private shadowDomAnchor: null|HTMLElement;
    private shadowDomAnchorDomObserver: null|MutationObserver;
    private shadowDomRoot: null|ShadowRoot;
    private display: null|HTMLElement;
    private dropzoneELem: null|HTMLElement = null;
    private viewportEventDispatcher: ViewportEventDispatcher;
    private isGuiEnabled: boolean = false;
    private userId: string = '';
    private pageUrl: string;
    private presetPageUrl: string;
    private roomJid: string = '';
    private room: Room|null;
    private propertyStorage: PropertyStorage = new PropertyStorage();
    private language = 'en-US';
    private babelfish: Translator;
    private vpi: VpiResolver;
    private xmppWindow: XmppWindow;
    private backpackWindow: BackpackWindow;
    private simpleItemTransferController: undefined | SimpleItemTransferController;
    private settingsWindow: SettingsWindow;
    private stanzasResponses: { [stanzaId: string]: StanzaResponseHandler } = {};
    private iframeApi: IframeApi;
    private readonly statusToPageSender: WeblinClientPageApi.ClientStatusToPageSender;
    private avatarGallery: AvatarGallery;
    private toasts: Set<Toast> = new Set();
    private readonly ownItems: Map<string,ItemProperties> = new Map();

    // private stayHereIsChecked: boolean = false;
    private backpackIsOpen: boolean = false;
    private vidconfIsOpen: boolean = false;
    private chatIsOpen: boolean = false;
    private privateVidconfIsOpen: boolean = false;
    private countRezzedItems: number = 0;

    // Getter

    getDebugUtils(): DebugUtils { return this.debugUtils; }
    getPropertyStorage(): PropertyStorage { return this.propertyStorage; }
    getShadowDomRoot(): ShadowRoot { return this.shadowDomRoot; }
    getDisplay(): HTMLElement { return this.display; }
    getViewPortEventDispatcher(): ViewportEventDispatcher { return this.viewportEventDispatcher; }
    public getUserId(): string { return this.userId; }
    getRoom(): Room|null { return this.room; }
    getLanguage(): string { return this.language; }

    getMyParticipant(): undefined | Participant { return this.room?.getMyParticipant(); }
    getMyBadgesDisplay(): null|BadgesController { return this.room?.getMyParticipant()?.getBadgesDisplay() ?? null; }

    getOwnItems(): ReadonlyMap<string,ItemProperties> { return this.ownItems; }
    getBackpackWindow(): BackpackWindow { return this.backpackWindow; }

    getAvatarGallery(): AvatarGallery { return this.avatarGallery; }

    /**
     * null before in a room and receiving first presence for local participant.
     */
    getSimpleItemTransferController(): undefined | SimpleItemTransferController
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
        this.appendToMe = appendToMe;
        this.debugUtils = new DebugUtils(this);
        this.statusToPageSender = new WeblinClientPageApi.ClientStatusToPageSender(this);
        this.viewportEventDispatcher = new ViewportEventDispatcher(this);
        const requestHandler = request => this.onBackgroundRequest(request)
        this.backgroundCommunicator = contentCommunicatorFactory(requestHandler);
        this.urlFetcher = new BackgroundMessageUrlFetcher()
    }

    async start(params: ContentAppParams)
    {
        if (params && params.nickname) { await Memory.setLocal(Utils.localStorageKey_Nickname(), params.nickname); }
        if (params && params.avatar) { await Memory.setLocal(Utils.localStorageKey_Avatar(), params.avatar); }
        if (params && params.pageUrl) { this.presetPageUrl = params.pageUrl; }
        if (params && params.x) { await Memory.setLocal(Utils.localStorageKey_X(), params.x); }
        this.params = params;

        this.backgroundCommunicator.start()
        BackgroundMessage.backgroundCommunicator = this.backgroundCommunicator;

        try {
            await BackgroundMessage.waitReady();
        } catch (error) {
            log.debug(error);
            Panic.now();
        }
        if (Panic.isOn) { return; }

        const userId = await Memory.getLocal(Utils.localStorageKey_Id(), null);
        if (!is.nonEmptyString(userId)) {
            log.debug('No user ID!');
            Panic.now();
            return;
        }
        this.userId = userId;

        if (!await this.getActive()) {
            log.info('Avatar disabled');
            this.messageHandler({ 'type': ContentAppNotification.type_stopped });
            return;
        }

        try {
            const config = await BackgroundMessage.getConfigTree(Config.onlineConfigName);
            Config.setOnlineTree(config);
        } catch (error) {
            log.debug(error.message);
            Panic.now();
        }
        if (Panic.isOn) { return; }

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

        this.language = Client.getUserLanguage()
        const translationTable = Config.get('i18n.translations', {})[this.language];
        const serviceUrl = Config.get('i18n.serviceUrl', '')
        this.babelfish = new Translator(translationTable, this.language, serviceUrl, this.urlFetcher);

        this.vpi = new VpiResolver(this.urlFetcher, Config);
        this.vpi.language = Translator.getShortLanguageCode(this.language);

        this.avatarGallery = new AvatarGallery();

        await this.assertActive();
        if (Panic.isOn) { return; }
        await this.assertUserNickname();
        if (Panic.isOn) { return; }
        await this.assertUserAvatar();
        if (Panic.isOn) { return; }
        await this.assertSavedPosition();
        if (Panic.isOn) { return; }

        try {
            await this.initDisplay();
        } catch (error) {
            log.debug(error.message);
            Panic.now();
        }

        BackgroundMessage.signalContentAppStartToBackground().catch(error => this.onError(error));
        BackgroundMessage.requestBackpackState().catch(ex => this.onError(ex));

        // this.enterPage();
        await this.checkPageUrlChanged();

        this.evaluateStayOnTabChange();
        if (this.roomJid !== '') {
            // this.stayHereIsChecked = await Memory.getLocal(Utils.localStorageKey_StayOnTabChange(this.roomJid), false);
            this.backpackIsOpen = await Memory.getLocal(Utils.localStorageKey_BackpackIsOpen(this.roomJid), false);
            this.chatIsOpen = await Memory.getLocal(Utils.localStorageKey_ChatIsOpen(this.roomJid), false);
            this.vidconfIsOpen = await Memory.getLocal(Utils.localStorageKey_VidconfIsOpen(this.roomJid), false);

            this.reshowBackpackWindow();
            this.reshowChatWindow();
            // this.reshowVidconfWindow(); // must be after enter
        }

        this.startCheckPageUrl();
        this.iframeApi = new IframeApi(this).start();

        this.debugUtils.onAppStartComplete();
        this.statusToPageSender.sendClientActive();

        if (false
            || this.isStopped // stop has been called while still starting.
            || is.nil(this.shadowDomRoot?.host?.parentElement) // another instance has removed our div#n3q element.
        ) {
            log.debug('ContentApp.start: Stopped while starting.', {this: {...this}});
            this.stop(); // Redo the stopping to fix the race.
        }
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

    private async initDisplay(): Promise<void>
    {
        document.querySelector('div#n3q')?.remove();

        this.appendToMeDomObserver = new MutationObserver(() => this.maintainDisplay());
        this.shadowDomAnchorDomObserver = new MutationObserver(() => this.maintainDisplay());
        this.shadowDomAnchor = DomUtils.elemOfHtml(`<div></div>`);
        this.shadowDomRoot = this.shadowDomAnchor.attachShadow({mode: 'closed'});

        const params = this.params;
        if (params.styleUrl) {
            const style = await this.urlFetcher.fetchAsText(params.styleUrl, '1')
            this.shadowDomRoot.appendChild(DomUtils.elemOfHtml(`<style>\n${style}\n</style>`));
        }

        this.display = DomUtils.elemOfHtml('<div id="n3q-display"></div>');
        DomUtils.preventKeyboardEventBubbling(this.display);
        this.shadowDomRoot.append(this.display);

        const variant = Client.getVariant();
        if (variant !== 'extension') {
            this.appendToMe.append(this.shadowDomAnchor);
        }

        this.maintainDisplay();
        this.handle_extensionIsGuiEnabledChanged(this.isGuiEnabled);
    }

    private maintainDisplay()
    {
        this.appendToMeDomObserver?.disconnect();
        this.shadowDomAnchorDomObserver?.disconnect();

        if (!this.display) {
            this.shadowDomAnchor?.remove();
            return;
        }
        this.stopIfEmbeddedAndExtensionPresent();

        // Move to end of body (prevent max z-index elements from rendering on top):
        const lastChildOfParent = this.appendToMe.lastElementChild;
        if (Environment.isExtension() && lastChildOfParent !== this.shadowDomAnchor) {
            this.appendToMe.append(this.shadowDomAnchor);
        }

        // Reset anchor:
        for (const childElem of this.shadowDomAnchor.childNodes) {
            childElem.remove();
        }
        const shadowDomAnchorStyle = 'all: revert !important; position: fixed !important; border: none !important; padding: 0 !important; width: 0 !important; height: 0 !important; overflow: hidden !important; z-index: 2147483647 !important; user-select: text !important;';
        this.shadowDomAnchor.setAttribute('id', 'n3q');
        this.shadowDomAnchor.setAttribute('data-client-variant', Client.getVariant());
        this.shadowDomAnchor.setAttribute('style', shadowDomAnchorStyle);

        // Use experimental popover API to get on top of topmost page content:
        // Feature disabled by default in Firefox (https://caniuse.com/mdn-api_htmlelement_showpopover).
        if (Config.get('system.displayPopupShadowDomAnchor')) {
            this.shadowDomAnchor.setAttribute('popover', 'manual');
            try {
                this.shadowDomAnchor['showPopover']?.();
            } catch (error) {
                // Already visible.
            }
        }

        // React to DOM changes:
        if (Config.get('system.displayProtectShadowDomAnchor')) {
            this.appendToMeDomObserver.observe(this.appendToMe, { childList: true });
            this.shadowDomAnchorDomObserver.observe(this.shadowDomAnchor, { childList: true, attributes: true });
        }
    }

    private stopIfEmbeddedAndExtensionPresent()
    {
        if (!Environment.isEmbedded()) {
            return;
        }
        for (const elem of document.querySelectorAll('div[id="n3q"]')) {
            if (elem !== this.shadowDomAnchor) {
                log.debug('ContentApp.maintainDisplay: Extension shadow DOM root detected. Stopping embedded.');
                this.stop();
                return;
            }
        }
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
        this.iframeApi?.stop();
        this.stopCheckPageUrl();
        this.leavePage();
        this.onUnload();
        BackgroundMessage.signalContentAppStopToBackground().catch(error => this.onError(error));
        this.backgroundCommunicator.stop()
    }

    onUnload()
    {
        if (this.room) {
            this.room.onUnload();
            this.room = null;
        }

        this.display = null;
        this.maintainDisplay(); // does the ramainder of the cleanup.
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
        const participantIds = this.room?.getParticipantIds() ?? [];
        const participantCount = Math.max(0, participantIds.length - 1);
        const maxChatAgeSecs = as.Float(Config.get('system.tabStatsRecentChatAgeSecs'), 1.0);
        const hasNewGroupChat = (this.room?.getChatWindow().getRecentMessageCount(maxChatAgeSecs, ChatUtils.userChatMessageTypes) ?? 0) !== 0;
        const hasNewPrivateChat = participantIds.some(participantId => {
            const participant = this.room.getParticipant(participantId);
            return participant.getPrivateChatWindow().getRecentMessageCount(maxChatAgeSecs, ChatUtils.userChatMessageTypes) !== 0;
        });
        const toastCount = this.toasts.size;
        const stats: TabStats = { participantCount, hasNewGroupChat, hasNewPrivateChat, toastCount };
        BackgroundMessage.sendTabStatsToBackground(stats).catch(error => this.onError(error));
    }

    test(): void
    {
        // let frame = <HTMLIFrameElement>$('<iframe class="n3q-base n3q-effect" style="position: fixed; width:100%; height: 100%; background-color: #ff0000; opacity: 20%;" src="https://localhost:5100/ItemFrame/Test" frameborder="0"></iframe>').get(0);
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

    setPrivateVidconfIsOpen(value: boolean): void
    {
        this.privateVidconfIsOpen = value;
        this.evaluateStayOnTabChange();
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
            || as.Bool(Config.get('room.stayOnTabChange'))
            || this.backpackIsOpen
            || this.vidconfIsOpen
            || this.chatIsOpen
            // || this.stayHereIsChecked
            || this.privateVidconfIsOpen
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
        try {
            switch (message.type) {

                case ContentMessage.type_sendStateToBackground: {
                    this.handle_sendStateToBackground();
                } break;

                case ContentMessage.type_configChanged: {
                    this.handle_configChanged();
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

                case ContentMessage.type_userSettingsChanged: {
                    this.handle_userSettingsChanged();
                } break;

                case ContentMessage.type_clientNotification: {
                    this.handle_clientNotification(message.data);
                } break;

                case ContentMessage.type_extensionActiveChanged: {
                    this.handle_extensionActiveChanged(message.data.state);
                } break;

                case ContentMessage.type_extensionIsGuiEnabledChanged: {
                    this.handle_extensionIsGuiEnabledChanged(message?.data?.isGuiEnabled);
                } break;

                case ContentMessage.type_onBackpackUpdate: {
                    const { itemsHide, itemsShowOrSet } = <BackpackUpdateData> message.data;
                    this.onBackpackUpdate(itemsHide, itemsShowOrSet)
                } break;

                case ContentMessage.type_chatMessagePersisted: {
                    this.getRoom()?.onChatMessagePersisted(message.data.chatChannel, message.data.chatMessage);
                } break;
                case ContentMessage.type_chatHistoryDeleted: {
                    this.getRoom()?.onChatHistoryDeleted(message.data.deletions);
                } break;
            }
        } catch (error) {
            this.onError(error)
            return BackgroundErrorResponse.ofError(error);
        }
        return { ok: true };
    }

    private onBackpackUpdate(itemsHide: ReadonlyArray<ItemProperties>, itemsShowOrSet: ReadonlyArray<ItemProperties>): void
    {
        itemsHide.forEach(item => this.ownItems.delete(item[Pid.Id]));
        itemsShowOrSet.forEach(item => this.ownItems.set(item[Pid.Id], item));
        this.backpackWindow?.onBackpackUpdate(itemsHide, itemsShowOrSet);
        this.room?.getMyParticipant()?.getBadgesDisplay()?.onBackpackUpdate(itemsHide, itemsShowOrSet);
    }

    public async handleItemInventoryiframeApiRequest(request: WeblinClientIframeApi.Request): Promise<WeblinClientApi.Response>
    {
        const response = this.getBackpackWindow()?.handleItemInventoryiframeApiRequest(request)
        if (response) {
            return response
        }
        return new WeblinClientApi.ErrorResponse('Item inventory iframe not found!')
    }

    handle_sendStateToBackground(): void
    {
        this.room?.sendStateToBackground();
        this.sendTabStatsToBackground();
    }

    handle_configChanged(): void
    {
        BackgroundMessage.getConfigTree(Config.onlineConfigName)
            .then(config => Config.setOnlineTree(config))
            .catch (error => log.debug(error.message));
        BackgroundMessage.getConfigTree(Config.devConfigName)
            .then(config => Config.setDevTree(config))
            .catch (error => log.debug(error.message));
    }

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

    handle_userSettingsChanged(): any
    {
        if (this.room) {
            this.room.onUserSettingsChanged();
        }
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

    handle_extensionActiveChanged(state: boolean): any
    {
        if (state) {
            // should not happen
        } else {
            this.messageHandler({ 'type': ContentAppNotification.type_stopped });
        }
    }

    handle_extensionIsGuiEnabledChanged(isGuiEnabled: unknown): void
    {
        this.isGuiEnabled = as.Bool(isGuiEnabled, true);
        if (this.isGuiEnabled) {
            this.display?.classList.remove('n3q-hidden');
            this.wakeup();
        } else {
            this.display?.classList.add('n3q-hidden');
            this.sleep('GuiHidden');
        }
    }

    leavePage()
    {
        this.leaveRoom();
    }

    async checkPageUrlChanged()
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
                this.room.setPageUrl(pageUrl);
                log.debug('ContentApp.checkPageUrlChanged', 'Same room', pageUrl, ' => ', this.roomJid);
                return;
            }

            this.leavePage();

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

    getSignificantUrlParts(url: string): string
    {
        const parsedUrl = new URL(url);
        return parsedUrl.host + parsedUrl.pathname + parsedUrl.search;
    }

    async vpiMap(url: string): Promise<VpiMappingResult>
    {
        return await this.vpi.map(url);
    }

    private checkPageUrlSec: number = as.Float(Config.get('room.checkPageUrlSec'), 5);
    private checkPageUrlTimer: number;
    private startCheckPageUrl()
    {
        this.stopCheckPageUrl();
        this.checkPageUrlTimer = <number><unknown>setTimeout(async () =>
        {
            await this.checkPageUrlChanged();
            this.checkPageUrlTimer = undefined;
            this.startCheckPageUrl();
        }, this.checkPageUrlSec * 1000);
    }

    private stopCheckPageUrl()
    {
        if (this.checkPageUrlTimer) {
            clearTimeout(this.checkPageUrlTimer);
            this.checkPageUrlTimer = undefined;
        }
    }

    static getRoomJidFromLocationUrl(locationUrl: string): string
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

    async enterRoom(roomJid: string, pageUrl: string, roomDestination: string): Promise<void>
    {
        this.leaveRoom();

        this.room = new Room(this, roomJid, pageUrl, roomDestination);
        if (Utils.logChannel('urlMapping', false)) { log.info('ContentApp.enterRoom', roomJid); }

        await this.room.enter().catch(error => this.onError(error));
        this.handle_extensionIsGuiEnabledChanged(this.isGuiEnabled);
    }

    leaveRoom(): void
    {
        if (this.room) {
            if (Utils.logChannel('urlMapping', false)) { log.info('ContentApp.leaveRoom', this.room.getJid()); }

            this.room.leave();
            this.room = null;
        }
    }

    onPresence(stanza: ltx.Element): void
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
        this.onError(error);
        Panic.now();
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
            this.dropzoneELem = DomUtils.elemOfHtml('<div class="n3q-base n3q-dropzone"></div>')
            this.display.append(this.dropzoneELem)
            this.toFront(this.dropzoneELem, ContentApp.LayerBelowEntities)
        }
        DomUtils.setElemClassPresent(this.dropzoneELem, 'n3q-dropzone-hilite', isHighlighted)
    }

    public getIsDropTargetInDropzone(ev: PointerEventData): boolean
    {
        return ev.dropTarget?.classList.contains('n3q-dropzone') ?? false
    }

    // i18n

    translateText(key: string, defaultText: string = null): string
    {
        return this.babelfish.translateText(key, defaultText);
    }

    translateElem(elem: HTMLElement): void
    {
        this.babelfish.translateElem(elem);
    }

    // Dont show this message again management

    localStorage_DontShowNotice_KeyPrefix: string = 'dontShowNotice.';

    async isDontShowNoticeType(type: string): Promise<boolean>
    {
        return await Memory.getLocal(this.localStorage_DontShowNotice_KeyPrefix + type, false);
    }

    async setDontShowNoticeType(type: string, value: boolean): Promise<void>
    {
        await Memory.setLocal(this.localStorage_DontShowNotice_KeyPrefix + type, value);
    }

    // my active

    async assertActive()
    {
        try {
            const active = await Memory.getLocal(Utils.localStorageKey_Active(), '');
            if (active == '') {
                await Memory.setLocal(Utils.localStorageKey_Active(), 'true');
            }
        } catch (error) {
            log.info(error);
            Panic.now();
        }
    }

    async getActive(): Promise<boolean>
    {
        try {
            const active = await Memory.getLocal(Utils.localStorageKey_Active(), 'true');
            return as.Bool(active);
        } catch (error) {
            log.info(error);
            return false;
        }
    }

    // my nickname

    async assertUserNickname()
    {
        try {
            let nickname = await Memory.getLocal(Utils.localStorageKey_Nickname(), '');
            if (nickname == '') {
                nickname = RandomNames.getRandomNickname();
                await Memory.setLocal(Utils.localStorageKey_Nickname(), nickname);
            }
        } catch (error) {
            log.info(error);
            Panic.now();
        }
    }

    async getUserNickname(): Promise<string>
    {
        try {
            return await Memory.getLocal(Utils.localStorageKey_Nickname(), 'no name');
        } catch (error) {
            log.info(error);
            return 'no name';
        }
    }

    // my avatar

    async assertUserAvatar()
    {
        try {
            await this.avatarGallery.getAvatarFromLocalMemory();
        } catch (error) {
            log.info(error);
            Panic.now();
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
            let x = as.Int(await Memory.getLocal(Utils.localStorageKey_X(), -1), -1);
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
            x = as.Int(await Memory.getLocal(Utils.localStorageKey_X(), -1), -1);
        } catch (error) {
            log.info(error);
        }

        if (x <= 0) {
            x = this.getDefaultPosition(await this.getUserNickname());
        }

        return x;
    }

    getDefaultPosition(key: string = null): number
    {
        let pos: number;
        let width = this.display.offsetWidth;
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
        const item = this.ownItems.get(itemId)
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
            { skipPresenceUpdate: true }
        ).catch(error => {
            this.onError(error)

            // Undo local change if not overwritten by concurrent change:
            const item = this.ownItems.get(itemId)
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
            await BackgroundMessage.modifyBackpackItemProperties(itemId, { [Pid.AutorezIsActive]: 'true' }, [], { skipPresenceUpdate: true });
        }

        const moveInsteadOfRez = as.Bool(props[Pid.IsRezzed]) && props[Pid.RezzedLocation] === room;
        if (moveInsteadOfRez) {
            await this.moveRezzedItemAsync(itemId, x);
        } else {
            if (as.Bool(props[Pid.IsRezzed])) {
                await this.derezItemAsync(itemId);
            }
            await BackgroundMessage.rezBackpackItem(itemId, room, x, destination, {});
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
        const propsDel = [Pid.AutorezIsActive];
        if (Utils.logChannel('items')) {
            log.info('ContentApp.derezItemAsync', 'itemId', itemId, 'roomJid', roomJid);
        }
        await BackgroundMessage.derezBackpackItem(
            itemId, roomJid, x, y, {}, propsDel, {}
        );
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
    ): void
    {
        (async () =>
        {
            const props = await BackgroundMessage.getBackpackItemProperties(itemId);
            const itemName = props[Pid.Label] ?? props[Pid.Template];
            const duration = Config.get('backpack.deleteToastDurationSec', 1000);
            const text = this.translateText('ItemLabel.' + itemName) + '\n' + itemId;
            const toast = new SimpleToast(
                this, 'backpack-reallyDelete', duration, 'question', 'Really delete?', text);
            let inOnAnswer = false;
            const onYes = () =>
            {
                if (!inOnAnswer) {
                    inOnAnswer = true;
                    toast.close();
                    this.deleteItem(props, onDeleted, onFailed ?? onCanceled);
                }
            };
            const onNo = () =>
            {
                if (!inOnAnswer) {
                    inOnAnswer = true;
                    toast.close();
                    onCanceled?.(itemId);
                }
            };
            toast.actionButton('Yes, delete item', onYes);
            toast.actionButton('No, keep it', onNo);
            toast.setDontShow(false);
            toast.show(onNo);
        })().catch(error =>
        {
            this.onError(ErrorWithData.ofError(error, 'Toast preparation failed!', { itemId: itemId }));
        });
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

    // GUI helpers:

    public makeIcon(iconUrl: null|string): HTMLElement
    {
        const iconWrapElem = DomUtils.elemOfHtml('<span class="icon-wrap"></span>');
        const iconElem = DomUtils.elemOfHtml('<img class="icon"/>');
        iconElem.addEventListener('error', (ev) => iconElem.classList.add('hidden'));
        this.fetchUrlAsDataUrl(iconUrl)
            .then(dataUrl => iconElem.setAttribute('src', dataUrl));
        iconWrapElem.append(iconElem);
        return iconWrapElem;
    }

    public makeWindowCloseButton(onClose: () => void, style: WindowStyle): HTMLElement {
        let iconUrl: string;
        switch (style) {
            case 'window': iconUrl = windowCloseIconDataUrl; break;
            case 'popup':
            case 'overlay':
            default: iconUrl = popupCloseIconDataUrl; break;
        }
        const helpText = this.translateText('Common.Close', 'Close');
        return this.makeWindowButton(onClose, style, 'close', iconUrl, helpText);
    }

    public makeWindowButton(onClick: () => void, style: WindowStyle, cssClass: string, iconUrl: string, helpText: string): HTMLElement {
        let buttonBaseCssClass: string;
        switch (style) {
            case 'window': buttonBaseCssClass = 'n3q-window-button'; break;
            case 'popup':
            case 'overlay':
            default: buttonBaseCssClass = 'n3q-popup-button'; break;
        }

        const buttonElem = DomUtils.elemOfHtml('<div></div>');
        buttonElem.classList.add(buttonBaseCssClass, cssClass);
        buttonElem.setAttribute('title', helpText);
        const dispatcher = PointerEventDispatcher.makeOpaqueDispatcher(this, buttonElem);
        dispatcher.addUnmodifiedLeftClickListener(ev => onClick());
        dispatcher.addListener('clickstart', ButtonId.first, ModifierKeyId.none, ev => {
            buttonElem.classList.add('active');
        });
        dispatcher.addListener('clickend', null, null, ev => {
            buttonElem.classList.remove('active');
        });

        const iconElem = this.makeIcon(iconUrl);
        buttonElem.appendChild(iconElem);

        return buttonElem;
    }

}
