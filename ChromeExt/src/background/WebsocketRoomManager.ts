import XmlElement from 'ltx/lib/Element.js';
import { as } from '../lib/as';
import { Config } from '../lib/Config';
import type { Logger } from '../lib/Logger';
import { ItemProperties } from '../lib/ItemProperties';
import { ContentMessage } from '../lib/ContentMessage';
import { WebsocketMessage as Message } from '../lib/WebsocketMessage';
import type { BackgroundApp } from './BackgroundApp';

class WebsocketRoomData {
    public readonly roomJid: string;
    public readonly clientRoomId: string;
    public readonly destination: string; // VPI-mapped destination URL.
    public readonly items: Map<string,ItemProperties> = new Map();
    public lastSendTimeMs: number = Date.now();

    public constructor(roomJid: string, clientRoomId: string, destination: string) {
        this.roomJid = roomJid;
        this.clientRoomId = clientRoomId;
        this.destination = destination;
    }
}

/**
 * Manages user room membership on the item server and handles room item notifications.
 * Performs room enter/leave/keepalive.
 * Caches item-server-provided room items and sends them as XMPP presences to contentscript instances running in browser tabs.
 *
 * The room ID sent to the server is the clientRoomId: the part before the '@' of the XMPP room JID.
 */
export class WebsocketRoomManager {
    private readonly app: BackgroundApp;
    private readonly logger: Logger;

    private readonly rooms: Map<string,WebsocketRoomData> = new Map();
    private readonly roomJidsByClientRoomId: Map<string,string> = new Map();
    private isStopped: boolean = false;

    public constructor(app: BackgroundApp) {
        this.app = app;
        this.logger = app.getLogger().getSubLogger('websocketRoomManagement', 'WebsocketRoomManager');
    }

    public stop(): void {
        if (this.isStopped) {
            return;
        }
        this.isStopped = true;
        for (const roomJid of [...this.rooms.keys()]) {
            this.leaveRoom(roomJid);
        }
    }

    public maintain(): void {
        if (this.isStopped) {
            return;
        }

        // Ping each room the client hasn't sent anything to for the configured interval,
        // keeping its membership on the item server alive:
        const nowMs = Date.now();
        const intervalSec = as.Float(Config.get('websocket.roomHeartbeatIntervalSec'), 10);
        for (const roomData of this.rooms.values()) {
            if (nowMs < roomData.lastSendTimeMs + 1000 * intervalSec) {
                continue;
            }
            this.sendRoomPingRequest(roomData)
                .catch(error => this.logger.logError('maintain: Ping failed!', { roomData }, error));
        }
    }

    public onRoomActive(roomJid: string, destination: string): void {
        if (this.isStopped || this.rooms.has(roomJid)) {
            return;
        }
        const clientRoomId = this.getClientRoomIdOfRoomJid(roomJid);
        if (clientRoomId === '') {
            this.logger.logInfo('onRoomActive: Room JID doesn\'t translate to a client room ID!', { roomJid });
            return;
        }
        const roomData = new WebsocketRoomData(roomJid, clientRoomId, destination);
        this.rooms.set(roomJid, roomData);
        this.roomJidsByClientRoomId.set(clientRoomId, roomJid);
        this.sendRoomEnterRequest(roomData)
            .catch(error => this.logger.logError('onRoomActive: Enter failed!', { roomJid }, error));
    }

    public onRoomInactive(roomJid: string): void {
        if (this.isStopped) {
            return;
        }
        this.leaveRoom(roomJid);
    }

    public onWebsocketReady(): void {
        if (this.isStopped) {
            return;
        }
        // A new connection has a new client ID on the server, so every room is entered again.
        for (const roomData of this.rooms.values()) {
            this.sendRoomEnterRequest(roomData)
                .catch(error => this.logger.logError('onWebsocketReady: Enter failed!', { roomData }, error));
        }
    }

    public handleRoomItemsNotification(notification: Message.RoomItemsNotification): void {
        if (this.isStopped) {
            return;
        }
        const roomJid = this.roomJidsByClientRoomId.get(notification.RoomId) ?? '';
        const roomData = this.rooms.get(roomJid) ?? null;
        if (!roomData) {
            this.logger.logInfo('handleRoomItemsNotification: Ignored notification for unknown room.', { notification });
            return;
        }

        const itemIdsToDelete = new Set(notification.ItemsDeleted);
        if (notification.IsSnapshot) {
            // Full room item set.
            // Cached items missing from it have been deleted while no update reached us.
            const itemIdsInNotification = new Set(notification.ItemsUpdatedOrCreated.map(item => ItemProperties.getId(item)));
            for (const itemId of roomData.items.keys()) {
                if (!itemIdsInNotification.has(itemId)) {
                    itemIdsToDelete.add(itemId);
                }
            }
        }

        for (const item of notification.ItemsUpdatedOrCreated) {
            const itemId = as.String(ItemProperties.getId(item));
            if (itemId === '') {
                this.logger.logWarning('handleRoomItemsNotification: Ignored item without ID!', { notification, item });
                continue;
            }
            roomData.items.set(itemId, item);
            this.sendStanzaToRoomTabs(roomData, this.makeItemPresence(roomData, item));
        }
        for (const itemId of itemIdsToDelete) {
            const item = roomData.items.get(itemId) ?? null;
            if (item) {
                roomData.items.delete(itemId);
                this.sendStanzaToRoomTabs(roomData, this.makeItemUnavailablePresence(roomData, item));
            }
        }
        this.logger.logDebug('handleRoomItemsNotification: Updated room items.', { notification, roomData });
    }

