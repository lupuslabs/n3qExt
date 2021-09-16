### contextToken format
    base64(
        {
            api: https://n3q-api.com/v1
            payload: {
                user: '765fgvhuz7t6ft6ftijt6fthbiit6ftbh'
                item: 'pirml6rhf5tp2go3mulhh3o'
                room: '9ca05afb1a49f26fb59642305c481661f8b370bd@muc4.virtual-presence.org'
                entropy: random
                expires: ISODate like 2020-07-08T07:30:33Z JS: Date.toISOString()
            },
            hash: sha256(systemSecret + base64(payload))
        }
    )

### developerToken format
    base64(
        {
            api: https://n3q-api.com/v1
            payload: {
                developer: "suat-theatre-tf5768gihu89z7t6ftugzuhji97t6fituljnjz6t"
                entropy: random
                expires: ISODate
            },
            hash: sha256(systemSecret + base64(payload))
        }
    )

### get payload hash
    ->  POST https://n3q-api.com/v1
        {
            method: "getPayloadHash"
            payload: {
                user: '765fgvhuz7t6ft6ftijt6fthbiit6ftbh'
                item: 'pirml6rhf5tp2go3mulhh3o'
                room: '9ca05afb1a49f26fb59642305c481661f8b370bd@muc4.virtual-presence.org'
                entropy: random
                expires: ISODate
            }
        }
    <-  response
        {
            status: "ok"
            result: sha256(systemSecret + base64(payload))
        }

### open iframe
https://theatre.weblin.sui.li/iframe.html?context=<contextToken>

### make backend api call
    ->  POST https://n3q-api.com/v1
        {
            developer: developerToken
            context: contextToken
            method: "getProperties"
            pids: [ "documentText", "documentMaxLength", "container" ]
        }
    <-  response
        {
            status: "ok",
            result: {
                documentText: "This is a text"
                documentMaxLength: 2000
                container: user-inventory-id or room-jid
            }
        }

### ItemAction:
    ->  POST https://n3q-api.com/v1
        {
            developer: developerToken
            context: contextToken
            method: "executeItemAction"
            action: "setText"
            args: {
                text: "This is a text"
            }
        }
