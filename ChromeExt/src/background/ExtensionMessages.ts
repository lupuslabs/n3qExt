import { is } from '../lib/is'

export namespace ExtensionMessage {

    export type ExtensionTheme = {
        name: string
        css: string
    }

    export const type_ExtensionThemesNotification = 'ExtensionThemesNotification'

    export const type_ExtensionThemesRequest = 'ExtensionThemesRequest'

    export function isExtensionTheme(val: unknown): val is ExtensionTheme
    {
        return is.object(val) && is.string(val['name']) && is.string(val['css'])
    }

}
