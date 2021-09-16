export class as
{
    private static readonly escapeHtml_entityMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '\'': '&quot;',
        '"': '&#39;',
        '\n': '<br/>',
    }

    private static readonly typeBoolean: string = typeof true;
    private static readonly typeString: string = typeof '';
    private static readonly typeNumber: string = typeof 1;

    static Bool(val: any, alt?: boolean): boolean
    {
        var res = alt ?? false;
        try {
            if (typeof val === this.typeBoolean) {
                res = val;
            } else {
                if (typeof val === this.typeString) {
                    if (val == 'true' || val == 'True' || val == 'TRUE' || val == '1' || val == 'yes') {
                        res = true;
                    } else { res = false; }
                } else {
                    if (typeof val === this.typeNumber) {
                        if (val >= 1) {
                            res = true;
                        } else { res = false; }
                    }
                }
            }
        } catch (error) {
            // alt
        }
        return res;
    }

    static String(val: any, alt?: string): string
    {
        var res = alt ?? '';
        try {
            if (typeof val === this.typeString) {
                res = val;
            } else {
                if (typeof val === this.typeNumber) {
                    res = '' + val;
                } else {
                    if (typeof val === this.typeBoolean) {
                        res = val ? 'true' : 'false';
                    }
                }
            }
        } catch (error) {
            // alt
        }
        return res;
    }

    static Int(val: any, alt?: number): number
    {
        var res = alt ?? 0;
        try {
            if (typeof val === this.typeNumber) {
                res = Math.round(val);
            } else {
                if (typeof val === this.typeString) {
                    res = parseInt(val);
                    if (isNaN(res)) {
                        res = alt ?? 0;
                    }
                }
            }
        } catch (error) {
            // alt
        }
        return res;
    }

    static Float(val: any, alt?: number): number
    {
        var res = alt ?? 0.0;
        try {
            if (typeof val === this.typeNumber) {
                res = val;
            } else {
                if (typeof val === this.typeString) {
                    res = parseFloat(val);
                    if (isNaN(res)) {
                        res = alt ?? 0;
                    }
                }
            }
        } catch (error) {
            // alt
        }
        return res;
    }

    static Html(val: any, alt?: string): string
    {
        let res = as.String(val, alt);
        let htmlEncoded = String(res).replace(/[&<>'"\n]/g, (s) => this.escapeHtml_entityMap[s]);
        return htmlEncoded;
    }

    static HtmlWithClickableLinks(val: any, alt?: string): string
    {
        let html = as.Html(val, alt);
        let clickableEncoded = as.makeLinksClickable(html);
        return clickableEncoded;
    }

    static makeLinksClickable(text): string
    {
        var urlRegex = /(https?:\/\/[^\s]+|www\.[^. ]+\.[^ ]+|[^. ]+\.(com|org|net|[a-z]{2}))/g;
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

    static HtmlLink(val: any, text?: string, urlFilter?: (s: string) => string, alt?: string): string
    {
        var res = as.String(val, alt);
        if (urlFilter == null) {
            urlFilter = (s => s.substr(0, 4) == 'http' ? s : '');
        }
        var url = urlFilter(res);
        if (as.String(url) != '') {
            if (text == '') {
                text = url;
            }
            res = '<a href="' + as.Html(url) + '">' + as.Html(text) + '</a>'
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
