/**
 * Implementation of an ordered set.
 * New elements are ordered after equal elements.
 * Identiacal elements are assumed to be equal.
 */
export class OrderedSet<T> implements Iterable<T>
{
    protected idFun: (a: T, b: T) => boolean;
    protected cmpFun: (a: T, b: T) => number;
    protected elements: T[] = [];

    /**
     * Identity is determined by idFun.
     * Order and equality is determined by cmpFun.
     * It is assumed that identical elements are also equal.
     * The set can contain multiple equal elements.
     * Adding an element removes identical elements.
     */
    public constructor(elements?: Iterable<T>, cmpFun?: (a: T, b: T) => number, idFun?: null|((a: T, b: T) => boolean))
    {
        this.idFun = idFun ?? ((a, b) => a === b);
        this.cmpFun = cmpFun ?? ((a, b) => a === b ? 0 : (a > b ? 1 : -1));
        for (const element of elements ?? []) {
            this.add(element);
        }
    }

    public length(): number
    {
        return this.elements.length;
    }

    public has(searchElement: T): boolean
    {
        return this.indexOf(searchElement).found;
    }

    /**
     * Searches for searchElement's inside this set.
     *
     * index might have any value when found is false.
     */
    public indexOf(searchElement: T): {found: boolean, index: number}
    {
        let {equalElementFound, equalOrLowerElementIndex} = this.lastIndexOfEqualElement(searchElement);
        return this.indexOfIdenticalElement(searchElement, equalOrLowerElementIndex, equalElementFound);
    }

    public at(index: number): null|T
    {
        return this.elements[index];
    }

    [Symbol.iterator](): Iterator<T>
    {
        return this.elements[Symbol.iterator]();
    }

    public toArray(): T[]
    {
        return [...this.elements];
    };

    public add(newElement: T): {index: number, replacedExisting: boolean}
    {
        const {lowerElementFound, equalElementFound, equalOrLowerElementIndex} = this.lastIndexOfEqualElement(newElement);
        let {found, index} = this.indexOfIdenticalElement(newElement, equalOrLowerElementIndex, equalElementFound);
        if (found) {
            this.elements.splice(index, 1, newElement);
        } else {
            index = lowerElementFound || equalElementFound ? equalOrLowerElementIndex + 1 : 0;
            this.elements.splice(index, 0, newElement);
        }
        return {index, replacedExisting: found};
    }

    public remove(oldElement: T): {found: boolean, index: number}
    {
        const {equalElementFound, equalOrLowerElementIndex} = this.lastIndexOfEqualElement(oldElement);
        const {found, index} = this.indexOfIdenticalElement(oldElement, equalOrLowerElementIndex, equalElementFound);
        if (found) {
            this.elements.splice(index, 1);
        }
        return {found, index};
    }

    public removeAt(index: number): boolean
    {
        const found = this.elements.length > index;
        if (found) {
            this.elements.splice(index, 1);
        }
        return found;
    }

    protected indexOfIdenticalElement(
        searchElement: T, equalElementIndex: number, equalElementFound: boolean
    ): {found: boolean, index: number} {
        let [found, index] = [false, -1];
        if (equalElementFound) {
            for (index = equalElementIndex; index >= 0; index--) {
                const indexElement = this.elements[index];
                found = this.idFun(indexElement, searchElement);
                if (found || this.cmpFun(indexElement, searchElement) !== 0) {
                    break;
                }
            }
        }
        return {found, index};
    }

    protected lastIndexOfEqualElement(searchElement: T)
    {
        let lowerBound = 0;
        let upperBound = this.elements.length;
        let equalElementFound = false;
        let lowerElementFound = false;
        while (lowerBound < upperBound) {
            const index = Math.floor(lowerBound + (upperBound - lowerBound) * 0.5);
            const order = this.cmpFun(this.elements[index], searchElement);
            if (order > 0) {
                upperBound = index;
            } else {
                equalElementFound = order === 0;
                lowerElementFound = !equalElementFound;
                lowerBound = index + 1;
            }
        }
        let equalOrLowerElementIndex = lowerBound === 0 ? 0 : lowerBound - 1;
        return {lowerElementFound, equalElementFound, equalOrLowerElementIndex};
    }

}
