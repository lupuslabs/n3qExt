const $ = require('jquery');
import { is } from '../lib/is';
import { as } from '../lib/as';
import { Config } from '../lib/Config';

export type AvatarAnimationParams = {[id: string]: string|number} & { 
    width: number,
    height: number,
    chatBubblesBottom: number,
    chatinBottom: number,
};

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
    static defaultsequence: string = 'defaultsequence';

    constructor(
        public params: AvatarAnimationParams,
        public sequences: { [id: string]: AvatarAnimationSequence }
    ) { }
}

type BottomOffsetRules = [{avatarHeightMin: number, bottomOffset: number}];

export class AnimationsXml
{
    static parseXml(dataUrl: string, data: string): AnimationsDefinition
    {
        let params: {[p: string]: string} = {};
        let sequences: { [id: string]: AvatarAnimationSequence } = {};

        let xml = $.parseXML(data);

        $(xml).find('param').each((index, param) =>
        {
            const [name, value] = [$(param).attr('name'), $(param).attr('value')];
            if (!is.nil(name) && !is.nil(value)) {
                params[name] = value;
            }
        });

        const defaultSize = Config.get('room.defaultAnimationSize', 100);
        const width = as.Int(params.width, defaultSize);
        const height = as.Int(params.height, defaultSize);

        const chatBubblesBottomStr = params.chatBubblesBottom;
        const chatBubblesDefault = Config.get('room.chatBubblesDefaultBottom', 100);
        const chatBubblesRules = Config.get('room.chatBubblesDefaultBottomAvatarHeightFactors', []);
        const chatBubblesBottom = this.getavatarHeightDependentBottomOffset(
            chatBubblesBottomStr, height, chatBubblesRules, chatBubblesDefault
        );

        const chatinBottomStr = params.chatinBottom;
        const chatinRules = Config.get('room.chatinDefaultBottomAvatarHeightFactors', []);
        const chatinDefault = Config.get('room.chatinDefaultBottom', 35);
        const chatinBottom = this.getavatarHeightDependentBottomOffset(
            chatinBottomStr, height, chatinRules, chatinDefault
        );

        const paramsParsed: AvatarAnimationParams = {
            ...params, width, height, chatBubblesBottom, chatinBottom,
        };
        
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

        return new AnimationsDefinition(paramsParsed, sequences);
    }

    protected static getavatarHeightDependentBottomOffset(
        bottomOffsetStr: null|string, avatarHeight: number, heightFRules: BottomOffsetRules, defaultValue: number,
    ): number {
        for (const {avatarHeightMin, bottomOffset} of heightFRules) {
            if (avatarHeight >= avatarHeightMin) {
                return as.Int(bottomOffsetStr, bottomOffset);
            }
        }
        return defaultValue;
    }

}
