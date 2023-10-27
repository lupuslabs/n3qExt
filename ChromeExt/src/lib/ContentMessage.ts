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
    static readonly type_userSettingsChanged = 'userSettingsChanged';
    static readonly type_extensionActiveChanged = 'extensionActiveChanged';
    static readonly type_extensionIsGuiEnabledChanged = 'extensionGuiVisibilityChanged';
    static readonly type_onBackpackUpdate = 'onBackpackUpdate';
    static readonly type_clientNotification = 'clientNotification';
    static readonly type_chatMessagePersisted = 'chatMessagePersisted';
    static readonly type_chatHistoryDeleted = 'chatHistoryDeleted';
}
