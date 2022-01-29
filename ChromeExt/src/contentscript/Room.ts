import log = require('loglevel');
import * as jid from '@xmpp/jid';
import * as xml from '@xmpp/xml';
import { Element as XmlElement } from 'ltx';
import { as } from '../lib/as';
import { Config } from '../lib/Config';
import { Utils } from '../lib/Utils';
import { Panic } from '../lib/Panic';
import { ItemProperties, Pid } from '../lib/ItemProperties';
import { BackgroundMessage } from '../lib/BackgroundMessage';
import { VpProtocol } from '../lib/VpProtocol';
import { ContentApp } from './ContentApp';
import { Entity } from './Entity';
import { Participant } from './Participant';
import { RoomItem } from './RoomItem';
import { ChatWindow } from './ChatWindow'; // Wants to be after Participant and Item otherwise $().resizable does not work
import { VidconfWindow } from './VidconfWindow';
import { BackpackItem } from './BackpackItem';
import { is } from '../lib/is';

export interface IRoomInfoLine extends Array<string> { 0: string, 1: string }
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
        const user = Config.get('xmpp.user', '');
        const domain = Config.get('xmpp.domain', '');
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

    getItemByItemId(itemId: string): null | RoomItem
    {
        for (const id in this.items) {
            const item = this.items[id];
            if (itemId === item.getItemId()) {
                return item;
            }
        }
        return null;
    }
    
    getParticipantIds(): Array<string>
    {
        const ids = [];
        for (const id in this.participants) {
            ids.push(id);
        }
        return ids;
    }

    getItemIds(): Array<string>
    {
        const itemIds = [];
        for (const id in this.items) {
            const item = this.items[id];
            itemIds.push(item.getItemId());
        }
        return itemIds;
    }

    getPageClaimItem(): null | RoomItem
    {
        for (const nick in this.items) {
            const roomItem = this.items[nick];
            const props = roomItem.getProperties();
            if (as.Bool(props[Pid.ClaimAspect])) {
                return roomItem;
            }
        }
        return null;
    }

    getAutoRangeItems(): Array<RoomItem>
    {
        const items = [];
        for (const nick in this.items) {
            const roomItem = this.items[nick];
            const props = this.items[nick].getProperties();
            if (as.Bool(props[Pid.IframeAspect]) && as.String(props[Pid.IframeAutoRange]) !== '') {
                items.push(roomItem);
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
            const nickname = await this.app.getUserNickname();
            const avatar = await this.app.getUserAvatar();
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
        window.setTimeout(async () => { await this.sendPresence(); }, as.Float(Config.get('xmpp.resendPresenceAfterResourceChangeBecauseServerSendsOldPresenceDataWithNewResourceToForceNewDataDelaySec'), 1) * 1000);
    }

    async sendPresence(): Promise<void>
    {
        try {
            const vpProps = { xmlns: 'vp:props', 'timestamp': Date.now(), 'Nickname': this.resource, 'AvatarId': this.avatar, 'nickname': this.resource, 'avatar': 'gif/' + this.avatar };

            const nickname = await this.getBackpackItemNickname(this.resource);
            if (nickname !== '') {
                vpProps['Nickname'] = nickname;
                vpProps['nickname'] = nickname;
            }

            // let imageUrl = await this.getBackpackItemAvatarImageUrl('');
            // if (imageUrl != '') {
            //     vpProps['ImageUrl'] = imageUrl;
            //     delete vpProps['AvatarId'];
            //     delete vpProps['avatar'];
            // }

            let avatarUrl = await this.getBackpackItemAvatarAnimationsUrl('');
            if (avatarUrl !== '') {
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

            const presence = xml('presence', { to: this.jid + '/' + this.resource });

            presence.append(xml('x', { xmlns: 'firebat:avatar:state', }).append(xml('position', { x: as.Int(this.posX) })));

            if (this.showAvailability !== '') {
                presence.append(xml('show', {}, this.showAvailability));
            }
            if (this.statusMessage !== '') {
                presence.append(xml('status', {}, this.statusMessage));
            }

            presence.append(xml('x', vpProps));

            let identityUrl = as.String(Config.get('identity.url'), '');
            let identityDigest = as.String(Config.get('identity.digest'), '1');
            if (identityUrl === '') {
                if (avatarUrl === '') {
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
            if (identityUrl !== '') {
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
    async getBackpackItemAvatarId(defaultValue: string): Promise<string> { return as.String(await this.getBackpackItemProperty({ [Pid.AvatarAspect]: 'true', [Pid.ActivatableIsActive]: 'true' }, Pid.AvatarAvatarId, defaultValue)); }
    async getBackpackItemAvatarAnimationsUrl(defaultValue: string): Promise<string> { return as.String(await this.getBackpackItemProperty({ [Pid.AvatarAspect]: 'true', [Pid.ActivatableIsActive]: 'true' }, Pid.AvatarAnimationsUrl, defaultValue)); }
    // async getBackpackItemAvatarImageUrl(defaultValue: string): Promise<string> { return as.String(await this.getBackpackItemProperty({ [Pid.AvatarAspect]: 'true', [Pid.ActivatableIsActive]: 'true' }, Pid.AvatarImageUrl, defaultValue)); }
    async getBackpackItemNickname(defaultValue: string): Promise<string> { return as.String(await this.getBackpackItemProperty({ [Pid.NicknameAspect]: 'true', [Pid.ActivatableIsActive]: 'true' }, Pid.NicknameText, defaultValue)); }

    async getBackpackItemProperty(filterProperties: ItemProperties, propertyPid: string, defautValue: any): Promise<any>
    {
        if (Utils.isBackpackEnabled()) {
            const propSet = await BackgroundMessage.findBackpackItemProperties(filterProperties);
            for (const id in propSet) {
                const props = propSet[id];
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
        const presence = xml('presence', { type: 'unavailable', to: this.jid + '/' + this.resource });

        this.app.sendStanza(presence);
    }

    onPresence(stanza: XmlElement): void
    {
        const presenceType = as.String(stanza.attrs.type, 'available');
        switch (presenceType) {
            case 'available': this.onPresenceAvailable(stanza); break;
            case 'unavailable': this.onPresenceUnavailable(stanza); break;
            case 'error': this.onPresenceError(stanza); break;
        }
    }

    onPresenceAvailable(stanza: XmlElement): void
    {
        const to = jid(stanza.attrs.to);
        const from = jid(stanza.attrs.from);
        const resource = from.getResource();
        const isSelf = (resource === this.resource);
        let entity: Entity;
        let isItem = false;

        // presence x.vp:props type='item'
        const vpPropsNode = stanza.getChildren('x').find(stanzaChild => (stanzaChild.attrs == null) ? false : stanzaChild.attrs.xmlns === 'vp:props');
        if (vpPropsNode) {
            const attrs = vpPropsNode.attrs;
            if (attrs) {
                const type = as.String(attrs.type);
                isItem = (type === 'item');
            }
        }

        if (isItem) {
            entity = this.items[resource];
            if (!entity) {
                const roomItem = new RoomItem(this.app, this, resource, false);
                this.items[resource] = roomItem;
                entity = roomItem;
            }
        } else {
            entity = this.participants[resource];
            if (!entity) {
                const participant = new Participant(this.app, this, resource, isSelf);
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
            const currentDependents = new Array<string>();
            const vpDependent = stanza.getChildren('x').find(stanzaChild => (stanzaChild.attrs == null) ? false : stanzaChild.attrs.xmlns === 'vp:dependent');
            if (vpDependent) {

                const dependentPresences = vpDependent.getChildren('presence');
                if (dependentPresences.length > 0) {
                    for (let i = 0; i < dependentPresences.length; i++) {
                        const dependentPresence = dependentPresences[i];
                        const incomplete = as.Bool(dependentPresence.attrs._incomplete, false);
                        if (!incomplete) {
                            dependentPresence.attrs['to'] = to.toString();
                            const dependentFrom = jid(dependentPresence.attrs.from);
                            const dependentResource = dependentFrom.getResource();
                            currentDependents.push(dependentResource);
                            this.onPresence(dependentPresence);
                        }
                    }
                }
            }

            const previousDependents = this.dependents[resource];
            if (previousDependents) {
                for (let i = 0; i < previousDependents.length; i++) {
                    const value = previousDependents[i];
                    if (!currentDependents.includes(value)) {
                        const dependentUnavailablePresence = xml('presence', { 'from': this.jid + '/' + value, 'type': 'unavailable', 'to': to.toString() });
                        this.onPresence(dependentUnavailablePresence);
                    }
                }
            }

            this.dependents[resource] = currentDependents;
        }
    }

    onPresenceUnavailable(stanza: XmlElement): void
    {
        const from = jid(stanza.attrs.from);
        const resource = from.getResource();

        if (this.participants[resource]) {
            this.participants[resource].onPresenceUnavailable(stanza);
            delete this.participants[resource];
        } else if (this.items[resource]) {
            this.items[resource].onPresenceUnavailable(stanza);
            delete this.items[resource];
        }

        const currentDependents = this.dependents[resource];
        if (currentDependents) {
            const to = jid(stanza.attrs.to);
            for (let i = 0; i < currentDependents.length; i++) {
                const value = currentDependents[i];
                const dependentUnavailablePresence = xml('presence', { 'from': this.jid + '/' + value, 'type': 'unavailable', 'to': to });
                this.onPresence(dependentUnavailablePresence);
            }
            delete this.dependents[resource];
        }
    }

    onPresenceError(stanza: XmlElement): void
    {
        const code = as.Int(stanza.getChildren('error')[0].attrs.code, -1);
        if (code === 409) {
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
        const nicks = this.getParticipantIds();
        nicks.forEach(nick =>
        {
            this.participants[nick].remove();
        });
    }

    private removeAllItems()
    {
        const itemIds = Object.keys(this.items);
        itemIds.forEach(itemId =>
        {
            this.items[itemId].remove();
        });
    }

    // Keepalive

    private keepAliveSec: number = as.Float(Config.get('room.keepAliveSec'), 180);
    private keepAliveTimer: undefined | number = undefined;
    private keepAlive()
    {
        if (this.keepAliveTimer === undefined) {
            this.keepAliveTimer = window.setTimeout(() =>
            {
                this.sendPresence();
                this.keepAliveTimer = undefined;
                this.keepAlive();
            }, this.keepAliveSec * 1000);
        }
    }

    private stopKeepAlive()
    {
        if (this.keepAliveTimer !== undefined) {
            clearTimeout(this.keepAliveTimer);
            this.keepAliveTimer = undefined;
        }
    }

    // message

    onMessage(stanza: XmlElement)
    {
        const from = jid(stanza.attrs.from);
        const nick = from.getResource();
        const type = as.String(stanza.attrs.type, 'groupchat');

        switch (type) {
            case 'groupchat':
                this.participants[nick]?.onMessageGroupchat(stanza);
                break;

            case 'chat':
                this.participants[nick]?.onMessagePrivateChat(stanza);
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
        const message = xml('message', { type: 'groupchat', to: this.jid, from: this.jid + '/' + this.myNick })
            .append(xml('body', { id: Utils.randomString(10) }, text))
            ;
        this.app.sendStanza(message);
        if (Config.get('points.enabled', false)) {
            /* await */ BackgroundMessage.pointsActivity(Pid.PointsChannelChat, 1);
        }
    }

    sendPrivateChat(text: string, nick: string)
    {
        const message = xml('message', { type: 'chat', to: this.jid + '/' + nick, from: this.jid + '/' + this.myNick })
            .append(xml('body', {}, text))
            ;
        this.app.sendStanza(message);
    }

    sendPoke(nick: string, type: string)
    {
        const message = xml('message', { type: 'chat', to: this.jid + '/' + nick, from: this.jid + '/' + this.myNick })
            .append(xml('x', { 'xmlns': 'vp:poke', 'type': type }))
            ;
        this.app.sendStanza(message);
        if (Config.get('points.enabled', false)) {
            /* await */ BackgroundMessage.pointsActivity(Pid.PointsChannelGreet, 1);
        }
    }

    sendPrivateVidconf(nick: string, url: string)
    {
        const message = xml('message', { type: 'chat', to: this.jid + '/' + nick, from: this.jid + '/' + this.myNick })
            .append(xml('x', { 'xmlns': VpProtocol.PrivateVideoconfRequest.xmlns, [VpProtocol.PrivateVideoconfRequest.key_url]: url }))
            ;
        this.app.sendStanza(message);
    }

    sendDeclinePrivateVidconfResponse(nick: string, comment: string)
    {
        const message = xml('message', { type: 'chat', to: this.jid + '/' + nick, from: this.jid + '/' + this.myNick })
            .append(xml('x', { 'xmlns': VpProtocol.Response.xmlns, [VpProtocol.Response.key_to]: VpProtocol.PrivateVideoconfRequest.xmlns, [VpProtocol.PrivateVideoconfResponse.key_type]: [VpProtocol.PrivateVideoconfResponse.type_decline], [VpProtocol.PrivateVideoconfResponse.key_comment]: comment }))
            ;
        this.app.sendStanza(message);
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

    showChatMessage(id: string, name: string, text: string)
    {
        if (is.nil(id)) {
            id = name + Date.now() + Utils.randomString(4);
        }
        this.chatWindow.addLine(id, name, text);
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
            const urlTemplate = as.String(Config.get('room.vidconfUrl'), 'https://webex.vulcan.weblin.com/Vidconf?room=weblin{room}&name={name}');
            const url = urlTemplate
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

    applyBackpackItemToParticipant(
        participant: Participant,
        backpackItem: BackpackItem,
    ): void
    {
        participant.applyBackpackItem(backpackItem);
    }

    applyItemToParticipant(participant: Participant, roomItem: RoomItem): void
    {
        participant.applyItem(roomItem);
    }

    async propsClaimYieldsToExistingClaim(props: ItemProperties): Promise<boolean>
    {
        const roomItem = this.getPageClaimItem();
        if (roomItem) {
            const otherProps = roomItem.getProperties();
            const myId = as.String(props[Pid.Id]);
            const otherId = as.String(otherProps[Pid.Id]);
            if (myId !== '' && myId !== otherId) {
                let otherStrength = as.Float(otherProps[Pid.ClaimStrength]);
                let myStrength = as.Float(props[Pid.ClaimStrength]);
                const myUrl = as.String(props[Pid.ClaimUrl]);
                const otherUrl = as.String(otherProps[Pid.ClaimUrl]);

                if (myUrl !== '') {
                    if (!await this.claimIsValidAndOriginal(props)) {
                        myStrength = 0.0;
                    }
                }

                if (otherUrl !== '') {
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
        const url = this.normalizeClaimUrl(props[Pid.ClaimUrl]);

        const mappingResult = await this.app.vpiMap(url);
        const mappedRoom = mappingResult.roomJid;
        const mappedRoomJid = jid(mappedRoom);
        const mappedRoomName = mappedRoomJid.local;

        const currentRoom = this.getJid();
        const currentRoomJid = jid(currentRoom);
        const currentRoomName = currentRoomJid.local;

        if (mappedRoomName === currentRoomName) {
            return true;
            // const publicKey = as.String(Config.get('backpack.signaturePublicKey'), '');
            // if (ItemProperties.verifySignature(props, publicKey)) {
            //     return true;
            // }
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
        const scriptItemIds = new Array<string>();

        const itemIds = this.getItemIds();
        for (let i = 0; i < itemIds.length; i++) {
            const itemId = itemIds[i];
            const props = this.getItemByItemId(itemId).getProperties();
            if (as.Bool(props[Pid.IframeLive])) {
                scriptItemIds.push(itemId);
            }
        }

        return scriptItemIds;
    }

}
