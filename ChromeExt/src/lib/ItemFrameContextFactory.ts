import { ItemProperties } from './ItemProperties'
import { Utils } from './Utils';
import { CryptoUtils } from './CryptoUtils'

export class ItemFrameContextFactory
{
    private userId: string = ''
    #userToken: Uint8Array = new Uint8Array([0])
    private languageId: string = ''

    public constructor() {}

    public setUserId(userId: string): void {
        this.userId = userId
    }

    public setUserToken(userToken: string): void {
        this.#userToken = new TextEncoder().encode(userToken)
    }

    public setLanguageId(languageId: string): void {
        this.languageId = languageId
    }

    public makeItemIframeUrl(roomId: string, itemProps: ItemProperties, iframeUrlTpl: string): string {
        const contextToken = this.getContextToken(roomId, itemProps)
        const iframeUrl = iframeUrlTpl
            .replace('{context}', encodeURIComponent(contextToken))
            .replace(/"/g, '%22')
        ;
        return iframeUrl
    }

    public getContextToken(roomId: string, itemProps: ItemProperties): string {
        const protocolVersion = '2'
        const {userId, languageId} = this
        const providerId = ItemProperties.getProviderId(itemProps)
        const inventoryId = ItemProperties.getInventoryId(itemProps)
        const itemId = ItemProperties.getId(itemProps)
        const entropy = Utils.randomString(20)
        const token = {protocolVersion, userId, languageId, roomId, providerId, inventoryId, itemId, entropy}

        const hash = this.calcHash(token)
        token['signature'] = CryptoUtils.signStringHmacSha256(this.#userToken, hash)

        const tokenString = JSON.stringify(token)
        const tokenBase64Encoded = Utils.base64Encode(tokenString)
        return tokenBase64Encoded
    }

    private calcHash(values: {[p:string]:string}): string {
        const hashMaker = CryptoUtils.getSha256Hasher()
        const cmpFun = (a: [string, string], b: [string, string]): number => {
            return a[0].localeCompare(b[0], 'en-US-u-co-unicode', { sensitivity: 'variant', numeric: false })
        }
        const separatorBuffer = new Uint8Array([0])
        for (const [key, value] of [...Object.entries(values)].sort(cmpFun)) {
            hashMaker.update(new TextEncoder().encode(key))
            hashMaker.update(separatorBuffer)
            hashMaker.update(new TextEncoder().encode(value))
            hashMaker.update(separatorBuffer)
        }
        const hash = hashMaker.digest().toHex()
        return hash;
    }
}
