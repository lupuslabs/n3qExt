import './test.css';
import { sut } from '../lib/sut';
import { sutGui } from '../lib/sutGui';
var s = new sut();

import { TestHelloWorld } from './TestHelloWorld'; s.addTestClass(TestHelloWorld); s.ignoreFailureForClass(TestHelloWorld);
import { TestAnimationsXml } from './TestAnimationsXml'; s.addTestClass(TestAnimationsXml);
import { TestContentApp } from './TestContentApp'; s.addTestClass(TestContentApp);
import { TestUtils } from './TestUtils'; s.addTestClass(TestUtils);
import { TestCryptoUtils } from './TestCryptoUtils'; s.addTestClass(TestCryptoUtils);
import { TestConfig } from './TestConfig'; s.addTestClass(TestConfig);
import { TestTranslator } from './TestTranslator'; s.addTestClass(TestTranslator);
import { TestMisc } from './TestMisc'; s.addTestClass(TestMisc);
import { TestVpiResolver } from './TestVpiResolver'; s.addTestClass(TestVpiResolver);
import { TestAs } from './TestAs'; s.addTestClass(TestAs);
// Used old local item provider: import { TestBackpack } from './TestBackpack'; s.addTestClass(TestBackpack);
import { TestPointsGenerator } from './TestPointsGenerator'; s.addTestClass(TestPointsGenerator);
import { TestOrderedSet } from './TestOrderedSet'; s.addTestClass(TestOrderedSet);
import { TestUrlRe } from './TestUrlRe'; s.addTestClass(TestUrlRe);
import { TestItemUpdateSubscription } from './TestItemUpdateSubscription'; s.addTestClass(TestItemUpdateSubscription);

s.run().then(() =>
{
    new sutGui().render(s, document.getElementsByTagName('body')[0]);
});
