import { expect } from 'chai';
import { AnimationsXml } from '../contentscript/AnimationsXml';
import { sut } from '../lib/sut';

export class TestAnimationsXml
{
    parseXml()
    {
        const result = AnimationsXml.parseXml('https://storage.zweitgeist.com/index.php/295/avatar2', '<config xmlns="http://schema.bluehands.de/character-config" version="1.0"> <param name="defaultsequence" value="idle"/> <sequence group="chat" name="chat1" probability="1000" type="basic" in="standard" out="standard"><animation src="https://files.zweitgeist.com/b4/cf/cc/c3ac04b3673c518f1c87b61f059755216f.gif"/></sequence> <sequence group="idle" name="idle1" probability="1000" type="status" in="standard" out="standard"><animation src="https://https.absolute.com/absolute.gif"/></sequence> <sequence group="idle" name="idle2" probability="5" type="status" in="standard" out="standard"><animation src="http://http.absolute.com/absolute.gif"/></sequence> <sequence group="moveleft" name="moveleft1" probability="1000" type="basic" in="moveleft" out="moveleft"><animation dx="-300" src="moveleft.gif"/></sequence> <sequence group="moveright" name="moveright1" probability="1000" type="basic" in="moveright" out="moveright"><animation dx="300" src="moveright.gif"/></sequence> <sequence group="sleep" name="sleep1" probability="1000" type="status" in="standard" out="standard"><animation src="https://files.zweitgeist.com/db/d1/23/16f4247df316bfa83c49fe094c879d8583.gif"/></sequence> <sequence group="wave" name="wave1" probability="1000" type="emote" in="standard" out="standard"><animation src="https://files.zweitgeist.com/e5/f7/e3/b3c9ee12571eff8287f41a0ef8822d87e7.gif"/></sequence> </config>');
        expect(result.sequences['chat1'].group).to.equal('chat');
        expect(result.sequences['chat1'].weight).to.equal(1000);
        expect(result.sequences['chat1'].type).to.equal('basic');
        expect(result.sequences['chat1'].in).to.equal('standard');
        expect(result.sequences['chat1'].out).to.equal('standard');
        expect(result.sequences['chat1'].url).to.equal('https://files.zweitgeist.com/b4/cf/cc/c3ac04b3673c518f1c87b61f059755216f.gif');
        expect(result.sequences['idle1'].weight).to.equal(1000);
        expect(result.sequences['idle1'].url).to.equal('https://https.absolute.com/absolute.gif');
        expect(result.sequences['idle2'].weight).to.equal(5);
        expect(result.sequences['idle2'].url).to.equal('http://http.absolute.com/absolute.gif');
        expect(result.sequences['moveleft1'].in).to.equal('moveleft');
        expect(result.sequences['moveleft1'].out).to.equal('moveleft');
        expect(result.sequences['moveleft1'].dx).to.equal(-300);
        expect(result.sequences['moveleft1'].url).to.equal('https://storage.zweitgeist.com/index.php/295/moveleft.gif');
        expect(result.sequences['moveright1'].dx).to.equal(300);
        expect(result.sequences['moveright1'].url).to.equal('https://storage.zweitgeist.com/index.php/295/moveright.gif');
        expect(result.sequences['wave1'].group).to.equal('wave');
        expect(result.sequences['wave1'].weight).to.equal(1000);
        expect(result.sequences['wave1'].type).to.equal('emote');
        expect(result.sequences['wave1'].in).to.equal('standard');
        expect(result.sequences['wave1'].out).to.equal('standard');
        expect(result.sequences['wave1'].url).to.equal('https://files.zweitgeist.com/e5/f7/e3/b3c9ee12571eff8287f41a0ef8822d87e7.gif');
    }
}