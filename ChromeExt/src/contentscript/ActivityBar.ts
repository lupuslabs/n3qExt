import * as $ from 'jquery';
import { as } from '../lib/as';
import { IObserver, IObservable } from '../lib/ObservableProperty';
import { ContentApp } from './ContentApp';
import { Participant } from './Participant';
import { Config } from '../lib/Config';
import { PointsGenerator } from './PointsGenerator';
import { Utils } from '../lib/Utils';
import { BackgroundMessage } from '../lib/BackgroundMessage';
import { Pid } from '../lib/ItemProperties';
import { PointerEventData } from '../lib/PointerEventData';

export class ActivitySet { [channel: string]: number }

export class ActivityBar implements IObserver
{
    private elem: HTMLDivElement;
    private activities: any;

    getElem(): HTMLDivElement { return this.elem; }
    getPoints(): number { return this.activities; }

    constructor(protected app: ContentApp, private participant: Participant, private display: HTMLElement)
    {
        this.elem = <HTMLDivElement>$('<div class="n3q-base n3q-activity" />').get(0);

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
        if (name === 'Activities') {
            let activities = JSON.parse(value);
            // this.setActivities(activities);
        }
    }

    async setActivities(): Promise<void>
    {
        let activitiesConfig = Config.get('points.activities', {});

        let activities = new ActivitySet();
        if (Utils.isBackpackEnabled()) {

            // Todo: Catch and handle error:
            let propSet = await BackgroundMessage.findBackpackItemProperties({ [Pid.PointsAspect]: 'true' });

            for (let id in propSet) {
                let props = propSet[id];
                for (let channel in activitiesConfig) {
                    if (props[channel]) {
                        activities[channel] = as.Int(props[channel], 0);
                    }
                }
            }
        }

        this.activities = activities;
        $(this.elem).empty();

        let channelContributions = new ActivitySet();

        for (let channel in activitiesConfig) {
            let config = activitiesConfig[channel];
            let value = as.Int(activities[channel], 0);
            let x = value - config.x0;
            let contribution = x * config.weight;
            channelContributions[channel] = contribution;
        }

        let availableWidth = $(this.elem).width();

        let left = 0;
        for (let channel in channelContributions) {
            let config = Config.get('points.activities.' + channel, null);
            if (config != null) {
                let contribution = activities[channel];
                if (contribution > 0) {
                    let width = contribution * 5;
                    let title = this.app.translateText('Activity.' + channel) + ': ' + activities[channel];

                    let part = <HTMLDivElement>$('<div class="n3q-base n3q-activity-segment" />').get(0);
                    $(part).css(Config.get('points.activities.' + channel + '.css', { backgroundColor: '#808080' }));
                    $(part).css({ position: 'absolute', height: '100%', width: width + 'px', left: left + 'px' });
                    $(part).css({ 'width': width + 'px' });
                    $(part).attr('title', '' + title);

                    $(this.elem).append(part);
                    left += width;
                }
            }
        }
    }
}
