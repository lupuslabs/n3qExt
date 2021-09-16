import * as $ from 'jquery';
import log = require('loglevel');
import { Config } from './Config';
import { Utils } from './Utils';

interface ITranslationResponse
{
    key: string;
    lang: string;
    translatedText: string;
    isTranslated: boolean;
    timestamp: number;
}

class HtmlElementPartApplier
{
    constructor(public elem: HTMLElement, public what: string) { }
    apply(translated: string): void { }
}

class HtmlElementPartAttributeApplier extends HtmlElementPartApplier
{
    constructor(public elem: HTMLElement, public what: string, public attrName: string) { super(elem, what); }

    apply(translated: string): void
    {
        $(this.elem).attr(this.attrName, translated);
    }
}

class HtmlElementTextPartApplier extends HtmlElementPartApplier
{
    constructor(public elem: HTMLElement, public what: string) { super(elem, what); }

    apply(translated: string): void
    {
        $(this.elem).text(translated);
    }
}

interface TranslatorLanguageMapper { (key: string): string }

export class Translator
{
    translationAvailable: { [id: string]: boolean; } = {};

    static mapLanguage(browserLanguage: string, languageMapper: TranslatorLanguageMapper, defaultLanguage: string): string
    {
        let language = defaultLanguage;

        if (languageMapper(browserLanguage) != undefined) {
            language = languageMapper(browserLanguage);
        } else {
            let parts = browserLanguage.split('-', 2);
            if (parts.length == 2) {
                if (languageMapper(parts[0]) != undefined) {
                    language = languageMapper(parts[0]);
                }
            }
        }

        return language;
    }

    constructor(private translations: any, private language: string, private translationService: string)
    {
    }

    getLanguage(): string
    {
        return this.language;
    }

    static getShortLanguageCode(language: string): string
    {
        return language.substr(0, 2);
    }

    translateText(key: string, defaultText: string): string
    {
        if (this.translations[key]) {
            return this.translations[key];
        } else {
            if (defaultText) { return defaultText; }
        }

        let parts = key.split('.', 2);
        if (parts.length == 2) { return parts[1]; }
        return key;
    }

    translateElem(elem: HTMLElement): void
    {
        var translate: string = $(elem).data('translate');
        if (translate) {

            var parts = translate.split(' ');
            for (var i = 0; i < parts.length; i++) {
                var cmd = parts[i];
                var cmdParts = cmd.split(':');
                var what = cmdParts[0];
                var applier: HtmlElementPartApplier = null;

                switch (what) {
                    case 'attr':
                        var attrName = cmdParts[1];
                        var context = cmdParts[2];
                        var text = $(elem).attr(attrName);
                        var key = this.getKey(context, text);
                        applier = new HtmlElementPartAttributeApplier(elem, what, attrName);
                        break;

                    case 'text':
                        if ($(elem).children().length == 0) {
                            var context = cmdParts[1];
                            var text = $(elem).text();
                            var key = this.getKey(context, text);
                            applier = new HtmlElementTextPartApplier(elem, what);
                        }
                        break;

                    case 'children':
                        $(elem).children().each(
                            (index, child) =>
                            {
                                //log.debug('translate child', child.tagName, child.className);
                                this.translateElem(<HTMLElement>child);
                            });
                        break;
                }

                if (applier != null) {
                    if (this.translations[key]) {
                        this.translationAvailable[key] = true;
                        this.applyTranslation(applier, this.translations[key], true);
                    } else {
                        if (this.translationAvailable[key] == undefined) {
                            if (this.translationService != undefined && this.translationService != null && this.translationService != '') {
                                var url = this.translationService + '?lang=' + encodeURI(this.language) + '&key=' + encodeURI(key);
                                jQuery.getJSON(url, data =>
                                {
                                    if (data.translatedText) {
                                        var response: ITranslationResponse = <ITranslationResponse>data;
                                        this.translationAvailable[key] = response.isTranslated;
                                        if (response.isTranslated) {
                                            this.translations[key] = response.translatedText;
                                        }
                                        this.applyTranslation(applier, response.translatedText, response.isTranslated);
                                    }
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    getKey(context: string, text: string): string
    {
        let key: string = context;
        if (context.indexOf('.') < 0) {
            if (text != undefined && text != null && text != '') {
                key = context + '.' + text;
            }
        }
        return key;
    }

    applyTranslation(applier: HtmlElementPartApplier, translatedText: string, isTranslated: boolean): void
    {
        applier.apply(translatedText);

        if (isTranslated) {
            var ontranslate: string = $(applier.elem).data('ontranslate');
            if (ontranslate != null) {
                var sepIndex = ontranslate.indexOf(':');
                var what = ontranslate.substr(0, sepIndex);
                var detail = ontranslate.substr(sepIndex + 1);

                switch (what) {
                    case 'show':
                        var selector = detail;
                        $(selector).removeClass('n3q-dim');//$(selector).toggle(true);
                        break;

                    case 'eval':
                        var code = detail;
                        eval(code);
                        break;

                }
            }
        }
    }
}
