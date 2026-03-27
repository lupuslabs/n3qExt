export class FreeSpace
{
    private max = 0;
    private limit = 20;
    private cell: Array<Array<number>> = [];

    constructor(private n: number, private contentW: number, private contentH: number, private rects: Array<{ left: number, top: number, right: number, bottom: number }>) { }

    getFreeCoordinate(width: number, height: number): { x: number, y: number }
    {
        let n = Math.max(1, this.n);
        let dx = Math.max(1, this.contentW) / n;
        let dy = Math.max(1, this.contentH) / n;
        for (let x = 0; x < n; x++) {
            this.cell[x] = [];
            for (let y = 0; y < n; y++) {
                this.cell[x][y] = Math.random();
            }
        }
        const widthOffset = 0.5 * width
        const heightOffset = 0.5 * height
        let innerWeight = 1;
        let outerWeight = 4;
        for (let r of this.rects) {
            let firstCol = Math.floor((r.left - widthOffset) / dx);
            let lastCol =  Math.floor((r.right + widthOffset) / dx);
            let firstRow = Math.floor((r.top - heightOffset) / dy);
            let lastRow =  Math.floor((r.bottom + heightOffset) / dy);
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
        let linear: Array<{ occ: number, x: number, y: number }> = [];
        for (let x = 0; x < n; x++) {
            for (let y = 0; y < n; y++) {
                linear.push({ occ: this.cell[x][y], x: x, y: y });
            }
        }
        linear.sort((a, b) => a.occ - b.occ);
        let destX = linear[0].x;
        let destY = linear[0].y;

        return { x: Math.floor(destX * dx + dx / 2), y: Math.floor(destY * dy + dy / 2) };
    }

    add(x: number, y: number, inc: number)
    {
        let n = this.n;
        x = Math.max(Math.min(x, n-1), 0);
        y = Math.max(Math.min(y, n-1), 0);
        let v = this.cell[x][y];
        v = Math.min(v + inc, this.limit);
        this.cell[x][y] = v;
        if (this.max < v) { this.max = v; }
    }

}
