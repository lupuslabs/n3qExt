import $ from 'jquery';
import { jid } from '@xmpp/jid';
import * as ltx from 'ltx';
import log = require('loglevel');
import { is } from '../lib/is';
import { as } from '../lib/as';
import { Config } from '../lib/Config';
import { ErrorWithData, Utils } from '../lib/Utils';
import { IObserver } from '../lib/ObservableProperty';
import { ItemProperties, Pid } from '../lib/ItemProperties';
import { BackgroundMessage } from '../lib/BackgroundMessage';
import { ItemException } from '../lib/ItemException';
import { ContentApp } from './ContentApp';
import { Entity } from './Entity';
import { Room } from './Room';
import { Avatar } from './Avatar';
import { Nickname } from './Nickname';
import { Chatout } from './Chatout';
import { Chatin } from './Chatin';
import { RoomItem } from './RoomItem';
import { ItemExceptionToast, SimpleToast } from './Toast';
import { PointsBar } from './PointsBar';
import { ActivityBar } from './ActivityBar';
import { BadgesController } from './BadgesController';
import { BackpackItem } from './BackpackItem';
import { WeblinClientIframeApi } from '../lib/WeblinClientIframeApi';
import { Environment } from '../lib/Environment';
import { Memory } from '../lib/Memory';
import { DomUtils } from '../lib/DomUtils';
import { PointerEventData } from '../lib/PointerEventData';
import { ChatUtils } from '../lib/ChatUtils';
import { Menu } from './Menu';
import { OwnParticipantMenu } from './OwnParticipantMenu';
import { OtherParticipantMenu } from './OtherParticipantMenu';
import { AnimationsDefinition } from './AnimationsXml';
import { TutorialWindow } from './TutorialWindow';
import introYouCloseIconDataUrl from '../assets/icons/inverse-close-circle-o.svg';

export class Participant extends Entity
{
    private menuDisplay: Menu;
    private nicknameDisplay: Nickname;
    private pointsDisplay: PointsBar;
    private activityDisplay: ActivityBar;
    private badgesDisplay: BadgesController;
    private chatoutDisplay: Chatout;
    private chatinDisplay: Chatin;
    private isFirstPresence: boolean = true;
    private userId: string = '';
    private decorationsVisibleByLongclick: boolean = false;
    private hideDecorationsTimeoutHandle: number|null = null;
    private supportsPrivateChat: boolean = false;
    private canReceiveItems: boolean = false;
    private supportsPersonApi: boolean = false;

    constructor(app: ContentApp, room: Room, roomNick: string, isSelf: boolean)
    {
        super(app, room, roomNick, isSelf);

        this.elem.classList.add('participant');
        this.elem.setAttribute('data-nick', roomNick);

        if (this.isSelf) {
            this.userId = this.app.getUserId();
            this.supportsPrivateChat = this.app.instantMessageManager.isFeatureEnabled();
            this.canReceiveItems = Utils.isBackpackEnabled();
            this.supportsPersonApi = Utils.isBackpackEnabled();
            this.elem.classList.add('participant-self');
            if (!this.app.getIsExclusiveWindowPopup()) {
                this.showIntroYouOnce().catch(error => this.app.onError(error));
                this.showTutorialOnce().catch(error => this.app.onError(error));
            }
        } else {
            this.elem.classList.add('participant-other');
        }

        if (this.isSelf) {
            this.menuDisplay = new OwnParticipantMenu(this.app, this);
        } else {
            this.menuDisplay = new OtherParticipantMenu(this.app, this);
        }

        this.chatoutDisplay = new Chatout(this.app, this.elem);
    }

    getBadgesDisplay(): BadgesController|null { return this.badgesDisplay; }
    getChatout(): Chatout { return this.chatoutDisplay; }
    getUserId(): string { return this.userId; }
    getSupportsPrivateChat(): boolean { return this.supportsPrivateChat; }
    getCanReceiveItems(): boolean { return this.canReceiveItems; }
    getSupportsPersonApi(): boolean { return this.supportsPersonApi; }

    getDisplayName(): string
    {
        let name = this.roomNick;
        if (this.nicknameDisplay) {
            name = this.nicknameDisplay.getNickname();
        }
        return name;
    }

