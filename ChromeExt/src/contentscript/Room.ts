import log = require('loglevel');
import { xml, jid } from '@xmpp/client';
import { as } from '../lib/as';
import { Config } from '../lib/Config';
import { Utils } from '../lib/Utils';
import { Panic } from '../lib/Panic';
import { ItemProperties, Pid } from '../lib/ItemProperties';
import { BackgroundMessage } from '../lib/BackgroundMessage';
import { Translator } from '../lib/Translator';
import { VpProtocol } from '../lib/VpProtocol';
import { ContentApp } from './ContentApp';
import { Entity } from './Entity';
import { Participant } from './Participant';
import { RoomItem } from './RoomItem';
import { ChatWindow } from './ChatWindow'; // Wants to be after Participant and Item otherwise $().resizable does not work
import { VidconfWindow } from './VidconfWindow';
import { VpiResolver } from './VpiResolver';
import { BackpackItem } from './BackpackItem';
import { SimpleToast } from './Toast';
import { pid } from 'process';

export interface IRoomInfoLine extends Array<string | string> { 0: string, 1: string }
export interface IRoomInfo extends Array<IRoomInfoLine> { }

export class Room
{
    private userJid: string;
    private resource: string = '';
    private avatar: string = '';
    private enterRetryCount: number = 0;
    private maxEnterRetries: number = as.Int(Config.get('xmpp.maxMucEnterRetries', 4));
    private participants: { [nick: string]: Participant; } = {};
    private items: { [nick: string]: RoomItem; } = {};
    private dependents: { [nick: string]: Array<string>; } = {};
    private isEntered = false; // iAmAlreadyHere() needs isEntered=true to be after onPresenceAvailable
    private chatWindow: ChatWindow;
    private vidconfWindow: VidconfWindow;
    private myNick: string;
    private showAvailability = '';
    private statusMessage = '';

    constructor(protected app: ContentApp, private jid: string, private pageUrl: string, private destination: string, private posX: number) 
    {
        let user = Config.get('xmpp.user', '');
        let domain = Config.get('xmpp.domain', '');
        if (domain == '') {
            Panic.now();
        }
        this.userJid = user + '@' + domain;

        this.chatWindow = new ChatWindow(app, this);
    }

    getInfo(): IRoomInfo
    {
        return [
            ['url', this.getPageUrl()],
            ['jid', this.getJid()],
            ['destination', this.getDestination()]
        ];
    }

    getChatWindow(): ChatWindow { return this.chatWindow; }
    getMyNick(): string { return this.myNick; }
    getJid(): string { return this.jid; }
    getDestination(): string { return this.destination; }
    getPageUrl(): string { return this.pageUrl; }
    setPageUrl(pageUrl: string): void { this.pageUrl = pageUrl; }
    getParticipant(nick: string): Participant { return this.participants[nick]; }
    getItem(nick: string): RoomItem { return this.items[nick]; }
    getParticipantIds(): Array<string>
    {
        let ids = [];
        for (let id in this.participants) {
            ids.push(id);
        }
        return ids;
    }
    getItemIds(): Array<string>
    {
        let ids = [];
        for (let id in this.items) {
            ids.push(id);
        }
        return ids;
    }

    getPageClaimItem(): RoomItem
    {
        for (let nick in this.items) {
            let props = this.items[nick].getProperties();
            if (as.Bool(props[Pid.ClaimAspect], false)) {
                return this.getItem(nick);
            }
        }
        return null;
    }

    getAutoRangeItems(): Array<RoomItem>
    {
        let items = [];
        for (let nick in this.items) {
            let props = this.items[nick].getProperties();
            if (as.Bool(props[Pid.IframeAspect], false) && as.String(props[Pid.IframeAutoRange], '') != '') {
                items.push(this.getItem(nick));
            }
        }
        return items;
    }

    iAmAlreadyHere()
    {
        return this.isEntered;
    }

    // presence

