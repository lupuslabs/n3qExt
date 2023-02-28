import { as } from '../lib/as'
import { Pid } from '../lib/ItemProperties'
import { Utils } from '../lib/Utils'
import * as log from 'loglevel'
import * as ltx from 'ltx'
import * as jid from '@xmpp/jid'
import { Config } from '../lib/Config'
import { Memory } from '../lib/Memory'
import { Backpack } from './Backpack'
import { RandomNames } from '../lib/RandomNames'
import { BackgroundApp } from './BackgroundApp'
import { ContentMessage } from '../lib/ContentMessage'
import { TabRoomPresenceData } from '../lib/BackgroundMessage'
import { AvatarGallery } from '../lib/AvatarGallery'
import { WeblinClientApi } from '../lib/WeblinClientApi'

// XMPP MUC extension docs: https://xmpp.org/extensions/xep-0045.html

class RoomData
{
    public readonly roomJid: string
    public posX: number

    public desiredNick: null|string // Initially tried nick set before entering the room.
    public confirmedNick: null|string = null // Set when entered the room.
    public pendingNick: null|string = null // Set while entering the room.
    public roomEnterTimeoutForNicknameProblemDetection: null|number = null
    public fallenBackToLastWorkingNick: boolean = false
    public enterRetryCount: number = 0

    public readonly tabIds: Set<number> = new Set()
    public readonly receivedPresences: Map<string,ltx.Element> = new Map()

    public lastSentPresenceData: null|TabRoomPresenceData = null
    public sentPresenceCounts: Map<string,number> = new Map()
    public presenceDataToSend: null|TabRoomPresenceData = null
    public sendPresenceTimeoutStart: null|Date = null
    public sendPresenceTimeoutHandle: null|number = null
    public sheduledPresenceCountSinceLastSend: Map<string,number> = new Map()

    public constructor(roomJid: string, posX: number)
    {
        this.roomJid = roomJid
        this.posX = posX
    }
}

export class RoomPresenceManager
{

    private settingsNick: string = 'new-user'
    private lastWorkingNick: string = ''
    private settingsAvatarUrl: string = ''
    private settingsPosX: number = 0

    private isStopped: boolean = false

    private readonly app: BackgroundApp
    private readonly tabPresences: Map<number,TabRoomPresenceData> = new Map()
    private readonly rooms: Map<string,RoomData> = new Map()

    public constructor(app: BackgroundApp) {
        this.app = app
        this.onUserSettingsChanged()
    }

    public stop(): void
    {
        if (this.isStopped) {
            return
        }
        for (const roomData of this.rooms.values()) {
            for (const tabId of roomData.tabIds.values()) {
                this.onTabUnavailable(tabId)
            }
            window.clearTimeout(roomData.sendPresenceTimeoutHandle)
        }
        this.rooms.clear()
        this.tabPresences.clear()
        this.isStopped = true
    }

    public getTabIdsByRoomJid(roomJid: string): number[]
    {
        return [...(this.rooms.get(roomJid)?.tabIds.values() ?? [])]
    }

    public updateRoomPos(roomJid: string, posX: number): void
    {
        if (this.isStopped) {
            return
        }
        this.settingsPosX = posX
        const roomData = this.rooms.get(roomJid)
        if (roomData) {
            roomData.posX = posX
            this.scheduleSendRoomPresence(roomData, null)
        }
    }

