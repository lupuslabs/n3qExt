
export class is {

    static nil(val: unknown): val is null|undefined
    {
        return val === undefined || val === null;
    }

    static string(val: unknown): val is string
    {
        return typeof val === typeof '';
    }

    static boolean(val: unknown): val is boolean
    {
        return typeof val === typeof false;
    }

    static number(val: unknown): val is number
    {
        return typeof val === typeof 0.0;
    }

    static array<T>(val: unknown): val is Array<T>
    {
        return val instanceof Array;
    }

}
