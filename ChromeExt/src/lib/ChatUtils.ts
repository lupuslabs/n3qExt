import { Utils } from './Utils'

export namespace ChatUtils {

    const chatChannelTypes = ['roompublic', 'roomprivate', 'instantMessage'] as const
    export type ChatChannelType = typeof chatChannelTypes[number]

    export type ChatChannel = {
        type:      ChatChannelType
        roomJid:   string
        roomNick:  string
    }

    const chatMessageTypes = ['chat', 'emote', 'cmd', 'cmdResult', 'participantStatus', 'itemStatus', 'info', 'debug'] as const
    export type ChatMessageType = typeof chatMessageTypes[number]

    const userChatMessageTypes = ['chat', 'emote'] as const
    export type UserChatMessageType = typeof userChatMessageTypes[number]
    void((a: UserChatMessageType) : ChatMessageType => a) // Makes transpiler detect non-ChatMessageType in UserChatMessageType.

    export type ChatMessage = {
        timestamp: string
        isUnread: boolean
        id:        string
        type:      ChatMessageType
        authorUserId: string
        authorName: string
        authorImageUrl: string
        text:      string
    }

    export function isUserChatMessageType(val: unknown): val is UserChatMessageType
    {
        return userChatMessageTypes.some(elem => elem === val)
    }

    export function areChatMessagesOfSameUser(msgA: ChatMessage, msgB: ChatMessage): boolean
    {
        if (msgA.authorUserId.length !== 0) {
            return msgA.authorUserId === msgB.authorUserId
        }
        return msgA.authorName === msgB.authorName
    }

    export function areChatsEqual(chatA: ChatChannel, chatB: ChatChannel): boolean
    {
        return chatA.type === chatB.type && chatA.roomJid === chatB.roomJid && chatA.roomNick === chatB.roomNick
    }

    export function makeChatMessageId(time: Date, nick: string): string
    {
        return `${time.getTime()}_${Utils.hashNumber(nick)}_${Utils.randomString(4)}`
    }

    export function chatMessageCmpFun(msgA: ChatMessage, msgB: ChatMessage): number
    {
        if (msgA.timestamp < msgB.timestamp) {
            return -1
        }
        return msgA.timestamp === msgB.timestamp ? 0 : 1
    }

    export function areChatMessagesIdentical(msgA: ChatMessage, msgB: ChatMessage): boolean
    {
        return msgA.id === msgB.id && msgA.timestamp === msgB.timestamp
    }

}
