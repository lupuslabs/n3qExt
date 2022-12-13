import log = require('loglevel');
import { as } from './as';
import { Utils } from './Utils';
import { is } from './is';
import { Config } from './Config';
const NodeRSA = require('node-rsa');


export enum Pid
{
    Id = 'Id',
    Version = 'Version',
    InventoryId = 'InventoryId',
    Name = 'Name',
    Digest = 'Digest',
    Label = 'Label',
    Description = 'Description',
    Template = 'Template',
    OwnerId = 'OwnerId',
    OwnerName = 'OwnerName',
    IsRezable = 'IsRezable',
    IsTransferable = 'IsTransferable',
    IsUnrezzedAction = 'IsUnrezzedAction',
    DeletableAspect = 'DeletableAspect',
    IsRezzed = 'IsRezzed',
    IsInvisible = 'IsInvisible',
    RezzedX = 'RezzedX',
    RezzedLocation = 'RezzedLocation',
    RezzedDestination = 'RezzedDestination',
    InventoryX = 'InventoryX',
    InventoryY = 'InventoryY',
    State = 'State',
    Provider = 'Provider',
    Stats = 'Stats',
    Display = 'Display',
    IframeAspect = 'IframeAspect',
    IframeOptions = 'IframeOptions',
    IframeUrl = 'IframeUrl',
    DocumentOptions = 'DocumentOptions',
    DocumentUrl = 'DocumentUrl',
    DocumentText = 'DocumentText',
    DocumentTitle = 'DocumentTitle',
    MigrationAspect = 'MigrationAspect',
    MigrationCid = 'MigrationCid',
    AutorezAspect = 'AutorezAspect',
    AutorezIsActive = 'AutorezIsActive',
    IframeAuto = 'IframeAuto',
    IframeAutoRange = 'IframeAutoRange',
    IframeLive = 'IframeLive',
    ImageUrl = 'ImageUrl',
    AnimationsUrl = 'AnimationsUrl',
    Width = 'Width',
    Height = 'Height',
    ActivatableAspect = 'ActivatableAspect',
    ApplierAspect = 'ApplierAspect',
    ClaimAspect = 'ClaimAspect',
    ClaimStrength = 'ClaimStrength',
    ClaimUrl = 'ClaimUrl',
    ClaimAccumulatedDuration = 'ClaimAccumulatedDuration',
    N3qAspect = 'N3qAspect',
    PageEffectAspect = 'PageEffectAspect',
    PointsAspect = 'PointsAspect',
    SettingsAspect = 'SettingsAspect',
    AvatarAspect = 'AvatarAspect',
    NicknameAspect = 'NicknameAspect',
    NicknameText = 'NicknameText',
    // AvatarImageUrl = 'AvatarImageUrl',
    AvatarAnimationsUrl = 'AvatarAnimationsUrl',
    PageEffectDuration = 'PageEffectDuration',
    PageEffectName = 'PageEffectName',
    PointsChannelChat = 'PointsChannelChat',
    PointsChannelEmote = 'PointsChannelEmote',
    PointsChannelGreet = 'PointsChannelGreet',
    PointsChannelNavigation = 'PointsChannelNavigation',
    PointsChannelItemApply = 'PointsChannelItemApply',
    PointsChannelPageOwned = 'PointsChannelPageOwned',
    PointsChannelSocial = 'PointsChannelSocial',
    PointsTotal = 'PointsTotal',
    PointsCurrent = 'PointsCurrent',
    ScreenAspect = 'ScreenAspect',
    ScreenOptions = 'ScreenOptions',
    ScreenUrl = 'ScreenUrl',
    ActivatableIsActive = 'ActivatableIsActive',
    Signed = 'Signed',
    SignatureRsa = 'SignatureRsa',
    Web3WalletAspect = 'Web3WalletAspect',
    Web3WalletAddress = 'Web3WalletAddress',
    Web3WalletNetwork = 'Web3WalletNetwork',
    Web3ContractAspect = 'Web3ContractAspect',
    Web3ContractAddress = 'Web3ContractAddress',
    Web3ContractNetwork = 'Web3ContractNetwork',
    NftAspect = 'NftAspect',
    NftSync = 'NftSync',
    NftOwner = 'NftOwner',
    NftNetwork = 'NftNetwork',
    NftContract = 'NftContract',
    NftTokenId = 'NftTokenId',
    NftTokenUri = 'NftTokenUri',
    ShopImageUrl = 'ShopImageUrl',
    LargeImageUrl = 'LargeImageUrl',
    ShowEffect = 'ShowEffect',
    AutoClaimed = 'AutoClaimed',
    ShowClaimReminder = 'ShowClaimReminder',
    BadgeAspect = 'BadgeAspect',
    BadgeIsActive = 'BadgeIsActive',
    BadgeTitle = 'BadgeTitle',
    BadgeDescription = 'BadgeDescription',
    BadgeLinkUrl = 'BadgeLinkUrl',
    BadgeLinkLabel = 'BadgeLinkLabel',
    BadgeImageUrl = 'BadgeImageUrl',
    BadgeImageWidth = 'BadgeImageWidth',
    BadgeImageHeight = 'BadgeImageHeight',
    BadgeIconUrl = 'BadgeIconUrl',
    BadgeIconWidth = 'BadgeIconWidth',
    BadgeIconHeight = 'BadgeIconHeight',
    BadgeIconX = 'BadgeIconX',
    BadgeIconY = 'BadgeIconY',
}

