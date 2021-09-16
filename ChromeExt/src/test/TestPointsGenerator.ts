import { expect } from 'chai';
import { PointsGenerator } from '../contentscript/PointsGenerator';

export class TestPointsGenerator
{
    largestDigit()
    {
        let p = new PointsGenerator(4,2,1);
        expect(1).to.equal(1);
        expect(p.largestDigit(0)).to.equal(0);
        expect(p.largestDigit(1)).to.equal(0);
        expect(p.largestDigit(2)).to.equal(0);
        expect(p.largestDigit(3)).to.equal(0);
        expect(p.largestDigit(4)).to.equal(1);
        expect(p.largestDigit(5)).to.equal(1);
        expect(p.largestDigit(8)).to.equal(1);
        expect(p.largestDigit(15)).to.equal(1);
        expect(p.largestDigit(16)).to.equal(2);
        expect(p.largestDigit(17)).to.equal(2);
    }

    getDigitList()
    {
        let p = new PointsGenerator(4,2,1);
        expect(p.getDigitList(0     ).map(kv => kv.exp + ':' + kv.count).join(' ')).to.equal('');
        expect(p.getDigitList(1     ).map(kv => kv.exp + ':' + kv.count).join(' ')).to.equal('0:1');
        expect(p.getDigitList(2     ).map(kv => kv.exp + ':' + kv.count).join(' ')).to.equal('0:2');
        expect(p.getDigitList(3     ).map(kv => kv.exp + ':' + kv.count).join(' ')).to.equal('0:3');
        expect(p.getDigitList(4     ).map(kv => kv.exp + ':' + kv.count).join(' ')).to.equal('1:1');
        expect(p.getDigitList(5     ).map(kv => kv.exp + ':' + kv.count).join(' ')).to.equal('1:1 0:1');
        expect(p.getDigitList(8     ).map(kv => kv.exp + ':' + kv.count).join(' ')).to.equal('1:2');
        expect(p.getDigitList(15    ).map(kv => kv.exp + ':' + kv.count).join(' ')).to.equal('1:3 0:3');
        expect(p.getDigitList(16    ).map(kv => kv.exp + ':' + kv.count).join(' ')).to.equal('2:1');
        expect(p.getDigitList(17    ).map(kv => kv.exp + ':' + kv.count).join(' ')).to.equal('2:1 0:1');
        expect(p.getDigitList(25    ).map(kv => kv.exp + ':' + kv.count).join(' ')).to.equal('2:1 1:2 0:1');                    
        expect(p.getDigitList(125   ).map(kv => kv.exp + ':' + kv.count).join(' ')).to.equal('3:1 2:3 1:3 0:1');                    
        expect(p.getDigitList(625   ).map(kv => kv.exp + ':' + kv.count).join(' ')).to.equal('4:2 3:1 2:3 0:1');                    
        expect(p.getDigitList(3125  ).map(kv => kv.exp + ':' + kv.count).join(' ')).to.equal('5:3 2:3 1:1 0:1');                    
        expect(p.getDigitList(15625 ).map(kv => kv.exp + ':' + kv.count).join(' ')).to.equal('6:3 5:3 4:1 1:2 0:1');                     
        expect(p.getDigitList(32    ).map(kv => kv.exp + ':' + kv.count).join(' ')).to.equal('2:2');           
        expect(p.getDigitList(82    ).map(kv => kv.exp + ':' + kv.count).join(' ')).to.equal('3:1 2:1 0:2');         
        expect(p.getDigitList(783   ).map(kv => kv.exp + ':' + kv.count).join(' ')).to.equal('4:3 1:3 0:3');         
        expect(p.getDigitList(812   ).map(kv => kv.exp + ':' + kv.count).join(' ')).to.equal('4:3 2:2 1:3');        
        expect(p.getDigitList(11    ).map(kv => kv.exp + ':' + kv.count).join(' ')).to.equal('1:2 0:3');       
        expect(p.getDigitList(7     ).map(kv => kv.exp + ':' + kv.count).join(' ')).to.equal('1:1 0:3');          
        expect(p.getDigitList(1007  ).map(kv => kv.exp + ':' + kv.count).join(' ')).to.equal('4:3 3:3 2:2 1:3 0:3'); 
        expect(p.getDigitList(1008  ).map(kv => kv.exp + ':' + kv.count).join(' ')).to.equal('4:3 3:3 2:3'); 
        expect(p.getDigitList(2500  ).map(kv => kv.exp + ':' + kv.count).join(' ')).to.equal('5:2 4:1 3:3 1:1');          
        expect(p.getDigitList(3905  ).map(kv => kv.exp + ':' + kv.count).join(' ')).to.equal('5:3 4:3 3:1 0:1');          
        expect(p.getDigitList(126773).map(kv => kv.exp + ':' + kv.count).join(' ')).to.equal('8:1 7:3 6:2 5:3 4:3 2:3 1:1 0:1');          
        expect(p.getDigitList(100061).map(kv => kv.exp + ':' + kv.count).join(' ')).to.equal('8:1 7:2 5:1 4:2 3:3 2:1 1:3 0:1');          
    }
    
