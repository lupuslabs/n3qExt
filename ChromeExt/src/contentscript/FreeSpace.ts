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

export class FreeSpace
{
    private max = 0;
    private limit = 20;
    private cell: Array<Array<number>> = [];

    constructor(private n: number, private contentW: number, private contentH: number, private rects: Array<{ left: number, top: number, right: number, bottom: number }>) { }

    getFreeCoordinate(elem: HTMLElement = null): { x: number, y: number }
    {
        $(elem).find('.n3q-testFreeSpace').remove();
        let n = this.n;
        let dx = this.contentW / n;
        let dy = this.contentH / n;
        for (let x = 0; x < n; x++) {
            this.cell[x] = [];
            for (let y = 0; y < n; y++) {
                if (elem) {
                    let cellElem = <HTMLElement>$('<div class="x' + x + ' y' + y + '" class="n3q-base n3q-testFreeSpace" style="opacity:0.8;position:absolute;width:' + dx + 'px;height:' + dy + 'px;left:' + Math.floor(x * dx) + 'px;top:' + Math.floor(y * dy) + 'px;"/>').get(0);
                    $(elem).append(cellElem);
                }
                this.cell[x][y] = Math.random();
            }
        }
        let innerWeight = 1;
        let outerWeight = 4;
        for (let i in this.rects) {
            let r = this.rects[i];
            let firstCol = Math.floor(r.left / dx);
            let lastCol =  Math.floor(r.right / dx);
            let firstRow = Math.floor(r.top / dy);
            let lastRow =  Math.floor(r.bottom / dy);
            for (let x = firstCol; x <= lastCol; x++) {
                for (let y = firstRow; y <= lastRow; y++) {
                    this.add(x-1, y-1, innerWeight);
                    this.add(x, y-1, innerWeight);
                    this.add(x+1, y-1, innerWeight);
                    this.add(x-1, y, innerWeight);
                    this.add(x, y, outerWeight);
                    this.add(x+1, y, innerWeight);
                    this.add(x-1, y+1, innerWeight);
                    this.add(x, y+1, innerWeight);
                    this.add(x+1, y+1, innerWeight);
                }
            }
        }
        let borderWeight = 2;
        for (let x = 0; x < n; x++) {
            this.add(x, 0, borderWeight);
            this.add(x, n - 1, borderWeight);
        }
        for (let y = 0; y < n; y++) {
            this.add(0, y, borderWeight);
            this.add(n-1, y, borderWeight);
        }
        if (elem) {
            for (let x = 0; x < this.n; x++) {
                for (let y = 0; y < this.n; y++) {
                    let c = 255 - 255 / this.max * this.cell[x][y];
                    $(elem).find('.x' + x + '.y' + y).css({ backgroundColor: 'rgb(' + c + ', ' + c + ', ' + c + ')' });
                }
            }
        }
        let linear: Array<{ occ: number, x: number, y: number }> = [];
        for (let x = 0; x < n; x++) {
            for (let y = 0; y < n; y++) {
                linear.push({ occ: this.cell[x][y], x: x, y: y });
            }
        }
        linear.sort((a, b) => a.occ - b.occ);
        let destX = linear[0].x;
        let destY = linear[0].y;

        if (elem) { $(elem).find('.x' + destX + '.y' + destY).css({ backgroundColor: '#ff0000' }); }

        return { x: Math.floor(destX * dx + dx / 2), y: Math.floor(destY * dy + dy / 2) };
    }

    add(x: number, y: number, inc: number)
    {
        let n = this.n;
        x = Math.max(Math.min(x, n-1), 0);
        y = Math.max(Math.min(y, n-1), 0);
        let v = this.cell[x][y];
        v = Math.min(v += inc, this.limit);
        this.cell[x][y] = v;
        if (this.max < v) { this.max = v; }
    }


}
