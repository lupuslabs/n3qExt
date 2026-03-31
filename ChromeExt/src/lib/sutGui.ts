import { DomUtils } from './DomUtils';
import { sut } from './sut';

export class sutGui
{
    render(s: sut, parent: any)
    {
        const result = s.getResult();

        const eTop = DomUtils.elemOfHtml('<div class="sut" />');
        if (result.runSuccess) {
            eTop.classList.add('sut-success');
        } else {
            eTop.classList.add('sut-failure');
        }

        const eTotals = DomUtils.elemOfHtml('<div class="sut-totals" />');

        {
            const e = DomUtils.elemOfHtml('<div class="sut-total sut-total-runSuccess">Success</div>');
            e.append(DomUtils.elemOfHtml('<div class="sut-label" />'));
            e.append(DomUtils.elemOfHtml('<div class="sut-value">' + (result.runSuccess ? 'true' : 'false') + '</div>'));
            eTotals.append(e);
        }

        {
            const e = DomUtils.elemOfHtml('<div class="sut-total sut-total-countSuccess">Successful</div>');
            e.append(DomUtils.elemOfHtml('<div class="sut-label" />'));
            e.append(DomUtils.elemOfHtml('<div class="sut-value">' + result.countSuccess + '</div>'));
            eTotals.append(e);
        }

        {
            const e = DomUtils.elemOfHtml('<div class="sut-total sut-total-countFailures">Failures</div>');
            e.append(DomUtils.elemOfHtml('<div class="sut-label" />'));
            e.append(DomUtils.elemOfHtml('<div class="sut-value">' + result.countFailures + '</div>'));
            eTotals.append(e);
        }

        eTop.append(eTotals);

        const eList = DomUtils.elemOfHtml('<div class="sut-testlist" />');
        for (const name in result.tests) {
            const eTest = DomUtils.elemOfHtml('<div class="sut-test" />');
            if (result.tests[name].success) {
                eTest.classList.add('sut-test-success');
            } else {
                eTest.classList.add('sut-test-failure');
            }

            {
                const e = DomUtils.elemOfHtml('<div class="sut-class" />');
                e.textContent = result.tests[name].className;
                eTest.append(e);
            }

            {
                const e = DomUtils.elemOfHtml('<div class="sut-name" />');
                e.textContent = result.tests[name].methodName;
                eTest.append(e);
            }

            {
                const e = DomUtils.elemOfHtml('<div class="sut-result" />');
                e.textContent = result.tests[name].result;
                eTest.append(e);
            }

            eList.append(eTest);
        }

        eTop.append(eList);

        parent.append(eTop);
    }
}
