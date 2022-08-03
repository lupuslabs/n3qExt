import { uniqueNamesGenerator, Config as NamesGeneratorConfig, adjectives, colors, animals } from 'unique-names-generator';
import { Config } from './Config';

export class RandomNames
{
    static getRandomNickname(): string
    {
        const customConfig: NamesGeneratorConfig = {
            dictionaries: [colors, animals],
            separator: ' ',
            length: 2,
            style: 'capital',
        };

        let randomName: string;

        const maxRetries = Config.get('settings.nameGeneratorBlocklistRetries', 20);
        const blocklist = Config.get('settings.nameGeneratorBlocklist', []);
        for (let i = 0; i < maxRetries; i++) {
            randomName = uniqueNamesGenerator(customConfig);
            const lowerName = randomName.toLowerCase();
            let blocked = false;
            for (const word of blocklist) {
                if (lowerName.indexOf(word) >= 0) {
                    blocked = true;
                    break;
                }
            }
            if (!blocked) { break; }
        }

        return randomName;
    }
}
