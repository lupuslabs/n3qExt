import { is } from './is';

export class as
{
    private static readonly escapeHtml_entityMap: {[key: string]: string} = {
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

    private static StringOfminLengthOrNull(val: string, minLength: number): null|string
    {
        return val.length >= minLength ? val : null
    }

    static StringOrNull(val: unknown, minLength: number = 0): null|string
    {
        if (is.string(val)) {
            return as.StringOfminLengthOrNull(val, minLength)
        }
        if (is.number(val)) {
            return as.StringOfminLengthOrNull(String(val), minLength)
        }
        if (is.boolean(val)) {
            return as.StringOfminLengthOrNull(val ? 'true' : 'false', minLength)
        }
        return null;
    }

    public static NonEmptyStringOrNull(val: unknown): null|string {
        return as.StringOrNull(val, 1);
    }

    static String(val: unknown, alt?: string): string
    {
        return as.StringOrNull(val, 0) ?? alt ?? '';
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
        const htmlEncoded = String(res).replace(/[&<>'"\n]/g, (s) => this.escapeHtml_entityMap[s] ?? s);
        return htmlEncoded;
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

    static FlatArray<T extends Exclude<{}, Array<any>>>(converter: (e: unknown) => null|T|T[], val: unknown): T[]
    {
        if (is.nil(val)) {
            return [];
        }
        if (is.array(val)) {
            return val.flatMap(e => as.FlatArray(converter, e));
        }
        const converted = converter(val);
        if (is.nil(converted)) {
            return [];
        }
        if (is.array(converted)) {
            return converted;
        }
        return [converted];
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