    public onUserSettingsChanged(): void
    {
        if (this.isStopped) {
            return
        }
        (async () => {
            let settingsChanged: boolean = false
            let delaySecs = as.Float(Config.get('xmpp.resendPresenceAfterResourceChangeBecauseServerSendsOldPresenceDataWithNewResourceToForceNewDataDelaySec'), 1)

            try {
                this.lastWorkingNick = as.String(await Memory.getLocal(Utils.localStorageKey_LastWorkingNickname(), ''))
            } catch (error) {
                log.info('RoomPresenceManager.onUserSettingsChanged: Retrieval of last working nickname failed!', { error })
            }
            try {
                const oldNick = this.settingsNick
                const nickname = as.String(await Memory.getLocal(Utils.localStorageKey_Nickname(), ''))
                if (nickname.length === 0) {
                    this.settingsNick = this.lastWorkingNick
                    if (this.settingsNick.length === 0) {
                        this.settingsNick = RandomNames.getRandomNickname()
                    }
                    await Memory.setLocal(Utils.localStorageKey_Nickname(), this.settingsNick)
                } else {
                    this.settingsNick = nickname
                }
                settingsChanged = settingsChanged || this.settingsNick !== oldNick
            } catch (error) {
                log.info('RoomPresenceManager.onUserSettingsChanged: Nickname retrieval failed!', { error })
            }

            try {
                const oldAvatarUrl = this.settingsAvatarUrl
                this.settingsAvatarUrl = (await (new AvatarGallery()).getAvatarFromLocalMemory()).getConfigUrl()
                settingsChanged = settingsChanged || this.settingsAvatarUrl !== oldAvatarUrl
            } catch (error) {
                log.info('RoomPresenceManager.onUserSettingsChanged: Avatar URL retrieval failed!', { error })
            }

            try {
                this.settingsPosX = as.Int(await Memory.getLocal(Utils.localStorageKey_X(), 100), 100)
            } catch (error) {
                log.info('RoomPresenceManager.onUserSettingsChanged: Position retrieval failed!', { error })
            }

            if (settingsChanged) {
                for (const roomData of this.rooms.values()) {
                    this.scheduleSendRoomPresence(roomData, delaySecs)
                }
            }
        })().catch(error => log.info('RoomPresenceManager.onUserSettingsChanged: Settings retrieval!', { error }))
    }

    public onTabUnavailable(tabId: number): void
    {
        if (this.isStopped) {
            return
        }
        const tabPresenceOld = this.tabPresences.get(tabId)
        if (tabPresenceOld) {
            const tabPresenceNew = {...tabPresenceOld, isAvailable: false}
            this.sendTabRoomPresence(tabId, tabPresenceNew)
        }
    }

