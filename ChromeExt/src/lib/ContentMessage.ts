import { ItemProperties, PersonData } from './ItemProperties';
import { ThemeUtils } from './ThemeUtils'

export class BackpackUpdateData
{
    constructor(public itemsHide: ItemProperties[], public itemsShowOrSet: ItemProperties[]) {}
}

export namespace ContentMessage
{
    export const type_sendStateToBackground = 'sendStateToBackground';
    export const type_configChanged = 'configChanged';
    export const type_xmppIo = 'xmppIo';
    export const type_recvStanza = 'recvStanza';
    export const type_extensionIsGuiEnabledChanged = 'extensionGuiVisibilityChanged';
    export const type_onBackpackUpdate = 'onBackpackUpdate';
    export const type_clientNotification = 'clientNotification';
    export const type_chatMessagePersisted = 'chatMessagePersisted';
    export const type_chatHistoryDeleted = 'chatHistoryDeleted';
    export const type_unreadChatChannels = 'unreadChatChannels';
    export const type_friendshipProposalsState = 'friendshipProposalsState';
    export const type_themes = 'themes';
    export const type_setGuiMode = 'setGuiMode';
    export const type_openInstantMessagesWindow = 'openInstantMessagesWindow';
    export const type_openPersonsWindow = 'openPersonsWindow';
    export const type_openBackpackItemInfo = 'openBackpackItemInfo';
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

export type ContentThemesMessage = {
    type: typeof ContentMessage.type_themes
    themes: ThemeUtils.Theme[]
}

export type ContentAppGuiMode = 'full' | 'popupWindow'

export type ContentSetGuiModeMessage = {
    type: typeof ContentMessage.type_setGuiMode
    mode: ContentAppGuiMode
}

export type ContentOpenInstantMessagesWindowMessage = {
    type: typeof ContentMessage.type_openInstantMessagesWindow
    otherPerson: Readonly<PersonData>
}

export type ContentOpenPersonsWindowMessage = {
    type: typeof ContentMessage.type_openPersonsWindow
}

export type ContentOpenBackpackItemInfo = {
    type: typeof ContentMessage.type_openBackpackItemInfo
    itemId: string
    withDebugInfo: null|boolean
}