    async showIntroYouOnce(): Promise<void>
    {
        const maxShowIntroYou = as.Int(Config.get('client.showIntroYou'));
        if (maxShowIntroYou > 0) {
            let countIntroYou = as.Int(await Memory.getLocal('client.introYou'));
            if (countIntroYou < maxShowIntroYou) {
                countIntroYou++;
                await Memory.setLocal('client.introYou', countIntroYou);

                const introYouElem = DomUtils.elemOfHtml(''
                    + '<div class="participant-intro-you n3q-bounce" data-translate="children">'
                    + '  <svg width="72" height="48" xmlns="http://www.w3.org/2000/svg">'
                    + '    <g>'
                    + '      <path stroke-width="0" stroke="#000" d="m0,25l36,-24l36,24l-18,0l0,24l-36,0l0,-24l-18,0l0,0z" id="svg_1" transform="rotate(-180 36 24)"/>'
                    + '    </g>'
                    + '  </svg>'
                    + '  <div class="text" data-translate="children"><div data-translate="text:Intro">You</div></div>'
                    + '</div>');
                const onClose = () => {
                    Memory.setLocal('client.introYou', maxShowIntroYou + 1).catch(error => this.app.onError(error));
                    introYouElem.remove();
                };
                const closeElem = this.app.uiHelper.makeWindowButton(onClose, 'overlay', 'close', introYouCloseIconDataUrl, 'Intro.Got it', 'Got it');
                introYouElem.append(closeElem);
                this.app.translateElem(introYouElem);
                this.getElem().append(introYouElem);
            }
        }
    }

    async showTutorialOnce(): Promise<void>
    {
        const maxShowTutorial = as.Int(Config.get('client.showTutorial'), 0);
        if (maxShowTutorial > 0) {
            let countTutorial = as.Int(await Memory.getLocal(TutorialWindow.localStorage_TutorialPopupCount_Key));
            if (countTutorial < maxShowTutorial && ! await TutorialWindow.isDontShow()) {
                if (await TutorialWindow.isExperiencedUser()) {
                    countTutorial = maxShowTutorial + 1;
                } else {
                    countTutorial++;
                }
                await Memory.setLocal(TutorialWindow.localStorage_TutorialPopupCount_Key, countTutorial);

                new TutorialWindow(this.app).show({});
            }
        }
    }

    remove(): void
    {
        this.avatarDisplay?.stop();
        this.nicknameDisplay?.stop();
        this.badgesDisplay?.stop();
        this.chatoutDisplay?.stop();
        this.chatinDisplay?.stop();
        this.closeMenu();
        super.remove();
    }

    public onAvatarAnimationsParsed(avatarAnimations: AnimationsDefinition): void
    {
        this.chatoutDisplay.onAvatarAnimationsParsed(avatarAnimations);
        this.chatinDisplay?.onAvatarAnimationsParsed(avatarAnimations);
    }

    // presence

