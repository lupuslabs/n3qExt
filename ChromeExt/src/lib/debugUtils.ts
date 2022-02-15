import { is } from './is';
import { as } from './as';

// Tools for debugging, generating debug output, and code instrumentation.

export abstract class ErrorWithDataBase extends Error
{
    public readonly data?: {[p: string]: unknown};
    
    protected constructor(
        msg: string,
        data?: {[p: string]: unknown},
    ) {
        super(msg);
        this.data = prepareValueForLog(data ?? {});
    }
}

export function prepareValueForLog(value: {[p: string]: unknown}): {[p: string]: unknown};
export function prepareValueForLog(value: unknown): unknown;
export function prepareValueForLog(value: unknown, prop:string, valPath: unknown[]): unknown;
export function prepareValueForLog(value: unknown, prop:string = '', valPath: unknown[] = []): unknown {
    if (!is.object(value)) {
        return value;
    }
    if (valPath.length > 10) {
        return '<<<max depth>>>';
    }
    if (value instanceof HTMLElement) {
        return prepareHtmlElementForLog(value);
    }
    for (let i = 0; i < valPath.length; i++) {
        if (valPath[i] === value) {
            return '<<<recursion>>>';
        }
    }

    let objMangled: string|{[p: string]: unknown} = {};
    valPath.push(value);
    try {
        for (prop in value) {
            objMangled[prop] = prepareValueForLog(value[prop], prop, valPath);
        }
        if (value instanceof Error) {
            objMangled['stack'] = prepareStackTraceForLog(value.stack);
        }
    } catch (error) {
        const clsName = value.constructor?.name ?? 'object';
        objMangled = `<<<unmangleable ${clsName}. Mangling error: ${error.message}>>>`;
    }
    valPath.pop();
    return objMangled;
}

export function prepareStackTraceForLog(trace: string): string[] {
    return trace.split('\n');
}

export function prepareHtmlElementForLog(value: HTMLElement): unknown {
    try {
        const tagStr = value.tagName;
        const id = value.id;
        const idStr = as.String(id) === ''
            ? ''
            : `#${id}`;
        const clses = value.className;
        const clsesStr = is.string(clses) && clses.length > 0
            ? `.${clses.replace(' ', '.')}`
            : '';
        return `<<<HTMLElement: ${tagStr}${idStr}${clsesStr}>>>`;
    } catch (error) {
        return `<<<unmangleable HTMLElement. Mangling error: ${error.message}>>>`;
    }
}