export class ItemProperties
{
    [pid: string]: string

    static getDisplay(props: ItemProperties): ItemProperties
    {
        let display: ItemProperties = {};

        const displayJson = as.String(props[Pid.Display]);
        if (as.String(displayJson) !== '') {
            display = JSON.parse(displayJson);
        } else {
            const stats = as.String(props[Pid.Stats]);
            const statsPids = stats.split(' ');
            for (let i = 0; i < statsPids.length; i++) {
                const pid = statsPids[i];
                const value = props[pid];
                if (value) {
                    display[pid] = value;
                }
            }
        }

        const provider = as.String(props[Pid.Provider]);
        if (provider && provider !== 'n3q') {
            display[Pid.Provider] = provider;
        }

        return display;
    }

    static verifySignature(props: ItemProperties, publicKey: string): boolean
    {
        if (publicKey) {
            const message = ItemProperties.getSignatureData(props);
            const signature = as.String(props[Pid.SignatureRsa]);
            try {
                const verifier = new NodeRSA(publicKey);
                if (verifier.verify(message, signature, 'utf8', 'base64')) {
                    return true;
                }
            } catch (error) {
                log.info('ItemProperties.verifySignature', error);
            }
        }
        return false;
    }

    static getSignatureData(props: ItemProperties): string
    {
        const signed = as.String(props[Pid.Signed]);
        if (signed !== '') {
            const pids = signed.split(' ');
            let message = '';
            for (let i = 0; i < pids.length; i++) {
                const pid = pids[i];
                const value = as.String(props[pid]);
                message += (message !== '' ? ' | ' : '') + pid + '=' + value;
            }
            return message;
        }
        return '';
    }

    static areEqual(left: ItemProperties, right: ItemProperties)
    {
        const leftSorted = Utils.sortObjectByKey(left);
        const rightSorted = Utils.sortObjectByKey(right);
        return JSON.stringify(leftSorted) === JSON.stringify(rightSorted);
    }

    /**
     * Returns selected properties as generic object.
     *
     * - Discards non-string values.
     * - Discards properties with non-Pid name.
     */
    static getStrings(
        item: undefined | ItemProperties | { [pid: string]: unknown },
        pids?: undefined | Array<Pid>,
    ): { [pid: string]: string }
    {
        const vals: { [pid: string]: string } = {};
        if (is.nil(pids)) {
            // Keep all string properties:
            for (const pid in <{ [prop: string]: unknown }>item) {
                const val = item[pid];
                if (is.string(val)) {
                    vals[pid] = val;
                }
            }
        } else {
            // Keep selected string properties only:
            for (const pid of pids) {
                const val = item[pid];
                if (is.string(val)) {
                    vals[pid] = val;
                }
            }
        }
        return vals;
    }

    static isSimpleTransferable(itemProps: ItemProperties): boolean
    {
        return as.Bool(Config.get('SimpleItemTransfer.enabled'))
            && as.Bool(itemProps[Pid.IsTransferable] ?? '1');
    }

    static getParsedIframeOptions(itemProps: ItemProperties): {[p: string]: any}
    {
        const frameOptsStr = itemProps[Pid.IframeOptions] ?? '{}';
        try {
            const frameOpts = JSON.parse(frameOptsStr);
            return frameOpts;
        } catch (error) {
            return {};
        }
    }

    static getIsBadge(itemProperties: ItemProperties): boolean
    {
        return as.Bool(itemProperties[Pid.BadgeAspect]);
    }

