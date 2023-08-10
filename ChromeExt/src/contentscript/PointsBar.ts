import * as $ from 'jquery';
import { as } from '../lib/as';
import { IObserver, IObservable } from '../lib/ObservableProperty';
import { ContentApp } from './ContentApp';
import { Participant } from './Participant';
import { Config } from '../lib/Config';
import { PointsGenerator } from './PointsGenerator';
import { Utils } from '../lib/Utils';
import { BackgroundMessage } from '../lib/BackgroundMessage';
import { ItemPropertiesSet, Pid } from '../lib/ItemProperties';
import { PointerEventData } from '../lib/PointerEventData';

export class PointsBar implements IObserver
{
    private elem: HTMLDivElement;
    private points: number;

    getElem(): HTMLDivElement { return this.elem; }
    getPoints(): number { return this.points; }

    constructor(protected app: ContentApp, private participant: Participant, private display: HTMLElement)
    {
        this.elem = <HTMLDivElement>$('<div class="n3q-base n3q-points" />').get(0);

        this.elem.addEventListener('pointerdown', (ev: PointerEvent) => {
            this.participant?.select();
        }, { capture: true });
        this.elem.addEventListener('pointerenter', (ev: PointerEvent) => {
            this.participant.onMouseEnterAvatar(new PointerEventData('hoverenter', ev, this.elem));
        });
        this.elem.addEventListener('pointermove', (ev: PointerEvent) => {
            this.participant?.onMouseEnterAvatar(new PointerEventData('hovermove', ev, this.elem));
        });
        this.elem.addEventListener('pointerleave', (ev: PointerEvent) => {
            this.participant?.onMouseLeaveAvatar(new PointerEventData('hoverleave', ev, this.elem));
        });

        display.appendChild(this.elem);
    }

    stop()
    {
        // Nothing to do
    }

    updateObservableProperty(name: string, value: string): void
    {
        if (name == 'Points') {
            this.setPoints(as.Int(value, 0));

            if (this.participant.getIsSelf()) {
                /*await*/ this.showTitleWithActivities();
            }
        }
    }

    setPoints(points: number): void
    {
        this.points = points;
        $(this.elem).empty();

        let title = String(this.points);
        $(this.elem).attr('title', '' + title);

        let pg = new PointsGenerator(4,
            Config.get('points.fullLevels', 2),
            Config.get('points.fractionalLevels', 1)
        );
        let digits = pg.getDigitList(points);
        let parts = pg.getPartsList(digits);
        let stars = parts.map(part => <HTMLDivElement>$('<div class="n3q-base n3q-points-icon n3q-points-icon-' + part + '" />').get(0));
        $(this.elem).append(stars);
    }

    async showTitleWithActivities(): Promise<void>
    {
        let title = this.app.translateText('Activity.TotalPoints') + ': ' + String(this.points);

        if (Utils.isBackpackEnabled()) {
            let activitiesConfig = Config.get('points.activities', {});
            let propSet = await BackgroundMessage.findBackpackItemProperties({ [Pid.PointsAspect]: 'true' })
                .catch(errorResponse => {
                    this.app.onError(errorResponse);
                    return new ItemPropertiesSet();
                });
            for (let id in propSet) {
                let props = propSet[id];
                for (let channel in activitiesConfig) {
                    if (props[channel]) {
                        let value = as.Int(props[channel], 0);
                        // if (value != 0) {
                            title += '\r\n' + this.app.translateText('Activity.' + channel) + ': ' + value;
                        // }
                    }
                }
            }
        }


        $(this.elem).attr('title', '' + title);
    }
}