    public onReceivedRoomPresenceStanza(roomPresenceStanza: ltx.Element)
    {
        if (this.isStopped) {
            return
        }

        const errorElem = roomPresenceStanza.getChild('error')
        const errorCode = as.Int(errorElem?.attrs.code, -1)

        let roomJid: string
        let participantResource: string
        try {
            const fromJid = jid(roomPresenceStanza.attrs.from)
            roomJid = fromJid.bare().toString()
            participantResource = fromJid.getResource() ?? ''
        } catch (error) {
            log.info('RoomPresenceManager.onReceivedRoomPresenceStanza: Invalid from!', { error, roomPresenceStanza })
            return
        }
        if (participantResource === '') {
            log.info('RoomPresenceManager.onReceivedRoomPresenceStanza: From doesn\'t contain participant resource!', { roomPresenceStanza })
            return
        }
        const roomData = this.rooms.get(roomJid)
        if (!roomData) {
            if (Utils.logChannel('backgroundPresenceManagement', true)) {
                log.info('RoomPresenceManager.onReceivedRoomPresenceStanza: Ignored presence for room without active tabs.', { roomPresenceStanza })
            }
            return
        }

        // Nick denial detection:
        if (roomData.pendingNick && errorCode === 409) { // Forbidden resource/nick
            roomData.enterRetryCount++
            if (roomData.enterRetryCount > as.Int(Config.get('xmpp.maxMucEnterRetries', 4))) {
                log.info('RoomPresenceManager.onReceivedRoomPresenceStanza: Too many room enter retries!', { roomPresenceStanza, roomData })
                return
            }
            const desiredNick = roomData.fallenBackToLastWorkingNick ? this.lastWorkingNick : roomData.desiredNick
            roomData.pendingNick = `${desiredNick}_${roomData.enterRetryCount}`
            if (Utils.logChannel('backgroundPresenceManagement', true)) {
                log.info('RoomPresenceManager.onReceivedRoomPresenceStanza: Nick is already taken, trying a variation.', { roomPresenceStanza, roomData })
            }
            this.scheduleSendRoomPresence(roomData)
            return
        }

        if (errorElem) {
            log.info('RoomPresenceManager.onReceivedRoomPresenceStanza: Ignoring error stanza!', { roomPresenceStanza, roomData })
            return
        }

        try {
            roomPresenceStanza = this.app.getBackpack()?.stanzaInFilter(roomPresenceStanza) ?? roomPresenceStanza
        } catch (error) {
            log.info('RoomPresenceManager.onReceivedRoomPresenceStanza: Backpack.stanzaInFilter failed!', { error, roomPresenceStanza, roomData })
            // Keep going with unfiltered presence.
        }

        // Nick change/acceptance detection:
        const roomUserStatusElem = roomPresenceStanza.getChild('x', 'http://jabber.org/protocol/muc#user')
        const isOwnEnterByStatus = (roomUserStatusElem?.getChildren('status') ?? []).some(elem => elem.attrs.code === '110')
        const isOwnEnterByResource = participantResource === roomData.pendingNick
        const isOwnEnter = isOwnEnterByStatus || isOwnEnterByResource
        const isOwnByConfirmedNick = participantResource === roomData.confirmedNick
        const isOwn = isOwnEnter || isOwnByConfirmedNick
        roomPresenceStanza.attrs._isSelf = isOwn
        if (isOwnEnter) {
            roomData.confirmedNick = participantResource
            roomData.pendingNick = null

            window.clearTimeout(roomData.roomEnterTimeoutForNicknameProblemDetection)
            roomData.roomEnterTimeoutForNicknameProblemDetection = null
            if (roomData.fallenBackToLastWorkingNick) {
                // Got into the room only after falling back to last working nickname right after a nickname change.
                this.app.showToastInAllTabs(
                    'FallenBackToOldNickBecauseServerIgbnoredPresenceTitle',
                    'FallenBackToOldNickBecauseServerIgbnoredPresenceText',
                    'FallenBackToOldNickname',
                    WeblinClientApi.ClientNotificationRequest.iconType_warning,
                    [{ text: 'Open settings', 'href': 'client:openSettings' }],
                );
            } else {
                // Only set last working nick if not using fallback because of possible race with other rooms.
                this.lastWorkingNick = roomData.desiredNick
                Memory.setLocal(Utils.localStorageKey_LastWorkingNickname(), this.lastWorkingNick).catch(error => {
                    log.info('RoomPresenceManager.onReceivedRoomPresenceStanza: Failed saving lastWorkingNick in local memory!', { error })
                })
            }
        }

        const isAvailable = (roomPresenceStanza.attrs.type ?? 'available') === 'available'
        if (isAvailable) {
            roomData.receivedPresences.set(participantResource, roomPresenceStanza)
        } else {
            roomData.receivedPresences.delete(participantResource)
        }
        this.sendRoomPresenceStanzaToRoomTabs(roomJid, roomPresenceStanza)
        if (Utils.logChannel('backgroundPresenceManagement', true)) {
            log.info('RoomPresenceManager.onReceivedRoomPresenceStanza: Processed a presence.', {
                roomPresenceStanza, isAvailable, isOwnEnterByStatus, isOwnEnterByResource, isOwnByConfirmedNick
            })
        }
        if (isOwnEnter) {
            // Some servers confuse outdated and new presence info in first presence after nick change, so shedule another presence right away:
            this.scheduleSendRoomPresence(roomData)
        }
    }

    public replayReceivedRoomPresenceStanza(roomJid: string, participantResource: string)
    {
        if (this.isStopped) {
            return
        }
        const stanza = this.rooms.get(roomJid)?.receivedPresences.get(participantResource)
        if (stanza) {
            stanza.attrs._replay = true
            this.onReceivedRoomPresenceStanza(stanza)
        }
    }

    public sendRoomPresence(roomJid: string): void
    {
        const roomData = this.rooms.get(roomJid);
        if (roomData?.confirmedNick) {
            this.scheduleSendRoomPresence(roomData);
        }
    }

