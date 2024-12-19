import { is } from './is'
import { as } from './as'

type MaybeSequence<T> = undefined|null|Iterable<T>|Iterator<T>|Iter<T>

export function iter<T>(value: MaybeSequence<T>): Iter<T>
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

export function iterOfIters<T>(...sequences: (MaybeSequence<T>)[]): Iter<T>
{
    if (sequences.length === 0) {
        return emptyIter
    }
    if (sequences.length !== 1) {
        return new IteratorIter(sequences.values()).flatmap(iter)
    }
    return iter(sequences[0])
}

export abstract class Iter<T> implements Iterator<T>, Iterable<T> {

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

    public toSet(): Set<T>
    {
        return new Set(this)
    }

    public toString(glue: string, elementConverter: (element: T) => string = as.String): string
    {
        return this.map(elementConverter).toArray().join(glue)
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

    public filterType<NewT extends T>(acceptFun: (element: T) => element is NewT): Iter<NewT>
    {
        return new IteratorIter(function*(iterable){
            for (const element of iterable) {
                if (acceptFun(element)) {
                    yield element
                }
            }
        }(this))
    }

    public removeNil(): Iter<NonNullable<T>>
    {
        return new IteratorIter(function*(iterable){
            for (const element of iterable) {
                if (!is.nil(element)) {
                    yield element
                }
            }
        }(this))
    }

    public removeDuplicates(isEqualFun: (a: T, b: T) => boolean): Iter<T>
    {
        return new IteratorIter(function*(iterable){
            const knownElems: T[] = []
            for (const element of iterable) {
                if (!knownElems.some(knownElement => isEqualFun(knownElement, element))) {
                    knownElems.push(element)
                    yield element
                }
            }
        }(this))
    }

    public skip(count: number): Iter<T>
    {
        for (let i = 0; i < count; i++) {
            this.getNext()
        }
        return this
    }

    public limit(maxCount: number): Iter<T>
    {
        return new IteratorIter(function*(iterable){
            let yieldCount = 0;
            for (const element of iterable) {
                if (yieldCount >= maxCount) {
                    return
                }
                yield element
                yieldCount++
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

    public flatmap<Out>(mapFun: (element: T) => MaybeSequence<Out>): Iter<Out>
    {
        return new IteratorIter(function*(iterable){
            for (const element of iterable) {
                for (const result of iter(mapFun(element))) {
                    yield result
                }
            }
        }(this))
    }

    public count(): number
    {
        return this.fold(0, (count, element) => count + 1)
    }

    public any(predicate: (element: T) => boolean): boolean
    {
        for (const element of this) {
            if (predicate(element)) {
                return true
            }
        }
        return false
    }

    public all(predicate: (element: T) => boolean): boolean
    {
        for (const element of this) {
            if (!predicate(element)) {
                return false
            }
        }
        return true
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
