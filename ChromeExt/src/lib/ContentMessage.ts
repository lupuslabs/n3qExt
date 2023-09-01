import { ItemProperties } from './ItemProperties';

export class BackpackShowItemData
{
    constructor(public id: string, public properties: ItemProperties)
    {
    }
}

export class BackpackSetItemData
{
    constructor(public id: string, public properties: ItemProperties)
    {
    }
}

export class BackpackRemoveItemData
{
    constructor(public id: string, public properties: ItemProperties)
    {
    }
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
    static readonly type_onBackpackShowItem = 'onBackpackShowItem';
    static readonly type_onBackpackSetItem = 'onBackpackSetItem';
    static readonly type_onBackpackHideItem = 'onBackpackHideItem';
    static readonly type_clientNotification = 'clientNotification';
    static readonly type_chatMessagePersisted = 'chatMessagePersisted';
    static readonly type_chatHistoryDeleted = 'chatHistoryDeleted';
}
