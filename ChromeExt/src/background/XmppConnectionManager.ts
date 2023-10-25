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
    service:  string,
    domain:   string,
    resource: string,
    username: string,
    password: string,
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

    public getXmppResource(): null|string
    {
        return this.resource ?? null
    }

    public getXmppJid(): null|string
    {
        return this.xmppJid ?? null
    }

    public stop()
    {
        this.isConnecting = false
        this.isConnected = false
        this.xmpp?.stop().catch(error => log.info(error))
        this.xmpp = null
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
                this.xmppConfig = xmppConfigNew
                this.stop()
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
        this.isConnecting = true;
        (async () => {
            this.xmpp = client(xmppConfig)

            this.xmpp.on('error', (err: any) => log.info('xmpp.on.error', err))

            this.xmpp.on('offline', () => {
                log.info('XMPP offline.')
                this.isConnecting = true
                this.isConnected = false
            })

            this.xmpp.on('online', (address: string) =>
            {
                log.info('XMPP online', { address, xmppConfig })
                this.xmppJid = address
                this.stats.xmppConnectCount++
                this.isConnecting = false
                this.isConnected = true
                Memory.setLocal('me.lastWorkingXmppConfig', this.xmppConfig).catch(error => log.info(error))

                this.sendServerPresence(Date.now())
                while (this.stanzaQ.length > 0) {
                    const stanza = this.stanzaQ.shift()
                    this.sendStanzaUnbuffered(stanza)
                }

                try {
                    this.app.onXmppOnline()
                } catch (error) { log.info(error) }
            })

            this.xmpp.on('stanza', (stanza: ltx.Element) => this.recvStanza(stanza))

            this.xmpp.start().catch(error => log.info(error))
        })().catch(error => log.info(error))
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
            log.debug('BackgroundApp.sendStanza', error.message ?? '')
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
            // Ignore from or to JID not parsable or none present. Stanza will just be send to all tabs.
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

}