    async onPresenceAvailable(stanza: ltx.Element): Promise<void>
    {
        let hasPosition: boolean = false;
        let newX: number = 123;

        let hasCondition: boolean = false;
        let newCondition: string = '';

        let newAvailability: string = '';
        let newStatusMessage: string = '';

        let xmppNickname = '';

        let vpNickname = '';
        let vpAvatarId = ''; // Todo: Remove after old clients updated.
        let vpAnimationsUrl = '';
        let vpImageUrl = '';
        let vpPoints = '';
        let vpBadges = '';

        let hasIdentityUrl = false;

        const isFirstPresence = this.isFirstPresence;
        this.isFirstPresence = false;

        // log.debug('#### recv', stanza.children[1].attrs);

        {
            const from = stanza.attrs.from;
            if (!is.nil(from)) {
                const fromJid = jid(from);
                const nickname = as.String(fromJid.getResource());
                if (nickname !== '') {
                    xmppNickname = nickname;
                }
            }
        }

        {
            const stateNode = stanza.getChildren('x').find(stanzaChild => (stanzaChild.attrs == null) ? false : stanzaChild.attrs.xmlns === 'firebat:avatar:state');
            if (stateNode) {
                const positionNode = stateNode.getChild('position');
                if (positionNode) {
                    newX = as.Int(positionNode.attrs.x, -1);
                    if (newX !== -1) {
                        hasPosition = true;
                    }
                }
                hasCondition = true;
                const conditionNode = stateNode.getChild('condition');
                if (conditionNode) {
                    newCondition = as.String(conditionNode.attrs.status);
                }
            }
        }

        {
            const identityNode = stanza.getChildren('x').find(stanzaChild => (stanzaChild.attrs == null) ? false : stanzaChild.attrs.xmlns === 'firebat:user:identity');
            if (identityNode != null) {
                const attrs = identityNode.attrs;
                const url = as.String(attrs.src);
                const digest = as.String(attrs.digest);

                if (url !== '') {
                    hasIdentityUrl = true;
                    this.app.getPropertyStorage().setIdentity(this.userId, url, digest);
                }
            }
        }

        {
            const vpPropsNode = stanza.getChildren('x').find(stanzaChild => (stanzaChild.attrs == null) ? false : stanzaChild.attrs.xmlns === 'vp:props');
            if (vpPropsNode) {
                const attrs = vpPropsNode.attrs;
                if (attrs) {
                    vpNickname = as.String(attrs.Nickname);
                    if (vpNickname === '') { vpNickname = as.String(attrs.nickname); }
                    vpAvatarId = as.String(attrs.AvatarId);
                    if (vpAvatarId === '') { vpAvatarId = as.String(attrs.avatar); }
                    vpAnimationsUrl = as.String(attrs.AnimationsUrl);
                    vpAnimationsUrl = as.String(attrs.AvatarUrl, vpAnimationsUrl);
                    vpImageUrl = as.String(attrs.ImageUrl);
                    vpPoints = as.String(attrs.Points);
                    vpBadges = as.String(attrs.Badges);
                    this.userId = as.String(attrs.userId);
                    const hasUserId = this.userId.length !== 0;
                    this.canReceiveItems = hasUserId && as.Bool(attrs.canReceiveItems);
                    this.supportsPersonApi = hasUserId && as.Bool(attrs.supportsPersonApi);
                    this.supportsPrivateChat = hasUserId && as.Bool(attrs.supportsPrivateChat);
                }
            }
        }

        { // <show>: dnd, away, xa
            const showNode = stanza.getChild('show');
            if (showNode) {
                newAvailability = showNode.getText();
                switch (newAvailability) {
                    case 'chat': newCondition = ''; hasCondition = true; break;
                    case 'available': newCondition = ''; hasCondition = true; break;
                    case 'away': newCondition = 'sleep'; hasCondition = true; break;
                    case 'dnd': newCondition = 'sleep'; hasCondition = true; break;
                    case 'xa': newCondition = 'sleep'; hasCondition = true; break;
                    default: break;
                }
            }
        }

        { // <status>: Status message (text)
            const statusNode = stanza.getChild('status');
            if (statusNode) {
                newStatusMessage = statusNode.getText();
            }
        }

        // hasIdentityUrl = false;
        // vpAvatar = '004/pinguin';
        // vpAvatar = '';
        // vpAnimationsUrl = 'https://weblin-avatar.dev.sui.li/items/baum/avatar.xml';
        // vpAnimationsUrl = '';
        // vpImageUrl = 'https://weblin-avatar.dev.sui.li/items/baum/idle.png';
        // vpImageUrl = '';

        if (isFirstPresence) {
            this.avatarDisplay = new Avatar(this.app, this, this.isSelf, true);
            if (Utils.isBackpackEnabled()) {
                this.avatarDisplay.addClass('participant-avatar');
            }

            if (Utils.isBadgesEnabled()) {
                this.badgesDisplay = new BadgesController(this.app, this, this.getElem());
            }

            // Uses this.badgesDisplay to decide about presence of a menu item:
            this.nicknameDisplay = new Nickname(this.app, this, this.isSelf, this.getElem());
            if (!this.isSelf) {
                if (Config.get('room.nicknameOnHover', true)) {
                    const nicknameElem = this.nicknameDisplay.getElem();
                    nicknameElem.style.display = 'none';
                }
            }

            if (Config.get('points.enabled', false) || Config.get('points.passiveEnabled', false)) {
                this.pointsDisplay = new PointsBar(this.app, this, this.getElem());
                if (!this.isSelf) {
                    if (Config.get('room.pointsOnHover', true)) {
                        const elem = this.pointsDisplay.getElem();
                        elem.style.display = 'none';
                    }
                }
            }

            if (this.isSelf && Config.get('points.activityDisplayEnabled', false)) {
                this.activityDisplay = new ActivityBar(this.app, this, this.getElem());
                if (!this.isSelf) {
                    if (Config.get('room.pointsOnHover', true)) {
                        const elem = this.activityDisplay.getElem();
                        elem.style.display = 'none';
                    }
                }
            }

            if (this.isSelf) {
                this.chatinDisplay = new Chatin(this.app, this, this.elem);
            }
        }

        let hasAvatar = false;
        if (this.avatarDisplay) {
            if (vpAvatarId !== '') {
                const animationsUrl = this.app.getAvatarGallery().getAvatarByIdOpt(vpAvatarId)?.getConfigUrl() ?? '';
                const proxiedAnimationsUrl = as.String(Config.get('avatars.animationsProxyUrlTemplate', 'https://webex.vulcan.weblin.com/Avatar/InlineData?url={url}')).replace('{url}', encodeURIComponent(animationsUrl));
                this.avatarDisplay?.updateObservableProperty('AnimationsUrl', proxiedAnimationsUrl);
                hasAvatar = true;
            } else if (vpAnimationsUrl !== '') {
                const proxiedAnimationsUrl = as.String(Config.get('avatars.animationsProxyUrlTemplate', 'https://webex.vulcan.weblin.com/Avatar/InlineData?url={url}')).replace('{url}', encodeURIComponent(vpAnimationsUrl));
                this.avatarDisplay?.updateObservableProperty('AnimationsUrl', proxiedAnimationsUrl);
                hasAvatar = true;
            } else {
                if (vpImageUrl !== '') {
                    this.avatarDisplay?.updateObservableProperty('ImageUrl', vpImageUrl);
                    hasAvatar = true;
                }
                if (hasIdentityUrl) {
                    this.app.getPropertyStorage().watch(this.userId, 'AnimationsUrl', this.avatarDisplay);
                    hasAvatar = true;
                }
            }
        }

        if (this.nicknameDisplay) {
            if (vpNickname !== '') {
                if (vpNickname !== this.nicknameDisplay.getNickname()) {
                    this.nicknameDisplay.setNickname(vpNickname);
                }
            } else {
                if (xmppNickname !== this.nicknameDisplay.getNickname()) {
                    this.nicknameDisplay.setNickname(xmppNickname);
                }
                if (hasIdentityUrl && isFirstPresence) {
                    this.app.getPropertyStorage().watch(this.userId, 'Nickname', this.nicknameDisplay);
                }
            }
        }

        if (this.pointsDisplay) {
            if (vpPoints !== '') {
                const newPoints = as.Int(vpPoints);
                if (newPoints !== this.pointsDisplay.getPoints()) {
                    this.pointsDisplay.setPoints(newPoints);
                }
            } else {
                if (hasIdentityUrl && isFirstPresence) {
                    this.app.getPropertyStorage().watch(this.userId, 'Points', this.pointsDisplay);
                }
            }
        }

        this.badgesDisplay?.updateBadgesFromPresence(vpBadges);

        if (this.isSelf) {
            await this.pointsDisplay?.showTitleWithActivities();
        }

        if (hasCondition) {
            this.avatarDisplay?.setCondition(newCondition);
        }

        this.setAvailability(newAvailability, newStatusMessage);

        if (isFirstPresence) {
            if (!hasPosition) {
                newX = this.isSelf ? await this.app.getSavedPosition() : this.app.getDefaultPosition(this.roomNick);
            }
            if (newX < 0) { newX = 100; }
            this.setPosition(newX);
        } else {
            if (hasPosition) {
                if (this.getPosition() !== newX) {
                    this.move(newX);
                }
            }
        }

        if (isFirstPresence) {
            if (this.isSelf) {
                this.show(true, as.Float(Config.get('room.fadeInSec'), 0.3));
            } else {
                this.show(true);
            }
        }

        if (isFirstPresence) {
            this.sendParticipantEventToAllScriptFrames({ event: 'enter' });
        }

        if (isFirstPresence) {
            // if (this.isSelf && Environment.isDevelopment()) { this.showChatWindow(); }
            if (this.isSelf) {
                if (Config.get('room.chatlogEnteredTheRoomSelf', true)) {
                    this.room?.showChatMessage(null, 'participantStatus', this.userId, this.roomNick, 'entered the room');
                }
            } else {
                if (this.room?.iAmAlreadyHere()) {
                    if (Config.get('room.chatlogEnteredTheRoom', true)) {
                        this.room?.showChatMessage(null, 'participantStatus', this.userId, this.roomNick, 'entered the room');
                    }
                } else {
                    if (Config.get('room.chatlogWasAlreadyThere', true)) {
                        this.room?.showChatMessage(null, 'participantStatus', this.userId, this.roomNick, 'was already there');
                    }
                }
            }
        }

        if (isFirstPresence) {
            if (!hasAvatar && Config.get('room.vCardAvatarFallback', false)) {
                this.fetchVcardImage(this.avatarDisplay);
            }
        }

        // if (isFirstPresence) {
        //     if (this.isSelf) {
        //         let pageUrl = this.room?.getPageUrl();
        //         if (pageUrl) {
        //             let parsedUrl = new URL(pageUrl);
        //             let domain = parsedUrl.host;
        //             if (domain) {
        //                 if (Config.get('room.autoOpenVidConfDomains', []).includes(domain)) {
        //                     this.app.showVidconfWindow(this.room.getMyParticipant()?.getElem());
        //                 }
        //             }
        //         }
        //     }
        // }
    }

