import log = require('loglevel')
import { ErrorWithData, Utils } from './Utils'
import { BackgroundMessage } from './BackgroundMessage'

type ResponseCacheItem = {
    response: Response,
    blob: Blob,
    responseTimeSecs: number,
}

type FetchRequestsItem = {
    resolve: (blob: Blob) => void,
    reject: (error: any) => void,
}

export interface UrlAsTextFetcher
{
    fetchAsText(url: string, version: string): Promise<string>
}

export interface UrlAsDataUrlFetcher
{
    fetchAsDataUrl(url: string, version: string): Promise<string>
}

export interface UrlJsonFetcher
{
    fetchJson(url: string): Promise<any>
}

export interface UrlFetcher extends UrlAsTextFetcher, UrlAsDataUrlFetcher, UrlJsonFetcher { }

export class DirectUrlFetcher implements UrlFetcher
{

    private readonly responseCache: Map<string,ResponseCacheItem> = new Map()
    private readonly fetchRequests: Map<string,Array<FetchRequestsItem>> = new Map()
    private cacheLifetimeSecs: number = 0
    private maintenanceIntervalSecs: number = 0
    private lastMaintenanceTimeSecs: number = 0

    public constructor() { }

    public setCacheLifetimeSecs(cacheLifetimeSecs: number): void
    {
        this.cacheLifetimeSecs = cacheLifetimeSecs
    }

    public setMaintenanceIntervalSecs(maintenanceIntervalSecs: number): void
    {
        this.maintenanceIntervalSecs = maintenanceIntervalSecs
    }

    public maintain(): void
    {
        const nowTimeSecs = Date.now() / 1000
        if (nowTimeSecs - this.lastMaintenanceTimeSecs > this.maintenanceIntervalSecs) {
            if (Utils.logChannel('backgroundFetchUrlCache', true)) { log.info('BackgroundApp.maintainHttpCache') }
            for (const [key, {responseTimeSecs}] of this.responseCache) {
                if (nowTimeSecs - responseTimeSecs > this.cacheLifetimeSecs) {
                    if (Utils.logChannel('backgroundFetchUrlCache', true)) {
                        log.info('UrlFetcher.maintain', (nowTimeSecs - responseTimeSecs), 'sec', 'delete', key)
                    }
                    this.responseCache.delete(key)
                }
            }
            this.lastMaintenanceTimeSecs = nowTimeSecs
        }
    }

    public async fetchAsText(url: string, version: string): Promise<string>
    {
        const blob = await this.fetchAsBlob(url, version)
        const fileReader = new FileReader()
        let text: string;
        try {
            fileReader.readAsText(blob)
            text = await new Promise<string>(resolve => {
                fileReader.onload = event => {
                    resolve(<string>event.target.result); // readAsDataURL always provides a string.
                }
            })
        } catch (error) {
            const msg = 'UrlFetcher.fetchAsText: Blob decoding failed!';
            throw new ErrorWithData(msg, { error })
        }
        return text
    }

    public async fetchAsDataUrl(url: string, version: string): Promise<string>
    {
        const blob = await this.fetchAsBlob(url, version)
        const fileReader = new FileReader()
        let dataUrl: string;
        try {
            fileReader.readAsDataURL(blob)
            dataUrl = await new Promise<string>(resolve => {
                fileReader.onload = event => {
                    resolve(<string>event.target.result); // readAsDataURL always provides a string.
                }
            })
        } catch (error) {
            const msg = 'UrlFetcher.fetchAsDataUrl: Blob decoding failed!';
            throw new ErrorWithData(msg, { error })
        }
        return dataUrl
    }

    public async fetchJson(url: string): Promise<any>
    {
        const json = await this.fetchAsText(url, '_nocache')
        let data: any
        try {
            data = JSON.parse(json)
        } catch (error) {
            const msg = 'UrlFetcher.fetchJson: JSON decoding failed!';
            throw new ErrorWithData(msg, { error })
        }
        return data
    }

    public fetchAsBlob(url: string, version: string): Promise<Blob>
    {
        this.maintain()
        return new Promise<Blob>((resolve, reject) => {
            const key = version + url

            const cachedEntry = version === '_nocache' ? null : this.responseCache.get(key)
            if (cachedEntry) {
                resolve(cachedEntry.blob)
                return
            }

            if (Utils.logChannel('backgroundFetchUrlCache', true)) {
                log.info('UrlFetcher.fetchAsBlob', 'not-cached', url, 'version=', version)
            }

            const requests = this.fetchRequests.get(key) ?? []
            const triggerFetch = requests.length === 0
            requests.push({resolve, reject})
            this.fetchRequests.set(key, requests)

            if (triggerFetch) {
                this.doFetch(key, url, version)
            }
        })
    }

    private doFetch(key: string, url: string, version: string): void
    {
        (async () => {

            let response: Response
            try {
                response = await fetch(url, { cache: 'reload' })
            } catch (error) {
                const msg = 'UrlFetcher.doFetch: fetch failed!'
                throw new ErrorWithData(msg, { error })
            }
            if (!response.ok) {
                const msg = 'UrlFetcher.doFetch: Fetch resulted in error response.'
                throw new ErrorWithData(msg, { response })
            }

            let blob: Blob
            try {
                blob = await response.blob()
            } catch (error) {
                const msg = 'UrlFetcher.doFetch: text retrieval failed!'
                throw new ErrorWithData(msg, { response })
            }

            if (version !== '_nocache') {
                let responseTimeSecs = blob.size === 0
                    ? 0 // Empty response is to be deleted on next maintenance.
                    : Date.now() / 1000 // Nonempty response is to be deleted after configured cache timeout.
                this.responseCache.set(key, {response, blob, responseTimeSecs})
            }

            if (Utils.logChannel('backgroundFetchUrl', true)) {
                log.info('UrlFetcher.doFetch', 'response', url, blob.size, response)
            }
            for (const {resolve} of this.fetchRequests.get(key) ?? []) {
                resolve(blob)
            }

        })().catch(error => {
            log.debug('UrlFetcher.doFetch', 'exception', url, error)
            for (const {reject} of this.fetchRequests.get(key) ?? []) {
                reject(error)
            }
        }).finally(() => {
            this.fetchRequests.delete(key)
        })
    }

}

export class BackgroundMessageUrlFetcher implements UrlFetcher
{

    public constructor() {}

    public fetchAsText(url: string, version: string): Promise<string>
    {
        return BackgroundMessage.fetchUrlAsText(url, version)
    }

    public fetchAsDataUrl(url: string, version: string): Promise<string>
    {
        return BackgroundMessage.fetchUrlAsDataUrl(url, version)
    }

    public fetchJson(url: string): Promise<any>
    {
        return BackgroundMessage.fetchUrlJson(url)
    }

}
