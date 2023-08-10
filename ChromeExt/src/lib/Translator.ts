import { is } from './is'
import { as } from './as'
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

abstract class HtmlElementPartApplier
{
    constructor(public elem: HTMLElement, public what: string) { }
    apply(translated: string): void { }
}

class HtmlElementPartAttributeApplier extends HtmlElementPartApplier
{
    constructor(public elem: HTMLElement, public what: string, public attrName: string) { super(elem, what) }

    apply(translated: string): void
    {
        this.elem.setAttribute(this.attrName, translated)
    }
}

class HtmlElementTextPartApplier extends HtmlElementPartApplier
{
    constructor(public elem: HTMLElement, public what: string) { super(elem, what) }

    apply(translated: string): void
    {
        this.elem.innerText = translated
    }
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

    private readonly translations: { [key: string]: any }
    private readonly translationAvailable: { [id: string]: boolean } = {}
    private readonly language: string
    private readonly translationServiceUrl: string
    private readonly urlFetcher: UrlJsonFetcher

    public constructor(translations: { [key: string]: any }, language: string, translationServiceUrl: string, urlFetcher: UrlJsonFetcher)
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

    public translateText(key: string, defaultText: string): string
    {
        if (this.translations[key]) {
            return this.translations[key]
        } else {
            if (defaultText) { return defaultText }
        }

        let parts = key.split('.', 2)
        if (parts.length === 2) { return parts[1] }
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
            let applier: HtmlElementPartApplier = null
            let key: string

            switch (what) {
                case 'attr': {
                    const attrName = as.String(cmdParts[1])
                    const context = as.String(cmdParts[2])
                    const text = as.String(elem.getAttribute(attrName))
                    key = this.getKey(context, text)
                    applier = new HtmlElementPartAttributeApplier(elem, what, attrName)
                    this.applyTranslation(key, applier)
                } break

                case 'text': {
                    if (!elem.children.length) {
                        const context = as.String(cmdParts[1])
                        const text = elem.innerText
                        key = this.getKey(context, text)
                        applier = new HtmlElementTextPartApplier(elem, what)
                        this.applyTranslation(key, applier)
                    }
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

    private applyTranslation(key: string, applier: HtmlElementPartApplier): void
    {
        if (this.translations[key] || this.translations[key] === '') {
            this.translationAvailable[key] = true
            applier.apply(this.translations[key])
        } else if (is.nil(this.translationAvailable[key]) && !is.nil(this.translationServiceUrl) && this.translationServiceUrl.length) {
            const url = this.translationServiceUrl + '?lang=' + encodeURI(this.language) + '&key=' + encodeURI(key)
            this.urlFetcher.fetchJson(url)
                .then((response: ITranslationResponse) => {
                    if (!response.translatedText) {
                        return
                    }
                    this.translationAvailable[key] = response.isTranslated
                    if (response.isTranslated) {
                        this.translations[key] = response.translatedText
                    }
                    applier.apply(response.translatedText)
                })
                .catch(error => {
                    log.info('Translator.applyTranslation: urlFetcher.fetchJson failed!', { error })
                })
        }
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