    getPartsList()
    {
        let p = new PointsGenerator(4,2,1);
        expect(p.getPartsList(p.getDigitList(0     )).join(' ')).to.equal('');
        expect(p.getPartsList(p.getDigitList(1     )).join(' ')).to.equal('0-1');
        expect(p.getPartsList(p.getDigitList(2     )).join(' ')).to.equal('0-2');
        expect(p.getPartsList(p.getDigitList(3     )).join(' ')).to.equal('0-3');
        expect(p.getPartsList(p.getDigitList(4     )).join(' ')).to.equal('1');
        expect(p.getPartsList(p.getDigitList(5     )).join(' ')).to.equal('1 0-1');
        expect(p.getPartsList(p.getDigitList(8     )).join(' ')).to.equal('1 1');
        expect(p.getPartsList(p.getDigitList(10    )).join(' ')).to.equal('1 1 0-2');
        expect(p.getPartsList(p.getDigitList(15    )).join(' ')).to.equal('1 1 1 0-3');
        expect(p.getPartsList(p.getDigitList(16    )).join(' ')).to.equal('2');
        expect(p.getPartsList(p.getDigitList(17    )).join(' ')).to.equal('2 0-1');
        expect(p.getPartsList(p.getDigitList(25    )).join(' ')).to.equal('2 1 1 0-1');
        expect(p.getPartsList(p.getDigitList(125   )).join(' ')).to.equal('3 2 2 2 1-3');
        expect(p.getPartsList(p.getDigitList(625   )).join(' ')).to.equal('4 4 3 2-3');
        expect(p.getPartsList(p.getDigitList(3125  )).join(' ')).to.equal('5 5 5');
        expect(p.getPartsList(p.getDigitList(15625 )).join(' ')).to.equal('6 6 6 5 5 5 4-1');
        expect(p.getPartsList(p.getDigitList(32    )).join(' ')).to.equal('2 2');
        expect(p.getPartsList(p.getDigitList(82    )).join(' ')).to.equal('3 2');
        expect(p.getPartsList(p.getDigitList(783   )).join(' ')).to.equal('4 4 4');
        expect(p.getPartsList(p.getDigitList(812   )).join(' ')).to.equal('4 4 4 2-2');
        expect(p.getPartsList(p.getDigitList(11    )).join(' ')).to.equal('1 1 0-3');
        expect(p.getPartsList(p.getDigitList(7     )).join(' ')).to.equal('1 0-3');
        expect(p.getPartsList(p.getDigitList(1007  )).join(' ')).to.equal('4 4 4 3 3 3 2-2');
        expect(p.getPartsList(p.getDigitList(1008  )).join(' ')).to.equal('4 4 4 3 3 3 2-3');
        expect(p.getPartsList(p.getDigitList(2500  )).join(' ')).to.equal('5 5 4 3-3');
        expect(p.getPartsList(p.getDigitList(3905  )).join(' ')).to.equal('5 5 5 4 4 4 3-1');
        expect(p.getPartsList(p.getDigitList(126773)).join(' ')).to.equal('8 7 7 7 6-2');
        expect(p.getPartsList(p.getDigitList(100061)).join(' ')).to.equal('8 7 7');
    }
    
}
