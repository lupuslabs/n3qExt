﻿// Chat records as generated by (Private)ChatWindow and stored in a chat history.

import { is } from './is';

export enum ChatType {
    roompublic = 'roompublic',
    roomprivate = 'roomprivate',
}

export type Chat = {
    type:      ChatType;
    roomJid:   string;
    roomNick:  string;
};

export type ChatMessage = {
    timestamp: string;
    id:        string;
    nick:      string;
    text:      string;
};

export function isChatType(val: unknown): val is ChatType
{
    return is.string(val) && Object.values<string>(ChatType).includes(val);
}

export function isChat(val: unknown): val is Chat
{
    return !is.nil(val)
    && isChatType(val['type'])
    && is.string(val['roomJid'])
    && is.string(val['roomNick'])
    && !(val['roomNick'] !== '' && val['type'] === ChatType.roompublic)
    ;
}

export function isChatMessage(val: unknown): val is ChatMessage
{
    return !is.nil(val)
    && is.string(val['timestamp'])
    && is.string(val['id'])
    && is.string(val['nick'])
    && is.string(val['text'])
    ;
}

let makeChatMessageId_nr = 0;
export function makeChatMessageId(): string
{
    makeChatMessageId_nr++;
    return `${Date.now()}:${makeChatMessageId_nr}`;
}