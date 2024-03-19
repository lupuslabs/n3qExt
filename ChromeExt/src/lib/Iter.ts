import { is } from './is'

export function iter<T>(value: undefined|null|Iterable<T>|Iterator<T>|Iter<T>): Iter<T>
{
    if (value instanceof Iter) {
        return value
    }
    if (is.nil(value)) {
        return emptyIter
    }
    if (is.iterator(value)) {
        return new IteratorIter(value)
    }
    if (is.iterable(value)) {
        return new IteratorIter(value[Symbol.iterator]())
    }
    return emptyIter
}

abstract class Iter<T> implements Iterator<T>, Iterable<T> {

    /* Iterable<T> */
    public [Symbol.iterator](): Iter<T>
    {
        return this
    }

    /* Iterator<T> */
    public abstract next(...ignoredArgs: unknown[]): IteratorResult<T>

    public getNext(): null|T
    {
        const { done, value } = this.next()
        return done ? null : value
    }

    public *toIterator(): Iterator<T>
    {
        yield *this
    }

    public toArray(): T[]
    {
        return [...this]
    }

    public toMap<K>(keyFun: (element: T) => K): Map<K,T>
    {
        return new Map<K, T>(this.map(e => [keyFun(e), e]))
    }

    public forEach(actionFun: (element: T) => void): void
    {
        for (const element of this) {
            actionFun(element)
        }
    }

    public filter(acceptFun: (element: T) => boolean): Iter<T>
    {
        return new IteratorIter(function*(iterable){
            for (const element of iterable) {
                if (acceptFun(element)) {
                    yield element
                }
            }
        }(this))
    }

    public fold<Out>(state: Out, foldFun: (state: Out, element: T) => Out): Out
    {
        for (const element of this) {
            state = foldFun(state, element)
        }
        return state
    }

    public map<Out>(mapFun: (element: T) => Out): Iter<Out>
    {
        return new IteratorIter(function*(iterable){
            for (const element of iterable) {
                yield mapFun(element)
            }
        }(this))
    }

    public flatmap<Out>(mapFun: (element: T) => undefined|null|Iterable<Out>|Iterator<Out>): Iter<Out>
    {
        return new IteratorIter(function*(iterable){
            for (const element of iterable) {
                for (const result of iter(mapFun(element))) {
                    yield result
                }
            }
        }(this))
    }

}

class IteratorIter<T> extends Iter<T> {

    private readonly iterator: Iterator<T>

    public constructor(iterator: Iterator<T>) {
        super()
        this.iterator = iterator
    }

    public next(...ignoredArgs: unknown[]): IteratorResult<T>
    {
        return this.iterator.next()
    }

}

class EmptyIter<T> extends Iter<T> {

    public next(...ignoredArgs: unknown[]): IteratorResult<T>
    {
        return { done: true, value: null }
    }

}

export const emptyIter = new EmptyIter<any>()
