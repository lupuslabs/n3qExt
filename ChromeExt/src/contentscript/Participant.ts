import * as $ from 'jquery';
import * as jid from '@xmpp/jid';
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
import { PrivateChatWindow } from './PrivateChatWindow';
import { PrivateVidconfWindow } from './PrivateVidconfWindow';
import { PointsBar } from './PointsBar';
import { ActivityBar } from './ActivityBar';
import { BadgesController } from './BadgesController';
import { VpProtocol } from '../lib/VpProtocol';
import { BackpackItem } from './BackpackItem';
import { WeblinClientIframeApi } from '../lib/WeblinClientIframeApi';
import { Environment } from '../lib/Environment';
import { Memory } from '../lib/Memory';
import { DomUtils } from '../lib/DomUtils';
import { PointerEventData } from '../lib/PointerEventData';
import { ChatUtils } from '../lib/ChatUtils';
import { RootMenu, } from './Menu';
import { OwnParticipantMenu } from './OwnParticipantMenu';
import { OtherParticipantMenu } from './OtherParticipantMenu';
import { AnimationsDefinition } from './AnimationsXml';
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'
import { TutorialWindow } from './TutorialWindow';

export class Participant extends Entity
{
    private menuDisplay: RootMenu;
    private nicknameDisplay: Nickname;
    private pointsDisplay: PointsBar;
    private activityDisplay: ActivityBar;
    private badgesDisplay: BadgesController;
    private chatoutDisplay: Chatout;
    private chatinDisplay: Chatin;
    private isFirstPresence: boolean = true;
    private userId: string;
    private privateChatWindow: PrivateChatWindow;
    private privateVidconfWindow: PrivateVidconfWindow;
    private decorationsVisible: boolean;
    private hideDecorationsTimeoutHandle: number|null = null;

    constructor(app: ContentApp, room: Room, roomNick: string, isSelf: boolean)
    {
        super(app, room, roomNick, isSelf);
        this.decorationsVisible = isSelf;

        this.elem.classList.add('n3q-participant');
        this.elem.setAttribute('data-nick', roomNick);

        if (isSelf) {
            this.elem.classList.add('n3q-participant-self');
            this.showIntroYouOnce().catch(error => this.app.onError(error));
            this.showTutorialOnce().catch(error => this.app.onError(error));
        } else {
            this.elem.classList.add('n3q-participant-other');
        }

        if (this.isSelf) {
            this.menuDisplay = new OwnParticipantMenu(this.app, this);
        } else {
            this.menuDisplay = new OtherParticipantMenu(this.app, this);
        }

        this.chatoutDisplay = new Chatout(this.app, this.elem);
        this.privateChatWindow = new PrivateChatWindow(this.app, this);
    }

    getBadgesDisplay(): BadgesController|null { return this.badgesDisplay; }
    getChatout(): Chatout { return this.chatoutDisplay; }
    getUserId(): string { return this.userId; }

    getDisplayName(): string
    {
        let name = this.roomNick;
        if (this.nicknameDisplay) {
            name = this.nicknameDisplay.getNickname();
        }
        return name;
    }

    public getPrivateChatWindow(): PrivateChatWindow
    {
        return this.privateChatWindow;
    }