    async enter(): Promise<void>
    {
        try {
            let nickname = await this.app.getUserNickname();
            let avatar = await this.app.getUserAvatar();
            this.resource = await this.getBackpackItemNickname(nickname);
            this.avatar = await this.getBackpackItemAvatarId(avatar);
        } catch (error) {
            log.info(error);
            this.resource = 'new-user';
            this.avatar = '004/pinguin';
        }

        this.enterRetryCount = 0;
        this.sendPresence();
    }

    sleep(statusMessage: string)
    {
        this.showAvailability = 'away';
        this.statusMessage = statusMessage;
        this.sendPresence();
    }

    wakeup()
    {
        this.showAvailability = '';
        this.sendPresence();
    }

    leave(): void
    {
        this.sendPresenceUnavailable();
        this.removeAllParticipants();
        this.removeAllItems();
        this.onUnload();
    }

    onUnload()
    {
        this.stopKeepAlive();
    }

    async onUserSettingsChanged(): Promise<void>
    {
        await this.enter();
        window.setTimeout(async () => { await this.sendPresence(); }, Config.get('xmpp.resendPresenceAfterResourceChangeBecauseServerSendsOldPresenceDataWithNewResourceToForceNewDataDelaySec', 1.0) * 1000);
    }

    async sendPresence(): Promise<void>
    {
        try {
            let vpProps = { xmlns: 'vp:props', 'timestamp': Date.now(), 'Nickname': this.resource, 'AvatarId': this.avatar, 'nickname': this.resource, 'avatar': 'gif/' + this.avatar };

            let nickname = await this.getBackpackItemNickname(this.resource);
            if (nickname != '') {
                vpProps['Nickname'] = nickname;
                vpProps['nickname'] = nickname;
            }

            let avatarUrl = await this.getBackpackItemAvatarUrl('');
            if (avatarUrl != '') {
                vpProps['AvatarUrl'] = avatarUrl;
                delete vpProps['AvatarId'];
                delete vpProps['avatar'];
            }

            let points = 0;
            if (Config.get('points.enabled', false)) {
                points = await this.getPointsItemPoints(0);
                if (points > 0) {
                    vpProps['Points'] = points;
                }
            }

            let presence = xml('presence', { to: this.jid + '/' + this.resource });

            presence.append(xml('x', { xmlns: 'firebat:avatar:state', }).append(xml('position', { x: as.Int(this.posX) })));

            if (this.showAvailability != '') {
                presence.append(xml('show', {}, this.showAvailability));
            }
            if (this.statusMessage != '') {
                presence.append(xml('status', {}, this.statusMessage));
            }

            presence.append(xml('x', vpProps));

            let identityUrl = Config.get('identity.url', '');
            let identityDigest = Config.get('identity.digest', '1');
            if (identityUrl == '') {
                if (avatarUrl == '') {
                    avatarUrl = Utils.getAvatarUrlFromAvatarId(this.avatar);
                }
                identityDigest = as.String(Utils.hash(this.resource + avatarUrl));
                identityUrl = as.String(Config.get('identity.identificatorUrlTemplate', 'https://webex.vulcan.weblin.com/Identity/Generated?avatarUrl={avatarUrl}&nickname={nickname}&digest={digest}&imageUrl={imageUrl}&points={points}'))
                    .replace('{nickname}', encodeURIComponent(nickname))
                    .replace('{avatarUrl}', encodeURIComponent(avatarUrl))
                    .replace('{digest}', encodeURIComponent(identityDigest))
                    .replace('{imageUrl}', encodeURIComponent(''))
                    ;
                if (points > 0) { identityUrl = identityUrl.replace('{points}', encodeURIComponent('' + points)); }
            }
            if (identityUrl != '') {
                presence.append(
                    xml('x', { xmlns: 'firebat:user:identity', 'jid': this.userJid, 'src': identityUrl, 'digest': identityDigest })
                );
            }

            // if (!this.isEntered) {
                presence.append(
                    xml('x', { xmlns: 'http://jabber.org/protocol/muc' })
                        .append(xml('history', { seconds: '180', maxchars: '3000', maxstanzas: '10' }))
                );
            // }

            // log.debug('#### send', presence.children[1].attrs);
            this.app.sendStanza(presence);
        } catch (error) {
            log.info(error);
            Panic.now();
        }
    }