    onPresenceUnavailable(stanza: ltx.Element): void
    {
        this.remove();

        if (Config.get('room.chatlogLeftTheRoom', true)) {
            this.room?.showChatMessage(null, 'participantStatus', this.userId, this.roomNick, 'left the room');
        }

        this.sendParticipantEventToAllScriptFrames({ event: 'leave' });
    }

    setAvailability(show: string, status: string): void
    {
        switch (show) {
            case 'away':
            case 'xa':
            case 'dnd':
                this.elem.setAttribute('title', this.app.translateText('StatusMessage.' + status));
                this.elem.classList.add('ghost');
                break;
            default:
                this.elem.removeAttribute('title');
                this.elem.classList.remove('ghost');
                break;
        }
    }

    fetchVcardImage(avatarDisplay: IObserver)
    {
        const stanzaId = Utils.randomString(15);
        const iq = new ltx.Element('iq', { 'type': 'get', 'id': stanzaId, 'to': this.room.getJid() + '/' + this.roomNick });
        iq.c('vCard', { 'xmlns': 'vcard-temp' });
        this.app.sendStanza(iq, stanzaId, (stanza) =>
        {
            const imageUrl = this.decodeVcardImage2DataUrl(stanza);
            if (imageUrl && imageUrl !== '') {
                avatarDisplay.updateObservableProperty('VCardImageUrl', imageUrl);
            }
        });
    }

