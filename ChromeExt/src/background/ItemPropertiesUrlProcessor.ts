import { is } from '../lib/is'
import { as } from '../lib/as'
import { Logger } from '../lib/Logger'
import { Config } from '../lib/Config'
import { ErrorWithData } from '../lib/Utils'
import { ItemProperties, ItemPropertiesUrlData } from '../lib/ItemProperties'
import { BackgroundApp } from './BackgroundApp'
import { UrlFetcher } from '../lib/UrlFetcher'

type ItemRecord = {
    refreshIntervalMs: number
    lastRefresh: Date
}

export class ItemPropertiesUrlProcessor
{
    private readonly app: BackgroundApp
    private readonly logger: Logger
    private readonly itemsUpdatedHandler: (itemsUpdated: ReadonlyArray<ItemProperties>) => void
    private readonly propertiesUrlFetcher: ItemPropertiesUrlFetcher
    private readonly items: Map<string,ItemRecord> = new Map()
    private lastMaintenance: Date = new Date()

    constructor(app: BackgroundApp, itemsUpdatedHandler: (itemsUpdated: ReadonlyArray<ItemProperties>) => void)
    {
        this.app = app
        this.logger = app.getLogger().getSubLogger('items', 'Item properties URL processing:')
        this.itemsUpdatedHandler = itemsUpdatedHandler
        this.propertiesUrlFetcher = new ItemPropertiesUrlFetcher(this.logger, app.getUrlFetcher())
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

        this.updateKnownItems()
        this.propertiesUrlFetcher.maintain()
    }

    public forgetItem(itemId: string): void
    {
        this.items.delete(itemId)
        this.propertiesUrlFetcher.forgetItem(itemId)
    }

    public async processItem(item: Readonly<ItemProperties>): Promise<ItemProperties>
    {
        const itemId: string = ItemProperties.getId(item)
        const isOwnItem = ItemProperties.getOwnerId(item) === this.app.getUserId()
        const itemPropertiesUrlData: null|ItemPropertiesUrlData = ItemProperties.getPropertiesUrlData(item)
        if (!this.isItemToBeProcessed(item, itemPropertiesUrlData)) {
            this.forgetItem(itemId)
            return item
        }

        const { propertiesUrl, pidsAllow, refreshInterval } = itemPropertiesUrlData
        const urlProperties = await this.propertiesUrlFetcher.resolveUrl(itemId, propertiesUrl, refreshInterval)
        const itemProcessed = ItemProperties.clone(item)
        for (const pid of pidsAllow) {
            const value = urlProperties[pid]
            if (is.string(value)) {
                itemProcessed[pid] = value
            }
        }

        if (isOwnItem) { // Other's items' refresh is triggered by incoming presences.
            this.items.set(itemId, {
                lastRefresh: new Date(),
                refreshIntervalMs: 1e3 * refreshInterval,
            })
        }

        this.logger.logInfo('processItem succeeded.', { item, itemProcessed })
        return itemProcessed
    }

    /**
     * Synchronous version of processItem returning the processed item if all neccessary data cached or null if not.
     */
    public getProcessedItemOrNull(item: Readonly<ItemProperties>): null|ItemProperties
    {
        const itemId: string = ItemProperties.getId(item)
        const isOwnItem = ItemProperties.getOwnerId(item) === this.app.getUserId()
        const itemPropertiesUrlData: null|ItemPropertiesUrlData = ItemProperties.getPropertiesUrlData(item)
        if (!this.isItemToBeProcessed(item, itemPropertiesUrlData)) {
            this.forgetItem(itemId)
            return item
        }

        const { propertiesUrl, pidsAllow, refreshInterval } = itemPropertiesUrlData
        const urlProperties = this.propertiesUrlFetcher.getResolvedUrlPropertiesOrNull(itemId, propertiesUrl)
        if (!urlProperties) {
            return null
        }

        const itemProcessed = ItemProperties.clone(item)
        for (const pid of pidsAllow) {
            const value = urlProperties[pid]
            if (is.string(value)) {
                itemProcessed[pid] = value
            }
        }

        if (isOwnItem) { // Other's items' refresh is triggered by incoming presences.
            this.items.set(itemId, {
                lastRefresh: new Date(),
                refreshIntervalMs: 1e3 * refreshInterval,
            })
        }

        this.logger.logInfo('processItem succeeded.', { item, itemProcessed })
        return itemProcessed
    }

    private isItemToBeProcessed(item: Readonly<ItemProperties>, itemPropertiesUrlData: null|ItemPropertiesUrlData): boolean
    {
        if (!itemPropertiesUrlData) {
            return false
        }
        const isOwnItem = ItemProperties.getOwnerId(item) === this.app.getUserId()
        if (isOwnItem) {
            return as.Bool(Config.get('backpack.PropertiesUrlProcessing.enableForOwnItems'))
        }
        return as.Bool(Config.get('backpack.PropertiesUrlProcessing.enableForOthersItems'))
    }

    private updateKnownItems(): void
    {
        const now = new Date()
        const itemsProcessing: Promise<ItemProperties>[] = []
        for (const [itemId, { lastRefresh, refreshIntervalMs }] of this.items) {
            const needsUpdate = lastRefresh.getTime() + refreshIntervalMs < now.getTime()
            if (needsUpdate) {
                try {
                    const item = this.app.getBackpack().getItem(itemId)
                    const itemProcessing = this.processItem(item).catch(_error => item)
                    itemsProcessing.push(itemProcessing)
                } catch (error) {
                    this.logger.logError('Item maintenance failed!', { itemId }, error)
                    this.forgetItem(itemId)
                }
            }
        }
        if (itemsProcessing.length === 0) {
            return
        }
        Promise.all(itemsProcessing).then(this.itemsUpdatedHandler)
    }

}

