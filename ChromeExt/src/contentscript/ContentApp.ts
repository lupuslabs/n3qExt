import log = require('loglevel');
import * as $ from 'jquery';
import { xml, jid } from '@xmpp/client';
import { as } from '../lib/as';
import { Utils } from '../lib/Utils';
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
import { HelloWorld } from './HelloWorld';
import { PropertyStorage } from './PropertyStorage';
import { Room } from './Room';
import { VpiResolver } from './VpiResolver';
import { SettingsWindow } from './SettingsWindow';
import { XmppWindow } from './XmppWindow';
import { ChangesWindow } from './ChangesWindow';
import { TestWindow } from './TestWindow';
import { BackpackWindow } from './BackpackWindow';
import { SimpleToast } from './Toast';
import { IframeApi } from './IframeApi';
import { RandomNames } from '../lib/RandomNames';

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
interface StanzaResponseHandler { (stanza: xml): void }

export class ContentApp
{
    private display: HTMLElement;
    private pageUrl: string;
    private presetPageUrl: string;
    private roomJid: string;
    private room: Room;
    private propertyStorage: PropertyStorage = new PropertyStorage();
    private babelfish: Translator;
    private vpi: VpiResolver;
    private xmppWindow: XmppWindow;
    private backpackWindow: BackpackWindow;
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
    getBackpackWindow(): BackpackWindow { return this.backpackWindow; }

    constructor(protected appendToMe: HTMLElement, private messageHandler: ContentAppNotificationCallback)
    {
    }

    async start(params: any)
    {
        if (params && params.nickname) { await Memory.setLocal(Utils.localStorageKey_Nickname(), params.nickname); }
        if (params && params.avatar) { await Memory.setLocal(Utils.localStorageKey_Avatar(), params.avatar); }
        if (params && params.pageUrl) { this.presetPageUrl = params.pageUrl; }
        if (params && params.x) { await Memory.setLocal(Utils.localStorageKey_X(), params.x); }

        try {
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
            let config = await BackgroundMessage.getConfigTree(Config.onlineConfigName);
            Config.setOnlineTree(config);
        } catch (error) {
            log.debug(error.message);
            Panic.now();
        }
        if (Panic.isOn) { return; }

        try {
            let config = await BackgroundMessage.getConfigTree(Config.devConfigName);
            Config.setDevTree(config);
        } catch (error) {
            log.debug(error.message);
        }

        Environment.NODE_ENV = Config.get('environment.NODE_ENV', null);

        {
            let pageUrl = Browser.getCurrentPageUrl();
            let parsedUrl = new URL(pageUrl);
            if (parsedUrl.hash.search('#n3qdisable') >= 0) {
                return;
            }
            let ignoredDomains: Array<string> = Config.get('vp.ignoredDomainSuffixes', []);
            for (let i = 0; i < ignoredDomains.length; i++) {
                if (parsedUrl.host.endsWith(ignoredDomains[i])) {
                    return;
                }
            }
        }

        await Utils.sleep(as.Float(Config.get('vp.deferPageEnterSec', 1)) * 1000);

        let navLang = Config.get('i18n.overrideBrowserLanguage', '');
        if (navLang == '') {
            navLang = navigator.language;
        }
        let language: string = Translator.mapLanguage(navLang, lang => { return Config.get('i18n.languageMapping', {})[lang]; }, Config.get('i18n.defaultLanguage', 'en-US'));
        this.babelfish = new Translator(Config.get('i18n.translations', {})[language], language, Config.get('i18n.serviceUrl', ''));

        this.vpi = new VpiResolver(BackgroundMessage, Config);
        this.vpi.language = Translator.getShortLanguageCode(this.babelfish.getLanguage());

        await this.assertActive();
        if (Panic.isOn) { return; }
        await this.assertUserNickname();
        if (Panic.isOn) { return; }
        await this.assertUserAvatar();
        if (Panic.isOn) { return; }
        await this.assertSavedPosition();
        if (Panic.isOn) { return; }

        $('div#n3q').remove();
        let page = $('<div id="n3q" class="n3q-base n3q-hidden-print" />').get(0);
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
        this.room.getParticipant(this.room.getMyNick()).showEffect('pulse');

        //this.room.getParticipant(this.room.getMyNick()).setRange(-250, 50);
        //this.sndChat.play();
        //new SimpleToast(this, 'test', 4, 'warning', 'Heiner (dev)', 'greets').show();
        //this.showBackpackWindow(null);
    }