    async getPointsItemPoints(defaultValue: number): Promise<number> { return as.Int(await this.getBackpackItemProperty({ [Pid.PointsAspect]: 'true' }, Pid.PointsTotal, defaultValue)); }
    async getBackpackItemAvatarId(defaultValue: string): Promise<string> { return as.String(await this.getBackpackItemProperty({ [Pid.AvatarAspect]: 'true', [Pid.DeactivatableIsInactive]: 'false' }, Pid.AvatarAvatarId, defaultValue)); }
    async getBackpackItemAvatarUrl(defaultValue: string): Promise<string> { return as.String(await this.getBackpackItemProperty({ [Pid.AvatarAspect]: 'true', [Pid.DeactivatableIsInactive]: 'false' }, Pid.AvatarAnimationsUrl, defaultValue)); }
    async getBackpackItemNickname(defaultValue: string): Promise<string> { return as.String(await this.getBackpackItemProperty({ [Pid.NicknameAspect]: 'true', [Pid.DeactivatableIsInactive]: 'false' }, Pid.NicknameText, defaultValue)); }

    async getBackpackItemProperty(filterProperties: ItemProperties, propertyPid: string, defautValue: any): Promise<any>
    {
        if (Utils.isBackpackEnabled()) {
            let propSet = await BackgroundMessage.findBackpackItemProperties(filterProperties);
            let item = null;
            for (let id in propSet) {
                let props = propSet[id];
                if (props) {
                    if (props[propertyPid]) {
                        return props[propertyPid];
                    }
                }
            }
        }
        return defautValue;
    }

    private sendPresenceUnavailable(): void
    {
        let presence = xml('presence', { type: 'unavailable', to: this.jid + '/' + this.resource });

        this.app.sendStanza(presence);
    }

    onPresence(stanza: any): void
    {
        let presenceType = as.String(stanza.attrs.type, 'available');
        switch (presenceType) {
            case 'available': this.onPresenceAvailable(stanza); break;
            case 'unavailable': this.onPresenceUnavailable(stanza); break;
            case 'error': this.onPresenceError(stanza); break;
        }
    }

    onPresenceAvailable(stanza: any): void
    {
        let to = jid(stanza.attrs.to);
        let from = jid(stanza.attrs.from);
        let resource = from.getResource();
        let isSelf = (resource == this.resource);
        let entity: Entity = null;
        let isItem = false;

        // presence x.vp:props type='item' 
        let vpPropsNode = stanza.getChildren('x').find(stanzaChild => (stanzaChild.attrs == null) ? false : stanzaChild.attrs.xmlns === 'vp:props');
        if (vpPropsNode) {
            let attrs = vpPropsNode.attrs;
            if (attrs) {
                let type = as.String(attrs.type, '');
                isItem = (type == 'item');
            }
        }

        if (isItem) {
            entity = this.items[resource];
            if (!entity) {
                let roomItem = new RoomItem(this.app, this, resource, false);
                this.items[resource] = roomItem;
                entity = roomItem;
            }
        } else {
            entity = this.participants[resource];
            if (!entity) {
                let participant = new Participant(this.app, this, resource, isSelf);
                this.participants[resource] = participant;
                entity = participant;
            }
        }

        if (entity) {
            entity.onPresenceAvailable(stanza);

            if (isSelf && !this.isEntered) {
                this.myNick = resource;
                this.isEntered = true;

                this.keepAlive();

                this.app.reshowVidconfWindow();
            }
        }

        {
            let currentDependents = new Array<string>();
            let vpDependent = stanza.getChildren('x').find(stanzaChild => (stanzaChild.attrs == null) ? false : stanzaChild.attrs.xmlns === 'vp:dependent');
            if (vpDependent) {

                let dependentPresences = vpDependent.getChildren('presence');
                if (dependentPresences.length > 0) {
                    for (let i = 0; i < dependentPresences.length; i++) {
                        var dependentPresence = dependentPresences[i];
                        dependentPresence.attrs['to'] = to.toString();
                        let dependentFrom = jid(dependentPresence.attrs.from);
                        let dependentResource = dependentFrom.getResource();
                        currentDependents.push(dependentResource);
                        this.onPresence(dependentPresence);
                    }
                }
            }

            let previousDependents = this.dependents[resource];
            if (previousDependents) {
                for (let i = 0; i < previousDependents.length; i++) {
                    let value = previousDependents[i];
                    if (!currentDependents.includes(value)) {
                        let dependentUnavailablePresence = xml('presence', { 'from': this.jid + '/' + value, 'type': 'unavailable', 'to': to.toString() });
                        this.onPresence(dependentUnavailablePresence);
                    }
                }
            }

            this.dependents[resource] = currentDependents;
        }
    }

