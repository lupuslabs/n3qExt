import log = require('loglevel');
import { ItemProperties } from './ItemProperties';
import { ContentApp } from '../contentscript/ContentApp';

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
    constructor(public id: string,)
    {
    }
}

export class ContentMessage
{
    static readonly type_recvStanza = 'recvStanza';
    static readonly type_userSettingsChanged = 'userSettingsChanged';
    static readonly type_extensionActiveChanged = 'extensionActiveChanged';
    static readonly type_onBackpackShowItem = 'onBackpackShowItem';
    static readonly type_onBackpackSetItem = 'onBackpackSetItem';
    static readonly type_onBackpackHideItem = 'onBackpackHideItem';
    static readonly type_sendPresence = 'sendPresence';
    static readonly type_clientNotification = 'clientNotification';

    static content: ContentApp;

    static sendMessage(tabId: number, message: any): void
    {
        if (ContentMessage.content) {
            ContentMessage.content.onDirectRuntimeMessage(message);
        } else {
            chrome.tabs.sendMessage(tabId, message);
        }
    }
}
