import log = require('loglevel');
import { is } from './is';
import { as } from './as';
import { iterOfIters } from './Iter'
import { Utils } from './Utils';
import { Config } from './Config';
const NodeRSA = require('node-rsa');

import defaultItemImageUrl from '../assets/DefaultItem.png'

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
    IframeLive = 'IframeLive', // Deprecated. Todo: Remove after all clients updated.
    ImageUrl = 'ImageUrl',
    ItemOverlayDefinitions = 'ItemOverlayDefinitions',
    ItemOverlayIds = 'ItemOverlayIds',
    InventoryIframeUrl = 'InventoryIframeUrl',
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
    PersonAspect = 'PersonAspect',
    UserId = 'UserId',
    UserFriendStatus = 'UserFriendStatus',
    UserOnlineStatus = 'UserOnlineStatus',
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
    BadgeIsTool = 'BadgeIsTool',
    BadgeToolOptions = 'BadgeToolOptions',
    BadgeIsPrivate = 'BadgeIsPrivate',
    BadgeFrameUrl = 'BadgeFrameUrl',
    BadgeFrameWidth = 'BadgeFrameWidth',
    BadgeFrameHeight = 'BadgeFrameHeight',
    EditablePropertiesAspect = 'EditablePropertiesAspect',
    EditableProperties = 'EditableProperties',
    PropertiesUrl = 'PropertiesUrl',
    PropertiesUrlRefreshInterval = 'PropertiesUrlRefreshInterval',
    ThemeAspect = 'ThemeAspect',
    ThemeCss = 'ThemeCss',
    ItemShopAspect = 'ItemShopAspect',
    StatBoostAspect = 'StatBoostAspect',
    StatBoostStat = 'StatBoostStat',
    StatBoostValue = 'StatBoostValue',
    StatBoostMax = 'StatBoostMax',
}

export function isPid(value: unknown): value is Pid
{
    return is.string(value) && value in Pid
}

export const userFriendStatuses = ['No', 'ProposedByOwner', 'ProposedByOther', 'Yes'] as const;
export type UserFriendStatus = typeof userFriendStatuses[number];

export function isUserFriendStatus(val: unknown): val is UserFriendStatus
{
    return userFriendStatuses.some(elem => elem === val);
}
export function asUserFriendStatus(val: unknown): UserFriendStatus
{
    return isUserFriendStatus(val) ? val : 'No';
}

export const onlineStatuses = ['Unknown', 'Online', 'Offline'] as const;
export type OnlineStatus = typeof onlineStatuses[number];

export function isOnlineStatus(val: unknown): val is OnlineStatus
{
    return onlineStatuses.some(elem => elem === val);
}
export function asOnlineStatus(val: unknown): OnlineStatus
{
    return isOnlineStatus(val) ? val : 'Unknown';
}

export type PersonData = {
    userId: string,
    userName: string,
    userImageUrl: string,
    ownFriendStatus: UserFriendStatus,
    ownPersonItem: null|ItemProperties,
}

export type ItemOverlayDefinition = {
    readonly id: string,
    readonly imageUrl: string,
    readonly tooltipText: ReadonlyMap<string,string>,
}

type RawItemOverlayDefinition = {id: string, imageUrl: string, tooltipText: {[p: string]: string}}

function isRawItemOverlayDefinition(elem: unknown): elem is RawItemOverlayDefinition
{
    return is.object(elem) && is.string(elem['id']) && is.string(elem['imageUrl']) && is.stringsObject(elem['tooltipText']);
}

export type BadgeIframeData = Readonly<{
    iframeUrl: null|string,
    iframeWidth: null|number,
    iframeHeight: null|number,
}>

export type ItemPropertiesUrlData = Readonly<{
    propertiesUrl: string
    refreshInterval: number
}>

export type ItemStatBoost = Readonly<{
    statBoostStat: string,
    statBoostValue: number,
    statBoostMax: null|number,
}>

export class ItemProperties
{
    [pid: string]: string

    static getId(item: ItemProperties): string
    {
        return item[Pid.Id];
    }

    static getProviderId(item: ItemProperties): string
    {
        return as.String(item[Pid.Provider]);
    }

    static getInventoryId(item: ItemProperties): string
    {
        return as.String(item[Pid.InventoryId]);
    }

    static getVersion(item: ItemProperties): number
    {
        return as.Int(item[Pid.Version]);
    }

    static getDigest(item: ItemProperties): string
    {
        return as.String(item[Pid.Digest]);
    }

    static getOwnerId(itemProperties: ItemProperties): string
    {
        return as.String(itemProperties[Pid.OwnerId]);
    }

    static getLabel(itemProperties: ItemProperties): string
    {
        return as.String(itemProperties[Pid.Label]);
    }

    static getImageUrl(itemProperties: ItemProperties): string
    {
        const url = as.String(itemProperties[Pid.ImageUrl]);
        return url.length !== 0 ? url : defaultItemImageUrl;
    }

