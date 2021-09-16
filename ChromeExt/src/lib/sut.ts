import log = require('loglevel');

export class sutTest
{
    constructor(
        public name: string,
        public methodName: string,
        public className: string,
        public fn: any,
        public isAsync: boolean,
        public success: boolean,
        public result: any
    ) { }
}

export class sut
{
    private ignoredClasses: Array<string> = [];
    private tests: { [name: string]: sutTest; } = {};
    private totalTests: number = 0;
    private countStarted: number = 0;
    private countFinished: number = 0;
    private countSuccess: number = 0;
    private countFailures: number = 0;
    private runSuccess: boolean = false;
    private runStarted: boolean = false;
    private runFinished: boolean = false;

    ignoreFailureForClass(testClass: any)
    {
        this.ignoredClasses.push(testClass.name);
    }

    isFailureIgnoredClass(className: string): boolean
    {
        return this.ignoredClasses.indexOf(className) >= 0;
    }

    getAllMethods(object)
    {
        return Object.getOwnPropertyNames(object.prototype).filter(function (property)
        {
            return typeof object[property] == 'function';
        });
    }

    addTestClass(testClass: any): void
    {
        let className = testClass.name;
        Object.getOwnPropertyNames(testClass.prototype).forEach(methodName =>
        {
            if (methodName != 'constructor' && typeof testClass.prototype[methodName] == 'function') {
                let name = className + '_' + methodName;
                let fnString = testClass.prototype[methodName].toString();
                let isAsync = fnString.startsWith('async');
                this.tests[name] = new sutTest(name, methodName, className, testClass.prototype[methodName], isAsync, false, null);
                this.totalTests++;
            }
        });
    }

    async run()
    {
        this.runStarted = true;
        this.runSuccess = true;
        for (let name in this.tests) {
            let result;
            this.countStarted++;
            try {
                if (this.tests[name].isAsync) {
                    result = await this.tests[name].fn();
                } else {
                    result = this.tests[name].fn();
                }
            } catch (error) {
                result = error;
            }
            this.countFinished++;
            this.tests[name].result = result;
            if (result === undefined || result === '') {
                this.tests[name].success = true;
                if (!(this.isFailureIgnoredClass(this.tests[name].className))) {
                    this.countSuccess++;
                }
            } else {
                this.tests[name].success = false;
                if (!(this.isFailureIgnoredClass(this.tests[name].className))) {
                    log.info(name, result);
                    this.countFailures++;
                    this.runSuccess = false;
                }
            }
        }
        this.runFinished = true;
    }

    getResult()
    {
        return {
            'runSuccess': this.runSuccess,
            'runStarted': this.runStarted,
            'runFinished': this.runFinished,
            'countSuccess': this.countSuccess,
            'countFailures': this.countFailures,
            'totalTests': this.totalTests,
            'tests': this.tests,
        }
    }
}