    onPresenceUnavailable(stanza: any): void
    {
        let from = jid(stanza.attrs.from);
        let resource = from.getResource();

        if (this.participants[resource]) {
            this.participants[resource].onPresenceUnavailable(stanza);
            delete this.participants[resource];
        } else if (this.items[resource]) {
            this.items[resource].onPresenceUnavailable(stanza);
            delete this.items[resource];
        }

        let currentDependents = this.dependents[resource];
        if (currentDependents) {
            let to = jid(stanza.attrs.to);
            for (let i = 0; i < currentDependents.length; i++) {
                let value = currentDependents[i];
                let dependentUnavailablePresence = xml('presence', { 'from': this.jid + '/' + value, 'type': 'unavailable', 'to': to });
                this.onPresence(dependentUnavailablePresence);
            };
            delete this.dependents[resource];
        }
    }

    onPresenceError(stanza: any): void
    {
        let code = as.Int(stanza.getChildren('error')[0].attrs.code, -1);
        if (code == 409) {
            this.reEnterDifferentNick();
        }
    }

    private reEnterDifferentNick(): void
    {
        this.enterRetryCount++;
        if (this.enterRetryCount > this.maxEnterRetries) {
            log.info('Too many retries ', this.enterRetryCount, 'giving up on room', this.jid);
            return;
        } else {
            this.resource = this.getNextNick(this.resource);
            this.sendPresence();
        }
    }

    private getNextNick(nick: string): string
    {
        return nick + '_';
    }

    private removeAllParticipants()
    {
        let nicks = this.getParticipantIds();
        nicks.forEach(nick =>
        {
            this.participants[nick].remove();
        });
    }

    private removeAllItems()
    {
        let itemIds = this.getItemIds();
        itemIds.forEach(itemId =>
        {
            this.items[itemId].remove();
        });
    }

    // Keepalive

    private keepAliveSec: number = Config.get('room.keepAliveSec', 180);
    private keepAliveTimer: number = undefined;
    private keepAlive()
    {
        if (this.keepAliveTimer == undefined) {
            this.keepAliveTimer = <number><unknown>setTimeout(() =>
            {
                this.sendPresence();
                this.keepAliveTimer = undefined;
                this.keepAlive();
            }, this.keepAliveSec * 1000);
        }
    }

    private stopKeepAlive()
    {
        if (this.keepAliveTimer != undefined) {
            clearTimeout(this.keepAliveTimer);
            this.keepAliveTimer = undefined;
        }
    }

    // message

    onMessage(stanza: any)
    {
        let from = jid(stanza.attrs.from);
        let nick = from.getResource();
        let type = as.String(stanza.attrs.type, 'groupchat');

        switch (type) {
            case 'groupchat':
                if (this.participants[nick] != undefined) {
                    this.participants[nick].onMessageGroupchat(stanza);
                }
                break;

            case 'chat':
                if (this.participants[nick] != undefined) {
                    this.participants[nick].onMessagePrivateChat(stanza);
                }
                break;

            case 'error':
                //hw todo
                break;
        }
    }

    // Send stuff

    /*
    <message
        from='hag66@shakespeare.lit/pda'
        id='hysf1v37'
        to='coven@chat.shakespeare.lit'
        type='groupchat'>
      <body>Harpier cries: 'tis time, 'tis time.</body>
    </message>
    */
    sendGroupChat(text: string)
    {
        let message = xml('message', { type: 'groupchat', to: this.jid, from: this.jid + '/' + this.myNick })
            .append(xml('body', {}, text))
            ;
        this.app.sendStanza(message);
        if (Config.get('points.enabled', false)) {
            /* await */ BackgroundMessage.pointsActivity(Pid.PointsChannelChat, 1);
        }
    }

