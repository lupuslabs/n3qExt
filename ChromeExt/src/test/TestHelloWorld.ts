import { expect } from 'chai';
import { HelloWorld } from '../contentscript/HelloWorld';
import { sut } from '../lib/sut';

// function sutMethod() {
//     return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
//         log.info('sutMethod', target, propertyKey, descriptor);
//     };
// }

function external_function_because_all_methods_are_ubject_to_testing()
{
    return 42;
}

export class TestHelloWorld
{
    private aPrivateProperty: number = 42;

    private privateMethodThrows = function ()
    {
        throw 'should not be called';
    }

    static staticMethod()
    {
        return 42;
    }

    getText_fails_INTENTIONALLY()
    {
        const result = HelloWorld.getText();
        expect(result).to.equal('Expected Hello');
    }

    getText_fails_with_result_INTENTIONALLY()
    {
        const result = HelloWorld.getText();
        return 'error';
    }

    getText()
    {
        const privateMethodResult = TestHelloWorld.staticMethod();
        // const privateMethodResult = external_function_because_all_methods_are_ubject_to_testing();
        const result = HelloWorld.getText();
        expect(result).to.equal('Hello World');
    }
}
