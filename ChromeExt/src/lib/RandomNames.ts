import { uniqueNamesGenerator, Config, adjectives, colors, animals } from 'unique-names-generator';

export class RandomNames
{
    static getRandomNickname(): string
    {
        const customConfig: Config = {
            dictionaries: [colors, animals],
            separator: ' ',
            length: 2,
            style: 'capital',
        };

        const randomName: string = uniqueNamesGenerator(customConfig);
        return randomName;
    }
}
