
export class is {

    private static readonly typeString: string = typeof '';
    private static readonly typeBoolean: string = typeof true;
    private static readonly typeNumber: string = typeof 1;
    private static readonly typeObject: string = typeof {};

    static nil(val: unknown): val is null|undefined
    {
        return val === undefined || val === null;
    }

    static string(val: unknown): val is string
    {
        return typeof val === is.typeString;
    }

    static boolean(val: unknown): val is boolean
    {
        return typeof val === is.typeBoolean;
    }

    static number(val: unknown): val is number
    {
        return typeof val === is.typeNumber;
    }

    static object(val: unknown): val is {[p: string]: unknown}
    {
        return !this.nil(val) && typeof val === is.typeObject;
    }

    static array<T>(val: unknown): val is Array<T>
    {
        return val instanceof Array;
    }

}
