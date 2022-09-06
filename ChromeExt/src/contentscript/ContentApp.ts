import log = require('loglevel');
import * as $ from 'jquery';
import * as jid from '@xmpp/jid';
import { Element as XmlElement } from 'ltx';
import { as } from '../lib/as';
import { is } from '../lib/is';
import { ErrorWithData, Utils } from '../lib/Utils';
import { BackgroundMessage } from '../lib/BackgroundMessage';
import { Panic } from '../lib/Panic';
import { Config } from '../lib/Config';
import { Memory } from '../lib/Memory';
import { AvatarGallery } from '../lib/AvatarGallery';
import { Translator } from '../lib/Translator';
import { Browser } from '../lib/Browser';
import { ContentMessage } from '../lib/ContentMessage';
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
import { ItemExceptionToast, SimpleToast } from './Toast';
import { IframeApi } from './IframeApi';
import { RandomNames } from '../lib/RandomNames';
import { Participant } from './Participant';
import { SimpleItemTransferController } from './SimpleItemTransferController';
import { ItemException } from '../lib/ItemException';
import { prepareValueForLog } from '../lib/debugUtils';
import { Entity } from './Entity';
import { Avatar } from './Avatar';

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
interface StanzaResponseHandler { (stanza: XmlElement): void }

export class ContentApp
{
    private display: HTMLElement;
    private pageUrl: string;
    private presetPageUrl: string;
    private roomJid: string;
    private room: Room;
    private propertyStorage: PropertyStorage = new PropertyStorage();
    private language = 'en-US';
    private babelfish: Translator;
    private vpi: VpiResolver;
    private xmppWindow: XmppWindow;
    private backpackWindow: BackpackWindow;
    private simpleItemTransferController: undefined | SimpleItemTransferController;
    private settingsWindow: SettingsWindow;
    private stanzasResponses: { [stanzaId: string]: StanzaResponseHandler } = {};
    private onRuntimeMessageClosure: (message: any, sender: any, sendResponse: any) => any;
    private iframeApi: IframeApi;

    // private stayHereIsChecked: boolean = false;
    private backpackIsOpen: boolean = false;
    private vidconfIsOpen: boolean = false;
    private chatIsOpen: boolean = false;
    private privateVidconfIsOpen: boolean = false;
    private countRezzedItems: number = 0;

    // Getter

    getPropertyStorage(): PropertyStorage { return this.propertyStorage; }
    getDisplay(): HTMLElement { return this.display; }
    getRoom(): Room { return this.room; }
    getLanguage(): string { return this.language; }

    getMyParticipant(): undefined | Participant
    {
        return this.room?.getParticipant(this.room.getMyNick()) ?? null;
    }

    getBackpackWindow(): BackpackWindow { return this.backpackWindow; }

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

    constructor(protected appendToMe: HTMLElement, private messageHandler: ContentAppNotificationCallback)
    {
    }

    activateBackgroundPageProbeDelaySec = 0;
    getActivateBackgroundPageProbeDelay()
    {
        if (this.activateBackgroundPageProbeDelaySec <= 0) {
            this.activateBackgroundPageProbeDelaySec = Config.get('system.activateBackgroundPageProbeDelayMinSec', 0.1);
        } else {
            this.activateBackgroundPageProbeDelaySec *= Config.get('system.activateBackgroundPageProbeDelayFactor', 2);
            const max = Config.get('system.activateBackgroundPageProbeDelayMaxSec', 10);
            if (this.activateBackgroundPageProbeDelaySec > max) {
                this.activateBackgroundPageProbeDelaySec = max;
            }
        }
        return this.activateBackgroundPageProbeDelaySec;
    }
    async activateBackgroundPage(): Promise<void>
    {
        return new Promise(async (resolve, reject) =>
        {
            const probeStartTime = Date.now() / 1000;
            let awake = false;
            while (!awake) {
                if (Utils.logChannel('startup', false)) { log.info('ContentApp.getActiveBackgroundPage', 'probing'); }
                try {
                    awake = await BackgroundMessage.wakeup();
                } catch (error) {
                    if (Utils.logChannel('startup', false)) { log.info('ContentApp.getActiveBackgroundPage', 'unreachable'); }
                }
                if (!awake) {
                    const now = Date.now() / 1000;
                    const since = now - probeStartTime;
                    if (since > Config.get('system.activateBackgroundPageProbeTotalSec', 60)) {
                        break;
                    } else {

                        const delay = this.getActivateBackgroundPageProbeDelay();
                        if (Utils.logChannel('startup', false)) { log.info('ContentApp.getActiveBackgroundPage', 'sleeping', delay); }
                        await Utils.sleep(delay * 1000);
                    }
                } else {
                    if (Utils.logChannel('startup', false)) { log.info('ContentApp.getActiveBackgroundPage', 'available'); }
                }
            }
            if (awake) {
                resolve();
            } else {
                reject({ message: 'BackgroundApp seems unreachable, giving up' });
            }
        });

        // WFT: chrome.runtime.getBackgroundPage is not a function
        // return new Promise(resolve =>
        // {
        //     chrome.runtime.getBackgroundPage(resolve);
        // });
    }

