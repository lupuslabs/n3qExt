import log = require('loglevel');
import { as } from './as';
import { Utils } from './Utils';
const NodeRSA = require('node-rsa');

export class Pid
{
    static readonly Id = 'Id';
    static readonly Name = 'Name';
    static readonly Label = 'Label';
    static readonly Description = 'Description';
    static readonly Reference = 'Reference';
    static readonly Template = 'Template';
    static readonly OwnerId = 'OwnerId';
    static readonly OwnerName = 'OwnerName';
    static readonly IsRezable = 'IsRezable';
    static readonly IsTakeable = 'IsTakeable';
    static readonly IsTransferable = 'IsTransferable';
    static readonly IsRezzed = 'IsRezzed';
    static readonly RezzedX = 'RezzedX';
    static readonly RezzedLocation = 'RezzedLocation';
    static readonly RezzedDestination = 'RezzedDestination';
    static readonly InventoryX = 'InventoryX';
    static readonly InventoryY = 'InventoryY';
    static readonly State = 'State';
    static readonly Provider = 'Provider';
    static readonly Stats = 'Stats';
    static readonly Display = 'Display';
    static readonly IframeAspect = 'IframeAspect';
    static readonly IframeOptions = 'IframeOptions';
    static readonly IframeUrl = 'IframeUrl';
    static readonly DocumentOptions = 'DocumentOptions';
    static readonly DocumentUrl = 'DocumentUrl';
    static readonly DocumentText = 'DocumentText';
    static readonly DocumentTitle = 'DocumentTitle';
    static readonly MigrationAspect = 'MigrationAspect';
    static readonly MigrationCid = 'MigrationCid';
    static readonly AutorezAspect = 'AutorezAspect';
    static readonly AutorezIsActive = 'AutorezIsActive';
    static readonly IframeAuto = 'IframeAuto';
    static readonly IframeAutoRange = 'IframeAutoRange';
    static readonly IframeLive = 'IframeLive';
    static readonly TransferState = 'TransferState';
    static readonly ImageUrl = 'ImageUrl';
    static readonly AnimationsUrl = 'AnimationsUrl';
    static readonly Width = 'Width';
    static readonly Height = 'Height';
    static readonly ApplierAspect = 'ApplierAspect';
    static readonly ClaimAspect = 'ClaimAspect';
    static readonly ClaimStrength = 'ClaimStrength';
    static readonly ClaimUrl = 'ClaimUrl';
    static readonly PointsAspect = 'PointsAspect';
    static readonly SettingsAspect = 'SettingsAspect';
    static readonly AvatarAspect = 'AvatarAspect';
    static readonly NicknameAspect = 'NicknameAspect';
    static readonly NicknameText = 'NicknameText';
    static readonly AvatarAvatarId = 'AvatarAvatarId';
    static readonly AvatarAnimationsUrl = 'AvatarAnimationsUrl';
    static readonly PointsChannelEntered = 'PointsChannelEntered';
    static readonly PointsChannelChat = 'PointsChannelChat';
    static readonly PointsChannelEmote = 'PointsChannelEmote';
    static readonly PointsChannelGreet = 'PointsChannelGreet';
    static readonly PointsChannelNavigation = 'PointsChannelNavigation';
    static readonly PointsChannelItemRez = 'PointsChannelItemRez';
    static readonly PointsChannelItemApply = 'PointsChannelItemApply';
    static readonly PointsTotal = 'PointsTotal';
    static readonly ScreenAspect = 'ScreenAspect';
    static readonly ScreenOptions = 'ScreenOptions';
    static readonly ScreenUrl = 'ScreenUrl';
    static readonly DeactivatableIsInactive = 'DeactivatableIsInactive';
    static readonly Signed = 'Signed';
    static readonly SignatureRsa = 'SignatureRsa';
    static readonly Web3BasedAspect = 'Web3BasedAspect';
    static readonly Web3BasedOwner = 'Web3BasedOwner';
    static readonly Web3WalletAspect = 'Web3WalletAspect';
    static readonly Web3WalletAddress = 'Web3WalletAddress';
    static readonly Web3WalletNetwork = 'Web3WalletNetwork';
    static readonly Web3ContractAspect = 'Web3ContractAspect';
    static readonly Web3ContractAddress = 'Web3ContractAddress';
    static readonly Web3ContractNetwork = 'Web3ContractNetwork';
    static readonly ShopImageUrl = 'ShopImageUrl';

    static readonly TransferState_Source = 'Source';
    static readonly TransferState_Destination = 'Destination';
}

export class ItemProperties
{
    [pid: string]: string

    static getDisplay(props: ItemProperties): ItemProperties
    {
        let display: ItemProperties = {};

        let displayJson = as.String(props[Pid.Display], null);
        if (as.String(displayJson, '') != '') {
            display = JSON.parse(displayJson);
        } else {
            let stats = as.String(props[Pid.Stats], null);
            let statsPids = stats.split(' ');
            for (let i = 0; i < statsPids.length; i++) {
                let pid = statsPids[i];
                let value = props[pid];
                if (value) {
                    display[pid] = value;
                }
            }
        }

        return display;
    }

    static verifySignature(props: ItemProperties, publicKey: string): boolean
    {
        if (publicKey && publicKey != '') {
            let message = ItemProperties.getSignatureData(props);
            let signature = as.String(props[Pid.SignatureRsa], '');
            try {
                let verifier = new NodeRSA(publicKey);
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
        let signed = as.String(props[Pid.Signed], '');
        if (signed != '') {
            let pids = signed.split(' ');
            let message = '';
            for (let i = 0; i < pids.length; i++) {
                let pid = pids[i];
                let value = as.String(props[pid], '');
                message += (message != '' ? ' | ' : '') + pid + '=' + value;
            }
            return message;
        }
        return '';
    }

    static areEqual(left: ItemProperties, right: ItemProperties)
    {
        let leftSorted = Utils.sortObjectByKey(left);
        let rightSorted = Utils.sortObjectByKey(right);
        return JSON.stringify(leftSorted) == JSON.stringify(rightSorted);
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
        [Pid.ClaimAspect]: { inPresence: true },
        [Pid.ClaimStrength]: { inPresence: true },
        [Pid.ClaimUrl]: { inPresence: true },
        [Pid.IframeAspect]: { inPresence: true },
        [Pid.IframeOptions]: { inPresence: true },
        [Pid.IframeUrl]: { inPresence: true },
        [Pid.IframeAuto]: { inPresence: true },
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
        [Pid.DeactivatableIsInactive]: { inPresence: true },
        [Pid.ShopImageUrl]: { inPresence: true },

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
