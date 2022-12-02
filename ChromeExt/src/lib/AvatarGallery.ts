import { is } from './is';
import { as } from './as';
import { Config } from './Config';
import { Utils } from './Utils';
import { Memory } from './Memory';

export class GalleryAvatar {

    readonly id: string;
    readonly previewImage: string;
    readonly gallery: AvatarGallery;
    readonly galleryIndex: number;

    public constructor(gallery: AvatarGallery, id: string, previewImage: string, galleryIndex: number) {
        this.id = id;
        this.previewImage = previewImage;
        this.gallery = gallery;
        this.galleryIndex = galleryIndex;
    }

    public getConfigUrl(): string
    {
        const avatarUrlDefault = 'https://webex.vulcan.weblin.com/avatars/{id}/config.xml';
        let configUrlTpl = as.String(Config.get('avatars.avatarConfigUrlTemplate', avatarUrlDefault));
        const configUrl = configUrlTpl.replace('{id}', this.id);
        return configUrl;
    }

    public getPreviewUrl(): string
    {
        return new URL(this.previewImage, this.getConfigUrl()).toString();
    }

    public getPreviousAvatar(): GalleryAvatar
    {
        let index = this.galleryIndex - 1;
        if (index < 0) {
            index = this.gallery.getLength() - 1;
        }
        return this.gallery.getAvatarByIndex(index);
    }

    public getNextAvatar(): GalleryAvatar
    {
        let index = this.galleryIndex + 1;
        if (index >= this.gallery.getLength()) {
            index = 0;
        }
        return this.gallery.getAvatarByIndex(index);
    }

    public async setAvatarInLocalMemory(): Promise<void>
    {
        await Memory.setLocal(Utils.localStorageKey_Avatar(), this.id);
    }

}

export class AvatarGallery
{
    protected avatars: GalleryAvatar[] = [];

    public constructor() {
        for (let {id, previewImage} of Config.get('avatars.gallery', [])) {
            if (is.string(id) && is.string(previewImage)) {
                this.avatars.push(new GalleryAvatar(this, id, previewImage, this.avatars.length));
            }
        }
        if (this.avatars.length === 0) {
            this.avatars.push(new GalleryAvatar(this, 'gif/004/pinguin', 'idle.gif', 0));
        }
    }

    public getLength(): number
    {
        return this.avatars.length;
    }

    public getAvatarById(avatarId: string): GalleryAvatar
    {
        return this.getAvatarByIdOpt(avatarId) ?? this.getRandomAvatar();
    }

    public getAvatarByIndex(avatarIndex: number): GalleryAvatar
    {
        return this.avatars[avatarIndex] ?? this.getRandomAvatar();
    }

    public getRandomAvatar(): GalleryAvatar
    {
        const avatarIds: string[] = Config.get('avatars.randomAvatarIds', []);
        const avatarId = avatarIds[Utils.randomInt(0, avatarIds.length)] ?? '';
        const avatar = this.getAvatarByIdOpt(avatarId) ?? this.avatars[0];
        return avatar;
    }

    public async getAvatarFromLocalMemory(): Promise<GalleryAvatar>
    {
        let avatarId = as.String(await Memory.getLocal(Utils.localStorageKey_Avatar(), ''));
        const avatar = this.getAvatarById(avatarId);
        if (avatarId !== avatar.id) {
            await avatar.setAvatarInLocalMemory();
        }
        return avatar;
    }

    protected getAvatarByIdOpt(avatarId: string): null|GalleryAvatar
    {
        const avatarIdMangled = this.automigrateAvatarId(avatarId);
        return this.avatars.find(a => a.id === avatarIdMangled) ?? null;
    }

    protected automigrateAvatarId(avatarId: string): string
    {
        if (false) { // Dummy.

        } else if (/^[^\/]+$/.test(avatarId)) {
            // In ancient times, the avatar root folder was the gif/002 subfolder.
            // Affected IDs consist of only a single path element (the corresponding avatar folder name):
            avatarId = `gif/002/${avatarId}`;

        } else if (/^[0-9]+\//.test(avatarId)) {
            // Before v1.2.4, the avatar root folder was the gif subfolder.
            // Affected IDs start with a purely digits folder name and need the GIF folder prefix:
            avatarId = `gif/${avatarId}`;

        }
        return avatarId;
    }

}
