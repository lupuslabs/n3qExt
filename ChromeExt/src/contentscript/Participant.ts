import * as $ from 'jquery';
import { xml, jid } from '@xmpp/client';
import log = require('loglevel');
import { as } from '../lib/as';
import { Config } from '../lib/Config';
import { Utils } from '../lib/Utils';
import { IObserver } from '../lib/ObservableProperty';
import { Pid } from '../lib/ItemProperties';
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
import { SimpleErrorToast, SimpleToast, Toast } from './Toast';
import { PrivateChatWindow } from './PrivateChatWindow';
import { PrivateVidconfWindow } from './PrivateVidconfWindow';
import { PointsBar } from './PointsBar';
import { ActivityBar } from './ActivityBar';
import { VpProtocol } from '../lib/VpProtocol';
import { BackpackItem } from './BackpackItem';
import { WeblinClientIframeApi } from '../lib/WeblinClientIframeApi';
import { ChatWindow } from './ChatWindow';
import { Environment } from '../lib/Environment';
import { Memory } from '../lib/Memory';

export class Participant extends Entity
{
    private nicknameDisplay: Nickname;
    private pointsDisplay: PointsBar;
    private activityDisplay: ActivityBar;
    private chatoutDisplay: Chatout;
    private chatinDisplay: Chatin;
    private isFirstPresence: boolean = true;
    private userId: string;
    private privateChatWindow: PrivateChatWindow;
    private privateVidconfWindow: PrivateVidconfWindow;

    constructor(app: ContentApp, room: Room, roomNick: string, isSelf: boolean)
    {
        super(app, room, roomNick, isSelf);

        $(this.getElem()).addClass('n3q-participant');
        $(this.getElem()).attr('data-nick', roomNick);

        if (isSelf) {
            $(this.getElem()).addClass('n3q-participant-self');
            /*await*/ this.showIntroYouOnce();
        } else {
            $(this.getElem()).addClass('n3q-participant-other');
        }
    }

