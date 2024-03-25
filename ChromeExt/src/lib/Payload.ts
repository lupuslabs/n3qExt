import { is } from './is'
import { as } from './as'
import { Utils } from './Utils';
import { ItemProperties, Pid } from './ItemProperties'

export class Payload
{
    static makeItemIframeUrl(user: string, lang: string, roomJid: null|string, participantName: null|string, itemId: string, itemProps: ItemProperties, iframeUrlTpl: string): string
    {
        const payloadOptions = { 'room': roomJid }
        if (is.nonEmptyString(roomJid)) {
            payloadOptions.room = roomJid
        }
        const tokenOptions = {
            properties: {
                [Pid.Provider]: itemProps[Pid.Provider],
                [Pid.InventoryId]: itemProps[Pid.InventoryId],
            },
        }
        const contextToken = Payload.getContextToken(user, itemId, lang, 600, payloadOptions, tokenOptions)

        //iframeUrl = 'https://jitsi.vulcan.weblin.com/{room}#userInfo.displayName="{name}"';
        //iframeUrl = 'https://jitsi.vulcan.weblin.com/8lgGTypkGd#userInfo.displayName="{name}"';
        //iframeUrl = 'https://meet.jit.si/example-103#interfaceConfig.TOOLBAR_BUTTONS=%5B%22microphone%22%2C%22camera%22%2C%22desktop%22%2C%22fullscreen%22%2C%22hangup%22%2C%22profile%22%2C%22settings%22%2C%22videoquality%22%5D&interfaceConfig.SETTINGS_SECTIONS=%5B%22devices%22%2C%22language%22%5D&interfaceConfig.TOOLBAR_ALWAYS_VISIBLE=false';
        //iframeUrl = 'https://webex.vulcan.weblin.com/Vidconf?room=weblin{room}&name={name}';
        //iframeUrl = 'https://video.weblin.io/Vidconf?room=weblin{room}&name={name}';
        const iframeUrl = iframeUrlTpl
            .replace('{context}', encodeURIComponent(contextToken))
            .replace('{room}', encodeURIComponent(as.String(roomJid)))
            .replace('{name}', encodeURIComponent(as.String(participantName)))
            .replace(/"/g, '%22')
        ;
        return iframeUrl
    }

    static getContextToken(user: string, itemId: string, lang: string, ttlSec: number, payloadOptions: {[p:string]: any}, tokenOptions: {[p:string]: any}): string
    {
        const payload = {
            'user': user,
            'item': itemId,
            'lang': lang,
            'entropy': Utils.randomString(20),
        };

        for (const key in payloadOptions) {
            payload[key] = payloadOptions[key]
        }

        // let hash = await this.getPayloadHash(api, payload);
        const hash = '_ignored'

        const token = {
            'payload': payload,
            'hash': hash
        }

        for (const key in tokenOptions) {
            token[key] = tokenOptions[key]
        }

        const tokenString = JSON.stringify(token)
        const tokenBase64Encoded = Utils.base64Encode(tokenString)
        return tokenBase64Encoded
    }
}
