import { is } from './is';
import { as } from './as';
import { Config } from './Config';
import { Utils } from './Utils';
import { Memory } from './Memory';

export class GalleryAvatar {

    readonly id: string;
    readonly previewImage: string;
    readonly gallery: AvatarGallery;
    readonly isSelectable: boolean;
    readonly galleryIndex: number;

    public constructor(
        gallery: AvatarGallery, id: string, previewImage: string, isSelectable: boolean, galleryIndex: number,
    ) {
        this.id = id;
        this.previewImage = previewImage;
        this.gallery = gallery;
        this.isSelectable = isSelectable;
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

    public getIsSelectable(): boolean
    {
        return this.isSelectable;
    }

    public getPreviousAvatar(): GalleryAvatar
    {
        if (!this.isSelectable) {
            return this.gallery.getSelectableAvatarByIndex(this.gallery.getSelectableLength());
        }
        let index = this.galleryIndex - 1;
        if (index < 0) {
            index = this.gallery.getSelectableLength() - 1;
        }
        return this.gallery.getSelectableAvatarByIndex(index);
    }

    public getNextAvatar(): GalleryAvatar
    {
        if (!this.isSelectable) {
            return this.gallery.getSelectableAvatarByIndex(0);
        }
        let index = this.galleryIndex + 1;
        if (index >= this.gallery.getSelectableLength()) {
            index = 0;
        }
        return this.gallery.getSelectableAvatarByIndex(index);
    }

    public async setAvatarInLocalMemory(): Promise<void>
    {
        await Memory.setLocal(Utils.localStorageKey_Avatar(), this.id);
    }

}

export class AvatarGallery
{
    protected avatars: GalleryAvatar[] = [];
    protected avatarsSelectable: GalleryAvatar[] = [];

    public constructor() {
        for (let {id, previewImage, isSelectable} of Config.get('avatars.gallery', [])) {
            if (is.string(id) && is.string(previewImage)) {
                const index = this.avatarsSelectable.length;
                const avatar = new GalleryAvatar(this, id, previewImage, isSelectable ?? true, index);
                this.avatars.push(avatar);
                if (avatar.getIsSelectable()) {
                    this.avatarsSelectable.push(avatar);
                }
            }
        }
        if (this.avatarsSelectable.length === 0) {
            const avatar = new GalleryAvatar(this, 'gif/004/pinguin', 'idle.gif', true, 0);
            this.avatars.push(avatar);
            this.avatarsSelectable.push(avatar);
        }
    }

    public getSelectableLength(): number
    {
        return this.avatarsSelectable.length;
    }

    public getAvatarById(avatarId: string): GalleryAvatar
    {
        return this.getAvatarByIdOpt(avatarId) ?? this.getRandomAvatar();
    }

    public getAvatarByIdOpt(avatarId: string): null|GalleryAvatar
    {
        const avatarIdMangled = this.automigrateAvatarId(avatarId);
        return this.avatars.find(a => a.id === avatarIdMangled) ?? null;
    }

    public getSelectableAvatarByIndex(avatarIndex: number): GalleryAvatar
    {
        return this.avatarsSelectable[avatarIndex] ?? this.getRandomAvatar();
    }

    public getRandomAvatar(): GalleryAvatar
    {
        const avatarIds: string[] = Config.get('avatars.randomAvatarIds', []);
        const avatarId = avatarIds[Utils.randomInt(0, avatarIds.length)] ?? '';
        const avatar = this.getAvatarByIdOpt(avatarId) ?? this.avatarsSelectable[0];
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
