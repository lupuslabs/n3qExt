import log = require('loglevel');
import * as jid from '@xmpp/jid';
import * as ltx from 'ltx';
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
import { ChatWindow } from './ChatWindow';
import { VidconfWindow } from './VidconfWindow';
import { BackpackItem } from './BackpackItem';
import { Chat, ChatMessage, ChatMessageType } from '../lib/ChatMessage';
import { is } from '../lib/is';
import { ChatConsole } from './ChatConsole';

export interface IRoomInfoLine extends Array<string> { 0: string, 1: string }
export interface IRoomInfo extends Array<IRoomInfoLine> { }

export class Room
{
    private participants: { [nick: string]: Participant; } = {};
    private items: { [nick: string]: RoomItem; } = {};
    private dependents: { [nick: string]: Array<string>; } = {};
    private isEntered = false; // iAmAlreadyHere() needs isEntered=true to be after onPresenceAvailable
    private chatWindow: ChatWindow;
    private vidconfWindow: VidconfWindow;
    private myNick: null|string;
    private isAvailable: boolean = true;
    private showAvailability = '';
    private statusMessage = '';

    constructor(protected app: ContentApp, private jid: string, private pageUrl: string, private destination: string)
    {
        this.chatWindow = new ChatWindow(app, this);
    }

    getInfo(): IRoomInfo
    {
        return [
            ['url', this.getPageUrl()],
            ['destination', this.getDestination()],
            ['jid', this.getJid()],
        ];
    }

    getChatWindow(): ChatWindow { return this.chatWindow; }
    getMyNick(): string|null { return this.myNick; }
    getJid(): string { return this.jid; }
    getDestination(): string { return this.destination; }
    getPageUrl(): string { return this.pageUrl; }
    setPageUrl(pageUrl: string): void { this.pageUrl = pageUrl; }
    getParticipant(nick: string): null|Participant { return this.participants[nick]; }
    getMyParticipant(): Participant|null { return is.nil(this.myNick) ? null : this.getParticipant(this.myNick); }
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

