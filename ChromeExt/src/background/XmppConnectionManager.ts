import log = require('loglevel')
import { as } from '../lib/as'
import { Utils } from '../lib/Utils'
import { Memory } from '../lib/Memory'
import { Config } from '../lib/Config'
import * as ltx from 'ltx'
import * as jid from '@xmpp/jid'
import { client } from '@xmpp/client'
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

export class XmppConnectionManager
{
    private readonly app: BackgroundApp

    private readonly resource: string = Utils.randomString(15)
    private xmppConfig: null|XmppConfig = null
    private xmpp: any = null
    private lastServerPresenceTimeMs: number = 0;

    private currentConnectionId: number = 0
    private isConnecting: boolean = false
    private isConnected: boolean = false
    private xmppJid: null|string = null

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
        return this.isConnected
    }

    public getStats(): XmppConnectionManagerStats
    {
        return {...this.stats}
    }

    public getXmppResource(): string
    {
        return this.resource
    }

    public getXmppJid(): null|string
    {
        return this.xmppJid
    }

    public stop()
    {
        this.isConnecting = false
        this.isConnected = false
        this.xmpp?.stop().catch((error: any) => log.info('XmppConnectionManager.stop: xmpp.stop failed!', error))
        this.xmpp = null
        this.xmppConfig = null
    }

    public onPing(): void
    {
        const timeMs = Date.now()
        if (timeMs - this.lastServerPresenceTimeMs > 30000) {
            this.sendServerPresence(timeMs);
        }
    }

    public onConfigUpdated(): void
    {
        (async () => {
            const xmppConfigNew = await this.makeXmppConfig()
            if (!this.xmppConfig || !this.areXmppConfigsEqual(xmppConfigNew, this.xmppConfig)) { // If config changed.
                this.startXmpp(xmppConfigNew)
            }
        })().catch(error => log.info(error))
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

    private startXmpp(xmppConfig: XmppConfig): void
    {
        if (this.isConnecting) {
            this.stop()
        }
        this.isConnecting = true
        this.xmppConfig = xmppConfig
        this.currentConnectionId++
        const connectionId = this.currentConnectionId
        try {
            this.xmpp = client(xmppConfig)
        } catch (error) {
            log.info('XmppConnectionManager.startXmpp: XMPP client construction failed!', error)
            this.stop()
            return
        }
        this.xmpp.on('error', (error: any) => this.onXmppError(connectionId, error))
        this.xmpp.on('offline', () => this.onXmppOffline(connectionId))
        this.xmpp.on('online', (address: string) => this.onXmppOnline(connectionId, address, xmppConfig))
        this.xmpp.on('stanza', (stanza: ltx.Element) => this.onXmppStanza(connectionId, stanza))
        this.xmpp.start().catch((error: any) => this.onXmppStartError(connectionId, error))
    }

    public sendStanza(stanza: ltx.Element): void
    {
        this.stats.stanzasOutCount++
        if (this.isConnected) {
            this.sendStanzaUnbuffered(stanza)
        } else if (this.isConnectionPresence(stanza)) {
            // Don't buffer connection presences.
        } else {
            this.stanzaQ.push(stanza)
        }
    }

    private sendStanzaUnbuffered(stanza: ltx.Element): void
    {
        try {
            if (!this.isConnectionPresence(stanza)) {
                this.logStanza(stanza, false)
            }

            this.xmpp.send(stanza)
        } catch (error) {
            log.debug('XmppConnectionManager.sendStanzaUnbuffered', error)
        }
    }

    private sendServerPresence(timeMs: number): void
    {
        this.lastServerPresenceTimeMs = timeMs;
        this.sendStanza(new ltx.Element('presence'))
    }

    private recvStanza(stanza: ltx.Element)
    {
        this.stats.stanzasInCount++
        if (!this.isConnectionPresence(stanza)) {
            this.logStanza(stanza, true)
        }

        this.app.recvStanza(stanza)
    }

    private logStanza(stanza: ltx.Element, isIncomming: boolean)
    {
        const toJid = as.String(stanza.attrs.to)
        if (Utils.logChannel('backgroundTraffic', true)) {
            const msg = isIncomming ? 'Received stanza' : 'Send stanza'
            log.info(msg, stanza, as.String(stanza.attrs.type, stanza.name === 'presence' ? 'available' : 'normal'), 'to=', toJid)
        }
        this.logStanzaToRelevantTabs(isIncomming, stanza)

        // if (stanza.name == 'presence' && as.String(stanza.type, 'available') == 'available') {
        //     let vpNode = stanza.getChildren('x').find(stanzaChild => (stanzaChild.attrs == null) ? false : stanzaChild.attrs.xmlns === 'vp:props')
        //     if (vpNode) {
        //         let xmppNickname = jid(stanza.attrs.to).getResource()
        //         let vpNickname = as.String(vpNode.attrs.Nickname, '')
        //         log.debug('send ########', xmppNickname, vpNickname)
        //         if (xmppNickname != vpNickname) {
        //             log.debug('send ########', xmppNickname, '-x-', vpNickname)
        //         }
        //     }
        // }
    }

    private logStanzaToRelevantTabs(isIncomming: boolean, stanza: ltx.Element): void
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
        const direction = isIncomming ? 'in' : 'out'
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

    private onXmppStartError(connectionId: number, error: any)
    {
        const isCurrentConnection = connectionId === this.currentConnectionId
        log.info('XmppConnectionManager.onXmppStartError', { isCurrentConnection }, error)
        if (isCurrentConnection) {
            this.stop()
        }
    }

    private onXmppError(connectionId: number, error: any)
    {
        const isCurrentConnection = connectionId === this.currentConnectionId
        log.info('XmppConnectionManager.onXmppError', { isCurrentConnection }, error)
    }

    private onXmppOffline(connectionId: number)
    {
        const isCurrentConnection = connectionId === this.currentConnectionId
        log.info('XmppConnectionManager.onXmppOffline', { isCurrentConnection })
        if (isCurrentConnection) {
            this.isConnecting = true
            this.isConnected = false
        }
    }

    private onXmppOnline(connectionId: number, address: string, xmppConfig: XmppConfig)
    {
        const isCurrentConnection = connectionId === this.currentConnectionId
        log.info('XmppConnectionManager.onXmppOnline', { isCurrentConnection, address, xmppConfig })
        if (!isCurrentConnection) {
            return
        }

        this.xmppJid = address
        this.stats.xmppConnectCount++
        this.isConnecting = false
        this.isConnected = true
        Memory.setLocal('me.lastWorkingXmppConfig', this.xmppConfig)
            .catch(error => log.info('XmppConnectionManager.onXmppOnline: Memory.setLocal failed!', error))

        this.sendServerPresence(Date.now())
        while (this.stanzaQ.length > 0) {
            const stanza = this.stanzaQ.shift()
            this.sendStanzaUnbuffered(stanza)
        }

        try {
            this.app.onXmppOnline()
        } catch (error) {
            log.info('XmppConnectionManager.onXmppOnline: app.onXmppOnline failed!', error)
        }
    }

    private onXmppStanza(connectionId: number, stanza: ltx.Element)
    {
        const isCurrentConnection = connectionId === this.currentConnectionId
        const isErrorStanza = (stanza.attrs.type ?? '') === 'error'
        if (!isCurrentConnection) {
            log.info('XmppConnectionManager.onXmppStanza: Received stanza for old connection.', { isCurrentConnection, isErrorStanza, stanza })
        } else if (isErrorStanza) {
            log.info('XmppConnectionManager.onXmppStanza: Received stanza is an error stanza.', { isCurrentConnection, isErrorStanza, stanza })
        }
        this.recvStanza(stanza)
    }

}
