export class is {

    private static readonly typeString: string = typeof ''
    private static readonly typeBoolean: string = typeof true
    private static readonly typeNumber: string = typeof 1
    private static readonly typeObject: string = typeof {}
    private static readonly typeFunction: string = typeof (() => {})

    static nil(val: unknown): val is null|undefined
    {
        return val === undefined || val === null
    }

    static string(val: unknown): val is string
    {
        return typeof val === is.typeString
    }

    static nonEmptyString(val: unknown): val is string
    {
        return is.string(val) && val.length !== 0
    }

    static boolean(val: unknown): val is boolean
    {
        return typeof val === is.typeBoolean
    }

    static number(val: unknown): val is number
    {
        return typeof val === is.typeNumber
    }

    static float(val: unknown): val is number
    {
        return is.number(val) && !isNaN(val)
    }

    static Date(val: unknown): val is Date
    {
        // instanceof doesn't work when date traversed a script context boundary and dates can be invalid:
        // https://stackoverflow.com/a/44198641/4017937
        return !is.nil(val) && Object.prototype.toString.call(val) === "[object Date]" && !isNaN((<Date> val).getTime());
    }

    static object(val: unknown): val is {[p: string|symbol]: unknown}
    {
        return !is.nil(val) && typeof val === is.typeObject
    }

    static stringsObject(val: unknown): val is {[p: string]: string}
    {
        return is.object(val)
            && !Object.entries(val).some(([k, v]) => !is.string(k) || !is.string(v))
    }

    static array<T>(val: unknown, elemGuard?: (elem: unknown) => elem is T): val is Array<T>
    {
        return Array.isArray(val) && (is.nil(elemGuard) || !val.some(elem => !elemGuard(elem)))
    }

    static fun(val: unknown): val is Function
    {
        return typeof val === is.typeFunction
    }

    static iterator<T>(val: unknown): val is Iterator<T>
    {
        return is.object(val) && is.fun(val['next'])
    }

    static iterable<T>(val: unknown): val is Iterable<T>
    {
        return is.object(val) && is.fun(val[Symbol.iterator])
    }

}