type UrlRecord = {
    propertiesUrl: string
    itemIds: Set<string>
    properties: Readonly<ItemProperties>
    isLoaded: boolean
    lastUse: Date
    lastRefresh: Date
    onUrlResolvedFuns: ((props: Readonly<ItemProperties>) => void)[]
}

class ItemPropertiesUrlFetcher
{
    private readonly logger: Logger
    private readonly urlFetcher: UrlFetcher
    private readonly urlRecordByUrl: Map<string,UrlRecord> = new Map()
    private readonly urlRecordByItem: Map<string,UrlRecord> = new Map()

    constructor(logger: Logger, urlFetcher: UrlFetcher)
    {
        this.logger = logger
        this.urlFetcher = urlFetcher
    }

    public maintain(): void
    {
        const now = new Date()
        const cacheLifetimeMs = 1e3 * as.Float(Config.get('backpack.PropertiesUrlProcessing.urlCacheLifetimeSec'), 3600)
        for (const { itemIds, lastUse, onUrlResolvedFuns } of this.urlRecordByUrl.values()) {
            const inRefresh = onUrlResolvedFuns.length !== 0
            const isOld = lastUse.getTime() + cacheLifetimeMs < now.getTime()
            if (isOld && !inRefresh) {
                itemIds.forEach(itemId => this.forgetItem(itemId))
            }
        }
    }

    public forgetItem(itemId: string): void
    {
        const itemUrlRecord = this.urlRecordByItem.get(itemId) ?? null
        if (!itemUrlRecord) {
            return
        }
        this.urlRecordByItem.delete(itemId)
        itemUrlRecord.itemIds.delete(itemId)
        if (itemUrlRecord.itemIds.size === 0) {
            this.urlRecordByUrl.delete(itemUrlRecord.propertiesUrl)
            this.callOnUrlResolvedFuns(itemUrlRecord)
        }
    }

    public resolveUrl(itemId: string, propertiesUrl: string, maxAgeSecs: number): Promise<Readonly<ItemProperties>>
    {
        const now = new Date()

        let urlRecord = this.urlRecordByUrl.get(propertiesUrl) ?? null
        if (urlRecord) {
            urlRecord.lastUse = now
        } else {
            urlRecord = {
                propertiesUrl,
                itemIds: new Set(),
                properties: {},
                isLoaded: false,
                lastUse: now,
                lastRefresh: new Date(0),
                onUrlResolvedFuns: [],
            }
            this.urlRecordByUrl.set(propertiesUrl, urlRecord)
        }
        const itemUrlRecord = this.urlRecordByItem.get(itemId) ?? null
        if (itemUrlRecord && itemUrlRecord !== urlRecord) {
            this.forgetItem(itemId)
        }
        urlRecord.itemIds.add(itemId)
        this.urlRecordByItem.set(itemId, urlRecord)

        const resultPromise = new Promise<Readonly<ItemProperties>>(resolveFun => {
            urlRecord.onUrlResolvedFuns.push(resolveFun)
        })

        const inRefresh = urlRecord.onUrlResolvedFuns.length > 1
        if (inRefresh) {
            return resultPromise
        }

        const isCurrent = urlRecord.lastRefresh.getTime() + 1e3 * maxAgeSecs > now.getTime()
        if (isCurrent) {
            this.callOnUrlResolvedFuns(urlRecord)
            return resultPromise
        }

        this.urlFetcher.fetchJson(propertiesUrl).then(props => {
            if (!is.stringsObject(props)) {
                const url = urlRecord.propertiesUrl
                throw new ErrorWithData('Received deserialized JSON is not of correct type.', { props })
            }
            this.logger.logInfo('Fetching JSON succeeded.', { record: urlRecord })
            return props
        }).catch(error => {
            this.logger.logInfo('Fetching JSON failed.', { record: urlRecord }, error)
            return {}
        }).then(props => {
            const now = new Date()
            urlRecord.properties = props
            urlRecord.isLoaded = true
            urlRecord.lastUse = now
            urlRecord.lastRefresh = now
            this.callOnUrlResolvedFuns(urlRecord)
        })
        return resultPromise
    }

    public getResolvedUrlPropertiesOrNull(itemId: string, propertiesUrl: string): null|Readonly<ItemProperties>
    {
        const urlRecord = this.urlRecordByUrl.get(propertiesUrl) ?? null
        if (!urlRecord || !urlRecord.isLoaded) {
            return null
        }
        urlRecord.lastUse = new Date()
        const itemUrlRecord = this.urlRecordByItem.get(itemId) ?? null
        if (itemUrlRecord && itemUrlRecord !== urlRecord) {
            this.forgetItem(itemId)
        }
        urlRecord.itemIds.add(itemId)
        this.urlRecordByItem.set(itemId, urlRecord)
        return urlRecord.properties
    }

    private callOnUrlResolvedFuns(record: UrlRecord): void
    {
        record.onUrlResolvedFuns.forEach(fun => fun(record.properties))
        record.onUrlResolvedFuns = []
    }

}
