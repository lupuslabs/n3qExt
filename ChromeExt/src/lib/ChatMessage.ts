﻿// Chat records as generated by (Private)ChatWindow and stored in a chat history.

import { is } from './is';
import { Utils } from './Utils';

const chatTypes = ['roompublic', 'roomprivate'] as const;
export type ChatType = typeof chatTypes[number];

export type Chat = {
    type:      ChatType;
    roomJid:   string;
    roomNick:  string;
};

export const chatMessageTypes = ['chat', 'emote', 'cmd', 'cmdResult', 'participantStatus', 'itemStatus', 'info', 'debug'] as const;
export type ChatMessageType = typeof chatMessageTypes[number];

export const userChatMessageTypes = ['chat', 'emote'] as const;
export type UserChatMessageType = typeof userChatMessageTypes[number];
void((a: UserChatMessageType) : ChatMessageType => a); // Makes transpiler detect non-ChatMessageType in UserChatMessageType.

export type ChatMessage = {
    timestamp: string;
    id:        string;
    type:      ChatMessageType;
    nick:      string;
    text:      string;
};

export function isChatType(val: unknown): val is ChatType
{
    return chatTypes.some(elem => elem === val);
}

export function isChat(val: unknown): val is Chat
{
    return is.object(val)
    && isChatType(val.type)
    && is.string(val.roomJid)
    && is.string(val.roomNick)
    && !(val.roomNick !== '' && val.type === 'roompublic')
    ;
}

export function isChatMessageType(val: unknown): val is ChatMessageType
{
    return chatMessageTypes.some(elem => elem === val);
}

export function isUserChatMessageType(val: unknown): val is UserChatMessageType
{
    return userChatMessageTypes.some(elem => elem === val);
}

export function isChatMessage(val: unknown): val is ChatMessage
{
    return is.object(val)
    && is.string(val.timestamp)
    && is.string(val.id)
    && isChatMessageType(val.type)
    && is.string(val.nick)
    && is.string(val.text)
    ;
}

export function areChatsEqual(chatA: Chat, chatB: Chat): boolean
{
    return chatA.type === chatB.type && chatA.roomJid === chatB.roomJid && chatA.roomNick === chatB.roomNick;
}

export function makeChatMessageId(time: Date, nick: string): string
{
    return `${time.getTime()}_${Utils.hashNumber(nick)}_${Utils.randomString(4)}`;
}

export function chatMessageCmpFun(msgA: ChatMessage, msgB: ChatMessage): number
{
    return msgA.timestamp < msgB.timestamp ? -1 : (msgA.timestamp === msgB.timestamp ? 0 : 1);
}

export function chatMessageIdFun(msgA: ChatMessage, msgB: ChatMessage): boolean
{
    return msgA.id === msgB.id && msgA.timestamp === msgB.timestamp;
}
