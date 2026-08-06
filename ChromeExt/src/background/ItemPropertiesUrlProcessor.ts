import { is } from '../lib/is'
import { as } from '../lib/as'
import { iter } from '../lib/Iter'
import { Logger } from '../lib/Logger'
import { Config } from '../lib/Config'
import { ItemProperties, ItemPropertiesUrlData } from '../lib/ItemProperties'
import { BackgroundApp } from './BackgroundApp'

type ItemRecord = {
    refreshIntervalMs: number
    lastPropertiesJson: null|string
}

type UrlRecord = {
    propertiesUrl: string
    items: Map<string,ItemRecord>
    inRefresh: boolean
    lastRefresh: Date
    lastPropertiesJson: null|string
}

export class ItemPropertiesUrlProcessor
{
    private readonly app: BackgroundApp
    private readonly logger: Logger
    private readonly urlRecordByUrl: Map<string,UrlRecord> = new Map()
    private readonly urlRecordByItemId: Map<string,UrlRecord> = new Map()
    private lastMaintenance: Date = new Date()

    constructor(app: BackgroundApp)
    {
        this.app = app
        this.logger = app.getLogger().getSubLogger('items', 'Item properties URL processing:')
    }

    public maintain(): void
    {
        const now = new Date()
        const maintenanceIntervalSecs = as.Float(Config.get('backpack.PropertiesUrlProcessing.maintenanceIntervalSec'), 1)
        const doMaintenance = this.lastMaintenance.getTime() + 1e3 * maintenanceIntervalSecs < now.getTime()
        if (!doMaintenance) {
            return
        }
        this.lastMaintenance = now

        iter(this.urlRecordByUrl.values()).forEach(urlRecord => this.refreshUrl(urlRecord))
    }

    public forgetItem(itemId: string): void
    {
        const itemUrlRecord = this.urlRecordByItemId.get(itemId) ?? null
        if (!itemUrlRecord) {
            return
        }
        this.urlRecordByItemId.delete(itemId)
        itemUrlRecord.items.delete(itemId)
        if (itemUrlRecord.items.size === 0) {
            this.urlRecordByUrl.delete(itemUrlRecord.propertiesUrl)
        }
    }

    public processItem(item: Readonly<ItemProperties>): void
    {
        if (ItemProperties.getOwnerId(item) !== this.app.getUserId()) {
            return
        }
        const itemId: string = ItemProperties.getId(item)
        const itemPropertiesUrlData: null|ItemPropertiesUrlData = ItemProperties.getPropertiesUrlData(item)
        if (!itemPropertiesUrlData
            || ItemProperties.getOwnerId(item) !== this.app.getUserId()
            || !as.Bool(Config.get('backpack.PropertiesUrlProcessing.enabled'))
        ) {
            this.forgetItem(itemId)
            return
        }
        const { propertiesUrl, refreshInterval } = itemPropertiesUrlData

        let urlRecord = this.urlRecordByUrl.get(propertiesUrl) ?? null
        if (!urlRecord) {
            urlRecord = {
                propertiesUrl,
                items: new Map(),
                inRefresh: false,
                lastRefresh: new Date(0),
                lastPropertiesJson: null,
            }
            this.urlRecordByUrl.set(propertiesUrl, urlRecord)
        }

        const oldItemUrlRecord = this.urlRecordByItemId.get(itemId) ?? null
        if (oldItemUrlRecord !== urlRecord) {
            this.forgetItem(itemId)
            this.urlRecordByItemId.set(itemId, urlRecord)
        }

        const itemRecord: ItemRecord = urlRecord.items.get(itemId) ?? null
        if (itemRecord) {
            itemRecord.refreshIntervalMs = 1e3 * refreshInterval
        } else {
            urlRecord.items.set(itemId, {
                refreshIntervalMs: 1e3 * refreshInterval,
                lastPropertiesJson: null,
            })
        }

        this.refreshUrl(urlRecord)
    }

    private refreshUrl(urlRecord: UrlRecord): void
    {
        if (urlRecord.inRefresh) {
            return
        }

        const nowTime = Date.now()
        const lastUrlRefresh = urlRecord.lastRefresh.getTime()
        const lastUrlRefreshDistance = nowTime - lastUrlRefresh
        const needsRefresh = iter(urlRecord.items.values())
            .any(itemRecord => itemRecord.refreshIntervalMs < lastUrlRefreshDistance)
        if (!needsRefresh) {
            this.updateItems(urlRecord)
            return
        }

        const propertiesUrl = urlRecord.propertiesUrl
        urlRecord.inRefresh = true
        this.app.getUrlFetcher().fetchAsText(propertiesUrl, '_nocache').then(propsJson => {
            if (!is.nonEmptyString(propsJson)) {
                this.logger.logInfo('Received empty string instead of JSON.', {urlRecord})
                return null
            }
            this.logger.logInfo('Fetching JSON succeeded.', {urlRecord, propsJson})
            return propsJson
        }).catch(error => {
            this.logger.logInfo('Fetching JSON failed.', {urlRecord}, error)
            return null
        }).then(propsJson => {
            const urlRecord = this.urlRecordByUrl.get(propertiesUrl) ?? null
            if (!urlRecord?.inRefresh) {
                return
            }
            urlRecord.inRefresh = false

            const now = new Date()
            urlRecord.lastRefresh = now
            if (is.nonEmptyString(propsJson)) {
                urlRecord.lastPropertiesJson = propsJson
            }
            this.updateItems(urlRecord)
        })
    }

    private updateItems(urlRecord: UrlRecord): void
    {
        const lastPropertiesJson = urlRecord.lastPropertiesJson
        if (!is.nonEmptyString(lastPropertiesJson)) {
            return
        }
        const backpack = this.app.getBackpack()
        const enabledForOwnItems = as.Bool(Config.get('backpack.PropertiesUrlProcessing.enabled'))
        urlRecord.items.forEach((itemRecord, itemId) => {
            if (!backpack?.getItemOrNull(itemId) || !enabledForOwnItems) {
                this.forgetItem(itemId)
                return
            }
            if (itemRecord.lastPropertiesJson === lastPropertiesJson) {
                return
            }
            itemRecord.lastPropertiesJson = lastPropertiesJson
            const action = 'EditableProperties.SetProperties'
            const args = {ValuesJson: lastPropertiesJson}
            this.app.getBackpack()?.executeItemAction(itemId, action, args, [itemId], true)
                .catch(error => this.logger.logError('Item update failed!', {urlRecord, itemId, itemRecord}, error))
        })
    }
}