    public replayRoomItemsToTab(tabId: number, roomJid: string): void {
        if (this.isStopped) {
            return;
        }
        const roomData = this.rooms.get(roomJid) ?? null;
        if (!roomData) {
            return;
        }
        for (const item of roomData.items.values()) {
            const stanza = this.makeItemPresence(roomData, item);
            this.app.sendToTab(tabId, { type: ContentMessage.type_recvStanza, stanza });
        }
    }

    private async sendRoomEnterRequest(roomData: WebsocketRoomData): Promise<void> {
        const request = new Message.RoomEnterRequest(Message.makeId(), roomData.clientRoomId, roomData.destination);
        const response = await this.sendRoomRequest(roomData, request);
        if (response instanceof Message.ErrorResponse) {
            this.logger.logDebug('sendRoomEnterRequest: Enter denied or websocket not ready.', { roomData, response });
        }
    }

    private async sendRoomLeaveRequest(roomData: WebsocketRoomData): Promise<void> {
        const request = new Message.RoomLeaveRequest(Message.makeId(), roomData.clientRoomId);
        const response = await this.sendRoomRequest(roomData, request);
        if (response instanceof Message.ErrorResponse) {
            this.logger.logDebug('sendRoomLeaveRequest: Leave denied or websocket not ready.', { roomData, response });
        }
    }

    private async sendRoomPingRequest(roomData: WebsocketRoomData): Promise<void> {
        const request = new Message.RoomPingRequest(Message.makeId(), roomData.clientRoomId);
        const response = await this.sendRoomRequest(roomData, request);
        if (response instanceof Message.ErrorResponse) {
            this.logger.logDebug('sendRoomPingRequest: Ping denied or websocket not ready.', { roomData, response });
        }
    }

    private async sendRoomRequest(roomData: WebsocketRoomData, request: Message.RoomRequest): Promise<Message.Response> {
        // Every send to the room resets its heartbeat idle time - all room sends go through here:
        roomData.lastSendTimeMs = Date.now();
        return await this.app.getWebsocketManager().sendRequest(request);
    }

    private leaveRoom(roomJid: string): void {
        const roomData = this.rooms.get(roomJid) ?? null;
        if (!roomData) {
            return;
        }
        this.rooms.delete(roomJid);
        this.roomJidsByClientRoomId.delete(roomData.clientRoomId);
        this.sendRoomLeaveRequest(roomData)
            .catch(error => this.logger.logError('leaveRoom: Leave failed!', { roomJid }, error));
    }

    private getClientRoomIdOfRoomJid(roomJid: string): string {
        // The item server's client room ID is the part before the '@' of the XMPP room JID.
        const atIndex = roomJid.indexOf('@');
        if (atIndex < 1) {
            return '';
        }
        return roomJid.substring(0, atIndex);
    }

    private makeItemPresence(roomData: WebsocketRoomData, item: ItemProperties): XmlElement {
        const presence = this.makeItemPresenceCore(roomData, item);
        presence.c('x', { ...item, xmlns: 'vp:props', type: 'item' });
        return presence;
    }

    private makeItemUnavailablePresence(roomData: WebsocketRoomData, item: ItemProperties): XmlElement {
        const presence = this.makeItemPresenceCore(roomData, item);
        presence.attrs.type = 'unavailable';
        return presence;
    }

    private makeItemPresenceCore(roomData: WebsocketRoomData, item: ItemProperties): XmlElement {
        const itemResource = `${ItemProperties.getInventoryId(item)}${ItemProperties.getId(item)}`;
        const from = `${roomData.roomJid}/${itemResource}`;
        const to = this.app.getXmppJid()?.toString() ?? '';
        return new XmlElement('presence', { from, to });
    }

    private sendStanzaToRoomTabs(roomData: WebsocketRoomData, stanza: XmlElement): void {
        this.app.sendToTabsForRoom(roomData.roomJid, { type: ContentMessage.type_recvStanza, stanza });
    }

}
