import { is } from '../lib/is';
import { expect } from 'chai';
import { OrderedSet } from '../lib/OrderedSet';

export class TestOrderedSet
{

    numbers_mutation()
    {
        try {

            const sut = new OrderedSet<number>();
            checkRead(sut, []);
    
            checkAdd(sut, 7, 0, false);
            checkRead(sut, [7]);
            checkAdd(sut, 1, 0, false);
            checkRead(sut, [1, 7]);
            checkAdd(sut, 13, 2, false);
            checkRead(sut, [1, 7, 13]);
            checkAdd(sut, 6, 1, false);
            checkRead(sut, [1, 6, 7, 13]);
            checkAdd(sut, 4, 1, false);
            checkRead(sut, [1, 4, 6, 7, 13]);
            checkAdd(sut, 6, 2, true);
            checkRead(sut, [1, 4, 6, 7, 13]);
            checkAdd(sut, 5, 2, false);
            checkRead(sut, [1, 4, 5, 6, 7, 13]);
            checkAdd(sut, 3, 1, false);
            checkRead(sut, [1, 3, 4, 5, 6, 7, 13]);
            checkAdd(sut, -1, 0, false);
            checkRead(sut, [-1, 1, 3, 4, 5, 6, 7, 13]);
            checkAdd(sut, 0, 1, false);
            checkRead(sut, [-1, 0, 1, 3, 4, 5, 6, 7, 13]);
            checkAdd(sut, 13, 8, true);
            checkRead(sut, [-1, 0, 1, 3, 4, 5, 6, 7, 13]);
            checkAdd(sut, 6, 6, true);
            checkRead(sut, [-1, 0, 1, 3, 4, 5, 6, 7, 13]);
            expect(sut.add(4)).to.eql({index: 4, replacedExisting: true});
            checkRead(sut, [-1, 0, 1, 3, 4, 5, 6, 7, 13]);
            expect(sut.add(5)).to.eql({index: 5, replacedExisting: true});
            checkRead(sut, [-1, 0, 1, 3, 4, 5, 6, 7, 13]);
    
            checkRemove(sut, -1, 0);
            checkRead(sut, [0, 1, 3, 4, 5, 6, 7, 13]);
            checkRemove(sut, -1);
            checkRead(sut, [0, 1, 3, 4, 5, 6, 7, 13]);
    
            checkRemove(sut, 1, 1);
            checkRead(sut, [0, 3, 4, 5, 6, 7, 13]);
            checkRemove(sut, 1);
            checkRead(sut, [0, 3, 4, 5, 6, 7, 13]);
    
            checkRemove(sut, 7, 5);
            checkRead(sut, [0, 3, 4, 5, 6, 13]);
            checkRemove(sut, 7);
            checkRead(sut, [0, 3, 4, 5, 6, 13]);
    
            checkRemove(sut, 13, 5);
            checkRead(sut, [0, 3, 4, 5, 6]);
            checkRemove(sut, 13);
            checkRead(sut, [0, 3, 4, 5, 6]);

        } catch (error) {
            console.log(error);
            throw error;
        }
    }

    numbers_construction()
    {
        try {

            const sut = new OrderedSet<number>([3, -2, 13, 3, -2, 13]);
            checkRead(sut, [-2, 3, 13]);

        } catch (error) {
            console.log(error);
            throw error;
        }
    }

    numbers_mutation_oddIsLowerEven_multiplesOfFourAreEqual_reverseOrder()
    {
        try {

            const idFun = (a, b) => Math.floor(b / 2) === Math.floor(a / 2);
            const cmpFun = (a, b) => Math.floor(b / 4) - Math.floor(a / 4);
            const sut = new OrderedSet<number>([], cmpFun, idFun);
            checkRead(sut, []);

            // order:     11 10  9 8  <  7 6  5 4  <  3 2  1 0
            // identical: #####  ###     ###  ###     ###  ###
            // eqal:      ##########     ########     ########

            checkAdd(sut, 4, 0, false);
            checkRead(sut, [4]);
            checkAdd(sut, 8, 0, false);
            checkRead(sut, [8, 4]);
            checkAdd(sut, 3, 2, false);
            checkRead(sut, [8, 4, 3]);
            checkAdd(sut, 6, 2, false);
            checkRead(sut, [8, 4, 6, 3]);

            expect(sut.indexOf(0).found).to.eql(false, 'wrong result for indexOf()!');
            expect(sut.indexOf(1).found).to.eql(false, 'wrong result for indexOf()!');
            expect(sut.indexOf(2)).to.eql({found: true, index: 3}, 'wrong result for indexOf()!');
            expect(sut.indexOf(3)).to.eql({found: true, index: 3}, 'wrong result for indexOf()!');
            expect(sut.indexOf(4)).to.eql({found: true, index: 1}, 'wrong result for indexOf()!');
            expect(sut.indexOf(5)).to.eql({found: true, index: 1}, 'wrong result for indexOf()!');
            expect(sut.indexOf(6)).to.eql({found: true, index: 2}, 'wrong result for indexOf()!');
            expect(sut.indexOf(7)).to.eql({found: true, index: 2}, 'wrong result for indexOf()!');
            expect(sut.indexOf(8)).to.eql({found: true, index: 0}, 'wrong result for indexOf()!');
            expect(sut.indexOf(9)).to.eql({found: true, index: 0}, 'wrong result for indexOf()!');
            expect(sut.indexOf(10).found).to.eql(false, 'wrong result for indexOf()!');
            expect(sut.indexOf(11).found).to.eql(false, 'wrong result for indexOf()!');

            checkRemove(sut, 5, 1);
            checkRemove(sut, 5);
            checkRemove(sut, 4);
            checkRemove(sut, 8, 0);
            checkRemove(sut, 8);
            checkRemove(sut, 9);

        } catch (error) {
            console.log(error);
            throw error;
        }
    }

}

function checkRemove<T>(sut: OrderedSet<T>, elementToRemove: T, index?: number): void
{
    const result = sut.remove(elementToRemove);
    if (is.nil(index)) {
        expect(result.found).to.eql(false, 'wrong result for remove()');
    } else {
        expect(result).to.eql({found: true, index}, 'wrong result for remove()');
    }
}

function checkAdd<T>(sut: OrderedSet<T>, elementToAdd: T, index: number, replacedExisting: boolean): void
{
    expect(sut.add(elementToAdd)).to.eql({index, replacedExisting}, 'wrong result for add()');
}

function checkRead<T>(sut: OrderedSet<T>, expected: T[]): void
{
    expect(sut.toArray()).to.eql(expected, 'wrong result for asArray()');
    expect(sut.length()).to.eql(expected.length, 'wrong result for length()');
    for (let index = 0; index < sut.length(); index++) {
        expect(sut.at(index)).to.eql(expected[index], 'wrong result for at()');
        expect(sut.indexOf(expected[index])).to.eql({found: true, index}, 'wrong result for indexOf()!');
        expect(sut.has(expected[index])).to.eql(true, 'wrong result for has()!');
    }
    const elements = [];
    // @ts-ignore
    for (const element of sut) {
        elements.push(element);
    }
    expect(elements).to.eql(expected, 'iteration returns different elements');
}
