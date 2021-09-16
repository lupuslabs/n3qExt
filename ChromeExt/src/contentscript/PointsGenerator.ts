import * as $ from 'jquery';
import { as } from '../lib/as';
import { IObserver, IObservable } from '../lib/ObservableProperty';
import { ContentApp } from './ContentApp';
import { Participant } from './Participant';
import { Config } from '../lib/Config';
import { Utils } from '../lib/Utils';
import { Environment } from '../lib/Environment';
import { Menu, MenuColumn, MenuItem, MenuHasIcon, MenuOnClickClose, MenuHasCheckbox } from './Menu';
import { listenerCount } from 'process';

export class PointsGenerator
{
    constructor(private base: number, private fullLevels: number, private fractionalLevels: number) { }

    getPartsList(digits: Array<{ exp: number, count: number }>): Array<string>
    {
        let list = [];

        let count = 0;
        let lastExp = -1;
        for (let i = 0; i < digits.length; i++) {
            let digit = digits[i];
            let gap = (lastExp < 0 ? digit.exp + 1 : lastExp) - digit.exp;
            count += gap;
            if (count > this.fullLevels + this.fractionalLevels) { break; }
            if (digit.exp == 0) { // list.length > 0 && 
                if (lastExp > 0 && lastExp - digit.exp > this.fractionalLevels + 1) { break; }
                list.push('' + digit.exp + '-' + digit.count);
            } else if (count > this.fullLevels && count <= this.fullLevels + this.fractionalLevels) {
                if (lastExp > 0 && lastExp - digit.exp > this.fractionalLevels + 1) { break; }
                list.push('' + digit.exp + '-' + digit.count);
            } else {
                if (lastExp > 0 && lastExp - digit.exp > 1) { break; }
                for (let j = 0; j < digit.count; j++) {
                    list.push('' + digit.exp);
                }
            }
            lastExp = digit.exp;
        }

        return list;
    }

    getDigitList(nPoints: number): Array<{ exp: number, count: number }>
    {
        let list = [];

        let work = nPoints;
        let position = this.largestDigit(work);
        let count = 0;
        while (position >= 0) {
            let fraction = Math.pow(this.base, position);
            while (work - fraction >= 0) {
                work -= fraction;
                count++;
            }
            if (count > 0) {
                list.push({ exp: position, count: count });
            }
            position--;
            count = 0;
        }

        return list;
    }

    largestDigit(n: number): number
    {
        if (n < 1) { return 0; }
        if (n == 1) { return 0; }
        let exp = 0;
        let cap = 1;
        while (n >= cap) {
            exp += 1;
            cap = Math.pow(this.base, exp);
        }
        return exp - 1;
    }
}