    public sendTabRoomPresence(tabId: number, tabPresenceData: TabRoomPresenceData): void
    {
        if (this.isStopped) {
            return
        }
        if (Utils.logChannel('backgroundPresenceManagement', true)) {
            log.info('RoomPresenceManager.sendTabRoomPresence: Incomming presence from tab.', { tabId, tabPresenceData })
        }
        const { tabIsNew, roomData } = this.setTabPresence(tabId, tabPresenceData)
        if (tabIsNew) {
            this.replayAllRoomPresenceStanzasToTab(tabId, roomData)
        }
        this.scheduleSendRoomPresence(roomData)
        if (!tabPresenceData.isAvailable) {
            this.simulateOwnUnavailableToTab(roomData, tabId) // Notify unavailable tab immediately.
            this.deleteTab(tabId)
        }
    }

    private scheduleSendRoomPresence(roomData: RoomData, delaySecs?: number): void
    {
        if (!roomData.tabIds.size) {
            return
        }
        roomData.presenceDataToSend = this.getMergedRoomPresenceData(roomData)
        const { logPresenceType, defaultDelaySecs } = this.getLogPresenceTypeAndDelayOfRoomData(roomData)
        delaySecs = delaySecs ?? defaultDelaySecs

        const nowDate = new Date()
        if (roomData.sendPresenceTimeoutHandle === null) {
            roomData.sheduledPresenceCountSinceLastSend = new Map()
        } else {
            clearTimeout(roomData.sendPresenceTimeoutHandle)
            roomData.sendPresenceTimeoutHandle = null
            roomData.sendPresenceTimeoutStart = null
        }
        const oldSheduledCount = roomData.sheduledPresenceCountSinceLastSend.get(logPresenceType) ?? 0
        roomData.sheduledPresenceCountSinceLastSend.set(logPresenceType, oldSheduledCount + 1)
        const startDate = roomData.sendPresenceTimeoutStart ?? nowDate
        const elapsedSecs = Math.max(0, nowDate.getTime() - startDate.getTime()) / 1000
        const deferDelaySecsFinal = Math.max(0, delaySecs - elapsedSecs)

        if (Utils.logChannel('backgroundPresenceManagement', true)) {
            log.info('RoomPresenceManager.scheduleSendRoomPresence: Scheduling sending a room presence.', {
                logPresenceType, deferDelaySecs: delaySecs, roomPresenceData: roomData.presenceDataToSend,
            })
        }
        roomData.sendPresenceTimeoutStart = nowDate
        const sender = () => this.doSendRoomPresence(roomData.roomJid, logPresenceType)
        roomData.sendPresenceTimeoutHandle = window.setTimeout(sender, 1000 * deferDelaySecsFinal)
    }

    private getLogPresenceTypeAndDelayOfRoomData(roomData: RoomData): { logPresenceType: string, defaultDelaySecs: number }
    {
        let logPresenceType: string
        let defaultDelaySecs: number
        if (roomData.presenceDataToSend.isAvailable) {
            const isAway = roomData.presenceDataToSend.showAvailability.length !== 0
            logPresenceType = isAway ? 'away' : 'available'
            const configKey = isAway ? 'xmpp.deferAwaySec' : 'xmpp.deferAwailable'
            defaultDelaySecs = as.Float(Config.get(configKey))
        } else {
            logPresenceType = 'unavailable'
            defaultDelaySecs = as.Float(Config.get('xmpp.deferUnavailableSec'))
        }
        return { logPresenceType, defaultDelaySecs }
    }