    async start(params: any)
    {
        if (params && params.nickname) { await Memory.setLocal(Utils.localStorageKey_Nickname(), params.nickname); }
        if (params && params.avatar) { await Memory.setLocal(Utils.localStorageKey_Avatar(), params.avatar); }
        if (params && params.pageUrl) { this.presetPageUrl = params.pageUrl; }
        if (params && params.x) { await Memory.setLocal(Utils.localStorageKey_X(), params.x); }

        try {
            // await this.activateBackgroundPage();
            await BackgroundMessage.waitReady();
        } catch (error) {
            log.debug(error.message);
            Panic.now();
        }
        if (Panic.isOn) { return; }

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

        {
            const pageUrl = Browser.getCurrentPageUrl();
            const parsedUrl = new URL(pageUrl);
            if (parsedUrl.hash.search('#n3qdisable') >= 0) {
                return;
            }
            const ignoredDomains: Array<string> = Config.get('vp.ignoredDomainSuffixes', []);
            for (const ignoredDomain of ignoredDomains) {
                if (parsedUrl.host.endsWith(ignoredDomain)) {
                    return;
                }
            }
        }

        await Utils.sleep(as.Float(Config.get('vp.deferPageEnterSec', 1)) * 1000);

        let navLang = as.String(Config.get('i18n.overrideBrowserLanguage', ''));
        if (navLang === '') {
            navLang = navigator.language;
        }
        this.language = Translator.mapLanguage(navLang, lang => { return Config.get('i18n.languageMapping', {})[lang]; }, Config.get('i18n.defaultLanguage', 'en-US'));
        this.babelfish = new Translator(Config.get('i18n.translations', {})[this.language], this.language, Config.get('i18n.serviceUrl', ''));

        this.vpi = new VpiResolver(BackgroundMessage, Config);
        this.vpi.language = Translator.getShortLanguageCode(this.language);

        await this.assertActive();
        if (Panic.isOn) { return; }
        await this.assertUserNickname();
        if (Panic.isOn) { return; }
        await this.assertUserAvatar();
        if (Panic.isOn) { return; }
        await this.assertSavedPosition();
        if (Panic.isOn) { return; }

        $('div#n3q').remove();
        const page = $('<div id="n3q" class="n3q-base n3q-hidden-print" />').get(0);
        this.display = $('<div class="n3q-base n3q-display" />').get(0);
        $(page).append(this.display);
        this.appendToMe.append(page);

        if (Environment.isExtension()) {
            this.onRuntimeMessageClosure = (message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => this.onRuntimeMessage(message, sender, sendResponse);
            chrome.runtime.onMessage.addListener(this.onRuntimeMessageClosure);
        }

        // this.enterPage();
        await this.checkPageUrlChanged();

        if (this.roomJid != '') {
            // this.stayHereIsChecked = await Memory.getLocal(Utils.localStorageKey_StayOnTabChange(this.roomJid), false);
            this.backpackIsOpen = await Memory.getLocal(Utils.localStorageKey_BackpackIsOpen(this.roomJid), false);
            this.chatIsOpen = await Memory.getLocal(Utils.localStorageKey_ChatIsOpen(this.roomJid), false);
            this.vidconfIsOpen = await Memory.getLocal(Utils.localStorageKey_VidconfIsOpen(this.roomJid), false);

            this.reshowBackpackWindow();
            this.reshowChatWindow();
            // this.reshowVidconfWindow(); // must be after enter
        }

        this.startCheckPageUrl();
        this.pingBackgroundToKeepConnectionAlive();
        this.iframeApi = new IframeApi(this).start();
    }

    sleep(statusMessage: string)
    {
        log.debug('ContentApp.sleep');
        this.room.sleep(statusMessage);
    }

    wakeup()
    {
        log.debug('ContentApp.wakeup');
        this.room.wakeup();
    }

    stop()
    {
        this.iframeApi?.stop();
        this.stop_pingBackgroundToKeepConnectionAlive();
        this.stopCheckPageUrl();
        this.leavePage();
        this.onUnload();
    }

    onUnload()
    {
        if (this.room) {
            this.room.onUnload();
            this.room = null;
        }

        try {
            chrome.runtime?.onMessage.removeListener(this.onRuntimeMessageClosure);
        } catch (error) {
            //
        }

        // Remove our own top element
        $('#n3q').remove();

        this.display = null;
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

    getEntityByelem(elem: Element|null): Entity|null
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
        } else {
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
        if (this.chatIsOpen) { this.showChatWindow(); }
    }
    showChatWindow(aboveElem?: HTMLElement): void
    {
        aboveElem = aboveElem ?? this.getMyParticipantELem();
        this.room.showChatWindow(aboveElem);
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

    showSettings(aboveElem: HTMLElement)
    {
        if (!this.settingsWindow) {
            this.settingsWindow = new SettingsWindow(this);
            /* await */ this.settingsWindow.show({ 'above': aboveElem, onClose: () => { this.settingsWindow = null; } });
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

    evaluateStayOnTabChange(): void
    {
        const stay = this.backpackIsOpen
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

    // Backgound pages dont allow timers
    // and alerts were unreliable on first test.
    // So, let the content script call the background
    private pingBackgroundToKeepConnectionAliveSec: number = as.Float(Config.get('xmpp.pingBackgroundToKeepConnectionAliveSec'), 180);
    private pingBackgroundToKeepConnectionAliveTimer: number = undefined;
    private pingBackgroundToKeepConnectionAlive()
    {
        if (this.pingBackgroundToKeepConnectionAliveTimer === undefined) {
            this.pingBackgroundToKeepConnectionAliveTimer = window.setTimeout(async () =>
            {
                try {
                    await BackgroundMessage.pingBackground();
                } catch (error) {
                    //
                }

                this.pingBackgroundToKeepConnectionAliveTimer = undefined;
                this.pingBackgroundToKeepConnectionAlive();
            }, this.pingBackgroundToKeepConnectionAliveSec * 1000);
        }
    }

    private stop_pingBackgroundToKeepConnectionAlive()
    {
        if (this.pingBackgroundToKeepConnectionAliveTimer !== undefined) {
            clearTimeout(this.pingBackgroundToKeepConnectionAliveTimer);
            this.pingBackgroundToKeepConnectionAliveTimer = undefined;
        }
    }

    // IPC

    onDirectRuntimeMessage(message: any)
    {
        this.onSimpleRuntimeMessage(message);
    }

    private onRuntimeMessage(message, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void): any
    {
        this.onSimpleRuntimeMessage(message);
    }

    private onSimpleRuntimeMessage(message): boolean
    {
        switch (message.type) {
            case ContentMessage.type_recvStanza: {
                this.handle_recvStanza(message.stanza);
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

            case ContentMessage.type_sendPresence: {
                this.handle_sendPresence();
                return false;
            } break;

            case ContentMessage.type_onBackpackShowItem: {
                this.backpackWindow?.onShowItem(message.data.id, message.data.properties);
                return false;
            } break;
            case ContentMessage.type_onBackpackSetItem: {
                this.backpackWindow?.onSetItem(message.data.id, message.data.properties);
                return false;
            } break;
            case ContentMessage.type_onBackpackHideItem: {
                this.backpackWindow?.onHideItem(message.data.id);
                return false;
            } break;

            case ContentMessage.type_chatHistoryDeleted: {
                this.getRoom().onChatHistoryDeleted(message.data.deletions);
                return false;
            } break;
        }
        return true;
    }

    handle_recvStanza(jsStanza: unknown): void
    {
        const stanza: XmlElement = Utils.jsObject2xmlObject(jsStanza);
        if (Utils.logChannel('contentTraffic', false)) {
            log.debug('ContentApp.recvStanza', stanza, as.String(stanza.attrs.type, stanza.name === 'presence' ? 'available' : 'normal'), 'to=', stanza.attrs.to, 'from=', stanza.attrs.from);
        }

        if (this.xmppWindow) {
            const stanzaText = stanza.toString();
            this.xmppWindow.showLine('_IN_', stanzaText);
        }

        switch (stanza.name) {
            case 'presence': this.onPresence(stanza); break;
            case 'message': this.onMessage(stanza); break;
            case 'iq': this.onIq(stanza); break;
        }
    }

    handle_userSettingsChanged(): any
    {
        // this.messageHandler({ 'type': ContentAppNotification.type_restart });
        if (this.room) {
            this.room.onUserSettingsChanged();
        }
    }

    handle_clientNotification(request: WeblinClientApi.ClientNotificationRequest): any
    {
        const title = as.String(request.title);
        const text = as.String(request.text);
        const iconType = as.String(request.iconType, WeblinClientApi.ClientNotificationRequest.defaultIcon);
        const links = request.links;
        const toast = new SimpleToast(this, request.type, as.Float(Config.get('client.notificationToastDurationSec'), 30), iconType, title, text);
        if (links) {
            links.forEach(link =>
            {
                toast.actionButton(link.text, () =>
                {
                    if (link.href.startsWith('client:')) {
                        const cmd = link.href.substring('client:'.length);
                        if (cmd === 'toggleBackpack') {
                            this.showBackpackWindow();
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

    handle_sendPresence(): void
    {
        this.room?.sendPresence();
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

            if (newRoomJid == this.roomJid) {
                this.room.setPageUrl(pageUrl);
                log.debug('ContentApp.checkPageUrlChanged', 'Same room', pageUrl, ' => ', this.roomJid);
                return;
            }

            this.leavePage();

            if (newRoomJid != '') {
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

        this.room = new Room(this, roomJid, pageUrl, roomDestination, await this.getSavedPosition());
        if (Utils.logChannel('urlMapping', false)) { log.info('ContentApp.enterRoom', roomJid); }

        this.room.enter();
    }

    leaveRoom(): void
    {
        if (this.room) {
            if (Utils.logChannel('urlMapping', false)) { log.info('ContentApp.leaveRoom', this.room.getJid()); }

            this.room.leave();
            this.room = null;
        }
    }

    onPresence(stanza: XmlElement): void
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

    onMessage(stanza: XmlElement): void
    {
        const from = jid(stanza.attrs.from);
        const roomOrUser = from.bare().toString();

        if (roomOrUser === this.room?.getJid()) {
            this.room?.onMessage(stanza);
        }
    }

    onIq(stanza: XmlElement): void
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
        stanza: XmlElement,
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
            if (this.xmppWindow) {
                const stanzaText = stanza.toString();
                this.xmppWindow.showLine('OUT', stanzaText);
            }
            if (stanzaId && responseHandler) {
                this.stanzasResponses[stanzaId] = responseHandler;
            }
            await BackgroundMessage.sendStanza(stanza);
        })().catch(error =>
        {
            this.onCriticalError(ErrorWithData.ofError(
                error, 'BackgroundMessage.sendStanza failed!', { stanza: stanza }));
        });
    }

    // Error handling

    public onError(error: Error): void
    {
        log.info({ error: prepareValueForLog(error) }); // Log to info channel only so it doesn't appear on extensions page.
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
        return (as.Int(elem.style.zIndex) == this.getFrontIndex(layer));
    }

    private dropzoneELem: HTMLElement = null;
    showDropzone()
    {
        this.hideDropzone();

        this.dropzoneELem = <HTMLElement>$('<div class="n3q-base n3q-dropzone" />').get(0);
        $(this.display).append(this.dropzoneELem);
        this.toFront(this.dropzoneELem, ContentApp.LayerAboveEntities);
    }

    hideDropzone()
    {
        if (this.dropzoneELem) {
            $(this.dropzoneELem).remove();
            this.dropzoneELem = null;
        }
    }

    hiliteDropzone(state: boolean)
    {
        if (this.dropzoneELem) {
            if (state) {
                $(this.dropzoneELem).addClass('n3q-dropzone-hilite');
            } else {
                $(this.dropzoneELem).removeClass('n3q-dropzone-hilite');
            }
        }
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
            let avatar = await Memory.getLocal(Utils.localStorageKey_Avatar(), '');
            if (avatar == '') {
                avatar = AvatarGallery.getRandomAvatar();
                await Memory.setLocal(Utils.localStorageKey_Avatar(), avatar);
            }
        } catch (error) {
            log.info(error);
            Panic.now();
        }
    }

    async getUserAvatar(): Promise<string>
    {
        try {
            return await Memory.getLocal(Utils.localStorageKey_Avatar(), '004/pinguin');
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
                this.getRoom()?.sendPresence().catch(error => {/* already handled */});
            }
            onDeleted?.(itemId);
        })().catch(error =>
        {
            this.onError(ErrorWithData.ofError(error, 'Error caught!', { itemId: itemId }));
            onFailed?.(itemId);
        });
    }

}
