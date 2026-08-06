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
        const params: { [p: string]: string } = {}
        const sequences: { [id: string]: AvatarAnimationSequence } = {}

        const xml = new DOMParser().parseFromString(data, 'text/xml');
        if (xml.querySelector('parsererror')) {
            throw new Error('XML parse error');
        }

        for (const param of xml.querySelectorAll('param' as string)) { // Linter detects name of deprecated HTML param element without explicit recast
            const name = param.getAttribute('name');
            const value = param.getAttribute('value');
            if (!is.nil(name) && !is.nil(value)) {
                params[name] = value;
            }
        }

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

        for (const sequence of xml.getElementsByTagName('sequence')) {
            const id: string = sequence.getAttribute('name');

            const record: AvatarAnimationSequence = new AvatarAnimationSequence();
            record.group = sequence.getAttribute('group');
            record.type = sequence.getAttribute('type');
            record.weight = as.Int(sequence.getAttribute('probability'), 1);
            record.in = sequence.getAttribute('in');
            record.out = sequence.getAttribute('out');

            const animation = sequence.getElementsByTagName('animation')[0];

            const src: string = animation?.getAttribute('src');
            if (!src.startsWith('http')) {
                const url: URL = new URL(src, dataUrl);
                record.url = url.toString();
            } else {
                record.url = src;
            }

            const dx: number = as.Int(animation?.getAttribute('dx'), null);
            if (dx != null) {
                record.dx = dx;
            }

            const duration: number = as.Int(animation?.getAttribute('duration'), -1);
            if (duration > 0) {
                record.duration = duration;
            }

            const loop: boolean = as.Bool(animation?.getAttribute('loop'), null);
            if (loop != null) {
                record.loop = loop;
            }

            sequences[id] = record;
        }

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