    private doSendRoomPresence(roomJid: string, logPresenceType: string): void
    {
        if (this.isStopped) {
            return
        }
        const roomData = this.rooms.get(roomJid) ?? null
        if (roomData === null) {
            if (Utils.logChannel('backgroundPresenceManagement', true)) {
                log.info('RoomPresenceManager.doSendRoomPresence: Didn\'t send room presence because no room data.', {
                    logPresenceType, roomJid,
                })
            }
            return
        }

        this.detectNicknameChangeAndUpdateRoomDataAccordinglyBeforeSendingNewPresence(roomData)

        const ownResourceInRoom = roomData.pendingNick ?? roomData.confirmedNick
        const presenceData = roomData.presenceDataToSend
        if (!presenceData) {
            if (Utils.logChannel('backgroundPresenceManagement', true)) {
                log.info('RoomPresenceManager.doSendRoomPresence: Didn\'t send room presence because no presence data.', {
                    logPresenceType, roomJid,
                })
            }
        } else if (!ownResourceInRoom) {
            log.info('RoomPresenceManager.doSendRoomPresence: Can\'t send room presence because own resource to use is unknown!', {
                roomData,
            })
        } else {
            const presenceStanza = this.makeRoomPresence(roomData, ownResourceInRoom, presenceData)
            if (Utils.logChannel('backgroundPresenceManagement', true)) {
                log.info('RoomPresenceManager.doSendRoomPresence: Sending room presence.', {
                    logPresenceType, presenceStanza,
                    roomData: JSON.parse(JSON.stringify(roomData)), // Avoid mutation after logging.
                })
            }
            this.app.sendStanza(presenceStanza)
            roomData.lastSentPresenceData = roomData.presenceDataToSend
            roomData.sentPresenceCounts.set(logPresenceType, (roomData.sentPresenceCounts.get(logPresenceType) ?? 0) + 1)
        }
        roomData.sheduledPresenceCountSinceLastSend = new Map()
        roomData.sendPresenceTimeoutHandle = null
        roomData.sendPresenceTimeoutStart = null
        roomData.presenceDataToSend = null
        if (!roomData.tabIds.size) {
            this.rooms.delete(roomJid)
        }
    }

    private detectNicknameChangeAndUpdateRoomDataAccordinglyBeforeSendingNewPresence(roomData: RoomData): void
    {
        if (!roomData.presenceDataToSend?.isAvailable) {
            return;
        }
        const desiredNick = this.getDesiredNick()
        if (desiredNick === roomData.desiredNick) {
            return;
        }

        roomData.desiredNick = desiredNick
        roomData.pendingNick = desiredNick
        roomData.enterRetryCount = 0
        roomData.fallenBackToLastWorkingNick = false

        window.clearTimeout(roomData.roomEnterTimeoutForNicknameProblemDetection)
        roomData.roomEnterTimeoutForNicknameProblemDetection = null

        // Detection of server completely ignoring the room (re)enter presence if the nick isn't known to be working:
        if (desiredNick !== this.lastWorkingNick) {
            const handler = () => this.onFailedToEnterRoomWithNewNicknameBecauseServerIgnoredPresence(roomData.roomJid)
            const timeoutSecs = as.Float(Config.get('xmpp.detectServerCompletelyIgnoredPresenceMaybeBecauseOfInvalidNicknameTimeoutSec'), 60)
            roomData.roomEnterTimeoutForNicknameProblemDetection = window.setTimeout(handler, 1000 * timeoutSecs)
        }
    }

    private simulateOwnUnavailableToTab(roomData: RoomData, unavailableTabId: number)
    {
        const roomJid = roomData.roomJid
        const ownResource = roomData.confirmedNick
        if (ownResource) { // Only if actually in the room.
            const from = this.makeToJid(roomJid, ownResource)
            const attrs = { type: 'unavailable', 'from': from, 'to': this.app.getXmppJid() ?? '', _isSelf: true }
            const stanza = new ltx.Element('presence', attrs)
            this.app.sendToTab(unavailableTabId, { type: ContentMessage.type_recvStanza, stanza })
        }
    }

    private getMergedRoomPresenceData(roomData: RoomData): TabRoomPresenceData
    {
        const tabPresences = [...roomData.tabIds.values()].map(tabId => this.tabPresences.get(tabId))
        const cmpByTimestampDesc = (a, b) => a.timestamp < b.timestamp ? 1 : (a.timestamp === b.timestamp ? 0 : -1)
        tabPresences.sort(cmpByTimestampDesc)
        const newestPresence = tabPresences[0] ?? null
        const filterForIsAvailable = p => p.isAvailable && p.showAvailability.length === 0
        const newestAvailablePresence = tabPresences.filter(filterForIsAvailable).pop() ?? null

        const roomPresence: TabRoomPresenceData = {
            ...newestPresence[0] ?? {
                roomJid: roomData.roomJid,
                ownResourceInRoom: roomData.pendingNick ?? roomData.confirmedNick,
                badges: newestPresence?.badges ?? '',
                timestamp: newestPresence?.timestamp ?? Utils.utcStringOfDate(new Date()),
            },
            isAvailable: tabPresences.some(tabPresence => tabPresence.isAvailable),
            showAvailability: newestAvailablePresence?.showAvailability ?? newestPresence?.showAvailability ?? '',
            statusMessage: newestAvailablePresence?.statusMessage ?? newestPresence?.statusMessage ?? '',
        }

        if (Utils.logChannel('backgroundPresenceManagement', true)) {
            log.info('RoomPresenceManager.getMergedRoomPresenceData: Merged tab presences.', {
                tabPresences, newestPresence, newestAvailablePresence, roomPresence
            })
        }
        return roomPresence
    }