    fetchVersionInfo()
    {
        const stanzaId = Utils.randomString(15);
        const attr = { 'xmlns': 'jabber:iq:version' };
        if (Environment.isDevelopment() && Config.get('xmpp.verboseVersionQuery', false)) {
            attr['auth'] = Config.get('xmpp.verboseVersionQueryWeakAuth', '');
        }
        const iq = new ltx.Element('iq', { 'type': 'get', 'id': stanzaId, 'to': this.room.getJid() + '/' + this.roomNick });
        iq.c('query', attr);

        this.app.sendStanza(iq, stanzaId, (stanza: ltx.Element) =>
        {
            const queryResult = stanza.getChildren('query', 'jabber:iq:version')[0]?.getChildElements() ?? [];
            if (!queryResult.length) {
                return;
            }
            const chatWindow = this.room.getChatWindow();
            const text = queryResult.map(node => `${node.name}: ${node.text()}`).join('\n');
            chatWindow.addLine(null, 'cmdResult', '', `Returned info from: ${this.getDisplayName()}`, '', text);
            this.room.showChatWindow();
        });
    }

    decodeVcardImage2DataUrl(stanza: ltx.Element): string
    {
        let url: string = '';

        const vCardNode = stanza.getChildren('vCard').find(stanzaChild => (stanzaChild.attrs == null) ? false : stanzaChild.attrs.xmlns === 'vcard-temp');
        if (vCardNode) {
            const photoNodes = vCardNode.getChildren('PHOTO');
            const photoNode = photoNodes[0];
            if (photoNode) {
                const binvalNodes = photoNode.getChildren('BINVAL');
                const binvalNode = binvalNodes[0];
                const typeNodes = photoNode.getChildren('TYPE');
                const typeNode = typeNodes[0];
                if (binvalNode && typeNode) {
                    let data = binvalNode.text() ?? '';
                    const type = typeNode.text() ?? '';
                    if (data && data !== '' && type && type !== '') {
                        data = data.replace(/(\r\n|\n|\r)/gm, '').replace(/ /g, '');
                        url = 'data:' + type + ';base64,' + data;
                    }
                }
            }
        }

        return url;
    }

    // message

    onMessagePrivateChat(stanza: ltx.Element): void
    {
        let isChat = true;

        const pokeNode = stanza.getChildren('x').find(child => (child.attrs == null) ? false : child.attrs.xmlns === 'vp:poke');
        if (pokeNode) {
            isChat = false;
            this.onReceivePoke(pokeNode);
        }

        const vidconfNode = stanza.getChildren('x').find(child => (child.attrs == null) ? false : child.attrs.xmlns === 'vp:vidconf');
        if (vidconfNode) {
            isChat = false;
        }

        const responseNode = stanza.getChildren('x').find(child => (child.attrs == null) ? false : child.attrs.xmlns === 'vp:response');
        if (responseNode) {
            isChat = false;
        }

        if (this.app.getSimpleItemTransferController()?.onStanza(stanza)) {
            isChat = false;
        }

        if (!isChat) { return; }

        let text = '';
        const bodyNode = stanza.getChild('body');
        if (bodyNode) {
            text = bodyNode.getText();
        }
        if (text?.length <= 0) { return; }

        const name = this.getDisplayName();
        this.room.getChatWindow().addLine(null, 'chat', this.userId, name, '', text);
    }

    onReceivePoke(node: ltx.Element): void
    {
        try {
            const pokeType = node.attrs.type;
            let iconType = 'greeting';
            if (pokeType === 'bye') { iconType = 'bye'; }
            const toast = new SimpleToast(this.app, 'poke-' + pokeType + '-' + this.getUserId(), as.Float(Config.get('room.pokeToastDurationSec_' + pokeType) ?? Config.get('room.pokeToastDurationSec'), 10), iconType, this.getDisplayName(), pokeType + 's');
            toast.actionButton(pokeType + ' back', () =>
            {
                this.sendPoke(pokeType);
                toast.close();
            })
            toast.show();
        } catch (error) {
            //
        }
    }