    static hasAutorezAspect(itemProperties: ItemProperties): boolean
    {
        return as.Bool(itemProperties[Pid.AutorezAspect]);
    }

    static getAutorezIsActive(itemProperties: ItemProperties): boolean
    {
        return as.Bool(itemProperties[Pid.AutorezAspect]) && as.Bool(itemProperties[Pid.AutorezIsActive]);
    }

    static getItemOverlayDefinitions(itemProperties: ItemProperties): null|ReadonlyMap<string,ItemOverlayDefinition>
    {
        const parsed = ItemProperties.getJsonProperty(itemProperties, Pid.ItemOverlayDefinitions);
        if (!is.array(parsed)) {
            return null;
        }
        const definitions: Map<string,ItemOverlayDefinition> = new Map();
        for (const {id, imageUrl, tooltipText} of parsed.filter(isRawItemOverlayDefinition)) {
            definitions.set(id, { id, imageUrl, tooltipText: new Map(Object.entries(tooltipText)) })
        }
        return definitions;
    }

    static getItemOverlayIds(itemProperties: ItemProperties): string[]
    {
        const parsed = ItemProperties.getJsonProperty(itemProperties, Pid.ItemOverlayIds);
        if (!is.array(parsed, is.string)) {
            return [];
        }
        return parsed;
    }

    static getIsVisibleInBackpack(item: ItemProperties): boolean
    {
        const isInvisible = as.Bool(item[Pid.IsInvisible], false);
        return !isInvisible || as.Bool(Config.get('backpack.showInvisibleItems', false));
    }

    static getHasValidBackpackPosition(item: ItemProperties): boolean
    {
        const {x, y} = ItemProperties.getBackpackPosition(item)
        return x >= 0 && y >= 0
    }

    static getBackpackPosition(item: ItemProperties): {x, y}
    {
        const x = as.Int(item[Pid.InventoryX], -1)
        const y = as.Int(item[Pid.InventoryY], -1)
        return {x, y}
    }

    static getImageData(item: ItemProperties): {imageUrl: string, width: number, height: number}
    {
        const imageUrl = ItemProperties.getImageUrl(item)
        const width = as.Int(item[Pid.Width], 1)
        const height = as.Int(item[Pid.Height], 1)
        return {imageUrl, width, height}
    }