    async showIntroYouOnce(): Promise<void>
    {
        const maxShowIntroYou = as.Int(Config.get('client.showIntroYou'), 0);
        if (maxShowIntroYou > 0) {
            let countIntroYou = as.Int(await Memory.getLocal('client.introYou', 0));
            if (countIntroYou < maxShowIntroYou) {
                countIntroYou++;
                await Memory.setLocal('client.introYou', countIntroYou);

                const introYouElem = DomUtils.elemOfHtml(''
                    + '<div class="n3q-base n3q-intro-you n3q-bounce" data-translate="children">'
                    + '  <svg class="n3q-base n3q-shadow-small" width="72" height="48" xmlns="http://www.w3.org/2000/svg">'
                    + '    <g>'
                    + '      <path class="n3q-base" stroke-width="0" stroke="#000" d="m0,25l36,-24l36,24l-18,0l0,24l-36,0l0,-24l-18,0l0,0z" id="svg_1" transform="rotate(-180 36 24)"/>'
                    + '    </g>'
                    + '  </svg>'
                    + '  <div class="n3q-base n3q-intro-you-label" data-translate="children"><div class="n3q-base n3q-intro-you-label-text" data-translate="text:Intro">You</div></div>'
                    + '</div>');
                const closeElem = DomUtils.elemOfHtml('<div class="n3q-base n3q-overlay-button n3q-shadow-small" title="Got it" data-translate="attr:title:Intro"><div class="n3q-base n3q-button-symbol n3q-button-close-small"></div></div>');
                PointerEventDispatcher.makeOpaqueDispatcher(this.app, closeElem).addUnmodifiedLeftClickListener(ev => {
                    Memory.setLocal('client.introYou', maxShowIntroYou + 1).catch(error => this.app.onError(error));
                    introYouElem.remove();
                });
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
            let countTutorial = as.Int(await Memory.getLocal('client.showTutorial', 0));
            if (countTutorial < maxShowTutorial && ! await TutorialWindow.isDontShow()) {
                countTutorial++;
                await Memory.setLocal('client.showTutorial', countTutorial);

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
                const jid = as.String(attrs.jid, url);
                this.userId = as.String(attrs.id, jid);

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
                this.avatarDisplay.addClass('n3q-participant-avatar');
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
            if (this.isSelf) {
                if (Utils.isBackpackEnabled()) {
                    const propSet = await BackgroundMessage.findBackpackItemProperties({ [Pid.AutorezAspect]: 'true', [Pid.AutorezIsActive]: 'true' });
                    for (const itemId in propSet) {
                        const props = propSet[itemId];
                        if (props[Pid.IsRezzed]) {
                            await BackgroundMessage.derezBackpackItem(itemId, props[Pid.RezzedLocation], -1, -1, {}, [], {});
                        }
                        await BackgroundMessage.rezBackpackItem(itemId, this.room.getJid(), as.Int(props[Pid.RezzedX], -1), this.room.getDestination(), {});
                    }
                }
            }
        }

        if (isFirstPresence) {
            this.sendParticipantEventToAllScriptFrames({ event: 'enter' });
        }

        if (isFirstPresence) {
            // if (this.isSelf && Environment.isDevelopment()) { this.showChatWindow(); }
            if (this.isSelf) {
                if (Config.get('room.chatlogEnteredTheRoomSelf', true)) {
                    this.room?.showChatMessage(null, 'participantStatus', this.roomNick, 'entered the room');
                }
            } else {
                if (this.room?.iAmAlreadyHere()) {
                    if (Config.get('room.chatlogEnteredTheRoom', true)) {
                        this.room?.showChatMessage(null, 'participantStatus', this.roomNick, 'entered the room');
                    }
                } else {
                    if (Config.get('room.chatlogWasAlreadyThere', true)) {
                        this.room?.showChatMessage(null, 'participantStatus', this.roomNick, 'was already there');
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
            this.room?.showChatMessage(null, 'participantStatus', this.roomNick, 'left the room');
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
                this.elem.classList.add('n3q-ghost');
                break;
            default:
                this.elem.removeAttribute('title');
                this.elem.classList.remove('n3q-ghost');
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
            if (imageUrl && imageUrl != '') {
                avatarDisplay.updateObservableProperty('VCardImageUrl', imageUrl);
            }
        });
    }

    fetchVersionInfo(chatWindow: IObserver)
    {
        const stanzaId = Utils.randomString(15);
        const attr = { 'xmlns': 'jabber:iq:version' };
        if (Environment.isDevelopment() || Config.get('xmpp.verboseVersionQuery', false)) {
            attr['auth'] = Config.get('xmpp.verboseVersionQueryWeakAuth', '');
        }
        const iq = new ltx.Element('iq', { 'type': 'get', 'id': stanzaId, 'to': this.room.getJid() + '/' + this.roomNick });
        iq.c('query', attr);

        this.app.sendStanza(iq, stanzaId, (stanza: ltx.Element) =>
        {
            const info = {};
            const versionQuery = stanza.getChildren('query').find(stanzaChild => (stanzaChild.attrs == null) ? false : stanzaChild.attrs.xmlns === 'jabber:iq:version');
            if (versionQuery) {
                const children = versionQuery.children;
                if (children) {
                    for (let i = 0; i < children.length; i++) {
                        const child = children[i];
                        if (child instanceof ltx.Element) {
                            info[child.name] = child.text();
                        }
                    }
                }
            }

            chatWindow.updateObservableProperty('VersionInfo', JSON.stringify(info));
        });
    }

    decodeVcardImage2DataUrl(stanza: ltx.Element): string
    {
        let url: string;

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
                    let data = binvalNode.text();
                    const type = typeNode.text();
                    if (data && data != '' && type && type != '') {
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
        const from = jid(stanza.attrs.from);
        const nick = from.getResource();
        const name = this.getDisplayName();
        let isChat = true;

        const pokeNode = stanza.getChildren('x').find(child => (child.attrs == null) ? false : child.attrs.xmlns === 'vp:poke');
        if (pokeNode) {
            isChat = false;
            this.onReceivePoke(pokeNode);
        }

        const vidconfNode = stanza.getChildren('x').find(child => (child.attrs == null) ? false : child.attrs.xmlns === 'vp:vidconf');
        if (vidconfNode) {
            isChat = false;
            this.onReceiveVidconf(vidconfNode);
        }

        const responseNode = stanza.getChildren('x').find(child => (child.attrs == null) ? false : child.attrs.xmlns === 'vp:response');
        if (responseNode) {
            isChat = false;
            this.onReceiveResponse(responseNode);
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

        this.openPrivateChat();
        this.privateChatWindow.addLine(null, 'chat', name, text);

        if (nick !== this.room.getMyNick()) {
            const chatWindow = this.privateChatWindow;
            if (chatWindow.isSoundEnabled()) {
                chatWindow.playSound();
            }
        }
    }

    onReceivePoke(node: ltx.Element): void
    {
        try {
            const pokeType = node.attrs.type;
            let iconType = 'greeting';
            if (pokeType == 'bye') { iconType = 'bye'; }
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

    onReceiveVidconf(node: ltx.Element): void
    {
        try {
            const url = node.attrs.url;
            const toast = new SimpleToast(this.app, 'privatevidconf', as.Float(Config.get('room.privateVidconfToastDurationSec'), 60), 'privatevidconf', this.getDisplayName(), 'Wants to start a private videoconference');
            toast.actionButton('Accept', () =>
            {
                this.openPrivateVidconf(this.getElem(), url);
                toast.close();
            });
            toast.actionButton('Decline', () =>
            {
                this.room?.sendDeclinePrivateVidconfResponse(this.roomNick, '');
                toast.close();
            })
            toast.show();
        } catch (error) {
            //
        }
    }

    onReceiveResponse(node: ltx.Element): void
    {
        try {
            if (node.attrs.to === VpProtocol.PrivateVideoconfRequest.xmlns) {
                if (node.attrs.type === VpProtocol.PrivateVideoconfResponse.type_decline) {
                    const toast = new SimpleToast(this.app, 'privatevidconfresponse', as.Float(Config.get('room.privateVidconfToastDurationSec'), 60), 'privatevidconf', this.getDisplayName(), 'Refuses to join the private videoconference');
                    toast.show();
                }
            }
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
            text = bodyNode.getText();
            id = bodyNode.attrs['id'];
        }

        if (text == '') { return; }

        if (timestamp === 0) {
            timestamp = now;
        }
        const delayMSec = now - timestamp;

        // always
        const {isEmote, emoteId} = this.parseEmoteCmd(text);
        const msgType: ChatUtils.ChatMessageType = isEmote ? 'emote' : 'chat';
        this.room?.showChatMessage(id, msgType, name, text);

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

            if (nick !== this.room.getMyNick()) {
                const chatWindow = this.room.getChatWindow();
                if (chatWindow) {
                    if (chatWindow.isSoundEnabled()) {
                        chatWindow.playSound();
                    }
                }
            }

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

    onChatMessagePersisted(chatChannel: ChatUtils.ChatChannel, chatMessage: ChatUtils.ChatMessage): void
    {
        this.privateChatWindow.onChatMessagePersisted(chatChannel, chatMessage);
    }

    public onChatHistoryDeleted(deletions: {chatChannel: ChatUtils.ChatChannel, olderThanTime: string}[]): void
    {
        this.privateChatWindow.onChatHistoryDeleted(deletions);
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
            this.showDecorations();
        }
    }

    onMouseLeaveAvatar(ev: PointerEventData): void
    {
        super.onMouseLeaveAvatar(ev);

        if (!this.isSelf) {
            this.hideDecorations();
        }
    }

    onUnmodifiedLeftClickAvatar(ev: PointerEventData): void
    {
        super.onUnmodifiedLeftClickAvatar(ev);

        if (this.isSelf) {
            this.toggleChatin();
        } else {
            this.toggleChatout();
        }
    }

    onCtrlLeftClickAvatar(ev: PointerEventData) {
        super.onCtrlLeftClickAvatar(ev);
        if (this.isSelf) {
            this.showBackpackWindow();
        }
    }

    onUnmodifiedLeftLongclickAvatar(ev: PointerEventData): void
    {
        super.onUnmodifiedLeftLongclickAvatar(ev);
        if (this.decorationsVisible) {
            this.hideDecorations();
        } else {
            this.showDecorations();
        }
    }

    onUnmodifiedLeftDoubleclickAvatar(ev: PointerEventData): void
    {
        super.onUnmodifiedLeftDoubleclickAvatar(ev);
        if (this.isSelf) {
            this.room?.showChatInWithText('');
        } else {
            this.room?.showChatInWithText('@' + this.getDisplayName() + ' ');
        }
    }

    onCtrlLeftDoubleclickAvatar(ev: PointerEventData): void
    {
        super.onCtrlLeftDoubleclickAvatar(ev);
        if (this.isSelf) {
            this.toggleChatWindow();
        } else {
            this.togglePrivateChatWindow();
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
            } else if (ItemProperties.isSimpleTransferable(draggingItem.getProperties())) {
                return true; // Own transferable RoomItem on other Participant.
            }
        } else if (draggingItem instanceof BackpackItem) {
            // Own BackpackItem on any Participant.
            if (this.isSelf) {
                return false; // Own BackpackItem on own Participant.
            }
            if (ItemProperties.isSimpleTransferable(draggingItem.getProperties())) {
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

        const itemIds = this.room.getAllScriptedItems();
        for (let i = 0; i < itemIds.length; i++) {
            this.room.getItemByItemId(itemIds[i])?.sendMessageToScriptFrame(new WeblinClientIframeApi.ParticipantMovedNotification(participantData));
        }
    }

    sendParticipantChatToAllScriptFrames(text: string): void
    {
        const participantData = {
            id: this.getRoomNick(),
            nickname: this.getDisplayName(),
            x: this.getPosition(),
            isSelf: this.getIsSelf(),
        };

        const itemIds = this.room.getAllScriptedItems();
        for (let i = 0; i < itemIds.length; i++) {
            this.room.getItemByItemId(itemIds[i])?.sendMessageToScriptFrame(new WeblinClientIframeApi.ParticipantChatNotification(participantData, text));
        }
    }

    sendParticipantEventToAllScriptFrames(data: any): void
    {
        const participantData = {
            id: this.getRoomNick(),
            nickname: this.getDisplayName(),
            x: this.getPosition(),
            isSelf: this.getIsSelf(),
        };

        const itemIds = this.room.getAllScriptedItems();
        for (let i = 0; i < itemIds.length; i++) {
            this.room.getItemByItemId(itemIds[i])?.sendMessageToScriptFrame(new WeblinClientIframeApi.ParticipantEventNotification(participantData, data));
        }
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

    showVidconfWindow(): void
    {
        this.app.showVidconfWindow();
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

    openPrivateChat(): void
    {
        this.privateChatWindow.show({ above: this.elem });
    }

    togglePrivateChatWindow(): void
    {
        if (this.privateChatWindow.isOpen()) {
            this.privateChatWindow.close();
        } else {
            this.openPrivateChat();
        }
    }

    async initiatePrivateVidconf(aboveElem: HTMLElement): Promise<void>
    {
        const roomJid = jid(this.room.getJid());

        let vidconfSecret = await Memory.getLocal('client.vidconfSecret', '');
        if (vidconfSecret == '') {
            vidconfSecret = Utils.randomString(10);
            await Memory.setLocal('client.vidconfSecret', vidconfSecret);
        }

        const confId = 'private-' + roomJid.getLocal() + '-' + vidconfSecret;

        const urlTemplate = as.String(Config.get('room.vidconfUrl'), 'https://video.weblin.io/Vidconf?room=weblin{room}&name={name}');
        const url = urlTemplate
            .replace('{room}', confId)
            ;

        this.room?.sendPrivateVidconf(this.roomNick, url);
        this.openPrivateVidconf(aboveElem, url);
    }

    private openPrivateVidconf(aboveElem: HTMLElement, urlTemplate: string): void
    {
        if (this.privateVidconfWindow == null) {
            const displayName = this.room.getMyParticipant()?.getDisplayName();
            if (!is.nil(displayName)) {
                const url = urlTemplate.replace('{name}', displayName);

                this.app.setPrivateVidconfIsOpen(true);

                this.privateVidconfWindow = new PrivateVidconfWindow(this.app, this);
                this.privateVidconfWindow.show({
                    above: aboveElem,
                    url: url,
                    onClose: () =>
                    {
                        this.privateVidconfWindow = null;
                        this.app.setPrivateVidconfIsOpen(false);
                    },
                });
            }
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

    public closeMenu(): void
    {
        if (this.menuDisplay.isOpen()) {
            this.menuDisplay.close();
            this.nicknameDisplay?.onMenuClose();
        }
    }

    public openMenu(): void
    {
        if (!this.menuDisplay.isOpen()) {
            const alignmentElem = this.nicknameDisplay?.getElem() ?? this.elem;
            const clientRect = alignmentElem.getBoundingClientRect();
            this.menuDisplay.open(clientRect.left, clientRect.top);
            this.nicknameDisplay?.onMenuOpen();
        }
    }

    private showDecorations(): void
    {
        window.clearTimeout(this.hideDecorationsTimeoutHandle);
        this.hideDecorationsTimeoutHandle = null;
        this.decorationsVisible = true;
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
        if (is.nil(this.hideDecorationsTimeoutHandle)) {
            this.hideDecorationsTimeoutHandle = window.setTimeout(() => {
                this.decorationsVisible = false;
                if (!is.nil(this.nicknameDisplay)) {
                    $(this.nicknameDisplay.getElem()).stop().fadeOut();
                }
                if (!is.nil(this.pointsDisplay)) {
                    $(this.pointsDisplay.getElem()).stop().fadeOut();
                }
                if (!is.nil(this.activityDisplay)) {
                    $(this.activityDisplay.getElem()).stop().fadeOut();
                }
            }, 1000 * as.Float(Config.get('avatars.inactiveDecorationsHideDelaySec'), 0.3));
        }
    }

}
