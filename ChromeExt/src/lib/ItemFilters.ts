import { is } from './is'
import { as } from './as'
import { Iter } from './Iter'
import { ErrorWithData } from './Utils'
import { ItemProperties } from './ItemProperties'

export namespace ItemFilters {

    // Public

    export interface ItemFilter
    {
        getId(): string
        getIconUrl(): string
        getLabelText(language: string): string
        getHelpText(language: string): string
        isMatchingItem(item: ItemProperties): boolean
    }

    export function parseItemFilter(filterDef: unknown): ItemFilter
    {
        if (!is.object(filterDef)) {
            throw new ErrorWithData('Itemfilter.Parser.parseItemFilter: filterDef isn\'t an object!', { filterDef })
        }
        try {
            const id = parseString(filterDef, 'id')
            const iconUrl = parseStringOrNull(filterDef, 'iconUrl')
            const labelTexts = parseLangTexts(filterDef, 'labelTexts', false)
            const helpTexts = parseLangTexts(filterDef, 'helpTexts', true)
            const rule = parseRule(filterDef['rule'])
            return new BasicItemFilter(id, iconUrl, labelTexts, helpTexts, rule)
        } catch (error) {
            error['filterDef'] = filterDef
            throw error
        }
    }

    export function parseItemFilters(filtersDef: unknown): ItemFilter[]
    {
        if (!is.array(filtersDef)) {
            throw new ErrorWithData('Itemfilter.Parser.parseItemFilters: filtersDef isn\'t an array!', { filtersDef })
        }
        return filtersDef.map(parseItemFilter)
    }

    export function parseRule(ruleDef: unknown): (item: ItemProperties) => boolean
    {
        if (!is.object(ruleDef)) {
            throw new ErrorWithData(`ItemFilter.Parser.parseRule: Invalid rule!`, { ruleDef })
        }
        switch (ruleDef['type']) {
            case 'any': return parseAnyRule(ruleDef)
            case 'propertyIsTrue': return parsePropertyIsTrueRule(ruleDef)
            case 'propertyIsNotEmpty': return parsePropertyIsNotEmptyRule(ruleDef)
            case 'propertyStringValueIsOneOf': return parsePropertyStringValueIsOneOfRule(ruleDef)
            case 'not': return parseNotRule(ruleDef)
            case 'or': return parseOrRule(ruleDef)
            default: throw new ErrorWithData(`ItemFilter.Parser.parseRule: Unknown rule type!`, { ruleDef })
        }
    }

    // Private

    function parseString(filterDef: {[p:string]:unknown}, name: string): string
    {
        const value = filterDef[name] ?? null
        if (!is.string(value) || value.length === 0) {
            throw new Error(`Itemfilter.Parser.parseString: filterDef.${name} invalid!`)
        }
        return value
    }

    function parseStringOrNull(filterDef: {[p:string]:unknown}, name: string): null|string
    {
        const value = filterDef[name] ?? ''
        if (!is.string(value)) {
            throw new Error(`Itemfilter.Parser.parseString: filterDef.${name} invalid!`)
        }
        return value.length === 0 ? null : value
    }

    function parseLangTexts(filterDef: {[p:string]:unknown}, name: string, allowEmpty: boolean): Map<string,string>
    {
        const texts = new Map<string,string>
        const textsDef = filterDef[name] ?? null
        if (allowEmpty && is.nil(textsDef)) {
            return texts
        }
        if (!is.object(textsDef)) {
            throw new Error(`ItemFilter.Parser.parseLangTexts: filterDef.${name} invalid!`)
        }
        for (let [language, text] of Object.entries(textsDef)) {
            text ??= ''
            if (!is.string(text) || (!allowEmpty && text.length === 0)) {
                throw new Error(`ItemFilter.Parser.parseLangTexts: filterDef.${name}[${language}] invalid!`)
            }
            texts.set(language, text)
        }
        return texts
    }

    function parseAnyRule(ruleDef: {[p:string]:unknown}): (item: ItemProperties) => boolean
    {
        return (item) => true
    }

    function parsePropertyIsTrueRule(ruleDef: {[p:string]:unknown}): (item: ItemProperties) => boolean
    {
        const propertyId = parseRulePropertyId(ruleDef)
        return (item) => as.Bool(item[propertyId])
    }

    function parsePropertyIsNotEmptyRule(ruleDef: {[p:string]:unknown}): (item: ItemProperties) => boolean
    {
        const propertyId = parseRulePropertyId(ruleDef)
        return (item) => (item[propertyId] ?? '').length !== 0
    }

    function parsePropertyStringValueIsOneOfRule(ruleDef: {[p:string]:unknown}): (item: ItemProperties) => boolean
    {
        const propertyId = parseRulePropertyId(ruleDef)
        const values = parseRulePropertyStringValues(ruleDef)
        return (item) => values.indexOf(item[propertyId] ?? '') !== -1
    }

    function parseNotRule(ruleDef: {[p:string]:unknown}): (item: ItemProperties) => boolean
    {
        const rule = parseRule(ruleDef['rule'])
        return (item) => !rule(item)
    }

    function parseOrRule(ruleDef: {[p:string]:unknown}): (item: ItemProperties) => boolean
    {
        const rules = parseRuleRules(ruleDef)
        return (item) => rules.some(rule => rule(item))
    }

    function parseRulePropertyId(ruleDef: {[p:string]:unknown}): string
    {
        const propertyId = ruleDef['property']
        if (!is.string(propertyId) || propertyId.length === 0) {
            throw new ErrorWithData(`ItemFilter.Parser.parseRulePropertyId: ruleDef.property invalid!`, { ruleDef })
        }
        return propertyId
    }

    function parseRulePropertyStringValues(ruleDef: {[p:string]:unknown}): string[]
    {
        const values = ruleDef['values']
        if (!is.array(values, is.string)) {
            throw new ErrorWithData(`ItemFilter.Parser.parseRulePropertyId: ruleDef.values invalid!`, { ruleDef })
        }
        return values
    }

    function parseRuleRules(ruleDef: {[p:string]:unknown}): ((item: ItemProperties) => boolean)[]
    {
        const ruleDefs = ruleDef['rules']
        if (!is.array(ruleDefs)) {
            throw new ErrorWithData(`ItemFilter.Parser.parseRulePropertyId: ruleDef.values invalid!`, { ruleDef })
        }
        return ruleDefs.map(parseRule)
    }

    class BasicItemFilter implements ItemFilter
    {
        protected readonly id: string
        protected readonly iconUrl: null|string
        protected readonly labels: Map<string,string>
        protected readonly helpTexts: Map<string,string>
        protected readonly matchFun: (item: ItemProperties) => boolean

        public constructor(id: string, iconUrl: null|string, labels: Map<string,string>, helpTexts: Map<string,string>, matchFun: (item: ItemProperties) => boolean) {
            this.id = id
            this.iconUrl = iconUrl
            this.labels = labels
            this.helpTexts = helpTexts
            this.matchFun = matchFun
        }

        getId(): string {
            return this.id
        }

        getIconUrl(): string {
            return this.iconUrl
        }

        getLabelText(language: string): string {
            return this.getLangText(this.labels, language)
        }

        getHelpText(language: string): string {
            return this.getLangText(this.helpTexts, language)
        }

        isMatchingItem(item: ItemProperties): boolean {
            return (this.matchFun)(item)
        }

        protected getLangText(langTexts: Map<string,string>, language: string): string
        {
            return langTexts.get(language) ?? langTexts.get('en-US') ?? Iter.next(langTexts.values()) ?? ''
        }

    }

}