    sendPrivateChat(text: string, nick: string)
    {
        let message = xml('message', { type: 'chat', to: this.jid + '/' + nick, from: this.jid + '/' + this.myNick })
            .append(xml('body', {}, text))
            ;
        this.app.sendStanza(message);
    }

    sendPoke(nick: string, type: string)
    {
        let message = xml('message', { type: 'chat', to: this.jid + '/' + nick, from: this.jid + '/' + this.myNick })
            .append(xml('x', { 'xmlns': 'vp:poke', 'type': type }))
            ;
        this.app.sendStanza(message);
        if (Config.get('points.enabled', false)) {
            /* await */ BackgroundMessage.pointsActivity(Pid.PointsChannelGreet, 1);
        }
    }

    sendPrivateVidconf(nick: string, url: string)
    {
        let message = xml('message', { type: 'chat', to: this.jid + '/' + nick, from: this.jid + '/' + this.myNick })
            .append(xml('x', { 'xmlns': VpProtocol.PrivateVideoconfRequest.xmlns, [VpProtocol.PrivateVideoconfRequest.key_url]: url }))
            ;
        this.app.sendStanza(message);
    }

    sendDeclinePrivateVidconfResponse(nick: string, comment: string)
    {
        let message = xml('message', { type: 'chat', to: this.jid + '/' + nick, from: this.jid + '/' + this.myNick })
            .append(xml('x', { 'xmlns': VpProtocol.Response.xmlns, [VpProtocol.Response.key_to]: VpProtocol.PrivateVideoconfRequest.xmlns, [VpProtocol.PrivateVideoconfResponse.key_type]: [VpProtocol.PrivateVideoconfResponse.type_decline], [VpProtocol.PrivateVideoconfResponse.key_comment]: comment }))
            ;
        this.app.sendStanza(message);
    }

    async transferItem(itemId: string, nick: string)
    {
        try {
            await BackgroundMessage.derezBackpackItem(itemId, this.getJid(), -1, -1, { [Pid.TransferState]: Pid.TransferState_Source }, [], {});
            let props = await BackgroundMessage.getBackpackItemProperties(itemId);
            let message = xml('message', { type: 'chat', to: this.jid + '/' + nick, from: this.jid + '/' + this.myNick })
                .append(xml('x', { 'xmlns': 'vp:transfer', 'type': 'request', 'item': itemId }, JSON.stringify(props)))
                ;
            this.app.sendStanza(message);
        } catch (error) {

        }
    }

    async confirmItemTransfer(itemId: string, nick: string)
    {
        try {
            let message = xml('message', { type: 'chat', to: this.jid + '/' + nick, from: this.jid + '/' + this.myNick })
                .append(xml('x', { 'xmlns': 'vp:transfer', 'type': 'confirm', 'item': itemId }))
                ;
            this.app.sendStanza(message);

            let props = await BackgroundMessage.getBackpackItemProperties(itemId);
            let senderName = this.getParticipant(nick).getDisplayName();
            let toast = new SimpleToast(this.app, 'itemtransfer-afterthefact', Config.get('backpack.receiveToastDurationSec', 20), 'notice', senderName, this.app.translateText('Toast.ItemTransferred') + ': ' + this.app.translateText('ItemLabel.' + props[Pid.Label]));
            toast.show(() => { });

        } catch (error) {

        }
    }

    showChatWindow(aboveElem: HTMLElement): void
    {
        if (this.chatWindow) {
            if (this.chatWindow.isOpen()) {
                this.chatWindow.close();
            } else {
                this.app.setChatIsOpen(true);
                this.chatWindow.show({
                    'above': aboveElem,
                    onClose: () =>
                    {
                        this.app.setChatIsOpen(false);
                    },
                });
            }
        }
    }

    toggleChatWindow(relativeToElem: HTMLElement): void
    {
        if (this.chatWindow) {
            if (this.chatWindow.isOpen()) {
                this.chatWindow.close();
            } else {
                this.showChatWindow(relativeToElem);
            }
        }
    }