    getParticipantByDisplayName(nick: string): null|Participant
    {
        for (const id in this.participants) {
            const participant = this.participants[id];
            if (participant.getDisplayName() === nick) {
                return participant;
            }
        }
        return null;
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

    public iAmAlreadyHere()
    {
        return this.isEntered;
    }

    // presence

    public async enter(): Promise<void>
    {
        this.isAvailable = true;
        this.sendPresence();
    }

    public sleep(statusMessage: string)
    {
        this.showAvailability = 'away';
        this.statusMessage = statusMessage;
        this.sendPresence();
    }

    public wakeup()
    {
        this.isAvailable = true;
        this.showAvailability = '';
        this.statusMessage = '';
        this.sendPresence();
    }

    public leave(): void
    {
        this.isAvailable = false;
        this.sendPresence();
        this.removeAllParticipants();
        this.removeAllItems();
        this.onUnload();
    }

    public onUnload()
    {
        this.stopKeepAlive();
    }

    public onUserSettingsChanged(): void
    {
        if (!this.isAvailable) {
            (async () => {
                await this.enter();
            })().catch(error => this.app.onError(error));
        }
    }

    saveOwnPosition(posX: number): void
    {
        this.app.savePosition(posX).catch(error => log.info(error));
        BackgroundMessage.sendRoomPos(this.jid, posX).catch(error => log.info(error));
    }

    public sendPresence(): void
    {
        (async () => {
            const timestamp = Utils.utcStringOfDate(new Date());
            const roomJid = this.jid;
            const {isAvailable, showAvailability, statusMessage} = this;

            let badges: string = '';
            try {
                badges = this.getMyParticipant()?.getBadgesDisplay()?.getBadgesStrForPresence() ?? '';
            } catch (error) {
                this.app.onError(error); // Not important enough to panic.
            }

            const presenceData = {
                timestamp, roomJid,
                isAvailable, showAvailability, statusMessage,
                badges,
            };
            this.app.sendRoomPresence(presenceData);
        })().catch(error => {
            log.info(error);
            Panic.now();
        });
    }

    public onPresence(stanza: ltx.Element): void
    {
        const presenceType = as.String(stanza.attrs.type, 'available');
        switch (presenceType) {
            case 'available': this.onPresenceAvailable(stanza); break;
            case 'unavailable': this.onPresenceUnavailable(stanza); break;
            default: log.info('Room.onPresence: Unexpected stanza!', { stanza }); break;
        }
    }

    private onPresenceAvailable(stanza: ltx.Element): void
    {
        const to = jid(stanza.attrs.to);
        const from = jid(stanza.attrs.from);
        const resource = from.getResource();
        const isSelf = stanza.attrs._isSelf ?? false;
        let entity: Entity;
        let isItem = false;

        // presence x.vp:props type='item'
        const vpPropsNode = stanza.getChild('x', 'vp:props');
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
                if (isSelf) {
                    const oldMyParticipant = this.getMyParticipant();
                    if (!is.nil(oldMyParticipant)) {
                        oldMyParticipant.remove();
                        delete this.participants[this.myNick];
                    }
                    this.myNick = resource;
                }
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
            const vpDependent = stanza.getChild('x', 'vp:dependent');
            if (vpDependent) {

                const dependentPresences = vpDependent.getChildren('presence');
                if (dependentPresences.length > 0) {
                    for (let i = 0; i < dependentPresences.length; i++) {
                        const dependentPresence = dependentPresences[i];
                        const incomplete = as.Bool(dependentPresence.attrs._incomplete, false);
                        if (!incomplete) {
                            dependentPresence.attrs['to'] = to.toString();
                            dependentPresence.attrs['parent'] = resource;
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
                        const dependentUnavailablePresence = new ltx.Element('presence', { 'from': this.jid + '/' + value, 'type': 'unavailable', 'to': to.toString() });
                        this.onPresence(dependentUnavailablePresence);
                    }
                }
            }

            this.dependents[resource] = currentDependents;
        }
    }

    private onPresenceUnavailable(stanza: ltx.Element): void
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
            const to = stanza.attrs.to;
            for (let i = 0; i < currentDependents.length; i++) {
                const value = currentDependents[i];
                const dependentUnavailablePresence = new ltx.Element('presence', { 'from': this.jid + '/' + value, 'type': 'unavailable', 'to': to });
                this.onPresence(dependentUnavailablePresence);
            }
            delete this.dependents[resource];
        }
    }

    private removeAllParticipants()
    {
        const nicks = this.getParticipantIds();
        nicks.forEach(nick =>
        {
            this.participants[nick].remove();
            delete this.participants[nick];
        });
    }

    private removeAllItems()
    {
        const itemIds = Object.keys(this.items);
        itemIds.forEach(itemId =>
        {
            this.items[itemId].remove();
            delete this.items[itemId];
        });
    }

    // Keepalive

    private keepAliveSec: number = as.Float(Config.get('room.keepAliveSec'), 180);
    private keepAliveTimer: undefined | number = undefined;
    private keepAlive()
    {
        // Todo: Move to RoomPresenceManager in backend.
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

    onMessage(stanza: ltx.Element)
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
    sendGroupChat(text: null|string): void
    {
        if (is.nil(text) || text.length === 0) {
            return;
        }
        if (ChatConsole.isChatCommand(text)) {
            this.handleGroupChatCommand(text);
            return;
        }
        this.makeAndSendGroupChatStanza(text);
        if (Config.get('points.enabled', false)) {
            BackgroundMessage.pointsActivity(Pid.PointsChannelChat, 1).catch(error => this.app.onError(error));
        }
    }

    protected makeAndSendGroupChatStanza(text: string): void
    {
        const message = new ltx.Element('message', { type: 'groupchat', to: this.jid, from: this.jid + '/' + this.myNick });
        message.c('body', { id: Utils.randomString(10) }).t(text);
        this.app.sendStanza(message);
    }

    protected handleGroupChatCommand(text: string): void
    {
        try {
            const outState = {msgCount: 0};
            const outputHandler = (data) => {
                // data: string | [nick: string, text: string] | [[nick: string, text: string]]
                if (Array.isArray(data)) {
                    if (is.string(data[0])) {
                        data = [data];
                    }
                } else {
                    data = [[data]];
                }
                for (let message of data) {
                    if (!Array.isArray(message)) {
                        message = [message];
                    }
                    const text = as.String(message[message.length - 1]);
                    const nick = as.String(message[message.length - 2]);
                    if (text.length !== 0) {
                        const type: ChatMessageType = outState.msgCount === 0 ? 'cmd' : 'cmdResult';
                        this.showChatMessage(null, type, nick, text);
                        outState.msgCount++;
                    }
                }
                if (outState.msgCount > 1) {
                    this.showChatWindow(this.getMyParticipant()?.getElem());
                }
            };
            const context = {app: this.app, room: this, out: outputHandler};
            ChatConsole.chatCommand(text, context);
        } catch (error) {
            this.app.onError(error);
        }
    }

    sendPrivateChat(text: string, nick: string)
    {
        const message = new ltx.Element('message', { type: 'chat', to: this.jid + '/' + nick, from: this.jid + '/' + this.myNick });
        message.c('body', {}).t(text);
        this.app.sendStanza(message);
    }

    sendPoke(nick: string, type: string, countsAsActivity: boolean = true)
    {
        const message = new ltx.Element('message', { type: 'chat', to: this.jid + '/' + nick, from: this.jid + '/' + this.myNick });
        message.c('x', { 'xmlns': 'vp:poke', 'type': type });
        this.app.sendStanza(message);

        if (countsAsActivity && Config.get('points.enabled', false)) {
            BackgroundMessage.pointsActivity(Pid.PointsChannelGreet, 1)
                .catch(error => { log.info('Room.sendPoke', error); });
        }
    }

    sendPrivateVidconf(nick: string, url: string)
    {
        const message = new ltx.Element('message', { type: 'chat', to: this.jid + '/' + nick, from: this.jid + '/' + this.myNick });
        message.c('x', { 'xmlns': VpProtocol.PrivateVideoconfRequest.xmlns, [VpProtocol.PrivateVideoconfRequest.key_url]: url });
        this.app.sendStanza(message);
    }

    sendDeclinePrivateVidconfResponse(nick: string, comment: string)
    {
        const message = new ltx.Element('message', { type: 'chat', to: this.jid + '/' + nick, from: this.jid + '/' + this.myNick });
        message.c('x', { 'xmlns': VpProtocol.Response.xmlns, [VpProtocol.Response.key_to]: VpProtocol.PrivateVideoconfRequest.xmlns, [VpProtocol.PrivateVideoconfResponse.key_type]: [VpProtocol.PrivateVideoconfResponse.type_decline], [VpProtocol.PrivateVideoconfResponse.key_comment]: comment });
        this.app.sendStanza(message);
    }

    showChatWindow(aboveElem?: HTMLElement): void
    {
        if (!this.chatWindow.isOpen()) {
            this.app.setChatIsOpen(true);
            this.chatWindow.show({
                'above': aboveElem,
                onClose: () => this.app.setChatIsOpen(false),
            });
        }
    }

    toggleChatWindow(relativeToElem?: HTMLElement): void
    {
        if (this.chatWindow.isOpen()) {
            this.chatWindow.close();
        } else {
            this.showChatWindow(relativeToElem);
        }
    }

    showChatInWithText(text: string): void
    {
        const participant = this.getMyParticipant();
        if (participant) {
            participant.showChatInWithText(text);
        }
    }

    showChatMessage(id: string|null, type: ChatMessageType, name: string, text: string)
    {
        this.chatWindow.addLine(id, type, name, text);
    }

    clearChatWindow()
    {
        this.chatWindow.clear();
    }

    onChatMessagePersisted(chat: Chat, chatMessage: ChatMessage): void
    {
        this.chatWindow?.onChatMessagePersisted(chat, chatMessage);
        for (const prop in this.participants) {
            this.participants[prop].onChatMessagePersisted(chat, chatMessage);
        }
    }

    onChatHistoryDeleted(deletions: {chat: Chat, olderThanTime: string}[]): void
    {
        this.chatWindow?.onChatHistoryDeleted(deletions);
        for (const prop in this.participants) {
            this.participants[prop].onChatHistoryDeleted(deletions);
        }
    }

    showVideoConference(aboveElem: HTMLElement, displayName: string): void
    {
        if (this.vidconfWindow) {
            this.vidconfWindow.close();
        } else {
            const urlTemplate = as.String(Config.get('room.vidconfUrl'), 'https://video.weblin.io/Vidconf?room=weblin{room}&name={name}');
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

    // Item interaction

    async applyItemToItem(activeItem: RoomItem, passiveItem: RoomItem): Promise<ItemProperties>
    {
        return await activeItem.applyItem(passiveItem);
    }

    applyBackpackItemToParticipant(participant: Participant, backpackItem: BackpackItem,): void
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
