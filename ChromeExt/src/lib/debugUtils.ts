export namespace DebugUitils
{

    export function escapeForVisibility(str: string): string
    {
        return str.replace(new RegExp('[^' // Allow list.
            + '\u0020-\u005B\u005D-\u007F' // ASCII space and non-white ASCII except backslash.
            + '\u00A1-\u00FF' // Non-white Latin 1 Supplement.
            + ']', 'g'), escapeCp)
    }

    export function escapeCp(cp: string): string
    {
        switch (cp) {
            case '\\': return '\\\\'
            case '\r': return '\\r'
            case '\n': return '\\n'
            default: return '\\u' + cp.charCodeAt(0).toString(16).padStart(4, '0')
        }
    }

}
