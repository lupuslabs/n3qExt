import { ItemProperties } from './ItemProperties';

export class BackpackUpdateData
{
    constructor(public itemsHide: ItemProperties[], public itemsShowOrSet: ItemProperties[]) {}
}

export class ContentMessage
{
    static readonly type_sendStateToBackground = 'sendStateToBackground';
    static readonly type_configChanged = 'configChanged';
    static readonly type_xmppIo = 'xmppIo';
    static readonly type_recvStanza = 'recvStanza';
    static readonly type_extensionIsGuiEnabledChanged = 'extensionGuiVisibilityChanged';
    static readonly type_onBackpackUpdate = 'onBackpackUpdate';
    static readonly type_clientNotification = 'clientNotification';
    static readonly type_chatMessagePersisted = 'chatMessagePersisted';
    static readonly type_chatHistoryDeleted = 'chatHistoryDeleted';
    static readonly type_friendshipProposalsState = 'friendshipProposalsState';
}

export type FriendshipProposalState = {
    proposingUserId: string,
    proposingUserName: string,
    proposingUserImageUrl: string,
    firstNotificationTime: Date,
}

export type FriendshipProposalsState = {
    proposed: FriendshipProposalState[],
    canceled: string[], // IDs of users that might have proposed a friendship before but aren't doing so right now.
}
