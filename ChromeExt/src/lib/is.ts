
export class is {

    private static readonly typeString: string = typeof '';
    private static readonly typeBoolean: string = typeof true;
    private static readonly typeNumber: string = typeof 1;
    private static readonly typeObject: string = typeof {};
    private static readonly typeFunction: string = typeof (() => {});

    static nil(val: unknown): val is null|undefined
    {
        return val === undefined || val === null;
    }

    static string(val: unknown): val is string
    {
        return typeof val === is.typeString;
    }

    static nonEmptyString(val: unknown): val is string
    {
        return this.string(val) && val.length !== 0;
    }

    static boolean(val: unknown): val is boolean
    {
        return typeof val === is.typeBoolean;
    }

    static number(val: unknown): val is number
    {
        return typeof val === is.typeNumber;
    }

    static float(val: unknown): val is number
    {
        return is.number(val) && !isNaN(val);
    }

    static object(val: unknown): val is {[p: string]: unknown}
    {
        return !this.nil(val) && typeof val === is.typeObject;
    }

    static array<T>(val: unknown, elemGuard?: (elem: unknown) => elem is T): val is Array<T>
    {
        return val instanceof Array && (is.nil(elemGuard) || !val.some(elem => !elemGuard(elem)));
    }

    static fun<T>(val: unknown): val is Function
    {
        return typeof val === is.typeFunction;
    }

    static iterator<T>(val: unknown): val is Iterator<T>
    {
        return is.object(val) && is.fun(val['next']);
    }

    static iterable<T>(val: unknown): val is Iterable<T>
    {
        return is.object(val) && is.fun((<Iterator<T>>(<any>val))[Symbol.iterator])
    }

}
