import { expect } from 'chai';
import { DomUtils } from '../lib/DomUtils'

export class TestUrlRe
{
    schemaUrlsPure()
    {
        const texts = [
            'http://example.com',
            'http://example.com/',
            'http://example.com/about/contact/',
            'http://ßßßßßß.de',
            'http://123-example.com',
            'http://ßub.example.com',
            'http://sub.sub.example.com',
            'http://नमस्ते.नेत',
            'http://user@example.com',
            'http://192.168.1.1',
            'http://192.168.1.1/',
            'http://192.168.1.1:8080/sdfasdf.php?sfsdf=rgdfg%20asd&dfdf=fff#Ö',
            'http://[2001:db8:85a3:0:0:8a2e:370:7334]',
            'http://[2001:db8:85a3:0:0:8a2e:370:7334]/',
            'http://[2001:db8:85a3:0:0:8a2e:370:7334]/path',
            'http://example.com:8080/',
            'http://user:password@example.com',
            'http://example.com/path%20with%20spaces',
            'http://example.com?param=value',
            'http://example.com#fragment',
            'http://ExAmPlE.com',
            'http://123.example.com',
            'http://नमस्ते.नेत',
            'http://مرحبا.ملاحظات',
            'http://مرحبا.ملاحظات/path/',
            'http://example.com/path?param=value',
            'http://example.com/path?param1=value1&param2=value2',
            'http://example.com/path?param=ßßßßßß',
            'http://ßßßßßß.de?param=ßßßßßß',
            'http://example.com#section',
            'http://example.com/path#this-is-a-very-long-hash-test-to-see-if-it-matches',
            'http://example.com/path?param=value#section',
        ]
        texts
            .forEach(text => expect(text.match(DomUtils.urlRe)).to.deep.equal([text]))
        texts
            .map(text => 'https' + text.substring(4))
            .forEach(text => expect(text.match(DomUtils.urlRe)).to.deep.equal([text]))
    }

    nonSchemaUrlsPure()
    {
        const texts = [
            'example.com',
            'example.com/',
            'example.com/about/contact/',
            'ßßßßßß.de',
            '123-example.com',
            'ßub.example.com',
            'sub.sub.example.com',
            'नमस्ते.नेत',
            'example.com:8080/',
            'example.com/path%20with%20spaces',
            'example.com?param=value',
            'example.com#fragment',
            'ExAmPlE.com',
            '123.example.com',
            'नमस्ते.नेत',
            'example.com/path?param=value',
            'example.com/path?param1=value1&param2=value2',
            'example.com/path?param=ßßßßßß',
            'ßßßßßß.de?param=ßßßßßß',
            'example.com#section',
            'example.com/path#this-is-a-very-long-hash-test-to-see-if-it-matches',
            'example.com/path?param=value#section',
        ]
        texts
            .forEach(text => expect(text.match(DomUtils.urlRe)).to.deep.equal([text]))
        texts
            .map(text => 'https' + text.substring(4))
            .forEach(text => expect(text.match(DomUtils.urlRe)).to.deep.equal([text]))
    }

    partialUrlText()
    {
        Object.entries({
            'user@example.com': 'example.com',
        }).forEach(([text, match]) => expect(text.match(DomUtils.urlRe)).to.deep.equal([match]))
    }

    nonUrlText()
    {
        [
            'The quick brown fox jumps over the lazy dog.',
            '1.3.3',
            '13.31.33',
            'v1.3.3',
            'v13.31.31',
            'a.b.c.d',
            '456.56',
        ].forEach(text => expect(text.match(DomUtils.urlRe)).to.equal(null))
    }
}