    private makeRoomPresence(roomData: RoomData, ownResourceInRoom: string, presenceData: TabRoomPresenceData): ltx.Element
    {
        const to = this.makeToJid(roomData.roomJid, ownResourceInRoom)
        if (!(presenceData?.isAvailable ?? false)) {
            return this.makeRoomUnavailablePresence(to)
        }
        const user = Config.get('xmpp.user', '')
        const domain = Config.get('xmpp.domain', '')
        const userJid = `${user}@${domain}`
        let {badges, isAvailable, showAvailability, statusMessage} = presenceData

        const vpProps = {
            xmlns: 'vp:props',
            timestamp: Date.now(),
            Nickname: ownResourceInRoom,
            nickname: ownResourceInRoom,
        }

        const backpack: null|Backpack = this.app.getBackpack()

        let avatarUrl = this.settingsAvatarUrl
        const avatarItemProps = { [Pid.AvatarAspect]: 'true', [Pid.ActivatableIsActive]: 'true' }
        const itemAvatarUrl = as.String(backpack?.getFirstFilteredItemsPropertyValue(avatarItemProps, Pid.AvatarAnimationsUrl))
        if (itemAvatarUrl.length) {
            avatarUrl = itemAvatarUrl
        }
        vpProps['AvatarUrl'] = avatarUrl

        let points = 0
        if (Config.get('points.enabled', false)) {
            const pointsItemProps = { [Pid.PointsAspect]: 'true' }
            points = as.Int(backpack?.getFirstFilteredItemsPropertyValue(pointsItemProps, Pid.PointsTotal))
            if (points > 0) {
                vpProps['Points'] = points
            }
        }

        if (badges.length !== 0) {
            vpProps['Badges'] = badges
        }

        let presence = new ltx.Element('presence', { to })
        if (!isAvailable) {
            presence.attrs.type = 'unavailable'
        }

        presence.c('x', { xmlns: 'firebat:avatar:state', }).c('position', { x: roomData.posX })

        if (showAvailability !== '') {
            presence.c('show').t(showAvailability)
        }
        if (statusMessage !== '') {
            presence.c('status').t(statusMessage)
        }

        presence.c('x', vpProps)

        let identityUrl = as.String(Config.get('identity.url'), '')
        let identityDigest = as.String(Config.get('identity.digest'), '1')
        if (identityUrl === '') {
            identityDigest = as.String(Utils.hashNumber(`${this.app.getXmppResource()}${avatarUrl}`))
            identityUrl = as.String(Config.get('identity.identificatorUrlTemplate', 'https://webex.vulcan.weblin.com/Identity/Generated?avatarUrl={avatarUrl}&nickname={nickname}&digest={digest}&imageUrl={imageUrl}&points={points}'))
                .replace('{nickname}', encodeURIComponent(ownResourceInRoom))
                .replace('{avatarUrl}', encodeURIComponent(avatarUrl))
                .replace('{digest}', encodeURIComponent(identityDigest))
                .replace('{imageUrl}', encodeURIComponent(''))

            if (points > 0) {
                identityUrl = identityUrl.replace('{points}', encodeURIComponent('' + points))
            }
        }
        if (identityUrl !== '') {
            presence.c('x', { xmlns: 'firebat:user:identity', 'jid': userJid, 'src': identityUrl, 'digest': identityDigest })
        }

        presence
            .c('x', { xmlns: 'http://jabber.org/protocol/muc' })
            .c('history', { seconds: '180', maxchars: '3000', maxstanzas: '10' })

        presence = backpack?.stanzaOutFilter(presence) ?? presence
        return presence
    }