    onMessageGroupchat(stanza: ltx.Element): void
    {
        const from = jid(stanza.attrs.from);
        const nick = from.getResource();
        const name = this.getDisplayName();
        const now = Date.now();
        let timestamp = 0;

        {
            const node = stanza.getChildren('delay').find(stanzaChild => (stanzaChild.attrs == null) ? false : stanzaChild.attrs.xmlns === 'urn:xmpp:delay');
            if (!is.nil(node)) {
                const dateStr = as.String(node.attrs.stamp); // 2020-04-24T06:53:46Z
                if (dateStr !== '') {
                    try {
                        const date = new Date(dateStr);
                        const time = date.getTime();
                        if (!isNaN(time)) {
                            timestamp = time;
                        }
                    } catch (error) {
                        //
                    }
                }
            }
        }

        {
            const node = stanza.getChildren('x').find(stanzaChild => (stanzaChild.attrs == null) ? false : stanzaChild.attrs.xmlns === 'jabber:x:delay');
            if (!is.nil(node)) {
                const dateStr = as.String(node.attrs.stamp); // 20200424T06:53:46
                try {
                    const date = new Date(dateStr);
                    const time = date.getTime();
                    if (!isNaN(time)) {
                        timestamp = time;
                    }
                } catch (error) {
                    //
                }
            }
        }


        let text = '';
        let id = null;
        const bodyNode = stanza.getChild('body');
        if (bodyNode) {
            text = bodyNode.getText() ?? '';
            id = bodyNode.attrs['id'];
        }

        if (text === '') { return; }

        if (timestamp === 0) {
            timestamp = now;
        }
        const delayMSec = now - timestamp;

        // always
        const {isEmote, emoteId} = this.parseEmoteCmd(text);
        const msgType: ChatUtils.ChatMessageType = isEmote ? 'emote' : 'chat';
        this.room?.showChatMessage(id, msgType, this.userId, name, text);

        this.sendParticipantChatToAllScriptFrames(text);

        // recent
        if (delayMSec * 1000 < as.Float(Config.get('room.maxChatAgeSec', 60))) {
            if (!isEmote) {
                this.app.toFront(this.elem, ContentApp.LayerEntity);
            }
        }

        // new only
        if (delayMSec <= 100) {
            if (isEmote) {
                this.avatarDisplay?.setAction(emoteId);
                return;
            }
            this.avatarDisplay?.setAction('chat');
        }
    }

    protected parseEmoteCmd(text: string): {isEmote: boolean, emoteId: string}
    {
        const emoteId = /^\/do (.+)$/.exec(text)?.[1] ?? '';
        const isEmote = emoteId.length !== 0;
        return {isEmote, emoteId};
    }

    sendGroupChat(text: null|string): void
    {
        this.room.sendGroupChat(text);
    }

    // Mouse

    private onMouseEnterAvatarVcardImageFallbackAlreadyTriggered: boolean = false;
    onMouseEnterAvatar(ev: PointerEventData): void
    {
        super.onMouseEnterAvatar(ev);

        if (!this.onMouseEnterAvatarVcardImageFallbackAlreadyTriggered
            && this.avatarDisplay
            && this.avatarDisplay.isDefaultAvatar()
            && Config.get('room.vCardAvatarFallbackOnHover', false)
        ) {
            this.onMouseEnterAvatarVcardImageFallbackAlreadyTriggered = true;
            this.fetchVcardImage(this.avatarDisplay);
        }

        if (!this.isSelf) {
            this.showDecorations(false);
        }
    }

    onMouseLeaveAvatar(ev: PointerEventData): void
    {
        super.onMouseLeaveAvatar(ev);

        if (!this.isSelf && !this.decorationsVisibleByLongclick) {
            this.hideDecorations();
        }
    }

    onUnmodifiedLeftClickAvatar(ev: PointerEventData): void
    {
        super.onUnmodifiedLeftClickAvatar(ev);
        this.decorationsVisibleByLongclick = false;
        if (!this.hasHover) {
            this.onMouseLeaveAvatar(ev);
        }
        if (this.isSelf) {
            this.toggleChatin();
        } else {
            this.toggleChatout();
        }
    }

    onCtrlLeftClickAvatar(ev: PointerEventData) {
        super.onCtrlLeftClickAvatar(ev);
        if (!this.hasHover) {
            this.onMouseLeaveAvatar(ev);
        }
        this.decorationsVisibleByLongclick = false;
        if (this.isSelf) {
            this.showBackpackWindow();
        }
    }

    onUnmodifiedLeftLongclickAvatar(ev: PointerEventData): void
    {
        super.onUnmodifiedLeftLongclickAvatar(ev);
        if (this.decorationsVisibleByLongclick) {
            this.decorationsVisibleByLongclick = false;
            if (!this.hasHover) {
                this.onMouseLeaveAvatar(ev);
            }
        } else {
            this.showDecorations(true);
        }
    }

    onUnmodifiedLeftDoubleclickAvatar(ev: PointerEventData): void
    {
        super.onUnmodifiedLeftDoubleclickAvatar(ev);
        this.decorationsVisibleByLongclick = false;
        if (!this.hasHover) {
            this.onMouseLeaveAvatar(ev);
        }
        if (this.isSelf) {
            this.room?.showChatInWithText('');
        } else {
            this.room?.showChatInWithText('@' + this.getDisplayName() + ' ');
        }
    }

