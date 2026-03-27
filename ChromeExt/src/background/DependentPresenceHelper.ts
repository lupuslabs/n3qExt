import { as } from '../lib/as'
import { iter } from '../lib/Iter'
import { ItemProperties, Pid } from '../lib/ItemProperties'
import * as ltx from 'ltx'
import { jid } from '@xmpp/jid'
import { BackgroundApp } from './BackgroundApp'
import { Logger } from '../lib/Logger'
import { Config } from '../lib/Config'
import { WeblinClientApi } from '../lib/WeblinClientApi'
import { ContentMessage } from '../lib/ContentMessage'

type DeferredItemRequest = {
    itemDefinition: ItemProperties
    roomJid: string
    participantNick: string
}

const roomNicksAreEqualFun = (A: DeferredItemRequest, B: DeferredItemRequest): boolean => {
    return A.roomJid === B.roomJid && A.participantNick === B.participantNick
}

export class DependentPresenceHelper
{
    private readonly app: BackgroundApp

    private warningNotificatonTime: Date = new Date(0)
    private limitNotificatonTime: Date = new Date(0)

    private readonly deferredItemsRequestLogger: Logger
    private deferredItemsToRequest: Map<string,DeferredItemRequest> = new Map()
    private deferredItemsRequestTime: null|Date = null
    private deferredItemsRequestTimeout: null|ReturnType<typeof setTimeout> = null
    private deferredItemsRequesting: ReadonlyMap<string,DeferredItemRequest> = new Map()

    constructor(app: BackgroundApp) {
        this.app = app
        this.deferredItemsRequestLogger = app.getLogger().getSubLogger('DependentPresenceItemRequests', 'DependentPresenceHelper')
    }

    public modifyOutgoingStanza(stanza: ltx.Element): void
    {
        if (stanza.name !== 'presence' || as.String(stanza.attrs['type'], 'available') !== 'available') {
            return
        }
        const toJid = jid(stanza.attrs.to)
        const roomJid = toJid.bare().toString()
        const dependentPresence = this.getDependentPresence(roomJid)
        if (dependentPresence) {
            stanza.cnode(dependentPresence)
        }
    }

    public modifyIncomingStanza(stanza: ltx.Element): void
    {
        if (stanza.name !== 'presence' || as.String(stanza.attrs['type'], 'available') !== 'available') {
            return
        }
        const fromJid = jid(stanza.attrs.from)
        const roomJid = fromJid.bare().toString()
        const participantNick = fromJid.getResource()
        const dependentPresences = stanza.getChildren('x', 'vp:dependent')[0]?.getChildren('presence') ?? []
        dependentPresences.forEach(dependentPresence => this.onDependentPresence(roomJid, participantNick, dependentPresence))
    }

    private getDependentPresence(roomJid: string): null|ltx.Element
    {
        const items = this.app.getBackpack().getRoomItems(roomJid)
        if (items.length === 0) {
            return null
        }

        if (items.length > Config.get('backpack.dependentPresenceItemsWarning', 20)) {
            const now = new Date()
            const warningIntervalMs = 1e3 * Config.get('backpack.dependentPresenceItemsWarningIntervalSec', 30.0)

            if (items.length > Config.get('backpack.dependentPresenceItemsLimit', 25)) {
                if (this.limitNotificatonTime.getTime() + warningIntervalMs < now.getTime()) {
                    this.limitNotificatonTime = now
                    this.showToast(roomJid,
                        this.app.translateText('Backpack.Too many items'),
                        this.app.translateText('Backpack.Page items disabled.'),
                        'DependentPresenceLimit',
                        WeblinClientApi.ClientNotificationRequest.iconType_warning,
                    )
                }
                return null
            }

            if (this.warningNotificatonTime.getTime() + warningIntervalMs < now.getTime()) {
                this.warningNotificatonTime = now
                this.showToast(roomJid,
                    this.app.translateText('Backpack.Too many items'),
                    this.app.translateText('Backpack.You are close to the limit of items on a page.'),
                    'DependentPresenceWarning',
                    WeblinClientApi.ClientNotificationRequest.iconType_notice,
                )
            }
        }

        const dependentPresence = new ltx.Element('x', { 'xmlns': 'vp:dependent' })
        for (const item of items) {
            const itemId = ItemProperties.getId(item)
            const inventoryId = ItemProperties.getInventoryId(item)
            const from = `${roomJid}/${inventoryId}${itemId}`
            const itemPresence = new ltx.Element('presence', { 'from': from })
            itemPresence.c('x', {
                'xmlns': 'vp:props',
                'type': 'item',
                [Pid.Provider]: ItemProperties.getProviderId(item),
                [Pid.Id]: itemId,
                [Pid.InventoryId]: inventoryId,
                [Pid.Digest]: ItemProperties.getDigest(item),
            })
            dependentPresence.cnode(itemPresence)
        }
        return dependentPresence
    }

