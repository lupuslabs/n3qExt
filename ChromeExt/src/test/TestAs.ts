import { expect } from 'chai';
import { as } from '../lib/as';

// class TestAs_copes_with_undefined_A
// {
//     key: string;
// }

// class TestAs_copes_with_undefined_B
// {
//     public a: TestAs_copes_with_undefined_A;
// }

// class TestAs_copes_with_undefined_C
// {
//     public b: TestAs_copes_with_undefined_B;
// }

export class TestAs
{
    // as_copes_with_undefined()
    // {
    //     let a = new TestAs_copes_with_undefined_A();
    //     a.key = '42';
    //     let b = new TestAs_copes_with_undefined_B();
    //     b.a = a;
    //     let c = new TestAs_copes_with_undefined_C();
    //     c.b = b;

    //     expect(c.b.a.key).to.equal('42');
    //     expect(as.String(c.b.a.key)).to.equal('42', 'default');
    //     expect(as.Int(c.b.a.key, 0)).to.equal(42);

    //     b.a = null;
    //     // expect(as.String(c.b.a.key, 'default')).to.equal('42', 'default');
    //     // expect(as.Int(c.b.a.key, 0)).to.equal(42);
    // }

    as_Bool()
    {
        expect(as.Bool(true)).to.equal(true);
        expect(as.Bool(false)).to.equal(false);
        expect(as.Bool('')).to.equal(false);
        expect(as.Bool('true')).to.equal(true);
        expect(as.Bool('1')).to.equal(true);
        expect(as.Bool(1)).to.equal(true);
        expect(as.Bool(undefined)).to.equal(false);
        expect(as.Bool(null)).to.equal(false);
        expect(as.Bool({ a: 'b' }['c'])).to.equal(false);
        expect(as.Bool(true, false)).to.equal(true);
        expect(as.Bool(false, true)).to.equal(false);
        expect(as.Bool('', true)).to.equal(false);
        expect(as.Bool('true', false)).to.equal(true);
        expect(as.Bool('1', false)).to.equal(true);
        expect(as.Bool(1, false)).to.equal(true);
        expect(as.Bool(undefined, true)).to.equal(true);
        expect(as.Bool(null, true)).to.equal(true);
        expect(as.Bool({ a: 'b' }['c'], true)).to.equal(true);
        expect(as.Bool(as.String(true))).to.equal(true);
        expect(as.Bool(as.String(false))).to.equal(false);
        expect(as.String(as.Bool('true'))).to.equal('true');
        expect(as.String(as.Bool('false'))).to.equal('false');
    }

    as_String()
    {
        expect(as.String('fourtytwo')).to.equal('fourtytwo');
        expect(as.String('')).to.equal('');
        expect(as.String(42)).to.equal('42');
        expect(as.String(undefined)).to.equal('');
        expect(as.String(null)).to.equal('');
        expect(as.String({ a: 'b' }['c'])).to.equal('');
        expect(as.String('fourtytwo', 'default')).to.equal('fourtytwo');
        expect(as.String('', 'default')).to.equal('');
        expect(as.String(42, 'default')).to.equal('42');
        expect(as.String(undefined, 'default')).to.equal('default');
        expect(as.String(undefined, '')).to.equal('');
        expect(as.String(null, 'default')).to.equal('default');
        expect(as.String({ a: 'b' }['c'], 'default')).to.equal('default');
    }

    as_Int()
    {
        expect(as.Int(42)).to.equal(42);
        expect(as.Int(42.1)).to.equal(42);
        expect(as.Int('')).to.equal(0);
        expect(as.Int('fourtytwo')).to.equal(0);
        expect(as.Int('42')).to.equal(42);
        expect(as.Int('42.1')).to.equal(42);
        expect(as.Int(undefined)).to.equal(0);
        expect(as.Int(null)).to.equal(0);
        expect(as.Int({ a: 'b' }['c'])).to.equal(0);
        expect(as.Int(42, 41)).to.equal(42);
        expect(as.Int(42.1, 41)).to.equal(42);
        expect(as.Int('', 41)).to.equal(41);
        expect(as.Int('fourtytwo', 41)).to.equal(41);
        expect(as.Int('42', 41)).to.equal(42);
        expect(as.Int('42.1', 41)).to.equal(42);
        expect(as.Int(undefined, 41)).to.equal(41);
        expect(as.Int(null, 41)).to.equal(41);
        expect(as.Int({ a: 'b' }['c'], 41)).to.equal(41);
    }

    as_Float()
    {
        expect(as.Float(42)).to.equal(42);
        expect(as.Float(42.1)).to.equal(42.1);
        expect(as.Float('')).to.equal(0);
        expect(as.Float('fourtytwo')).to.equal(0);
        expect(as.Float('42')).to.equal(42);
        expect(as.Float('42.1')).to.equal(42.1);
        expect(as.Float(undefined)).to.equal(0);
        expect(as.Float(null)).to.equal(0);
        expect(as.Float({ a: 'b' }['c'])).to.equal(0);
        expect(as.Float(42, 3.14)).to.equal(42);
        expect(as.Float(42.1, 3.14)).to.equal(42.1);
        expect(as.Float('', 3.14)).to.equal(3.14);
        expect(as.Float('fourtytwo', 3.14)).to.equal(3.14);
        expect(as.Float('42', 3.14)).to.equal(42);
        expect(as.Float('42.1', 3.14)).to.equal(42.1);
        expect(as.Float(undefined, 3.14)).to.equal(3.14);
        expect(as.Float(null, 3.14)).to.equal(3.14);
        expect(as.Float({ a: 'b' }['c'], 3.14)).to.equal(3.14);
    }

    as_Html()
    {
        expect(as.Html('fourtytwo')).to.equal('fourtytwo');
        expect(as.Html('&')).to.equal('&amp;');
        expect(as.Html(null, '&')).to.equal('&amp;');
        expect(as.Html('')).to.equal('');
    }

    // as_Object()
    // {
    //     expect(as.Object('{ "answer" : 42 }').answer == 42);
    //     expect(as.Object(null, '{ "answer" : 42 }').answer == 42);
    //     expect(as.Object('[ "one", "two" ]').length == 2);
    //     expect(as.Object('true'));
    //     expect(as.Object('42')).to.equal(42);
    //     expect(as.Object('"fourtytwo"')).to.equal('fourtytwo');
    //     expect(as.Object('{', '42')).to.equal('42');
    // }

}
