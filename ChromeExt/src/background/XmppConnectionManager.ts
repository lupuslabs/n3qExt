import log = require('loglevel')
import { as } from '../lib/as'
import { Utils } from '../lib/Utils'
import { Memory } from '../lib/Memory'
import { Config } from '../lib/Config'
import * as ltx from 'ltx'
import * as jid from '@xmpp/jid'
import JID = jid.JID
import { client as clientMaker, Client } from '@xmpp/client'
import { ContentMessage } from '../lib/ContentMessage'
import { BackgroundApp } from './BackgroundApp'

type XmppConfig = {
    readonly service:  string,
    readonly domain:   string,
    readonly resource: string,
    readonly username: string,
    readonly password: string,
}

type XmppConnectionManagerStats = {
    xmppConnectCount: number,
    stanzasOutCount: number,
    stanzasInCount: number,
}

type ClientStatus = 'offline'|'connecting'|'online'|'disconnecting'

export class XmppConnectionManager
{
    private readonly app: BackgroundApp

    private readonly resource: string = Utils.randomString(15)
    private isRunning: boolean = true

    private xmppConfig: null|XmppConfig = null
    private xmppConfigChanged: boolean = false
    private currentClientId: number = 0
    private client: null|Client = null
    private lastServerPresenceTimeMs: number = 0

    private clientStatus: ClientStatus = 'offline'
    private xmppJid: null|JID = null

    private stats: XmppConnectionManagerStats = {
        xmppConnectCount: 0,
        stanzasOutCount: 0,
        stanzasInCount: 0,
    }

    private readonly stanzaQ: Array<ltx.Element> = []

    constructor(app: BackgroundApp) {
        this.app = app
    }

    public getIsConnected(): boolean
    {
        return this.clientStatus === 'online'
    }

    public getStats(): XmppConnectionManagerStats
    {
        return {...this.stats}
    }

    public getXmppResource(): string
    {
        return this.resource
    }

    public getXmppJid(): null|JID
    {
        return this.xmppJid
    }

    public stop()
    {
        this.isRunning = false
        this.stopClient(this.currentClientId, this.client)
    }

    public maintain(): void
    {
        if (!this.isRunning) {
            return
        }
        switch (this.clientStatus) {
            case 'offline': {
                this.startXmpp()
            } break;
            case 'connecting': {
                if (this.xmppConfigChanged) {
                    this.stopClient(this.currentClientId, this.client)
                } else if ((this.client?.status ?? 'offline') === 'online') {
                    this.clientStatus = 'online'
                    Memory.setLocal('me.lastWorkingXmppConfig', this.xmppConfig)
                        .catch(error => log.info('XmppConnectionManager.maintain: Memory.setLocal failed!', { error }, error))

                    this.sendServerPresence(Date.now())
                    while (this.stanzaQ.length > 0) {
                        const stanza = this.stanzaQ.shift()
                        this.sendStanzaUnbuffered(stanza)
                    }

                    try {
                        this.app.onXmppOnline()
                    } catch (error) {
                        log.info('XmppConnectionManager.maintain: app.onXmppOnline failed!', { error }, error)
                    }
                }
            } break;
            case 'online': {
                if (this.xmppConfigChanged) {
                    this.stopClient(this.currentClientId, this.client)
                } else if ((this.client?.status ?? 'offline') !== 'online') {
                    this.clientStatus = 'connecting'
                } else {
                    const timeMs = Date.now()
                    if (timeMs - this.lastServerPresenceTimeMs > 30000) {
                        this.sendServerPresence(timeMs);
                    }
                }
            } break;
            case 'disconnecting': {
                if ((this.client?.status ?? 'offline') === 'offline') {
                    this.clientStatus = 'offline'
                    this.client = null
                    this.startXmpp()
                }
            } break;
        }
    }

    public onConfigUpdated(): void
    {
        this.makeXmppConfig().then(xmppConfigNew => {
            if (this.xmppConfig && this.areXmppConfigsEqual(xmppConfigNew, this.xmppConfig)) {
                return
            }
            this.xmppConfig = xmppConfigNew
            this.xmppConfigChanged = true
            this.maintain()
        }).catch(error => log.info(error))
    }

    private areXmppConfigsEqual(a: XmppConfig, b: XmppConfig): boolean
    {
        return Object.entries(a).every(([k, v]) => b[k] === v)
    }

