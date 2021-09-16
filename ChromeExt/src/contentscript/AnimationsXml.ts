const $ = require('jquery');
import { as } from '../lib/as';

export class AvatarAnimationParam
{
    static defaultsequence: string = 'defaultsequence';
    name: string;
    value: string;
}

export class AvatarAnimationSequence
{
    group: string;
    type: string;
    weight: number;
    in: string;
    out: string;
    url: string;
    dx: number;
    duration: number;
    loop: boolean;
}

export class AnimationsDefinition
{
    constructor(
        public params: { [id: string]: AvatarAnimationParam },
        public sequences: { [id: string]: AvatarAnimationSequence }
    ) { }
}

export class AnimationsXml
{
    static parseXml(dataUrl: string, data: string): AnimationsDefinition
    {
        let params: { [id: string]: AvatarAnimationParam } = {};
        let sequences: { [id: string]: AvatarAnimationSequence } = {};

        let xml = $.parseXML(data);

        $(xml).find('param').each((index, param) =>
        {
            params[$(param).attr('name')] = $(param).attr('value');
        });

        $(xml).find('sequence').each((index, sequence) =>
        {
            let id: string = $(sequence).attr('name');

            let record: AvatarAnimationSequence = new AvatarAnimationSequence();
            record.group = $(sequence).attr('group');
            record.type = $(sequence).attr('type');
            record.weight = as.Int($(sequence).attr('probability'), 1);
            record.in = $(sequence).attr('in');
            record.out = $(sequence).attr('out');

            let animation = $(sequence).find('animation').first();

            let src: string = $(animation).attr('src');
            if (!src.startsWith('http')) {
                let url: URL = new URL(src, dataUrl);
                record.url = url.toString();
            } else {
                record.url = src;
            }

            let dx: number = as.Int($(animation).attr('dx'), null);
            if (dx != null) {
                record.dx = dx;
            }

            let duration: number = as.Int($(animation).attr('duration'), -1);
            if (duration > 0) {
                record.duration = duration;
            }

            let loop: boolean = as.Bool($(animation).attr('loop'), null);
            if (loop != null) {
                record.loop = loop;
            }

            sequences[id] = record;
        });

        return new AnimationsDefinition(params, sequences);
    }
}