    navigate(url: string, target: string = '_top')
    {
        if (target == '' || target == '_top') {
            window.location.href = url;
        } else {
            window.location.href = url;
        }
    }

    playSound(fluteSound: any)
    {
    }

    getMyParticipantELem(): HTMLElement
    {
        if (this.room) {
            let participant = this.room.getParticipant(this.room.getMyNick());
            if (participant) {
                return participant.getElem();
            }
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
        aboveElem = aboveElem ?? this.getMyParticipantELem();
        if (this.room) {
            let participant = this.room.getParticipant(this.room.getMyNick());
            if (participant) {
                let displayName = participant.getDisplayName();
                this.room.showVideoConference(aboveElem, displayName);
            }
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
        let stay = this.backpackIsOpen
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
    private pingBackgroundToKeepConnectionAliveSec: number = Config.get('xmpp.pingBackgroundToKeepConnectionAliveSec', 180);
    private pingBackgroundToKeepConnectionAliveTimer: number = undefined;
    private pingBackgroundToKeepConnectionAlive()
    {
        if (this.pingBackgroundToKeepConnectionAliveTimer == undefined) {
            this.pingBackgroundToKeepConnectionAliveTimer = <number><unknown>setTimeout(async () =>
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
        if (this.pingBackgroundToKeepConnectionAliveTimer != undefined) {
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

    private onSimpleRuntimeMessage(message): any
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
        }
        return true;
    }

    handle_recvStanza(jsStanza: any): any
    {
        let stanza: xml = Utils.jsObject2xmlObject(jsStanza);
        if (Utils.logChannel('contentTraffic', false)) {
            log.debug('ContentApp.recvStanza', stanza, as.String(stanza.attrs.type, stanza.name == 'presence' ? 'available' : 'normal'), 'to=', stanza.attrs.to, 'from=', stanza.attrs.from);
        }

        if (this.xmppWindow) {
            let stanzaText = stanza.toString();
            this.xmppWindow.showLine('_IN_', stanzaText);
        }

        switch (stanza.name) {
            case 'presence': this.onPresence(stanza); break;
            case 'message': this.onMessage(stanza); break;
            case 'iq': this.onIq(stanza); break;
        }

        // return true;
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
        let title = as.String(request.title, '');
        let text = as.String(request.text, '');
        let iconType = as.String(request.iconType, WeblinClientApi.ClientNotificationRequest.defaultIcon);
        let links = request.links;
        let what = '';
        let detail = request.detail;
        if (detail) {
            what = as.String(detail.what, '');
        }
        let toast = new SimpleToast(this, 'itemframe-' + iconType + what, Config.get('client.notificationToastDurationSec', 30), iconType, title, text);
        if (links) {
            links.forEach(link =>
            {
                toast.actionButton(link.text, () => { document.location.href = link.href; });
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
        if (this.room) {
            this.room.sendPresence();
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

            let strippedUrlPrefixes = Config.get('vp.strippedUrlPrefixes', []);
            let notStrippedUrlPrefixes = Config.get('vp.notStrippedUrlPrefixes', []);
            for (let i = 0; i < strippedUrlPrefixes.length; i++) {
                if (pageUrl.startsWith(strippedUrlPrefixes[i]) && !Utils.startsWith(pageUrl, notStrippedUrlPrefixes)) {
                    pageUrl = pageUrl.substring(strippedUrlPrefixes[i].length);
                    if (!pageUrl.startsWith('https://')) {
                        pageUrl = 'https://' + pageUrl;
                    }
                }
            }

            let newSignificatParts = pageUrl ? this.getSignificantUrlParts(pageUrl) : '';
            let oldSignificatParts = this.pageUrl ? this.getSignificantUrlParts(this.pageUrl) : '';
            if (newSignificatParts == oldSignificatParts) { return }

            if (Utils.logChannel('urlMapping', false)) { log.info('Page changed', this.pageUrl, ' => ', pageUrl); }
            this.pageUrl = pageUrl;

            let newRoomJid = await this.vpiMap(pageUrl);

            if (newRoomJid == this.roomJid) {
                this.room.setPageUrl(pageUrl);
                log.debug('ContentApp.checkPageUrlChanged', 'Same room', pageUrl, ' => ', this.roomJid);
                return;
            }

            this.leavePage();

            this.roomJid = newRoomJid;
            if (Utils.logChannel('urlMapping', false)) { log.info('Mapped', pageUrl, ' => ', this.roomJid); }

            if (this.roomJid != '') {
                this.enterRoom(this.roomJid, pageUrl, pageUrl);
                if (Config.get('points.enabled', false)) {
                    /* await */ BackgroundMessage.pointsActivity(Pid.PointsChannelNavigation, 1);
                }
            }

        } catch (error) {
            log.info(error);
        }
    }

    getSignificantUrlParts(url: string)
    {
        let parsedUrl = new URL(url)
        return parsedUrl.host + parsedUrl.pathname + parsedUrl.search;
    }

    async vpiMap(url: string): Promise<string>
    {
        let locationUrl = await this.vpi.map(url);
        let roomJid = ContentApp.getRoomJidFromLocationUrl(locationUrl);
        return roomJid;
    }

    private checkPageUrlSec: number = Config.get('room.checkPageUrlSec', 5);
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
                let url = new URL(locationUrl);
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
    //         let vpi = new VpiResolver(BackgroundMessage, Config);
    //         vpi.language = Translator.getShortLanguageCode(this.babelfish.getLanguage());

    //         this.locationUrl = await vpi.map(pageUrl);
    //         log.debug('Mapped', pageUrl, ' => ', this.locationUrl);

    //         let roomJid = ContentApp.getRoomJidFromLocationUrl(this.locationUrl);
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

    onPresence(stanza: xml): void
    {
        let isHandled = false;

        let from = jid(stanza.attrs.from);
        let roomOrUser = from.bare();

        if (!isHandled) {
            if (this.room) {
                if (roomOrUser == this.room.getJid()) {
                    this.room.onPresence(stanza);
                    isHandled = true;
                }
            }
        }
    }

    onMessage(stanza: xml): void
    {
        let from = jid(stanza.attrs.from);
        let roomOrUser = from.bare();

        if (this.room) {
            if (roomOrUser == this.room.getJid()) {
                this.room.onMessage(stanza);
            }
        }
    }

    onIq(stanza: xml): void
    {
        if (stanza.attrs) {
            let id = stanza.attrs.id;
            if (id) {
                if (this.stanzasResponses[id]) {
                    this.stanzasResponses[id](stanza);
                    delete this.stanzasResponses[id];
                }
            }
        }
    }

    async sendStanza(stanza: xml, stanzaId: string = null, responseHandler: StanzaResponseHandler = null): Promise<void>
    {
        if (Utils.logChannel('contentTraffic', false)) {
            log.debug('ContentApp.sendStanza', stanza, as.String(stanza.attrs.type, stanza.name == 'presence' ? 'available' : 'normal'), 'to=', stanza.attrs.to);
        }
        try {
            if (this.xmppWindow) {
                let stanzaText = stanza.toString();
                this.xmppWindow.showLine('OUT', stanzaText);
            }

            if (stanzaId && responseHandler) {
                this.stanzasResponses[stanzaId] = responseHandler;
            }

            await BackgroundMessage.sendStanza(stanza);
        } catch (error) {
            log.info(error);
            Panic.now();
        }
    }

    // Window management

    public static LayerBelowEntities = 20;
    public static LayerEntity = 30;
    public static LayerEntityContent = 31;
    public static LayerEntityTooltip = 32;
    public static LayerPopup = 40;
    public static LayerAboveEntities = 45;
    public static LayerWindow = 50;
    public static LayerWindowContent = 51;
    public static LayerDrag = 99;
    private static layerSize = 10 * 1000 * 1000;
    private frontIndex: { [layer: number]: number; } = {};
    toFront(elem: HTMLElement, layer: number)
    {
        this.incrementFrontIndex(layer);
        let absoluteIndex = this.getFrontIndex(layer);
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
        return (as.Int(elem.style.zIndex, 0) == this.getFrontIndex(layer));
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
            let active = await Memory.getLocal(Utils.localStorageKey_Active(), '');
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
            let active = await Memory.getLocal(Utils.localStorageKey_Active(), 'true');
            return as.Bool(active, false);
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
                x = Utils.randomInt(as.Int(Config.get('room.randomEnterPosXMin', 400)), as.Int(Config.get('room.randomEnterPosXMax', 700)))
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
        let pos: number = 300;
        let width = this.display.offsetWidth;
        if (!width) { width = 500; }
        if (key) {
            pos = Utils.pseudoRandomInt(250, width - 80, key, '', 7237);
        } else {
            pos = Utils.randomInt(250, width - 80);
        }
        return pos;
    }
}
