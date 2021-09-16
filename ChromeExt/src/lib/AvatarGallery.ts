import { Config } from './Config';
import { Utils } from './Utils';

export class AvatarGallery
{
    static getRandomAvatar(): string
    {
        let avatar = '004/pinguin';
        let avatars: Array<string> = Config.get('avatars.randomList', ['004/pinguin']);
        let index = Utils.randomInt(0, avatars.length);
        avatar = avatars[index];
        return avatar;
    }
}