    getRoomNick(): string { return this.roomNick; }
    getChatout(): Chatout { return this.chatoutDisplay; }

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
        let maxShowIntroYou = Config.get('client.showIntroYou', 0);
        if (maxShowIntroYou > 0) {
            let countIntroYou = await Memory.getLocal('client.introYou', 0);
            if (countIntroYou < maxShowIntroYou) {
                countIntroYou++;
                await Memory.setLocal('client.introYou', countIntroYou);

                let introYouElem = $(''
                    + '<div class="n3q-base n3q-intro-you n3q-bounce" data-translate="children">'
                    + '  <svg class="n3q-base n3q-shadow-small" width="72" height="48" xmlns="http://www.w3.org/2000/svg">'
                    + '    <g>'
                    + '      <path class="n3q-base" stroke-width="0" stroke="#000" d="m0,25l36,-24l36,24l-18,0l0,24l-36,0l0,-24l-18,0l0,0z" id="svg_1" transform="rotate(-180 36 24)"/>'
                    + '    </g>'
                    + '  </svg>'
                    + '  <div class="n3q-base n3q-intro-you-label" data-translate="children"><div class="n3q-base n3q-intro-you-label-text" data-translate="text:Intro">You</div></div>'
                    + '</div>').get(0);
                let closeElem = <HTMLElement>$('<div class="n3q-base n3q-overlay-button n3q-shadow-small" title="Got it" data-translate="attr:title:Intro"><div class="n3q-base n3q-button-symbol n3q-button-close-small" />').get(0);
                $(closeElem).on('click', async ev =>
                {
                    await Memory.setLocal('client.introYou', maxShowIntroYou + 1);
                    $(introYouElem).remove();
                });
                $(introYouElem).append(closeElem);
                this.app.translateElem(introYouElem);
                $(this.getElem()).append(introYouElem);
            }
        }
    }

    remove(): void
    {
        this.avatarDisplay?.stop();
        this.nicknameDisplay?.stop();
        this.chatoutDisplay?.stop();
        this.chatinDisplay?.stop();
        super.remove();
    }

    // presence

    async onPresenceAvailable(stanza: any): Promise<void>
    {
        let hasPosition: boolean = false;
        let newX: number = 123;

        let hasCondition: boolean = false;
        let newCondition: string = '';

        let newAvailability: string = '';
        let newStatusMessage: string = '';

        let xmppNickname = '';

        let vpNickname = '';
        let vpAvatarId = '';
        let vpAnimationsUrl = '';
        let vpImageUrl = '';
        let vpPoints = '';

        let hasIdentityUrl = false;

        let isFirstPresence = this.isFirstPresence;
        this.isFirstPresence = false;

        // log.debug('#### recv', stanza.children[1].attrs);

        {
            let from = stanza.attrs.from
            if (from != undefined) {
                let fromJid = new jid(from);
                let nickname = as.String(fromJid.getResource(), '');
                if (nickname != '') {
                    xmppNickname = nickname;
                }
            }
        }

        {
            let stateNode = stanza.getChildren('x').find(stanzaChild => (stanzaChild.attrs == null) ? false : stanzaChild.attrs.xmlns === 'firebat:avatar:state');
            if (stateNode) {
                let positionNode = stateNode.getChild('position');
                if (positionNode) {
                    newX = as.Int(positionNode.attrs.x, -1);
                    if (newX != -1) {
                        hasPosition = true;
                    }
                }
                hasCondition = true;
                let conditionNode = stateNode.getChild('condition');
                if (conditionNode) {
                    newCondition = as.String(conditionNode.attrs.status, '');
                }
            }
        }

        {
            let identityNode = stanza.getChildren('x').find(stanzaChild => (stanzaChild.attrs == null) ? false : stanzaChild.attrs.xmlns === 'firebat:user:identity');
            if (identityNode != null) {
                let attrs = identityNode.attrs;
                let url = as.String(attrs.src, '');
                let digest = as.String(attrs.digest, '');
                let jid = as.String(attrs.jid, url);
                this.userId = as.String(attrs.id, jid);

                if (url != '') {
                    hasIdentityUrl = true;
                    this.app.getPropertyStorage().setIdentity(this.userId, url, digest);
                }
            }
        }

        {
            let vpPropsNode = stanza.getChildren('x').find(stanzaChild => (stanzaChild.attrs == null) ? false : stanzaChild.attrs.xmlns === 'vp:props');
            if (vpPropsNode) {
                let attrs = vpPropsNode.attrs;
                if (attrs) {
                    vpNickname = as.String(attrs.Nickname, '');
                    if (vpNickname == '') { vpNickname = as.String(attrs.nickname, ''); }
                    vpAvatarId = as.String(attrs.AvatarId, '');
                    if (vpAvatarId == '') { vpAvatarId = as.String(attrs.avatar, ''); }
                    vpAnimationsUrl = as.String(attrs.AnimationsUrl, '');
                    vpAnimationsUrl = as.String(attrs.AvatarUrl, vpAnimationsUrl);
                    vpImageUrl = as.String(attrs.ImageUrl, '');
                }
            }
        }

        { // <show>: dnd, away, xa
            let showNode = stanza.getChild('show');
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
            let statusNode = stanza.getChild('status');
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
            this.avatarDisplay = new Avatar(this.app, this, this.isSelf);
            if (Utils.isBackpackEnabled()) {
                this.avatarDisplay.addClass('n3q-participant-avatar');
                this.avatarDisplay.makeDroppable();
            }

            this.nicknameDisplay = new Nickname(this.app, this, this.isSelf, this.getElem());
            if (!this.isSelf) {
                if (Config.get('room.nicknameOnHover', true)) {
                    let nicknameElem = this.nicknameDisplay.getElem();
                    nicknameElem.style.display = 'none';
                    $(this.getElem()).hover(function ()
                    {
                        if (nicknameElem) { $(nicknameElem).stop().fadeIn('fast'); }
                    }, function ()
                    {
                        if (nicknameElem) { $(nicknameElem).stop().fadeOut(); }
                    });
                }
            }

            if (Config.get('points.enabled', false) || Config.get('points.passiveEnabled', false)) {
                this.pointsDisplay = new PointsBar(this.app, this, this.getElem());
                if (!this.isSelf) {
                    if (Config.get('room.pointsOnHover', true)) {
                        let elem = this.pointsDisplay.getElem();
                        elem.style.display = 'none';
                        $(this.getElem()).hover(function ()
                        {
                            if (elem) { $(elem).stop().fadeIn('fast'); }
                        }, function ()
                        {
                            if (elem) { $(elem).stop().fadeOut(); }
                        });
                    }
                }
            }

            if (this.isSelf && Config.get('points.activityDisplayEnabled', false)) {
                this.activityDisplay = new ActivityBar(this.app, this, this.getElem());
                if (!this.isSelf) {
                    if (Config.get('room.pointsOnHover', true)) {
                        let elem = this.activityDisplay.getElem();
                        elem.style.display = 'none';
                        $(this.getElem()).hover(function ()
                        {
                            if (elem) { $(elem).stop().fadeIn('fast'); }
                        }, function ()
                        {
                            if (elem) { $(elem).stop().fadeOut(); }
                        });
                    }
                }
            }

            this.chatoutDisplay = new Chatout(this.app, this, this.getElem());

            if (this.isSelf) {
                this.chatinDisplay = new Chatin(this.app, this, this.getElem());
            }
        }

        let hasAvatar = false;
        if (this.avatarDisplay) {
            if (vpAvatarId != '') {
                let animationsUrl = Utils.getAvatarUrlFromAvatarId(vpAvatarId);
                let proxiedAnimationsUrl = as.String(Config.get('avatars.animationsProxyUrlTemplate', 'https://webex.vulcan.weblin.com/Avatar/InlineData?url={url}')).replace('{url}', encodeURIComponent(animationsUrl));
                this.avatarDisplay?.updateObservableProperty('AnimationsUrl', proxiedAnimationsUrl);
                hasAvatar = true;
            } else if (vpAnimationsUrl != '') {
                let proxiedAnimationsUrl = as.String(Config.get('avatars.animationsProxyUrlTemplate', 'https://webex.vulcan.weblin.com/Avatar/InlineData?url={url}')).replace('{url}', encodeURIComponent(vpAnimationsUrl));
                this.avatarDisplay?.updateObservableProperty('AnimationsUrl', proxiedAnimationsUrl);
                hasAvatar = true;
            } else {
                if (vpImageUrl != '') {
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
            if (vpNickname != '') {
                if (vpNickname != this.nicknameDisplay.getNickname()) {
                    this.nicknameDisplay.setNickname(vpNickname);
                }
            } else {
                if (xmppNickname != this.nicknameDisplay.getNickname()) {
                    this.nicknameDisplay.setNickname(xmppNickname);
                }
                if (hasIdentityUrl && isFirstPresence) {
                    this.app.getPropertyStorage().watch(this.userId, 'Nickname', this.nicknameDisplay);
                }
            }
        }

        if (this.pointsDisplay) {
            if (vpPoints != '') {
                let newPoints = as.Int(vpPoints, 0);
                if (newPoints != this.pointsDisplay.getPoints()) {
                    this.pointsDisplay.setPoints(newPoints);
                }
            } else {
                if (hasIdentityUrl && isFirstPresence) {
                    this.app.getPropertyStorage().watch(this.userId, 'Points', this.pointsDisplay);
                }
            }
        }

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
                if (this.getPosition() != newX) {
                    this.move(newX);
                }
            }
        }

        if (isFirstPresence) {
            if (this.isSelf) {
                this.show(true, Config.get('room.fadeInSec', 0.3));
            } else {
                this.show(true);
            }
        }

        if (isFirstPresence) {
            if (this.isSelf) {
                if (Utils.isBackpackEnabled()) {
                    let propSet = await BackgroundMessage.findBackpackItemProperties({ [Pid.AutorezAspect]: 'true', [Pid.AutorezIsActive]: 'true' });
                    for (const itemId in propSet) {
                        let props = propSet[itemId];
                        if (props[Pid.IsRezzed]) {
                            await BackgroundMessage.derezBackpackItem(itemId, props[Pid.RezzedLocation], -1, -1, {}, [], {});
                        }
                        await BackgroundMessage.rezBackpackItem(itemId, this.room.getJid(), -1, this.room.getDestination(), {});
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
                    this.room?.showChatMessage(this.roomNick, 'entered the room');
                }
            } else {
                if (this.room?.iAmAlreadyHere()) {
                    if (Config.get('room.chatlogEnteredTheRoom', true)) {
                        this.room?.showChatMessage(this.roomNick, 'entered the room');
                    }
                } else {
                    if (Config.get('room.chatlogWasAlreadyThere', true)) {
                        this.room?.showChatMessage(this.roomNick, 'was already there');
                    }
                }
            }
        }

        if (isFirstPresence) {
            if (!hasAvatar && Config.get('room.vCardAvatarFallback', false)) {
                this.fetchVcardImage(this.avatarDisplay);
            }
        }
    }

    onPresenceUnavailable(stanza: any): void
    {
        this.remove();

        if (Config.get('room.chatlogLeftTheRoom', true)) {
            this.room?.showChatMessage(this.roomNick, 'left the room');
        }

        this.sendParticipantEventToAllScriptFrames({ event: 'leave' });
    }

    setAvailability(show: string, status: string): void
    {
        switch (show) {
            case 'away':
            case 'xa':
            case 'dnd':
                $(this.elem).attr('title', this.app.translateText('StatusMessage.' + status));
                $(this.elem).addClass('n3q-ghost');
                break;
            default:
                $(this.elem).removeAttr('title');
                $(this.elem).removeClass('n3q-ghost');
                break;
        }
    }

    fetchVcardImage(avatarDisplay: IObserver)
    {
        let stanzaId = Utils.randomString(15);
        let iq = xml('iq', { 'type': 'get', 'id': stanzaId, 'to': this.room.getJid() + '/' + this.roomNick })
            .append(xml('vCard', { 'xmlns': 'vcard-temp' }))
            ;
        this.app.sendStanza(iq, stanzaId, (stanza) =>
        {
            let imageUrl = this.decodeVcardImage2DataUrl(stanza);
            if (imageUrl && imageUrl != '') {
                avatarDisplay.updateObservableProperty('VCardImageUrl', imageUrl);
            }
        });
    }

    fetchVersionInfo(chatWindow: IObserver)
    {
        let stanzaId = Utils.randomString(15);
        let attr = { 'xmlns': 'jabber:iq:version' };
        if (Environment.isDevelopment() || Config.get('xmpp.verboseVersionQuery', false)) {
            attr['auth'] = Config.get('xmpp.verboseVersionQueryWeakAuth', '');
        }
        let query = xml('query', attr);
        let iq = xml('iq', { 'type': 'get', 'id': stanzaId, 'to': this.room.getJid() + '/' + this.roomNick }).append(query);

        this.app.sendStanza(iq, stanzaId, (stanza: xml) =>
        {
            // chatWindow.addLine(this.roomNick + Date.now(), this.roomNick, 'xx');

            let info = {};
            let versionQuery = stanza.getChildren('query').find(stanzaChild => (stanzaChild.attrs == null) ? false : stanzaChild.attrs.xmlns === 'jabber:iq:version');
            if (versionQuery) {
                let children = versionQuery.children;
                if (children) {
                    for (let i = 0; i < children.length; i++) {
                        let child = children[i];
                        info[child.name] = child.text();
                    }
                }
            }

            chatWindow.updateObservableProperty('VersionInfo', JSON.stringify(info));
        });
    }

    decodeVcardImage2DataUrl(stanza: xml): string
    {
        let url: string;

        let vCardNode = stanza.getChildren('vCard').find(stanzaChild => (stanzaChild.attrs == null) ? false : stanzaChild.attrs.xmlns === 'vcard-temp');
        if (vCardNode) {
            let photoNodes = vCardNode.getChildren('PHOTO');
            let photoNode = photoNodes[0];
            if (photoNode) {
                let binvalNodes = photoNode.getChildren('BINVAL');
                let binvalNode = binvalNodes[0];
                let typeNodes = photoNode.getChildren('TYPE');
                let typeNode = typeNodes[0];
                if (binvalNode && typeNode) {
                    let data = binvalNode.text();
                    let type = typeNode.text();
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

    async onMessagePrivateChat(stanza: any): Promise<void>
    {
        let from = jid(stanza.attrs.from);
        let nick = from.getResource();
        let name = this.getDisplayName();
        let isChat = true;

        let pokeNode = stanza.getChildren('x').find(child => (child.attrs == null) ? false : as.String(child.attrs.xmlns, '') == 'vp:poke');
        if (pokeNode) {
            isChat = false;
            this.onReceivePoke(pokeNode);
        }

        let vidconfNode = stanza.getChildren('x').find(child => (child.attrs == null) ? false : as.String(child.attrs.xmlns, '') == 'vp:vidconf');
        if (vidconfNode) {
            isChat = false;
            this.onReceiveVidconf(vidconfNode);
        }

        let responseNode = stanza.getChildren('x').find(child => (child.attrs == null) ? false : as.String(child.attrs.xmlns, '') == 'vp:response');
        if (responseNode) {
            isChat = false;
            this.onReceiveResponse(responseNode);
        }

        let transferNode = stanza.getChildren('x').find(child => (child.attrs == null) ? false : as.String(child.attrs.xmlns, '') == 'vp:transfer');
        if (transferNode) {
            isChat = false;
            this.onReceiveTransfer(transferNode);
        }

        if (!isChat) { return; }

        let text = '';
        let bodyNode = stanza.getChild('body');
        if (bodyNode) {
            text = bodyNode.getText();
        }

        if (text == '') { return; }

        if (this.privateChatWindow == null) {
            await this.openPrivateChat(this.elem);
        }
        this.privateChatWindow?.addLine(nick + Date.now(), name, text);

        if (this.room) {
            if (nick != this.room.getMyNick()) {
                let chatWindow = this.privateChatWindow;
                if (chatWindow) {
                    if (chatWindow.isSoundEnabled()) {
                        chatWindow.playSound();
                    }
                }
            }
        }

        // if (this.privateChatWindow == null) {
        //     new SimpleToast(this.app, 'PrivateChat', Config.get('room.privateChatToastDurationSec', 60), 'privatechat', name, text).show();
        // } else {
        //     this.privateChatWindow?.addLine(nick + Date.now(), name, text);
        // }
    }

    onReceivePoke(node: any): void
    {
        try {
            let pokeType = node.attrs.type;
            let iconType = 'greeting';
            if (pokeType == 'bye') { iconType = 'bye'; }
            let toast = new SimpleToast(this.app, 'poke-' + pokeType, Config.get('room.pokeToastDurationSec_' + pokeType, Config.get('room.pokeToastDurationSec', 10)), iconType, this.getDisplayName(), pokeType + 's');
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

    onReceiveVidconf(node: any): void
    {
        try {
            let url = node.attrs.url;
            let toast = new SimpleToast(this.app, 'privatevidconf', Config.get('room.privateVidconfToastDurationSec', 60), 'privatevidconf', this.getDisplayName(), 'Wants to start a private videoconference');
            toast.actionButton('Accept', () =>
            {
                this.openPrivateVidconf(this.getElem(), url);
                toast.close();
            })
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

    onReceiveResponse(node: any): void
    {
        try {
            if (node.attrs.to == VpProtocol.PrivateVideoconfRequest.xmlns) {
                if (node.attrs.type == VpProtocol.PrivateVideoconfResponse.type_decline) {
                    let comment = node.attrs.comment;
                    let toast = new SimpleToast(this.app, 'privatevidconfresponse', Config.get('room.privateVidconfToastDurationSec', 60), 'privatevidconf', this.getDisplayName(), 'Refuses to join the private videoconference');
                    toast.show();
                }
            }
        } catch (error) {
            //
        }
    }

    async onReceiveTransfer(node: any): Promise<void>
    {
        try {
            let type = as.String(node.attrs.type, '');
            let itemId = as.String(node.attrs.item, '');
            if (type != '' && itemId != '') {
                switch (type) {

                    case 'propose':

                        let transferId: string = null;
                        let propSet = await BackgroundMessage.findBackpackItemProperties({ [Pid.Id]: itemId, [Pid.IsTakeable]: 'true', [Pid.IsRezzed]: 'true', [Pid.RezzedLocation]: this.room.getJid() });
                        if (propSet[itemId]) {
                            this.room.transferItem(itemId, this.roomNick);
                        }
                        break;

                    case 'request':
                        if (node.children && node.children.length > 0)
                            for (let i = 0; i < node.children.length; i++) {
                                let body = as.String(node.children[i], '');
                                if (body != '') {
                                    let props = JSON.parse(body);

                                    delete props[Pid.InventoryX];
                                    delete props[Pid.InventoryY];

                                    await BackgroundMessage.addBackpackItem(itemId, props, {});
                                    await BackgroundMessage.derezBackpackItem(itemId, this.room.getJid(), -1, -1, {}, [Pid.AutorezIsActive, Pid.TransferState], {});
                                    await this.room.confirmItemTransfer(itemId, this.roomNick);
                                }
                            }
                        break;

                    case 'confirm':
                        let props = await BackgroundMessage.getBackpackItemProperties(itemId);
                        if (props[Pid.TransferState] == Pid.TransferState_Source) {
                            await BackgroundMessage.deleteBackpackItem(itemId, {});
                        }
                        break;

                }
            }
        } catch (error) {
            //
        }
    }

    onMessageGroupchat(stanza: any): void
    {
        let from = jid(stanza.attrs.from);
        let nick = from.getResource();
        let name = this.getDisplayName();
        let now = Date.now();
        let timestamp = 0;

        {
            let node = stanza.getChildren('delay').find(stanzaChild => (stanzaChild.attrs == null) ? false : stanzaChild.attrs.xmlns === 'urn:xmpp:delay');
            if (node != undefined) {
                let dateStr = as.String(node.attrs.stamp, ''); // 2020-04-24T06:53:46Z
                if (dateStr != '') {
                    try {
                        var date = new Date(dateStr);
                        let time = date.getTime();
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
            let node = stanza.getChildren('x').find(stanzaChild => (stanzaChild.attrs == null) ? false : stanzaChild.attrs.xmlns === 'jabber:x:delay');
            if (node != undefined) {
                let dateStr = as.String(node.attrs.stamp, ''); // 20200424T06:53:46
                try {
                    var date = new Date(dateStr);
                    let time = date.getTime();
                    if (!isNaN(time)) {
                        timestamp = time;
                    }
                } catch (error) {
                    //
                }
            }
        }


        let text = '';
        let bodyNode = stanza.getChild('body');
        if (bodyNode) {
            text = bodyNode.getText();
        }

        if (text == '') { return; }

        if (timestamp == 0) {
            timestamp = now;
        }
        let delayMSec = now - timestamp;

        // always
        this.room?.showChatMessage(name, text);

        this.sendParticipantChatToAllScriptFrames(text);

        // recent
        if (delayMSec * 1000 < as.Float(Config.get('room.maxChatAgeSec', 60))) {
            if (!this.isChatCommand(text)) {
                this.chatoutDisplay?.setText(text);
                this.app.toFront(this.elem, ContentApp.LayerEntity);
            }
        }

        // new only
        if (delayMSec <= 100) {
            this.avatarDisplay?.setAction('chat');
            if (this.isChatCommand(text)) {
                return this.onChatCommand(text);
            }

            if (this.room) {
                if (nick != this.room.getMyNick()) {
                    let chatWindow = this.room.getChatWindow();
                    if (chatWindow) {
                        if (chatWindow.isSoundEnabled()) {
                            chatWindow.playSound();
                        }
                    }
                }
            }

        }
    }

    isChatCommand(text: string) { return text.substring(0, 1) == '/'; }

    onChatCommand(text: string): void
    {
        var parts: string[] = text.split(' ');
        if (parts.length < 1) { return; }
        var cmd: string = parts[0];

        switch (cmd) {
            case '/do':
                if (parts.length < 2) { return; }
                // this.chatoutDisplay?.setText(text);
                this.avatarDisplay?.setAction(parts[1]);
                break;
        }
    }

    // /do WaterBottle ApplyTo WaterCan
    private chat_command_apply: string = '/action';
    sendGroupChat(text: string, handler?: (IMessage: any) => any): void
    {
        //hw later
        // if (text.substr(0, this.chat_command_apply.length) == this.chat_command_apply) {
        //     var parts = text.split(' ');
        //     if (parts.length == 4) {
        //         var activeName = parts[1];
        //         var action = parts[2];
        //         var passiveName = parts[3];
        //         var activeId: string = '';
        //         var passiveId: string = '';
        //         var activeUndecided: boolean = false;
        //         var passiveUndecided: boolean = false;
        //         for (var id in this.things) {
        //             if (this.things[id].isIdentifiedBy(activeName)) {
        //                 activeUndecided = (activeId != '');
        //                 if (!activeUndecided) {
        //                     activeId = id;
        //                 }
        //                 break;
        //             }
        //         }
        //         for (var id in this.things) {
        //             if (this.things[id].isIdentifiedBy(passiveName)) {
        //                 passiveUndecided = (passiveId != '');
        //                 if (!passiveUndecided) {
        //                     passiveId = id;
        //                 }
        //                 break;
        //             }
        //         }
        //         if (activeUndecided || passiveUndecided) {
        //             new SimpleNotice(this, 'ActionAmbiguous', 10, 'glyphicon glyphicon-ban-circle', 'Not Executed', (activeUndecided ? activeName : passiveName) + ' is ambiguous');
        //         } else {
        //             if (activeId != '' && passiveId != '') {
        //                 this.sendItemActionMessage(this.getRoomName(), activeId, action, { Item: passiveId });
        //             }
        //         }
        //     }
        // }

        this.room?.sendGroupChat(text);
    }

    // Mouse

    private onMouseEnterAvatarVcardImageFallbackAlreadyTriggered: boolean = false;
    onMouseEnterAvatar(ev: JQuery.Event): void
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
    }

    onMouseClickAvatar(ev: JQuery.Event): void
    {
        super.onMouseClickAvatar(ev)

        if (this.isSelf) {
            this.toggleChatin();
        } else {
            this.toggleChatout();
        }
    }

    onMouseDoubleClickAvatar(ev: JQuery.Event): void
    {
        // super.onMouseClickAvatar(ev)
        if (this.isSelf) {
            this.toggleChatWindow();
        } else {
            this.togglePrivateChatWindow();
        }
    }

    onDraggedTo(newX: number): void
    {
        if (this.getPosition() != newX) {
            if (this.isSelf) {
                this.app.savePosition(newX);
                this.room?.sendMoveMessage(newX);
            } else {
                this.quickSlide(newX);
            }
        }
    }

    onMoveDestinationReached(newX: number): void
    {
        super.onMoveDestinationReached(newX);
        this.sendParticipantMovedToAllScriptFrames();

        if (this.isSelf) {
            let items = this.getRoom().getAutoRangeItems();
            for (let i = 0; i < items.length; i++) {
                let item = items[i];
                item.checkIframeAutoRange();
            }
        }
    }

    sendParticipantMovedToAllScriptFrames(): void
    {
        let participantData = {
            id: this.getRoomNick(),
            nickname: this.getDisplayName(),
            x: this.getPosition(),
            isSelf: this.getIsSelf(),
        };

        let itemIds = this.room.getAllScriptedItems();
        for (let i = 0; i < itemIds.length; i++) {
            this.room.getItem(itemIds[i])?.sendMessageToScriptFrame(new WeblinClientIframeApi.ParticipantMovedNotification(participantData));
        }
    }

    sendParticipantChatToAllScriptFrames(text: string): void
    {
        let participantData = {
            id: this.getRoomNick(),
            nickname: this.getDisplayName(),
            x: this.getPosition(),
            isSelf: this.getIsSelf(),
        };

        let itemIds = this.room.getAllScriptedItems();
        for (let i = 0; i < itemIds.length; i++) {
            this.room.getItem(itemIds[i])?.sendMessageToScriptFrame(new WeblinClientIframeApi.ParticipantChatNotification(participantData, text));
        }
    }

    sendParticipantEventToAllScriptFrames(data: any): void
    {
        let participantData = {
            id: this.getRoomNick(),
            nickname: this.getDisplayName(),
            x: this.getPosition(),
            isSelf: this.getIsSelf(),
        };

        let itemIds = this.room.getAllScriptedItems();
        for (let i = 0; i < itemIds.length; i++) {
            this.room.getItem(itemIds[i])?.sendMessageToScriptFrame(new WeblinClientIframeApi.ParticipantEventNotification(participantData, data));
        }
    }

    do(what: string): void
    {
        this.room?.sendGroupChat('/do ' + what);
        if (Config.get('points.enabled', false)) {
            /* await */ BackgroundMessage.pointsActivity(Pid.PointsChannelEmote, 1);
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

    sendPoke(type: string): void
    {
        this.room?.sendPoke(this.roomNick, type);
    }

    async openPrivateChat(aboveElem: HTMLElement): Promise<void>
    {
        if (this.privateChatWindow == null) {
            this.privateChatWindow = new PrivateChatWindow(this.app, this);
            await this.privateChatWindow.show({
                'above': aboveElem,
                onClose: () => { this.privateChatWindow = null; },
            });
        }
    }

    togglePrivateChatWindow(): void
    {
        if (this.privateChatWindow) {
            if (this.privateChatWindow.isOpen()) {
                this.privateChatWindow.close();
            }
        } else {
            this.openPrivateChat(this.elem);
        }
    }

    async initiatePrivateVidconf(aboveElem: HTMLElement): Promise<void>
    {
        let roomJid = jid(this.room.getJid());

        let vidconfSecret = await Memory.getLocal('client.vidconfSecret', '');
        if (vidconfSecret == '') {
            vidconfSecret = Utils.randomString(10);
            await Memory.setLocal('client.vidconfSecret',vidconfSecret);
        }

        let confId = 'private-' + roomJid.getLocal() + '-' + vidconfSecret;

        let urlTemplate = Config.get('room.vidconfUrl', 'https://meet.jit.si/{room}#userInfo.displayName="{name}"');
        let url = urlTemplate
            .replace('{room}', confId)
            ;

        this.room?.sendPrivateVidconf(this.roomNick, url);
        this.openPrivateVidconf(aboveElem, url);
    }

    openPrivateVidconf(aboveElem: HTMLElement, urlTemplate: string): void
    {
        if (this.privateVidconfWindow == null) {
            let displayName = this.room.getParticipant(this.room.getMyNick()).getDisplayName();

            let url = urlTemplate
                .replace('{name}', displayName)
                ;

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

    async applyItem(roomItem: RoomItem)
    {
        let itemId = roomItem.getRoomNick();
        let roomJid = this.getRoom().getJid();
        if (this.isSelf) {
            log.debug('Participant.applyItem', 'derez', itemId, 'room', roomJid);
            await BackgroundMessage.derezBackpackItem(itemId, roomJid, -1, -1, {}, [Pid.AutorezIsActive], {});
        } else {
            log.debug('Participant.applyItem', 'transfer', itemId, 'room', roomJid);

            if (!as.Bool(roomItem.getProperties()[Pid.IsTransferable], true)) {
                let fact = ItemException.fact2String(ItemException.Fact.NotTransferred);
                let reason = ItemException.reason2String(ItemException.Reason.ItemIsNotTransferable);
                new SimpleErrorToast(this.app, 'Warning-' + fact + '-' + reason, Config.get('room.applyItemErrorToastDurationSec', 5), 'warning', fact, reason, '').show();
            } else {
                await this.room?.transferItem(itemId, this.roomNick);
            }

        }
    }

    async applyBackpackItem(backpackItem: BackpackItem)
    {
        log.debug('Participant.applyBackpackItem', '### NOT YET IMPLEMENTED');
    }

}