    showChatMessage(name: string, text: string)
    {
        this.chatWindow.addLine(name + Date.now(), name, text);
    }

    clearChatWindow()
    {
        this.chatWindow.clear();
    }

    showVideoConference(aboveElem: HTMLElement, displayName: string): void
    {
        if (this.vidconfWindow) {
            this.vidconfWindow.close();
        } else {
            let urlTemplate = Config.get('room.vidconfUrl', 'https://meet.jit.si/{room}#userInfo.displayName="{name}"');
            let url = urlTemplate
                .replace('{room}', this.jid)
                .replace('{name}', displayName)
                ;

            this.app.setVidconfIsOpen(true);

            this.vidconfWindow = new VidconfWindow(this.app);
            this.vidconfWindow.show({
                'above': aboveElem,
                'url': url,
                onClose: () =>
                {
                    this.vidconfWindow = null;
                    this.app.setVidconfIsOpen(false);
                },
            });
        }
    }

    sendMoveMessage(newX: number): void
    {
        this.posX = newX;
        this.sendPresence();
    }

    // Item interaction

    applyItemToItem(activeItem: RoomItem, passiveItem: RoomItem)
    {
        activeItem.applyItem(passiveItem);
    }

    applyBackpackItemToParticipant(participant: Participant, backpackItem: BackpackItem)
    {
        participant.applyBackpackItem(backpackItem);
    }

    applyItemToParticipant(participant: Participant, roomItem: RoomItem)
    {
        participant.applyItem(roomItem);
    }

    async propsClaimDefersToExistingClaim(props: ItemProperties): Promise<boolean>
    {
        var roomItem = this.getPageClaimItem();
        if (roomItem) {
            let otherProps = roomItem.getProperties();
            let myId = as.String(props[Pid.Id], null);
            let otherId = as.String(otherProps[Pid.Id], null);
            if (myId != '' && myId != otherId) {
                let otherStrength = as.Float(otherProps[Pid.ClaimStrength], 0.0);
                let myStrength = as.Float(props[Pid.ClaimStrength], 0.0);
                let myUrl = as.String(props[Pid.ClaimUrl], '');
                let otherUrl = as.String(otherProps[Pid.ClaimUrl], '');

                if (myUrl != '') {
                    if (!await this.claimIsValidAndOriginal(props)) {
                        myStrength = 0.0;
                    }
                }

                if (otherUrl != '') {
                    if (!await this.claimIsValidAndOriginal(otherProps)) {
                        otherStrength = 0.0;
                    }
                }

                if (myStrength <= otherStrength) {
                    return true;
                }
            }
        }
        return false;
    }

    async claimIsValidAndOriginal(props: ItemProperties): Promise<boolean>
    {
        let url = this.normalizeClaimUrl(props[Pid.ClaimUrl]);

        let mappedRoom = await this.app.vpiMap(url);
        let mappedRoomJid = jid(mappedRoom);
        let mappedRoomName = mappedRoomJid.local;

        let currentRoom = this.getJid();
        let currentRoomJid = jid(currentRoom);
        let currentRoomName = currentRoomJid.local;

        if (mappedRoomName == currentRoomName) {
            let publicKey = Config.get('backpack.signaturePublicKey', '');
            if (ItemProperties.verifySignature(props, publicKey)) {
                return true;
            }
        }

        return false;
    }

    normalizeClaimUrl(url: string): string
    {
        if (url.startsWith('https://')) { return url; }
        if (url.startsWith('http://')) { return url; }
        if (url.startsWith('//')) { return 'https:' + url; }
        return 'https://' + url;
    }

    getAllScriptedItems(): Array<string>
    {
        let scriptItemIds = new Array<string>();

        let itemIds = this.getItemIds();
        for (let i = 0; i < itemIds.length; i++) {
            let itemId = itemIds[i];
            let props = this.getItem(itemId).getProperties();
            if (as.Bool(props[Pid.IframeLive], false)) {
                scriptItemIds.push(itemId);
            }
        }

        return scriptItemIds;
    }

}