    static getBadgeIconDimensions(itemProperties: ItemProperties): {iconWidth: number, iconHeight: number}
    {
        return {
            iconWidth: as.Int(itemProperties[Pid.BadgeIconWidth]),
            iconHeight: as.Int(itemProperties[Pid.BadgeIconHeight]),
        };
    }

    static getBadgeIconPos(itemProperties: ItemProperties): {iconX: number, iconY: number}
    {
        return {
            iconX: as.Float(itemProperties[Pid.BadgeIconX]),
            iconY: as.Float(itemProperties[Pid.BadgeIconY]),
        };
    }

    static getBadgeIconUrl(itemProperties: ItemProperties): string
    {
        return as.String(itemProperties[Pid.BadgeIconUrl]);
    }

    static getBadgeTitle(itemProperties: ItemProperties): string
    {
        return as.String(itemProperties[Pid.BadgeTitle]);
    }

    static getBadgeImageData(
        itemProperties: ItemProperties
    ): null|{imageUrl: string, imageWidth: number, imageHeight: number} {
        return {
            imageUrl: as.String(itemProperties[Pid.BadgeImageUrl]),
            imageWidth: as.Int(itemProperties[Pid.BadgeImageWidth]),
            imageHeight: as.Int(itemProperties[Pid.BadgeImageHeight]),
        };
    }

    static getBadgeDescription(itemProperties: ItemProperties): string
    {
        return as.String(itemProperties[Pid.BadgeDescription]);
    }

    static getBadgeLinkData(itemProperties: ItemProperties): {linkUrl: string, linkLabel: string}
    {
        return {
            linkUrl: as.String(itemProperties[Pid.BadgeLinkUrl]),
            linkLabel: as.String(itemProperties[Pid.BadgeLinkLabel]),
        }
    }

}

export class ItemPropertiesSet { [id: string]: ItemProperties }

interface PropertyDefinition
{
    inPresence: boolean;
}

export class Property
{
    private static config: { [pid: string]: PropertyDefinition } = {
        [Pid.Id]: { inPresence: true },
        [Pid.Label]: { inPresence: true },
        [Pid.Description]: { inPresence: true },
        [Pid.OwnerId]: { inPresence: true },
        [Pid.OwnerName]: { inPresence: true },
        [Pid.State]: { inPresence: true },
        [Pid.Provider]: { inPresence: true },
        [Pid.ImageUrl]: { inPresence: true },
        [Pid.AnimationsUrl]: { inPresence: true },
        [Pid.Width]: { inPresence: true },
        [Pid.Height]: { inPresence: true },
        [Pid.RezzedX]: { inPresence: true },
        [Pid.IsInvisible]: { inPresence: true },
        [Pid.ClaimAspect]: { inPresence: true },
        [Pid.ClaimStrength]: { inPresence: true },
        [Pid.ClaimUrl]: { inPresence: true },
        [Pid.ClaimAccumulatedDuration]: { inPresence: true },
        [Pid.IframeAspect]: { inPresence: true },
        [Pid.IframeOptions]: { inPresence: true },
        [Pid.IframeUrl]: { inPresence: true },
        [Pid.IframeAuto]: { inPresence: true },
        [Pid.IframeLive]: { inPresence: true },
        [Pid.IframeAutoRange]: { inPresence: true },
        [Pid.DocumentOptions]: { inPresence: true },
        [Pid.DocumentUrl]: { inPresence: true },
        [Pid.DocumentTitle]: { inPresence: true },
        [Pid.DocumentText]: { inPresence: true },
        [Pid.ScreenAspect]: { inPresence: true },
        [Pid.ScreenOptions]: { inPresence: true },
        [Pid.ScreenUrl]: { inPresence: true },
        [Pid.Display]: { inPresence: true },
        [Pid.Signed]: { inPresence: true },
        [Pid.SignatureRsa]: { inPresence: true },
        [Pid.ActivatableIsActive]: { inPresence: true },
        [Pid.ShopImageUrl]: { inPresence: true },
        [Pid.PageEffectName]: { inPresence: true },

        // For unit test
        ['Test1']: { inPresence: true },
        ['Test2']: { inPresence: true },
        ['Test3']: { inPresence: false },
        // ['Test4']: { inPresence: true },
    };

    static inPresence(pid: string): boolean
    {
        if (this.config[pid]) {
            if (this.config[pid].inPresence) {
                return this.config[pid].inPresence;
            }
        }
        return false;
    }
}
