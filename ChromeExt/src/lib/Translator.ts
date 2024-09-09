import { is } from './is'
import { as } from './as'
import {iter} from './Iter';
import log = require('loglevel')
import { UrlJsonFetcher } from './UrlFetcher'

interface ITranslationResponse
{
    key: string
    lang: string
    translatedText: string
    isTranslated: boolean
    timestamp: number
}

type TranslatorLanguageMapper = (key: null|string) => string

export class Translator
{

    public static mapLanguage(browserLanguage: string, languageMapper: TranslatorLanguageMapper, defaultLanguage: string): string
    {
        const language = languageMapper(browserLanguage)
        if (!is.nil(language)) {
            return language
        }

        const parts = browserLanguage.split('-', 2)
        if (parts.length === 2) {
            const language = languageMapper(parts[0])
            if (!is.nil(language)) {
                return language
            }
        }

        return defaultLanguage
    }

    public static getShortLanguageCode(language: string): string
    {
        return language.substring(0, 2)
    }

    private readonly translations: { [key: string]: string }
    private readonly translationsFetched: Set<string> = new Set()
    private readonly language: string
    private readonly translationServiceUrl: string
    private readonly urlFetcher: UrlJsonFetcher

    public constructor(translations: { [key: string]: string }, language: string, translationServiceUrl: string, urlFetcher: UrlJsonFetcher)
    {
        this.translations = translations
        this.language = language
        this.translationServiceUrl = translationServiceUrl
        this.urlFetcher = urlFetcher
    }

    public getLanguage(): string
    {
        return this.language
    }

    public translateText(key: string, defaultText?: null|string): string
    {
        const translated = this.translations[key] ?? null
        if (is.string(translated)) {
            return translated
        }
        if (is.nonEmptyString(defaultText)) {
            return defaultText
        }

        const parts = key.split('.', 2)
        if (parts.length === 2) {
            return parts[1]
        }
        return key
    }

    public translateElem(elem: HTMLElement): void
    {
        const translate: string = as.String(elem.getAttribute('data-translate'))
        if (!translate.length) {
            return
        }
        const cmds = translate.split(' ')
        for (const cmd of cmds) {
            const cmdParts = cmd.split(':')
            const what = cmdParts[0]

            switch (what) {
                case 'attr': {
                    const attrName = as.String(cmdParts[1])
                    const context = as.String(cmdParts[2])
                    const text = as.String(elem.getAttribute(attrName))
                    const key = this.getKey(context, text)
                    const applier = (translatedText: string) => elem.setAttribute(attrName, translatedText)
                    this.applyTranslation(key, applier)
                } break

                case 'text': {
                    iter(elem.childNodes).filter(childNode => childNode.nodeType === Node.TEXT_NODE).forEach(childNode => {
                        const context = as.String(cmdParts[1])
                        const text = childNode.textContent
                        const key = this.getKey(context, text)
                        const applier = (translatedText: string) => { childNode.textContent = translatedText }
                        this.applyTranslation(key, applier)
                    })
                } break

                case 'children': {
                    for (const child of elem.children) {
                        if (child instanceof HTMLElement) {
                            //log.debug('translate child', child.tagName, child.className)
                            this.translateElem(child)
                        }
                    }
                } break
            }
        }
    }

    private applyTranslation(key: string, applier: (translatedText: string) => void): void
    {
        const translatedText = this.translations[key] ?? null
        if (!is.nil(translatedText)) {
            applier(translatedText)
            return
        }
        if (this.translationsFetched.has(key) || !is.nonEmptyString(this.translationServiceUrl)) {
            return
        }
        const url = this.translationServiceUrl + '?lang=' + encodeURI(this.language) + '&key=' + encodeURI(key)
        this.urlFetcher.fetchJson(url)
            .then((response: ITranslationResponse) => {
                const { translatedText } = response
                if (!is.string(translatedText)) {
                    return
                }
                this.translationsFetched.add(key)
                if (response.isTranslated) {
                    this.translations[key] = translatedText
                }
                applier(translatedText)
            })
            .catch(error => log.info('Translator.applyTranslation: urlFetcher.fetchJson failed!', { error }))
    }

    private getKey(context: string, text: string): string
    {
        let key: string = context
        if (context.indexOf('.') < 0) {
            if (text.length) {
                key = context + '.' + text
            }
        }
        return key
    }

}
