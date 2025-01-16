import { is } from '../lib/is'
import { as } from '../lib/as'
import { iter } from '../lib/Iter'
import { Logger } from '../lib/Logger'
import { Config } from '../lib/Config'
import { ItemProperties } from '../lib/ItemProperties'
import { BackgroundApp } from './BackgroundApp'
import { BackgroundBrowserTab } from './BackgroundBrowserTabs'

type ItemAction = 'none'|'derez'|'derezWait'|'rez'|'rezWait'

type ItemState = {
    currentAction: ItemAction
    lastActionDate: Date
    unrezzedByUs: boolean
    lastAutorezDate: Date
}

export class ItemAutorezzer
{
    private readonly app: BackgroundApp
    private readonly logger: Logger
    private readonly itemStates: Map<string,ItemState> = new Map()
    private isStopped: boolean = false
    private rezRoomUrl: null|string = null
    private rezRoomJid: null|string = null

    constructor(app: BackgroundApp)
    {
        this.app = app
        this.logger = app.getLogger().getSubLogger('items', 'Item auto-rezzing:')
        this.app.getBrowserTabs().tabFocusedListeners.addListener(tab => this.onTabChanged(tab))
        this.app.getBrowserTabs().tabStatsChangedListeners.addListener(tab => this.onTabChanged(tab))
    }

    public maintain(): void
    {
        if (this.isStopped) {
            return
        }
        iter(this.app.getBackpack().getItems().entries())
            .filter(([itemId, props]) => ItemProperties.getAutorezIsActive(props))
            .forEach(([itemId, props]) => this.maintainItemState(itemId, this.getItemState(itemId)))
    }

    public stop(): void
    {
        this.isStopped = true
    }

    private forgetItemState(itemId: string): void
    {
        this.itemStates.delete(itemId)
    }

    private getItemState(itemId: string): ItemState
    {
        let itemState = this.itemStates.get(itemId)
        if (!itemState) {
            itemState = {
                currentAction: 'none',
                lastActionDate: new Date(),
                unrezzedByUs: false,
                lastAutorezDate: new Date(0),
            }
            this.itemStates.set(itemId, itemState)
        }
        return itemState
    }

    private maintainItemState(itemId: string, itemState: ItemState): void
    {
        const props = this.app.getBackpack().getItemOrNull(itemId)
        if (!props) {
            this.forgetItemState(itemId)
            return
        }
        switch (itemState.currentAction) {
            case 'none': {
                this.autorezItem(itemId)
            } break
            case 'derezWait':
            case 'rezWait': {
                const minRetryDelayMs = 1e3 * as.Float(Config.get('itemAutorezzer.itemActionRetryDelaySec'), 1)
                if (Date.now() < itemState.lastActionDate.getTime() + minRetryDelayMs) {
                    itemState.currentAction = 'none'
                    this.autorezItem(itemId)
                }
            } break
            default: {} break
        }
    }

    private onTabChanged(tab: BackgroundBrowserTab): void {
        if (tab.getIsFocused() && tab.getStats().isInRoom) {
            const rezRoomUrl = tab.getStats().roomUrl
            const rezRoomJid = tab.getStats().roomJid
            if (this.rezRoomUrl !== rezRoomUrl || this.rezRoomJid !== rezRoomJid) {
                this.rezRoomUrl = rezRoomUrl
                this.rezRoomJid = rezRoomJid
            }
        }
        this.maintain()
    }

    private autorezItem(itemId: string): void
    {
        if (!as.Bool(Config.get('itemAutorezzer.enabled'))) {
            return
        }
        const props = this.app.getBackpack().getItemOrNull(itemId)
        const itemState = this.getItemState(itemId)
        const minAutorezIntervalMs = 1e3 * as.Float(Config.get('itemAutorezzer.minItemRezIntervalSec'), 1)
        if (
            is.nil(this.rezRoomUrl) || is.nil(this.rezRoomJid)
            || !props || !ItemProperties.hasAutorezAspect(props) || itemState.currentAction !== 'none'
            || Date.now() < itemState.lastAutorezDate.getTime() + minAutorezIntervalMs
        ) {
            return
        }
        if (ItemProperties.getIsRezzed(props)) {
            if (ItemProperties.getRezzedLocation(props) === this.rezRoomJid) {
                return
            }
            this.unrezItem(itemId, ItemProperties.getRezzedLocation(props), itemState)
            return
        }
        if (!itemState.unrezzedByUs) {
            this.forgetItemState(itemId)
            return
        }
        this.rezItem(itemId, this.rezRoomUrl, this.rezRoomJid, ItemProperties.getRezzedX(props), itemState)
    }

    private unrezItem(itemId: string, rezzedRoomJid: string, itemState: ItemState): void
    {
        itemState.currentAction = 'derez'
        itemState.lastActionDate = new Date()
        this.app.getBackpack().derezItem(itemId, rezzedRoomJid, -1, -1)
            .catch(error => error)
            .then(maybeError => {
                if (this.isStopped) {
                    return
                }
                const isError = !!maybeError
                if (isError) {
                    this.logger.logError(maybeError)
                }
                const itemState = this.getItemState(itemId)
                if (itemState.currentAction !== 'derez') {
                    return
                }
                itemState.currentAction = isError ? 'derezWait' : 'none'
                itemState.lastActionDate = new Date()
                itemState.unrezzedByUs = !isError
                if (!isError) {
                    this.autorezItem(itemId)
                }
            })
    }

    private rezItem(itemId: string, rezRoomUrl: string, rezRoomJid: string, rezX: number, itemState: ItemState): void
    {
        itemState.currentAction = 'rez'
        itemState.lastActionDate = new Date()
        this.app.getBackpack().rezItem(itemId, rezRoomJid, rezX, rezRoomUrl)
            .catch(error => error)
            .then(maybeError => {
                if (this.isStopped) {
                    return
                }
                const isError = !!maybeError
                if (isError) {
                    this.logger.logError(maybeError)
                }
                const itemState = this.getItemState(itemId)
                if (itemState.currentAction !== 'rez') {
                    return
                }
                itemState.currentAction = isError ? 'rezWait' : 'none'
                itemState.lastActionDate = new Date()
                itemState.lastAutorezDate = new Date()
                itemState.unrezzedByUs = false
                if (!isError) {
                    this.autorezItem(itemId)
                }
            })
    }

}
