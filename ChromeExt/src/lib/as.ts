import { is } from './is';

export class as
{
    private static readonly escapeHtml_entityMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '\'': '&#39;',
        '"': '&quot;',
        '\n': '<br/>',
    };

    static Bool(val: unknown, alt?: boolean): boolean
    {
        let res = alt ?? false;
        try {
            if (is.boolean(val)) {
                res = val;
            } else {
                if (is.string(val)) {
                    res = val === 'true' || val === 'True' || val === 'TRUE'
                        || val === '1' || val === 'yes';
                } else {
                    if (is.number(val)) {
                        res = val >= 1;
                    }
                }
            }
        } catch (error) {
            // alt
        }
        return res;
    }

    static String(val: unknown, alt?: string): string
    {
        let res = alt ?? '';
        try {
            if (is.string(val)) {
                res = val;
            } else {
                if (is.number(val)) {
                    res = '' + val;
                } else {
                    if (is.boolean(val)) {
                        res = val ? 'true' : 'false';
                    }
                }
            }
        } catch (error) {
            // alt
        }
        return res;
    }

    static IntOrNull(val: unknown): null|number
    {
        const valFloat = as.FloatOrNull(val);
        return is.nil(valFloat) ? null : Math.round(valFloat);
    }

    static Int(val: unknown, alt?: number): number
    {
        return Math.round(as.Float(val, alt));
    }

    static FloatOrNull(val: unknown): null|number
    {
        if (is.float(val)) {
            return val;
        }
        if (is.string(val)) {
            try {
                const result = parseFloat(val);
                if (isNaN(result)) {
                    return null;
                }
                return result;
            } catch (error) {
                return null;
            }
        }
        return null;
    }

    static Float(val: unknown, alt?: number): number
    {
        return as.FloatOrNull(val) ?? alt ?? 0.0;
    }

    static Html(val: unknown, alt?: string): string
    {
        const res = as.String(val, alt);
        const htmlEncoded = String(res).replace(/[&<>'"\n]/g, (s) => this.escapeHtml_entityMap[s]);
        return htmlEncoded;
    }

    static HtmlWithClickableLinks(val: unknown, alt?: string): string
    {
        const html = as.Html(val, alt);
        const clickableEncoded = as.makeLinksClickable(html);
        return clickableEncoded;
    }

    static makeLinksClickable(text): string
    {
        const urlRegex = /(https?:\/\/[^\s]+|www\.[^. ]+\.[^ ]+|[^. ]+\.(com|org|net|[a-z]{2}))/g;
        return text.replace(urlRegex, url =>
        {
            let navigateUrl = url;
            if (navigateUrl.startsWith('http://') || navigateUrl.startsWith('https://')) {
                //
            } else {
                navigateUrl = 'http://' + url;
            }
            return '<a href="' + navigateUrl + '" target="_blank">' + url + '</a>';
        });
    }

    static HtmlLink(val: unknown, text?: string, urlFilter?: (s: string) => string, alt?: string, target?: string): string
    {
        let res = as.String(val, alt);
        if (urlFilter == null) {
            urlFilter = (s => s.substr(0, 4) === 'http' ? s : '');
        }
        const url = urlFilter(res);
        if (as.String(url) !== '') {
            text = text ?? '';
            if (text === '') {
                text = url;
            }
            res = '<a href="' + as.Html(url) + '"' + (target ? ' target=' + target : '')+ '>' + as.Html(text) + '</a>'
        }
        return res;
    }

    // static Object(val: any, alt?: any): any
    // {
    //     var res = alt ?? {};
    //     var obj = as.String(val, '{}');
    //     try {
    //         res = JSON.parse(obj);
    //     } catch (exception) {
    //         //
    //     }
    //     return obj;
    // }
}