    private onDependentPresence(roomJid: string, participantNick: string, dependentPresence: ltx.Element): void
    {
        const vpProps = dependentPresence.getChildren('x', 'vp:props')[0]
        if (!vpProps) {
            return
        }
        dependentPresence.attrs._incomplete = true

        const vpPropsAttrs = vpProps.attrs
        const itemId = ItemProperties.getId(vpPropsAttrs)
        const providerId = ItemProperties.getProviderId(vpPropsAttrs)
        const inventoryId = ItemProperties.getInventoryId(vpPropsAttrs)
        const digest = ItemProperties.getDigest(vpPropsAttrs)
        const itemDefinition = { [Pid.Id]: itemId, [Pid.Provider]: providerId, [Pid.InventoryId]: inventoryId }
        const loadedItem = this.app.getBackpack().getLoadedItemsByInventoryItemIds([itemDefinition]).itemsLoaded[0]

        if (loadedItem) {
            this.completeDependentPresence(loadedItem, dependentPresence, vpProps)
            if (ItemProperties.getDigest(loadedItem) === digest) {
                return
            }
            itemDefinition[Pid.Version] = ItemProperties.getVersion(loadedItem) + 1 // Force update because digest doesn't match
        }
        this.requestItemForDependentPresence(roomJid, participantNick, itemDefinition)
    }

    private completeDependentPresence(props: ItemProperties, dependentPresence: ltx.Element, vpProps: ltx.Element): void
    {
        delete dependentPresence.attrs._incomplete
        for (const [pid, value] of Object.entries(props)) {
            vpProps.attrs[pid] = value
        }
    }

    private requestItemForDependentPresence(roomJid: string, participantNick: string, itemDefinition: ItemProperties): void
    {
        const itemId = ItemProperties.getId(itemDefinition)
        if (this.deferredItemsRequesting.has(itemId) || this.deferredItemsToRequest.has(itemId)) {
            return
        }
        this.deferredItemsToRequest.set(itemId, { itemDefinition, roomJid, participantNick })

        if (!this.deferredItemsRequestTime) {
            const requestDelayMs = 1e3 * Config.get('itemCache.clusterItemFetchSec', 0.1)
            this.deferredItemsRequestTime = new Date(Date.now() + requestDelayMs)
            this.deferredItemsRequestTimeout = setTimeout(() => this.doItemsForDependentPresenceRequest(), requestDelayMs)
            return
        }

        if (this.deferredItemsRequestTime > new Date()) {
            this.doItemsForDependentPresenceRequest()
        }
    }

    private doItemsForDependentPresenceRequest(): void
    {
        if (this.deferredItemsRequesting.size !== 0) {
            return
        }

        clearTimeout(this.deferredItemsRequestTimeout)
        this.deferredItemsRequestTimeout = null
        this.deferredItemsRequestTime = null
        const roomitemsToGet = this.deferredItemsToRequest
        this.deferredItemsToRequest = new Map()
        this.deferredItemsRequesting = roomitemsToGet
        const itemsToGet: ItemProperties[] = iter(roomitemsToGet.values())
            .map(({ itemDefinition }) => itemDefinition)
            .toArray()
        this.deferredItemsRequestLogger.logInfo('requestItemPropertiesForDependentPresence', { roomitemsToGet, itemsToGet })

        this.app.getBackpack().getItemsByInventoryItemIds(itemsToGet)
            .then(itemsRetrieved => {
                if (itemsRetrieved.length !== itemsToGet.length) {
                    const msg = 'Didn\'t get all items for dependent presence.'
                    this.deferredItemsRequestLogger.logWarning(msg, { itemsToGet, items: itemsRetrieved })
                }
                const roomNicks = iter(itemsRetrieved)
                    .map(item => roomitemsToGet.get(ItemProperties.getId(item)))
                    .removeNil()
                    .removeDuplicates(roomNicksAreEqualFun)
                    .map(({ roomJid, participantNick }) => ({ roomJid, participantNick }))
                    .toArray()
                roomNicks.forEach(({ roomJid, participantNick }) => this.app.replayPresence(roomJid, participantNick))
                const msg = 'requestItemPropertiesForDependentPresence: Replayed presence.'
                this.deferredItemsRequestLogger.logInfo(msg, { roomitemsToGet, itemsRetrieved, roomNicks })
            }).catch(error => {
                this.deferredItemsRequestLogger.logError('requestItemPropertiesForDependentPresence', error)
            }).finally(() => {
                this.deferredItemsRequesting = new Map()
            })
    }

    private showToast(roomJid: string, title: string, text: string, type: string, iconType: string): void
    {
        const data = new WeblinClientApi.ClientNotificationRequest(WeblinClientApi.ClientNotificationRequest.type, '')
        data.title = title
        data.text = text
        data.type = type
        data.iconType = iconType
        this.app.sendToTabsForRoom(roomJid, { type: ContentMessage.type_clientNotification, data })
    }

}
