import { expect } from 'chai';
import { Translator } from '../lib/Translator';

export class TestTranslator
{
    mapLanguage_typical_DE()
    {
        let language = Translator.mapLanguage('de-DE', lang => { return { 'de-DE': 'de-DE', 'de': 'de-DE' }[lang]; }, 'en-US');
        expect(language).to.equal('de-DE');
    }

    mapLanguage_CH()
    {
        let language = Translator.mapLanguage('de-CH', lang => { return { 'de-DE': 'de-DE', 'de': 'de-DE' }[lang]; }, 'en-US');
        expect(language).to.equal('de-DE');
    }

    mapLanguage_unknown()
    {
        let language = Translator.mapLanguage('ab-CD', lang => { return { 'de-DE': 'de-DE', 'de': 'de-DE' }[lang]; }, 'en-US');
        expect(language).to.equal('en-US');
    }

    mapLanguage_US()
    {
        let language = Translator.mapLanguage('en-US', lang => { return { 'de-DE': 'de-DE', 'de': 'de-DE' }[lang]; }, 'en-US');
        expect(language).to.equal('en-US');
    }

    mapLanguage_GB()
    {
        let language = Translator.mapLanguage('en-GB', lang => { return { 'de-DE': 'de-DE', 'de': 'de-DE' }[lang]; }, 'en-US');
        expect(language).to.equal('en-US');
    }
}