    private async makeXmppConfig(): Promise<XmppConfig>
    {
        const lastKnownGoodConfig = <Partial<XmppConfig>> await Memory.getLocal('me.lastWorkingXmppConfig', {})

        let service = Config.get('xmpp.service', 'wss://xmpp.vulcan.weblin.com/xmpp-websocket')
        if (!service.length) { service = lastKnownGoodConfig.service ?? '' }
        if (!service.length) { throw new Error('Missing xmpp.service!') }
        let domain = Config.get('xmpp.domain', 'xmpp.vulcan.weblin.com')
        if (!domain.length) { domain = lastKnownGoodConfig.domain ?? '' }
        if (!domain.length) { throw new Error('Missing xmpp.domain!') }
        const resource = this.resource

        let username = as.String(await Memory.getSync('xmpp.user', ''))
        if (!username.length) { username = Config.get('xmpp.user', '') }
        if (!username.length) { username = lastKnownGoodConfig.username ?? '' }
        if (!username.length) { throw new Error('Missing xmpp.username!') }

        let password = as.String(await Memory.getSync('xmpp.pass', ''))
        if (!password.length) { password = Config.get('xmpp.pass', '') }
        if (!password.length) { password = lastKnownGoodConfig.password ?? '' }
        if (!password.length) { throw new Error('Missing xmpp.password!') }

        return { service, domain, resource, username, password }
    }

    private startXmpp(): void
    {
        const xmppConfig = this.xmppConfig
        if (!xmppConfig) {
            return
        }
        this.clientStatus = 'connecting'
        this.currentClientId++
        const clientId = this.currentClientId
        log.info('XmppConnectionManager.startXmpp: Creating new XMPP client.', { clientId, xmppConfig })
        let client: Client;
        try {
            client = clientMaker(xmppConfig)
        } catch (error) {
            log.info('XmppConnectionManager.startXmpp: XMPP client construction failed!', { error }, error)
            this.clientStatus = 'offline'
            return
        }
        client.on('error', error => this.onXmppError(clientId, client, error))
        client.on('offline', () => this.onXmppOffline(clientId))
        client.on('online', address => this.onXmppOnline(clientId, client, address))
        client.on('stanza', stanza => this.onXmppStanza(clientId, client, stanza))
        client.start().catch((error: any) => this.onXmppStartError(clientId, error))
        this.client = client
        this.xmppConfigChanged = false
    }

    private stopClient(clientId: number, client: null|Client)
    {
        if ((client?.status ?? 'offline') === 'offline') {
            return
        }
        if (client === this.client) {
            log.info('XmppConnectionManager.stopClient: Stopping current XMPP client.', { clientId })
            this.clientStatus = 'disconnecting'
        } else {
            log.info('XmppConnectionManager.stopClient: Stopping old XMPP client.', { clientId })
        }
        try {
            client.reconnect?.stop?.()
        } catch (error) {
            log.info('XmppConnectionManager.stopClient: xmppClient.reconnect.stop failed!', { clientId, error }, error)
        }
        client.stop().catch((error: any) => {
            log.info('XmppConnectionManager.stopClient: xmppClient.stop failed!', { clientId, error }, error)
        }).then(() => {
            log.info('XmppConnectionManager.stopClient: Stopped XMPP client.', {
                clientId,
                client: {...client},
                clientSocket: {...client.socket ?? {}},
                clientTransport_0: {...client.transports[0] ?? {}},
            })
            this.maintain()
        })
    }

    public sendStanza(stanza: ltx.Element): void
    {
        this.stats.stanzasOutCount++
        if (this.clientStatus === 'online') {
            this.sendStanzaUnbuffered(stanza)
        } else if (this.isConnectionPresence(stanza)) {
            // Don't buffer connection presences.
        } else {
            this.stanzaQ.push(stanza)
        }
    }

    private sendStanzaUnbuffered(stanza: ltx.Element): void
    {
        if (!this.isConnectionPresence(stanza)) {
            if (Utils.logChannel('backgroundTraffic', true)) {
                log.info('Send stanza', { stanza, type: stanza.attrs.type, name: stanza.name, to: stanza.attrs.to })
            }
            this.logStanzaToRelevantTabs('out', stanza)
        }
        this.client.send(stanza).catch(error => log.debug('XmppConnectionManager.sendStanzaUnbuffered', error))
    }

