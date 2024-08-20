import { is } from './is'

export namespace ThemeUtils {

    const ThemeSourceExtensionTypeValue = 'extension'
    const ThemeSourceUserTypeValue = 'user'
    export type ThemeSourceType = typeof ThemeSourceExtensionTypeValue | typeof ThemeSourceUserTypeValue

    const sourceTypeOrderValues: { [p in ThemeSourceType]: number } = {
        [ThemeSourceExtensionTypeValue]: 1,
        [ThemeSourceUserTypeValue]: 2,
    }

    export function isThemeSourceType(val: unknown): val is ThemeSourceType
    {
        return is.string(val) && is.float(sourceTypeOrderValues[val])
    }

    export type Theme = {
        id: string
        name: string
        orderIndex: number
        sourceType: ThemeSourceType
        sourceId: string
        isEnabled: boolean
        css: string
    }

    export function isTheme(val: unknown): val is Theme
    {
        return is.object(val)
            && is.string(val['id']) && is.string(val['name']) && is.number(val['orderIndex'])
            && isThemeSourceType(val['sourceType']) && is.string(val['sourceId'])
            && is.boolean(val['isEnabled'])
            && is.string(val['css'])
    }

    export function cmpTheme(theme1: Theme, theme2: Theme): number
    {
        const sourceTypeDiff = sourceTypeOrderValues[theme1.sourceType] - sourceTypeOrderValues[theme2.sourceType]
        if (sourceTypeDiff !== 0) {
            return sourceTypeDiff
        }
        if (theme1.sourceId !== theme2.sourceId) {
            return theme1.sourceId < theme2.sourceId ? -1 : 1
        }
        const orderindexDiff = theme1.orderIndex - theme2.orderIndex
        if (orderindexDiff !== 0) {
            return orderindexDiff
        }
        return theme1.name < theme2.name ? -1 : 1
    }

}
