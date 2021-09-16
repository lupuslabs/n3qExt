const $ = require('jquery');
import { sut } from './sut';

export class sutGui
{
    render(s: sut, parent: any)
    {
        let result = s.getResult();

        let eTop = <HTMLDivElement>$('<div class="sut" />').get(0);
        if (result.runSuccess) {
            $(eTop).addClass('sut-success');
        } else {
            $(eTop).addClass('sut-failure');
        }

        let eTotals = <HTMLDivElement>$('<div class="sut-totals" />').get(0);

        {
            let e = <HTMLDivElement>$('<div class="sut-total sut-total-runSuccess">Success</div>').get(0);
            e.append($('<div class="sut-label" />').get(0));
            e.append($('<div class="sut-value">' + (result.runSuccess ? 'true' : 'false') + '</div>').get(0));
            eTotals.append(e);
        }

        {
            let e = <HTMLDivElement>$('<div class="sut-total sut-total-countSuccess">Successful</div>').get(0);
            e.append($('<div class="sut-label" />').get(0));
            e.append($('<div class="sut-value">' + result.countSuccess + '</div>').get(0));
            eTotals.append(e);
        }

        {
            let e = <HTMLDivElement>$('<div class="sut-total sut-total-countFailures">Failures</div>').get(0);
            e.append($('<div class="sut-label" />').get(0));
            e.append($('<div class="sut-value">' + result.countFailures + '</div>').get(0));
            eTotals.append(e);
        }

        eTop.append(eTotals);

        let eList = <HTMLDivElement>$('<div class="sut-testlist" />').get(0);
        for (var name in result.tests) {
            let eTest = <HTMLDivElement>$('<div class="sut-test" />').get(0);
            if (result.tests[name].success) {
                $(eTest).addClass('sut-test-success');
            } else {
                $(eTest).addClass('sut-test-failure');
            }

            {
                let e = <HTMLDivElement>$('<div class="sut-class" />').get(0);
                $(e).text(result.tests[name].className);
                eTest.append(e);
            }

            {
                let e = <HTMLDivElement>$('<div class="sut-name" />').get(0);
                $(e).text(result.tests[name].methodName);
                eTest.append(e);
            }

            {
                let e = <HTMLDivElement>$('<div class="sut-result" />').get(0);
                $(e).text(result.tests[name].result);
                eTest.append(e);
            }

            eList.append(eTest);
        };

        eTop.append(eList);

        parent.append(eTop);
    }
}