    private sendServerPresence(timeMs: number): void
    {
        this.lastServerPresenceTimeMs = timeMs;
        this.sendStanza(new ltx.Element('presence'))
    }

    private logStanzaToRelevantTabs(direction: 'in'|'out', stanza: ltx.Element): void
    {
        let roomJid: string = ''
        try {
            if ((stanza.name === 'presence' || stanza.name === 'message')) {
                roomJid = jid(stanza.attrs.from ?? stanza.attrs.to).bare().toString()
            }
        } catch (error) {
            // Ignore from or to JID not parsable or present. Stanza will just be sent to all tabs.
        }
        const type = ContentMessage.type_xmppIo
        const message = { type, direction, stanza }
        if (roomJid.length) {
            this.app.sendToTabsForRoom(roomJid, message)
        } else {
            this.app.sendToAllTabs(message)
        }
    }

    private isConnectionPresence(stanza: ltx.Element): boolean
    {
        const toJid = as.String(stanza.attrs.to)
        let isConnectionPresence = false
        try {
            isConnectionPresence = stanza.name === 'presence' && toJid.length === 0
        } catch (error) {
            // Ignore toJid filled but unparsable.
        }
        return isConnectionPresence
    }

    private onXmppStartError(clientId: number, error: any)
    {
        const isCurrentConnection = clientId === this.currentClientId
        if (isCurrentConnection) {
            log.info('XmppConnectionManager.onXmppStartError: Current XMPP client start failed!', { clientId, error }, error)
            this.stopClient(this.currentClientId, this.client)
        } else {
            log.info('XmppConnectionManager.onXmppStartError: Old XMPP client start failed.', { clientId, error }, error)
        }
    }

    private onXmppError(clientId: number, client: Client, error: any)
    {
        const isCurrentConnection = clientId === this.currentClientId
        if (isCurrentConnection) {
            log.info('XmppConnectionManager.onXmppError: Current XMPP client error!', { clientId, error }, error)
        } else {
            log.info('XmppConnectionManager.onXmppError: Old XMPP client error.', { clientId, error }, error)
            this.stopClient(clientId, client)
        }
    }

    private onXmppOffline(clientId: number)
    {
        const isCurrentConnection = clientId === this.currentClientId
        if (!isCurrentConnection) {
            log.info('XmppConnectionManager.onXmppOffline: Old XMPP client offline.', { clientId })
            return
        }
        log.info('XmppConnectionManager.onXmppOffline: Current XMPP client offline.', { clientId })
        this.maintain()
    }

    private onXmppOnline(clientId: number, client: Client, address: JID)
    {
        const isCurrentConnection = clientId === this.currentClientId
        if (!isCurrentConnection) {
            log.info('XmppConnectionManager.onXmppOnline: Old XMPP client online!', { clientId, address })
            this.stopClient(clientId, client)
            return
        }
        log.info('XmppConnectionManager.onXmppOnline: Current XMPP client online.', { clientId, address })
        this.xmppJid = address
        this.stats.xmppConnectCount++
        this.maintain()
    }

    private onXmppStanza(clientId: number, client: Client, stanza: ltx.Element)
    {
        this.stats.stanzasInCount++

        const isCurrentConnection = clientId === this.currentClientId
        const isErrorStanza = (stanza.attrs.type ?? '') === 'error'
        if (!isCurrentConnection) {
            log.info('XmppConnectionManager.onXmppStanza: Received stanza for old connection.', { clientId, isErrorStanza, stanza })
            this.stopClient(clientId, client)
            this.logStanzaToRelevantTabs('in', stanza)
        } else if (isErrorStanza) {
            log.info('XmppConnectionManager.onXmppStanza: Received error stanza!', { clientId, stanza })
            this.logStanzaToRelevantTabs('in', stanza)
        } else if (this.isConnectionPresence(stanza)) {
            // Ignore connection presence.
        } else {
            if (Utils.logChannel('backgroundTraffic', true)) {
                log.info('XmppConnectionManager.onXmppStanza: Received stanza.', { clientId, stanza, type: stanza.attrs.type, name: stanza.name, to: stanza.attrs.to })
            }
            this.logStanzaToRelevantTabs('in', stanza)
        }

        try {
            this.app.recvStanza(stanza)
        } catch (error) {
            log.info('XmppConnectionManager.onXmppStanza: app.recvStanza failed!', { stanza, error }, error)
        }
    }

}