    static getDisplay(props: ItemProperties): ItemProperties
    {
        let display: ItemProperties = {};

        const displayParsed = ItemProperties.getJsonProperty(props, Pid.Display);
        if (is.object(displayParsed)) {
            Object.assign(display, displayParsed);
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

    static getDifferentPids(a: ItemProperties, b: ItemProperties): Set<Pid>
    {
        const pids = iterOfIters(Object.keys(a), Object.keys(b)).filterType(isPid)
        const pidsDifferent = new Set<Pid>(pids.filter(pid => a[pid] !== b[pid]));
        return pidsDifferent;
    }

    static clone(props: ItemProperties): ItemProperties
    {
        return {...props};
    }

    /**
     * Returns selected properties as generic object.
     *
     * - Discards non-string values.
     * - Discards properties with non-Pid name.
     */
    static getStrings(
        item: undefined | ItemProperties | { [pid: string]: unknown },
        pids?: undefined | Array<string>,
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
        const frameOpts = ItemProperties.getJsonProperty(itemProps, Pid.IframeOptions);
        if (!is.object(frameOpts)) {
            return {};
        }
        return frameOpts;
    }

    static getIframeUrl(itemProps: ItemProperties): null|string
    {
        return as.StringOrNull(itemProps[Pid.IframeUrl], 1);
    }

    static getIframeWindowTitle(itemProps: ItemProperties): string
    {
        return as.String(itemProps[Pid.Description] ?? itemProps[Pid.Label] ?? 'Item');
    }

    static getInventoryIframeUrl(item: ItemProperties): string
    {
        return as.String(item[Pid.InventoryIframeUrl]);
    }

    static getIsRezable(item: ItemProperties): boolean
    {
        return as.Bool(item[Pid.IsRezable], true);
    }

    static getIsRezzed(item: ItemProperties): boolean
    {
        return as.Bool(item[Pid.IsRezzed]);
    }

    static getRezzedLocation(item: ItemProperties): null|string
    {
        return as.StringOrNull(item[Pid.RezzedLocation]);
    }

    static getRezzedX(item: ItemProperties): null|number
    {
        return as.IntOrNull(item[Pid.RezzedX]);
    }

    static getIsBadge(itemProperties: ItemProperties): boolean
    {
        return as.Bool(itemProperties[Pid.BadgeAspect]);
    }

    static getBadgeIsActive(itemProperties: ItemProperties): boolean
    {
        return as.Bool(itemProperties[Pid.BadgeIsActive]);
    }

    static getIsToolBadge(itemProperties: ItemProperties): boolean
    {
        return as.Bool(itemProperties[Pid.BadgeIsTool]) && as.Bool(itemProperties[Pid.BadgeAspect]);
    }

    static getBadgeToolOptions(itemProperties: ItemProperties): { left: number, top: number, width: number, height: number }
    {
        let options = { left: 40, top: 40, width: 400, height: 400 };
        const parsed = ItemProperties.getJsonProperty(itemProperties, Pid.BadgeToolOptions);
        if (is.object(parsed)) {
            Object.assign(options, parsed);
        }
        return options;
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

    static getBadgeIframeData(itemProperties: ItemProperties): BadgeIframeData
    {
        return {
            iframeUrl: as.StringOrNull(itemProperties[Pid.BadgeFrameUrl], 1),
            iframeWidth: as.IntOrNull(itemProperties[Pid.BadgeFrameWidth]),
            iframeHeight: as.IntOrNull(itemProperties[Pid.BadgeFrameHeight]),
        }
    }

    static getIsPerson(itemProperties: ItemProperties): boolean
    {
        return as.Bool(itemProperties[Pid.PersonAspect]);
    }

    static getUserId(itemProperties: ItemProperties): string
    {
        return as.String(itemProperties[Pid.UserId]);
    }

    static getUserFriendStatus(itemProperties: ItemProperties): UserFriendStatus
    {
        return asUserFriendStatus(itemProperties[Pid.UserFriendStatus]);
    }

    static getUserOnlineStatus(itemProperties: ItemProperties): OnlineStatus
    {
        return asOnlineStatus(itemProperties[Pid.UserOnlineStatus]);
    }

    static getPersonData(itemProperties: ItemProperties): PersonData
    {
        return {
            userId: ItemProperties.getUserId(itemProperties),
            userName: ItemProperties.getLabel(itemProperties),
            userImageUrl: ItemProperties.getImageUrl(itemProperties),
            ownFriendStatus: ItemProperties.getUserFriendStatus(itemProperties),
            ownPersonItem: itemProperties,
        }
    }

    static getPropertiesUrl(itemProperties: ItemProperties): null|string
    {
        return as.StringOrNull(itemProperties[Pid.PropertiesUrl], 1);
    }

    static getPropertiesUrlRefreshInterval(itemProperties: ItemProperties): number
    {
        const value = ItemProperties.getJsonProperty(itemProperties, Pid.PropertiesUrlRefreshInterval);
        return as.Float(value, 3600);
    }

    static getPropertiesUrlData(itemProperties: ItemProperties): null|ItemPropertiesUrlData
    {
        const propertiesUrl = ItemProperties.getPropertiesUrl(itemProperties)
        if (!propertiesUrl) {
            return null;
        }
        const refreshInterval = ItemProperties.getPropertiesUrlRefreshInterval(itemProperties)
        return { propertiesUrl, refreshInterval }
    }

    static hasThemeAspect(itemProperties: ItemProperties): boolean
    {
        return as.Bool(itemProperties[Pid.ThemeAspect]);
    }

    static getActivatableIsActive(itemProperties: ItemProperties): boolean
    {
        return as.Bool(itemProperties[Pid.ActivatableIsActive]);
    }

    static getThemeData(itemProperties: ItemProperties): null|{id: string, name: string, isEnabled: boolean, css: string, x: number, y: number}
    {
        if (!ItemProperties.hasThemeAspect(itemProperties)) {
            return null;
        }
        const id = ItemProperties.getId(itemProperties);
        const name = ItemProperties.getLabel(itemProperties);
        const isEnabled = ItemProperties.getActivatableIsActive(itemProperties);
        const css = as.StringOrNull(itemProperties[Pid.ThemeCss], 0);
        const {x, y} = ItemProperties.getBackpackPosition(itemProperties);
        return {id, name, isEnabled, css, x, y}
    }

    static getJsonProperty(itemProperties: ItemProperties, pid: Pid): unknown
    {
        const json = itemProperties[pid];
        if (!is.string(json)) {
            return null;
        }
        try {
            return JSON.parse(json);
        } catch (error) {
            return null;
        }
    }

    static isN3qSystemItem(itemProps: ItemProperties): boolean
    {
        return as.Bool(itemProps[Pid.N3qAspect]);
    }

    static isItemShop(itemProps: ItemProperties): boolean
    {
        return as.Bool(itemProps[Pid.ItemShopAspect]);
    }

    static isSystemItemShop(itemProps: ItemProperties): boolean
    {
        return ItemProperties.isN3qSystemItem(itemProps) && ItemProperties.isItemShop(itemProps);
    }

    static getStatBoosts(itemProps: ItemProperties): ReadonlyArray<ItemStatBoost>
    {
        if (!as.Bool(itemProps[Pid.StatBoostAspect])) {
            return [];
        }
        const statBoostStat = itemProps[Pid.StatBoostStat]
        const statBoostMax = as.FloatOrNull(itemProps[Pid.StatBoostMax])
        const statBoostValue = as.FloatOrNull(itemProps[Pid.StatBoostValue])
        if (!is.nonEmptyString(statBoostStat) || is.nil(statBoostValue)) {
            return [];
        }
        return [{statBoostStat, statBoostMax, statBoostValue}]
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