    private makeRoomUnavailablePresence(to: string): ltx.Element
    {
        return new ltx.Element('presence', { type: 'unavailable', to })
    }

    private makeToJid(roomJid: string, resource: string): string
    {
        const toJid = jid.parse(roomJid).bare()
        toJid.setResource(resource)
        return toJid.toString()
    }

    private setTabPresence(tabId: number, tabPresenceData: TabRoomPresenceData): { tabIsNew: boolean, roomData: RoomData }
    {
        const roomJid = tabPresenceData.roomJid
        let roomData = this.rooms.get(roomJid) ?? null
        if (!roomData) {
            roomData = new RoomData(roomJid, this.settingsPosX)
            this.rooms.set(roomJid, roomData)
        }
        this.tabPresences.set(tabId, tabPresenceData)
        const oldSize = roomData.tabIds.size
        roomData.tabIds.add(tabId)
        const tabIsNew = oldSize !== roomData.tabIds.size
        if (tabIsNew && Utils.logChannel('room2tab', true)) {
            log.info('RoomPresenceManager.setTabPresence: Added room2tab mapping.', { roomJid, tabId })
        }
        return { tabIsNew, roomData }
    }

    private deleteTab(tabId): void
    {
        const roomJid = this.tabPresences.get(tabId)?.roomJid ?? ''
        const roomData = this.rooms.get(roomJid) ?? null
        const hasBeenRemoved = roomData?.tabIds.delete(tabId)
        if (hasBeenRemoved && Utils.logChannel('room2tab', true)) {
            log.info('RoomPresenceManager.deleteTab: Removed room2tab mapping.', { roomJid, tabId })
        }
        if (!roomData?.tabIds.size && !roomData?.sendPresenceTimeoutHandle) {
            this.rooms.delete(roomJid)
        }
    }

    private getDesiredNick(): string
    {
        let nick: string = ''
        const backpack = this.app.getBackpack()
        if (backpack) {
            const filterProps = { [Pid.NicknameAspect]: 'true', [Pid.ActivatableIsActive]: 'true' }
            nick = as.String(backpack?.getFirstFilteredItemsPropertyValue(filterProps, Pid.NicknameText))
        }
        if (!nick.length) {
            nick = this.settingsNick
        }
        return nick
    }

    private replayAllRoomPresenceStanzasToTab(tabId: number, roomData: RoomData): void
    {
        for (const roomPresenceStanza of roomData.receivedPresences.values()) {
            const message = { 'type': ContentMessage.type_recvStanza, 'stanza': roomPresenceStanza }
            this.app.sendToTab(tabId, message)
        }
    }

    private sendRoomPresenceStanzaToRoomTabs(roomJid: string, roomPresenceStanza: ltx.Element): void
    {
        const message = { 'type': ContentMessage.type_recvStanza, 'stanza': roomPresenceStanza }
        this.app.sendToTabsForRoom(roomJid, message)
    }

    private onFailedToEnterRoomWithNewNicknameBecauseServerIgnoredPresence(roomJid: string): void
    {
        const roomData = this.rooms.get(roomJid) ?? null
        if (roomData) {
            roomData.presenceDataToSend = this.getMergedRoomPresenceData(roomData)
        }
        if (!roomData?.presenceDataToSend?.isAvailable) {
            return
        }
        log.info('RoomPresenceManager.onFailedToEnterRoomWithNewNickname: Entering room with new nick failed because server completely ignored the presence!', { roomData })

        window.clearTimeout(roomData.roomEnterTimeoutForNicknameProblemDetection)
        roomData.roomEnterTimeoutForNicknameProblemDetection = null

        roomData.pendingNick = this.lastWorkingNick
        roomData.enterRetryCount = 0
        roomData.fallenBackToLastWorkingNick = true
        const { logPresenceType } = this.getLogPresenceTypeAndDelayOfRoomData(roomData)
        this.doSendRoomPresence(roomJid, logPresenceType)
    }

}