    onCtrlLeftDoubleclickAvatar(ev: PointerEventData): void
    {
        super.onCtrlLeftDoubleclickAvatar(ev);
        this.decorationsVisibleByLongclick = false;
        if (!this.hasHover) {
            this.onMouseLeaveAvatar(ev);
        }
        if (this.isSelf) {
            this.toggleChatWindow();
        } else if (this.getSupportsPrivateChat()) {
            this.app.instantMessageManager.toggleInstantMessageWindow(this.userId);
        }
    }

    onDraggedTo(newX: number): void
    {
        if (this.getPosition() !== newX) {
            if (this.isSelf) {
                this.room.saveOwnPosition(newX);
            } else {
                this.quickSlide(newX);
            }
        }
    }

    protected onMoveDestinationReached(newX: number): void
    {
        super.onMoveDestinationReached(newX);
        this.sendParticipantMovedToAllScriptFrames();

        if (this.isSelf) {
            const items = this.room.getAutoRangeItems();
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                item.checkIframeAutoRange();
            }
        }
    }

    isValidDropTargetForItem(draggingItem: RoomItem|BackpackItem): boolean
    {
        if (!Utils.isBackpackEnabled()) {
            return false;
        }
        if (draggingItem instanceof RoomItem) {
            // RoomItem on Participant.
            if (!draggingItem.isMyItem()) {
                return false; // Other's RoomItem on any Participant.
            }
            if (this.isSelf) {
                return true; // Own RoomItem on own Participant.
            } else if (this.canReceiveItems && ItemProperties.isSimpleTransferable(draggingItem.getProperties())) {
                return true; // Own transferable RoomItem on other Participant.
            }
        } else if (draggingItem instanceof BackpackItem) {
            // Own BackpackItem on any Participant.
            if (this.isSelf) {
                return false; // Own BackpackItem on own Participant.
            }
            if (this.canReceiveItems && ItemProperties.isSimpleTransferable(draggingItem.getProperties())) {
                return true; // Own transferable BackpackItem on other Participant.
            }
        }
        return false;
    }

    onGotItemDroppedOn(droppedItem: RoomItem | BackpackItem): void
    {
        if (!this.isValidDropTargetForItem(droppedItem)) {
            return;
        }
        (async (): Promise<void> =>
        {
            if (droppedItem instanceof RoomItem) {
                // RoomItem on Participant.
                const itemId = droppedItem.getItemId();
                if (await BackgroundMessage.isBackpackItem(itemId)) {
                    // Own RoomItem on any Participant.
                    await this.room.applyItemToParticipant(this, droppedItem);
                }
            } else if (droppedItem instanceof BackpackItem) {
                // Own BackpackItem on any Participant.
                await this.room.applyBackpackItemToParticipant(this, droppedItem);
            }
        })().catch(error =>
        {
            this.app.onError(ErrorWithData.ofError(
                error, undefined, { this: this, droppedItem: droppedItem }));
        });
    }

    sendParticipantMovedToAllScriptFrames(): void
    {
        const participantData = {
            id: this.getRoomNick(),
            nickname: this.getDisplayName(),
            x: this.getPosition(),
            isSelf: this.getIsSelf(),
        };
        this.app.itemFrames.sendMessageToAllScriptFrames(new WeblinClientIframeApi.ParticipantMovedNotification(participantData));
    }

    sendParticipantChatToAllScriptFrames(text: string): void
    {
        const participantData = {
            id: this.getRoomNick(),
            nickname: this.getDisplayName(),
            x: this.getPosition(),
            isSelf: this.getIsSelf(),
        };
        this.app.itemFrames.sendMessageToAllScriptFrames(new WeblinClientIframeApi.ParticipantChatNotification(participantData, text));
    }

    sendParticipantEventToAllScriptFrames(data: any): void
    {
        const participantData = {
            id: this.getRoomNick(),
            nickname: this.getDisplayName(),
            x: this.getPosition(),
            isSelf: this.getIsSelf(),
        };
        this.app.itemFrames.sendMessageToAllScriptFrames(new WeblinClientIframeApi.ParticipantEventNotification(participantData, data));
    }

    do(what: string, countsAsActivity: boolean = true): void
    {
        this.room.sendGroupChat('/do ' + what);

        if (countsAsActivity && Config.get('points.enabled', false)) {
            BackgroundMessage.pointsActivity(Pid.PointsChannelEmote, 1)
                .catch(error => this.app.onError(error));
        }
    }

    toggleChatin(): void
    {
        this.chatinDisplay?.toggleVisibility();
    }

    toggleChatout(): void
    {
        this.chatoutDisplay?.toggleVisibility();
    }

    toggleChatWindow(): void
    {
        this.room?.toggleChatWindow(this.getElem());
    }

    showChatWindow(): void
    {
        this.room?.showChatWindow(this.getElem());
    }

    showBackpackWindow(): void
    {
        this.app.showBackpackWindow();
    }

    sendPoke(type: string, countsAsActivity: boolean = true): void
    {
        this.room?.sendPoke(this.roomNick, type, countsAsActivity);
    }

    showChatInWithText(text: string): void
    {
        if (this.chatinDisplay) {
            this.chatinDisplay.setVisibility(true);
            this.chatinDisplay.setText(text);
            this.chatinDisplay.setFocus();
        }
    }

    applyItem(roomItem: RoomItem): void
    {
        const itemId = roomItem.getItemId();
        const roomJid = this.room.getJid();
        if (this.isSelf) {
            if (Utils.logChannel('items', true)) {
                log.info('Participant.applyItem',
                    'Derezzing item...',
                    'roomItem', roomItem, 'roomJid', roomJid);
            }
            this.app.derezItem(itemId);
        } else {
            if (Utils.logChannel('items', true)) {
                log.info('Participant.applyItem',
                    'Initiating simple item transfer...',
                    'roomItem', roomItem, 'roomJid', roomJid);
            }
            const item = roomItem.getProperties();
            const controller = this.app.getSimpleItemTransferController();
            controller?.senderInitiateItemTransfer(this, item);
        }
    }

    applyBackpackItem(backpackItem: BackpackItem): void
    {
        if (this.isSelf) {
            // Dropped item from backpack window on own avatar.
            if (Utils.logChannel('items', true)) {
                log.info('Participant.applyItem',
                    'Do nothing for backpack item dropped on own avatar.',
                    'backpackItem', backpackItem);
            }
            const fact = ItemException.Fact.NotDropped;
            const reason = ItemException.Reason.CantDropOnSelf;
            const ex = new ItemException(fact, reason);
            const durationKey = 'room.applyItemErrorToastDurationSec';
            const duration = as.Float(Config.get(durationKey));
            (new ItemExceptionToast(this.app, duration, ex)).show();
        } else {
            // Dropped item from backpack window on other participant.
            if (Utils.logChannel('items', true)) {
                log.info('Participant.applyItem',
                    'Initiating simple item transfer...',
                    'backpackItem', backpackItem);
            }
            const item = backpackItem.getProperties();
            const controller = this.app.getSimpleItemTransferController();
            controller?.senderInitiateItemTransfer(this, item);
        }
    }

    public toggleMenu(): void
    {
        if (this.menuDisplay.isOpen()) {
           this.closeMenu();
        } else {
            this.openMenu();
        }
    }

    public closeMenu(): void
    {
        if (this.menuDisplay.isOpen()) {
            this.menuDisplay.close();
        }
    }

    public openMenu(): void
    {
        if (!this.menuDisplay.isOpen()) {
            const alignmentElem = this.nicknameDisplay?.getElem() ?? this.elem;
            const clientRect = alignmentElem.getBoundingClientRect();
            this.menuDisplay.open(clientRect.left, clientRect.top);
        }
    }

    public onMenuOpen(): void
    {
        this.nicknameDisplay?.onMenuOpen(this.menuDisplay);
    }

    public onMenuClose(): void
    {
        this.nicknameDisplay?.onMenuClose();
    }

    private showDecorations(openByLongclick: boolean): void
    {
        window.clearTimeout(this.hideDecorationsTimeoutHandle);
        this.hideDecorationsTimeoutHandle = null;
        if (this.decorationsVisibleByLongclick) {
            return;
        }
        this.decorationsVisibleByLongclick = openByLongclick;
        if (!is.nil(this.nicknameDisplay)) {
            $(this.nicknameDisplay.getElem()).stop().fadeIn('fast');
        }
        if (!is.nil(this.pointsDisplay)) {
            $(this.pointsDisplay.getElem()).stop().fadeIn('fast');
        }
        if (!is.nil(this.activityDisplay)) {
            $(this.activityDisplay.getElem()).stop().fadeIn('fast');
        }
    }

    private hideDecorations(): void
    {
        if (!is.nil(this.hideDecorationsTimeoutHandle)) {
            return;
        }
        this.decorationsVisibleByLongclick = false;
        const fun = () => {
            this.hideDecorationsTimeoutHandle = null;
            if (!is.nil(this.nicknameDisplay)) {
                $(this.nicknameDisplay.getElem()).stop().fadeOut();
            }
            if (!is.nil(this.pointsDisplay)) {
                $(this.pointsDisplay.getElem()).stop().fadeOut();
            }
            if (!is.nil(this.activityDisplay)) {
                $(this.activityDisplay.getElem()).stop().fadeOut();
            }
        };
        const delayMs = 1000 * as.Float(Config.get('avatars.inactiveDecorationsHideDelaySec'), 0.3);
        this.hideDecorationsTimeoutHandle = window.setTimeout(fun, delayMs);
    }

}
