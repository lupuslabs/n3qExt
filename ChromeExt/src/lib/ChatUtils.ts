import { is } from './is'
import { as } from './as'
import { Utils } from './Utils'
import { DomUtils } from './DomUtils';
import { ParseUtils } from './ParseUtils'

export namespace ChatUtils {

    const chatChannelTypes = ['roompublic', 'roomprivate', 'instantMessage'] as const
    export type ChatChannelType = typeof chatChannelTypes[number]

    export type ChatChannel = {
        type:      ChatChannelType
        roomJid:   string
        roomNick:  string
    }

    export const chatMessageTypes = ['chat', 'emote', 'cmd', 'cmdResult', 'participantStatus', 'itemStatus', 'info', 'debug', 'vidconfInvite', 'vidconfDecline'] as const
    export type ChatMessageType = typeof chatMessageTypes[number]

    export const userChatMessageTypes = ['chat', 'emote'] as const
    export type UserChatMessageType = typeof userChatMessageTypes[number]
    void((a: UserChatMessageType) : ChatMessageType => a) // Makes transpiler detect non-ChatMessageType in UserChatMessageType.

    export const instantMessageTypes = ['chat', 'vidconfInvite', 'vidconfDecline'] as const
    export type InstantMessageType = typeof instantMessageTypes[number]
    void((a: InstantMessageType) : ChatMessageType => a) // Makes transpiler detect non-ChatMessageType in InstantMessageType.

    export const vidconfMessageTypes = ['vidconfInvite', 'vidconfDecline'] as const
    export type VidconfMessageType = typeof vidconfMessageTypes[number]
    void((a: VidconfMessageType) : ChatMessageType => a) // Makes transpiler detect non-ChatMessageType in InstantMessageType.

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

    export type VidconfInviteData = {
        vidconfId: string
    }

    export function isUserChatMessageType(val: unknown): val is UserChatMessageType
    {
        return userChatMessageTypes.some(elem => elem === val)
    }

    export function isInstantMessageType(val: unknown): val is InstantMessageType
    {
        return instantMessageTypes.some(elem => elem === val)
    }

    export function isVidconfMessageType(val: unknown): val is VidconfMessageType
    {
        return vidconfMessageTypes.some(elem => elem === val)
    }

    export function parseVidconfInviteData(valJson: string): VidconfInviteData
    {
        const val = JSON.parse(valJson)
        const vidconfId = as.String(val?.vidconfId)
        if (vidconfId.length === 0) {
            throw new Error('Missing vidconfId!')
        }
        return {vidconfId}
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

    export function prepareTextHtml(text: string, highlightOwnMentionName?: string): {textNodes: Node[], ownNameMentionFound: boolean}
    {
        const state = {ownNameMentionFound: false} as const
        const paragraphs: Node[] = DomUtils.paragraphNodesOfText(text)
        const paragraphsWithLinks = DomUtils.convertTextInNodes(paragraphs, DomUtils.makeLinksInTextClickable, {})
        let paragraphsWithLinksAndMentions = paragraphsWithLinks
        if (is.nonEmptyString(highlightOwnMentionName)) {
            const converter = (line: string, _context: DomUtils.NodeConversionContext) =>
                highlightOwnNameMentionInHtml(line, highlightOwnMentionName, state)
            paragraphsWithLinksAndMentions = DomUtils.convertTextInNodes(paragraphsWithLinks, converter, {})
        }
        const {ownNameMentionFound} = state
        return {textNodes: paragraphsWithLinksAndMentions, ownNameMentionFound}
    }

    export function highlightOwnNameMentionInHtml(text: string, ownMentionName: string, state: {ownNameMentionFound: boolean}): Node[]
    {
        const tokenDefs: ParseUtils.TokenDef[] = [
            {name: 'sep', re: /^[\s,.;:?!]/},
            {name: 'at', re: /^@/, onlyAfter: ['', 'sep'], onlyBefore: ['ownName']},
            {name: 'ownName', re: new RegExp(`^${ParseUtils.escapeForRe(ownMentionName)}`), onlyAfter: ['at'], onlyBefore: ['', 'sep']},
            {name: 'text', re: /^[^\s,.;:?!@]+/},
        ]
        const rawTokens = ParseUtils.tokenizeString(text, tokenDefs, 'text')

        const tokens: ParseUtils.Token[] = []
        let lastToken: null|ParseUtils.Token = null
        for (const token of rawTokens) {
            if (token.name !== 'ownName' && lastToken && lastToken.name !== 'ownName') {
                lastToken.parts.text = lastToken.parts.text.concat(token.parts.text)
            } else {
                tokens.push(token)
                lastToken = token
            }
        }

        const nodes: Node[] = []
        for (const token of tokens) {
            if (token.name !== 'ownName') {
                nodes.push(document.createTextNode(token.parts.text))
            } else {
                state.ownNameMentionFound = true
                const node = document.createElement('span')
                node.classList.add('own-name-mention')
                node.appendChild(document.createTextNode(token.parts.text))
                nodes.push(node)
            }
        }
        return nodes
    }

}
