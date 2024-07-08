import { is } from '../lib/is';
import { as } from '../lib/as';
import { BackgroundApp } from './BackgroundApp';
import log = require('loglevel');
import { Config } from '../lib/Config';
import { ErrorWithData, Utils } from '../lib/Utils';

import { ChatUtils } from '../lib/ChatUtils'
import ChatChannelType = ChatUtils.ChatChannelType
import ChatChannel = ChatUtils.ChatChannel
import ChatMessage = ChatUtils.ChatMessage

// Schema:
// Chat 1:∞ ChatMessage
// Meta containing only a single {name: 'lastChatId', value: number} record.

type ChatChannelRecord = ChatChannel & {
    id: number; // Autoincrement
    lastMaintained: string;
    unreadMessageCount: number;
}

type ChatMessageRecord = ChatMessage & {
    chatId: number; // ChatChannelRecord.id
}

export class ChatHistoryStorage {

    private app: BackgroundApp;
    private maintainanceLastTime: number = 0;
    private db: IDBDatabase|null;

    //--------------------------------------------------------------------------
    // Public API

    public constructor(app: BackgroundApp)
    {
        this.app = app;
    }

    public async storeChatMessage(
        chatChannel: ChatChannel, chatMessage: ChatMessage, deduplicate: boolean
    ): Promise<{ createdOrUpdated: boolean, messageCurrent: ChatMessage }> {
        let transaction: IDBTransaction = null;
        let transactionPromise: Promise<void> = null;
        try {
            await this.openDb();
            [transaction, transactionPromise] = this.getNewDbTransaction();
            const {type, roomJid, roomNick} = chatChannel;
            const timestamp = chatMessage.timestamp;
            const chatRecord = await this.getOrCreateChatChannelRecord(transaction, type, roomJid, roomNick, timestamp);
            const { createdOrUpdated, unreadCountChange, messageCurrent }
                = await this.createChatMessageOrUpdateIsUnread(transaction, chatRecord, chatMessage, deduplicate);
            if (unreadCountChange !== 0) {
                chatRecord.unreadMessageCount = Math.max(0, chatRecord.unreadMessageCount + unreadCountChange);
                await this.updateChatChannelRecord(transaction, chatRecord);
            }
            await transactionPromise;
            if (Utils.logChannel('chatHistory', true)) {
                log.debug('ChatHistoryStorage.storeChatMessage: Done.', { chatChannel, chatMessage, createdOrUpdated, messageCurrent });
            }
            return { createdOrUpdated, messageCurrent };
        } catch (error) {
            await this.disposeErroneousTransaction(transaction, transactionPromise);
            const errorMsg = 'ChatHistoryStorage.storeChatMessage: Failed!';
            if (Utils.logChannel('chatHistory', true)) {
                log.debug(errorMsg, {error, chatChannel, chatMessage, this: {...this}});
            }
            throw new ErrorWithData(errorMsg, {originalError: error, chatChannel, chatMessage});
        }
    }

    public async getChatHistoryByChatChannel(chatChannel: ChatChannel): Promise<ChatMessage[]>
    {
        let transaction: IDBTransaction = null;
        let transactionPromise: Promise<void> = null;
        try {
            await this.openDb();
            [transaction, transactionPromise] = this.getNewDbTransaction(true);
            const {type, roomJid, roomNick} = chatChannel;
            const chatRecord = await this.getChatChannelRecordByTypeRoomJidRoomNick(transaction, type, roomJid, roomNick);
            const chatHistoryFound = !is.nil(chatRecord);
            const chatMessages: ChatMessage[] = [];
            if (chatHistoryFound) {
                const chatMessageRecords = await this.getChatMessageRecordsByChatChannelId(transaction, chatRecord.id);
                for (const {timestamp, isUnread, id, type, authorUserId, authorName, authorImageUrl, text} of chatMessageRecords) {
                    chatMessages.push({timestamp, isUnread, id, type, authorUserId, authorName, authorImageUrl, text});
                }
            }
            await transactionPromise;
            if (Utils.logChannel('chatHistory', true)) {
                log.debug('ChatHistoryStorage.getChatHistoryByChatChannel: Done.', {chatChannel, chatHistoryFound, chatMessages});
            }
            return chatMessages;
        } catch (error) {
            await this.disposeErroneousTransaction(transaction, transactionPromise);
            const errorMsg = 'ChatHistoryStorage.getChatHistoryByChatChannel: Failed!';
            if (Utils.logChannel('chatHistory', true)) {
                log.debug(errorMsg, {error, chatChannel, this: {...this}});
            }
            throw new ErrorWithData(errorMsg, {originalError: error, chatChannel});
        }
    }

    public async deleteOldChatHistoryByChatChannelOlderThanTime(chatChannel: ChatChannel, olderThanTime: string): Promise<void>
    {
        let transaction: IDBTransaction = null;
        let transactionPromise: Promise<void> = null;
        try {
            await this.openDb();
            [transaction, transactionPromise] = this.getNewDbTransaction();
            const {type, roomJid, roomNick} = chatChannel;
            const chatRecord = await this.getChatChannelRecordByTypeRoomJidRoomNick(transaction, type, roomJid, roomNick);
            const chatFound = !is.nil(chatRecord);
            let messagesDeleted = 0;
            let chatDeleted = false;
            if (chatFound) {
                const { chatIsEmpty, deletedCount, unreadDeletedCount}
                    = await this.deleteOldChatMessageRecordsByChatChannelIdOlderThanTime(transaction, chatRecord.id, olderThanTime);
                messagesDeleted = deletedCount;
                if (chatIsEmpty) {
                    await this.deleteChatChannelRecordById(transaction, chatRecord.id);
                    chatDeleted = true;
                } else {
                    chatRecord.unreadMessageCount = Math.max(0, chatRecord.unreadMessageCount - unreadDeletedCount);
                    await this.updateChatChannelRecord(transaction, chatRecord);
                }
            }
            await transactionPromise;
            if (Utils.logChannel('chatHistory', true)) {
                const msg = 'ChatHistoryStorage.deleteOldChatHistoryByChatChannelOlderThanTime: Done.';
                log.debug(msg, {chatChannel, olderThanTime, chatFound, chatDeleted, messagesDeleted});
            }
        } catch (error) {
            await this.disposeErroneousTransaction(transaction, transactionPromise);
            const errorMsg = 'ChatHistoryStorage.deleteOldChatHistoryByChatChannelOlderThanTime: Failed!';
            if (Utils.logChannel('chatHistory', true)) {
                log.debug(errorMsg, {error, chatChannel, olderThanTime, this: {...this}});
            }
            throw new ErrorWithData(errorMsg, {originalError: error, chatChannel, olderThanTime});
        }
    }

    public async getUnreadChatChannelsByType(type: ChatChannelType, limit: number): Promise<ChatChannel[]>
    {
        let transaction: IDBTransaction = null;
        let transactionPromise: Promise<void> = null;
        try {
            await this.openDb();
            [transaction, transactionPromise] = this.getNewDbTransaction(true);
            const chatRecords = await this.getUnreadChatChannelRecordsByType(transaction, type, limit);
            const chatChannels: ChatChannel[] = chatRecords.map(({ type, roomJid, roomNick }) => ({ type, roomJid, roomNick }));
            await transactionPromise;
            const msg = 'ChatHistoryStorage.getUnreadChatChannelsByType: Done.';
            if (Utils.logChannel('chatHistory', true)) {
                log.debug(msg, { type, limit, chatChannels });
            }
            return chatChannels;
        } catch (error) {
            await this.disposeErroneousTransaction(transaction, transactionPromise);
            const errorMsg = 'ChatHistoryStorage.getUnreadChatChannelsByType: Failed!';
            if (Utils.logChannel('chatHistory', true)) {
                log.debug(errorMsg, { error, type, limit });
            }
            throw new ErrorWithData(errorMsg, { originalError: error, type, limit });
        }
    }

    public async maintain(now: Date): Promise<Map<string, {chatChannel: ChatChannel, olderThanTime: string}[]>>
    {
        const deletedHistoriesByRoomJid: Map<string, {chatChannel: ChatChannel, olderThanTime: string}[]> = new Map();

        const nowSecs = now.getTime() / 1000;
        const maintenanceCheckIntervalSecs = as.Float(Config.get('chatHistory.maintenanceCheckIntervalSec'), 60);
        const maintenanceDelaySecs = this.maintainanceLastTime + maintenanceCheckIntervalSecs - nowSecs;
        if (maintenanceDelaySecs > 0) {
            if (Utils.logChannel('chatHistory', true)) {
                log.debug(`ChatHistoryStorage.maintain: Maintainance scheduled`
                    + ` to not be done earlier than at least ${maintenanceDelaySecs} seconds.`);
            }
            return deletedHistoriesByRoomJid;
        }
        this.maintainanceLastTime = nowSecs;

        let transaction: IDBTransaction = null;
        let transactionPromise: Promise<void> = null;
        try {
            const nowStr = Utils.utcStringOfDate(now);
            const maintenanceIntervalSecs = as.Float(Config.get('chatHistory.maintenanceIntervalSec'), 3600);
            const chatOlderThanDate = new Date((nowSecs - maintenanceIntervalSecs) * 1000);
            const chatOlderThanTimeStr = Utils.utcStringOfDate(chatOlderThanDate);
            await this.openDb();
            let chatRecord: ChatChannelRecord|null = null;
            let chatRecordFound = true;
            let writeCount = 0;
            const maintenanceWriteCount = as.Float(Config.get('chatHistory.maintenanceWriteCount'), 1000);
            while (chatRecordFound && writeCount < maintenanceWriteCount) {
                [transaction, transactionPromise] = this.getNewDbTransaction();
                chatRecord = await this.getChatChannelRecordToMaintain(transaction, chatOlderThanTimeStr);
                chatRecordFound = !is.nil(chatRecord);
                if (chatRecordFound) {
                    const retentionSecs = as.Float(Config.get(`chatHistory.messageRetentionSecByChannelType.${chatRecord.type}`), 1e9);
                    const msgOlderThanTime = Utils.utcStringOfDate(new Date(now.getTime() - retentionSecs * 1000));
                    const { chatIsEmpty, deletedCount, unreadDeletedCount}
                        = await this.deleteOldChatMessageRecordsByChatChannelIdOlderThanTime(transaction, chatRecord.id, msgOlderThanTime);
                    writeCount += deletedCount + 1;
                    if (chatIsEmpty) {
                        await this.deleteChatChannelRecordById(transaction, chatRecord.id);
                    } else {
                        chatRecord.lastMaintained = nowStr;
                        chatRecord.unreadMessageCount = Math.max(0, chatRecord.unreadMessageCount - unreadDeletedCount);
                        await this.updateChatChannelRecord(transaction, chatRecord);
                    }
                    if (deletedCount !== 0 || chatIsEmpty) {
                        const {type, roomJid, roomNick} = chatRecord;
                        const chatChannel:ChatChannel = { type, roomJid, roomNick };
                        const jidEntries = deletedHistoriesByRoomJid.get(roomJid) ?? [];
                        jidEntries.push({chatChannel, olderThanTime: msgOlderThanTime});
                        deletedHistoriesByRoomJid.set(roomJid, jidEntries);
                    }
                }
                await transactionPromise;
            }
            if (Utils.logChannel('chatHistory', true)) {
                log.debug('ChatHistoryStorage.maintain: Maintainance done.', {deletedHistoriesByRoomJid});
            }
            return deletedHistoriesByRoomJid;
        } catch (error) {
            await this.disposeErroneousTransaction(transaction, transactionPromise);
            const errorMsg = 'ChatHistoryStorage.maintain: Failed!';
            log.info(errorMsg, error);
            throw new ErrorWithData(errorMsg, {originalError: error});
        }
    }

    //--------------------------------------------------------------------------
    // ChatMessageRecord

    private async createChatMessageOrUpdateIsUnread(
        transaction: IDBTransaction, chatChannel: ChatChannelRecord, msg: ChatMessage, deduplicate: boolean,
    ): Promise<{ createdOrUpdated: boolean, unreadCountChange: number, messageCurrent: ChatMessageRecord }> {
        let oldChatmessage: null|ChatMessageRecord = await this.getChatMessageById(transaction, chatChannel.id, msg.id)
        if (!oldChatmessage && deduplicate) {
            oldChatmessage = await this.getDuplicateChatMessage(transaction, chatChannel.id, msg);
        }
        if (oldChatmessage && (!oldChatmessage.isUnread || msg.isUnread)) {
            // Message exists and it's unread status isn't to be updated.
            return { createdOrUpdated: false, unreadCountChange: 0, messageCurrent: oldChatmessage };
        }
        const chatId = chatChannel.id;
        let chatMessageRecord: ChatMessageRecord;
        if (oldChatmessage) {
            chatMessageRecord = oldChatmessage;
            chatMessageRecord.isUnread = msg.isUnread;
        } else {
            const {timestamp, isUnread, id, type, authorUserId, authorName, authorImageUrl, text} = msg;
            chatMessageRecord = { chatId, timestamp, isUnread, id, type, authorUserId, authorName, authorImageUrl, text };
        }
        const chatMessageTable = transaction.objectStore('ChatMessage');
        try {
            await this.awaitDbRequest(chatMessageTable.put(chatMessageRecord));
        } catch (error) {
            const msg = 'ChatHistoryStorage.createChatMessage: chatMessageTable.add failed!';
            throw new ErrorWithData(msg, {chatMessageRecord, error});
        }
        const unreadCountChange = (chatMessageRecord.isUnread ? 1 : 0) - ((oldChatmessage?.isUnread ?? false) ? 1 : 0);
        return { createdOrUpdated: true, unreadCountChange, messageCurrent: chatMessageRecord };
    }

    private async getChatMessageById(
        transaction: IDBTransaction, chatChannelId: number, chatMessageId: string
    ): Promise<null|ChatMessageRecord> {
        const chatMessageTable = transaction.objectStore('ChatMessage');
        let messageRaw: null|ChatMessageRecord
        try {
            messageRaw = await this.awaitDbRequest(chatMessageTable.get([chatChannelId, chatMessageId]));
        } catch (error) {
            const msg = 'ChatHistoryStorage.hasChatMessageWithId: chatMessageTable.get failed!';
            throw new ErrorWithData(msg, {chatChannelId, chatMessageId, error});
        }
        if (!messageRaw) {
            return null;
        }
        return this.fixOldChatMessageRecord(messageRaw);
    }

    private async getDuplicateChatMessage(
        transaction: IDBTransaction, chatChannelId: number, chatMessageNew: ChatMessage
    ): Promise<null|ChatMessageRecord> {
        const chatMessageTable = transaction.objectStore('ChatMessage');
        const index = chatMessageTable.index('iChatTimestamp');
        const keyRange = IDBKeyRange.bound([chatChannelId, '0'], [chatChannelId, '9'], false, false);
        let cursor: null|IDBCursorWithValue = null;
        try {
            cursor = await this.awaitDbRequest(index.openCursor(keyRange, 'prev'));
        } catch (error) {
            const msg = 'ChatHistoryStorage.createChatMessageIfNew: iChatTimestamp.openCursor failed!';
            throw new ErrorWithData(msg, {chatChannelId, error});
        }
        if (is.nil(cursor)) {
            return null;
        }
        const chatMessageOld: ChatMessageRecord = this.fixOldChatMessageRecord(cursor.value);
        if (chatMessageOld.authorName !== chatMessageNew.authorName || chatMessageOld.text !== chatMessageNew.text) {
            return null;
        }
        const timeNew = Utils.dateOfUtcString(chatMessageNew.timestamp).getTime();
        const timeMin = timeNew - 1000 * as.Float(Config.get('chatHistory.messageDeduplicationMaxAgeSec'), 1);
        const timeOld = Utils.dateOfUtcString(chatMessageOld.timestamp).getTime();
        if (timeOld < timeMin) {
            return null;
        }
        return chatMessageOld;
    }

    private async getChatMessageRecordsByChatChannelId(
        transaction: IDBTransaction, chatChannelId: number,
    ): Promise<ChatMessageRecord[]> {
        const chatMessageTable = transaction.objectStore('ChatMessage');
        const index = chatMessageTable.index('iChatTimestamp');
        const keyRange = IDBKeyRange.bound([chatChannelId, '0'], [chatChannelId, '9'], false, false);
        try {
            return (await this.awaitDbRequest(index.getAll(keyRange)))
                .map(record => this.fixOldChatMessageRecord(record));
        } catch (error) {
            const msg = 'ChatHistoryStorage.getChatMessageRecordsByChatChannelId: iChatTimestamp.getAll failed!';
            throw new ErrorWithData(msg, {chatChannelId, error});
        }
    }

    private async deleteOldChatMessageRecordsByChatChannelIdOlderThanTime(
        transaction: IDBTransaction, chatChannelId: number, olderThanTime: string,
    ): Promise<{ chatIsEmpty: boolean, deletedCount: number, unreadDeletedCount: number }> {
        const chatMessageTable = transaction.objectStore('ChatMessage');
        const index = chatMessageTable.index('iChatTimestamp');
        const keyRange = IDBKeyRange.bound([chatChannelId, '0'], [chatChannelId, '9'], false, false);
        const result = {
            chatIsEmpty: true,
            deletedCount: 0,
            unreadDeletedCount: 0,
        };
        await this.indexForeach(index, keyRange, 'next', Number.MAX_VALUE, async cursor => {
            const chatMessage = this.fixOldChatMessageRecord(cursor.value);
            if (chatMessage.timestamp >= olderThanTime) {
                result.chatIsEmpty = false;
                return false;
            }
            try {
                await this.awaitDbRequest(cursor.delete());
            } catch (error) {
                const msg = 'ChatHistoryStorage.deleteOldChatMessageRecordsByChatChannelIdOlderThanTime: cursor.delete failed!';
                throw new ErrorWithData(msg, {chatMessage, error});
            }
            result.deletedCount++;
            if (chatMessage.isUnread) {
                result.unreadDeletedCount++;
            }
            return true;
        });
        return result;
    }

    private fixOldChatMessageRecord(oldRecord: ChatMessageRecord): ChatMessageRecord
    {
        const { chatId, timestamp, id, type, text } = oldRecord
        const authorUserId = oldRecord['authorUserId'] ?? '';
        const authorName = oldRecord['authorName'] ?? oldRecord['nick'] ?? '';
        const authorImageUrl = as.String(oldRecord['authorImageUrl']);
        const isUnread = as.Bool(oldRecord['isUnread']);
        return { chatId, timestamp, isUnread, id, type, authorUserId, authorName, authorImageUrl, text };
    }

    //--------------------------------------------------------------------------
    // ChatChannelRecord

    private async getOrCreateChatChannelRecord(
        transaction: IDBTransaction, type: ChatChannelType, roomJid: string, roomNick: string, lastMaintained: string,
    ): Promise<ChatChannelRecord> {
        const chatFromIndex = await this.getChatChannelRecordByTypeRoomJidRoomNick(transaction, type, roomJid, roomNick);
        if (chatFromIndex) {
            return chatFromIndex;
        }

        const metaTable = transaction.objectStore('Meta');
        let metaRecord;
        try {
            metaRecord = await this.awaitDbRequest(metaTable.get('lastChatId'))
        } catch (error) {
            const msg = 'ChatHistoryStorage.getOrCreateChatChannelRecord: metaTable.get failed!';
            throw new ErrorWithData(msg, { type, roomJid, roomNick, lastMaintained, error });
        }
        const lastId: number = metaRecord?.value ?? 0;
        const id = lastId + 1;
        metaRecord = {name: 'lastChatId', value: id};
        try {
            await this.awaitDbRequest(metaTable.put(metaRecord));
        } catch (error) {
            const msg = 'ChatHistoryStorage.getOrCreateChatChannelRecord: metaTable.put failed!';
            throw new ErrorWithData(msg, {metaRecord, error});
        }

        const unreadMessageCount = 0;
        const chatChannelRecord: ChatChannelRecord = { id, type, roomJid, roomNick, lastMaintained, unreadMessageCount };
        const chatChannelTable = transaction.objectStore('Chat');
        try {
            await this.awaitDbRequest(chatChannelTable.add(chatChannelRecord));
        } catch (error) {
            const msg = 'ChatHistoryStorage.getOrCreateChatChannelRecord: chatChannelTable.add failed!';
            throw new ErrorWithData(msg, {chatChannelRecord, error});
        }
        return chatChannelRecord;
    }

    private async updateChatChannelRecord(transaction: IDBTransaction, chatChannelRecord: ChatChannelRecord): Promise<void> {
        const chatChannelTable = transaction.objectStore('Chat');
        try {
            await this.awaitDbRequest(chatChannelTable.put(chatChannelRecord));
        } catch (error) {
            const msg = 'ChatHistoryStorage.updateChatChannelRecord: chatTable.put failed!';
            throw new ErrorWithData(msg, {chatChannelRecord, error});
        }
    }

    private async deleteChatChannelRecordById(transaction: IDBTransaction, chatChannelRecordId: number): Promise<void> {
        const chatChannelTable = transaction.objectStore('Chat');
        try {
            await this.awaitDbRequest(chatChannelTable.delete(chatChannelRecordId));
        } catch (error) {
            const msg = 'ChatHistoryStorage.deleteChatChannelRecordById: chatChannelTable.delete failed!';
            throw new ErrorWithData(msg, {chatChannelRecordId, error});
        }
    }

    private async getChatChannelRecordByTypeRoomJidRoomNick(
        transaction: IDBTransaction, type: ChatChannelType, roomJid: string, roomNick: string
    ): Promise<ChatChannelRecord|null> {
        const chatChannelTable = transaction.objectStore('Chat');
        const index = chatChannelTable.index('iTypeRoomJidNick');
        try {
            return await this.awaitChatChannelRecordRequest(index.get(IDBKeyRange.only([type, roomJid, roomNick])));
        } catch (error) {
            const msg = 'ChatHistoryStorage.getChatChannelRecordByTypeRoomJidRoomNick: iTypeRoomJidNick.get failed!';
            throw new ErrorWithData(msg, {type, roomJid, roomNick, error});
        }
    }

    private async getUnreadChatChannelRecordsByType(transaction: IDBTransaction, type: ChatChannelType, limit: number): Promise<ChatChannelRecord[]>
    {
        const index = transaction.objectStore('Chat').index('iTypeUnread');
        const keyRange = IDBKeyRange.bound([type, 1], [type, Number.MAX_VALUE], false, false);
        const chatChannels: ChatChannelRecord[] = [];
        await this.indexForeach(index, keyRange, 'prev', limit, async cursor => {
            chatChannels.push(this.fixOldChatChannelRecord(cursor.value));
            return true;
        });
        return chatChannels;
    }

    private async getChatChannelRecordToMaintain(transaction: IDBTransaction, olderThanTime: string): Promise<ChatChannelRecord|null> {
        const chatChannelTable = transaction.objectStore('Chat');
        const index = chatChannelTable.index('iLastMaintained');
        try {
            return await this.awaitChatChannelRecordRequest(index.get(IDBKeyRange.upperBound(olderThanTime, true)));
        } catch (error) {
            const msg = 'ChatHistoryStorage.getChatChannelRecordToMaintain: iLastMaintained.get failed!';
            throw new ErrorWithData(msg, {olderThanTime, error});
        }
    }

    private async awaitChatChannelRecordRequest(dbRequest: IDBRequest<ChatChannelRecord>): Promise<null|ChatChannelRecord>
    {
        const record: null|ChatChannelRecord = await this.awaitDbRequest(dbRequest);
        if (!record) {
            return null;
        }
        return this.fixOldChatChannelRecord(record);
    }

    private fixOldChatChannelRecord(chatChannelOld: ChatChannelRecord): ChatChannelRecord
    {
        const { id, type, roomJid, roomNick, lastMaintained } = chatChannelOld
        const unreadMessageCount = chatChannelOld['unreadMessageCount'] ?? 0;
        return { id, type, roomJid, roomNick, lastMaintained, unreadMessageCount };
    }

    //--------------------------------------------------------------------------
    // IndexedDB helpers

    private async indexForeach(
        index: IDBIndex, keyRange: IDBKeyRange, cursorDirection: 'next'|'prev', limit: number, action: (cursor: IDBCursorWithValue) => Promise<boolean>
    ): Promise<void> {
        const cursorRequest = index.openCursor(keyRange, cursorDirection);
        let cursor: IDBCursorWithValue = await this.awaitDbRequest(cursorRequest);
        for (let count = 0; !is.nil(cursor) && count < limit && await action(cursor); count++) {
            cursor.continue();
            cursor = await this.awaitDbRequest(cursorRequest);
        }
    }

    private awaitDbRequest<T>(dbRequest: IDBRequest<T>): Promise<T>
    {
        const result = new Promise<T>((resolve, reject) => {
            dbRequest.onerror = ev => {
                const msg = 'IndexedDB request failed!';
                reject(new ErrorWithData(msg, {originalError: dbRequest.error, dbRequest}));
            };
            dbRequest.onsuccess = ev => resolve(dbRequest.result);
        });
        return result;
    }

    private getNewDbTransaction(readonly: boolean = false): [IDBTransaction, Promise<void>]
    {
        const transaction = this.db.transaction(['Meta', 'Chat', 'ChatMessage'], readonly ? 'readonly' : 'readwrite');
        const promise = new Promise<void>((resolve, reject) => {
            transaction.oncomplete = (ev) => {
                resolve();
            };
            transaction.onerror = (ev) => {
                const msg = 'IndexedDB transaction failed!';
                reject(new ErrorWithData(msg, {originalError: transaction.error, transaction}));
            };
            transaction.onabort = (ev) => {
                const msg = 'IndexedDB transaction aborted!';
                reject(new ErrorWithData(msg, {originalError: transaction.error, transaction}));
            };
        });
        return [transaction, promise];
    }

    private async disposeErroneousTransaction(
        transaction: IDBTransaction|null, transactionPromise: Promise<void>|null
    ): Promise<void> {
        // transaction is null or already known to be erroneous with known root cause.
        // To be called to ensure abortion and proper disposal of the transaction and its associated promise.
        if (is.nil(transaction) !== is.nil(transactionPromise)) {
            const msg = 'ChatHistoryStorage.disposeErroneousTransaction: Only transaction or transactionPromise is nil - but not both!';
            throw new ErrorWithData(msg, {transaction, transactionPromise});
        }
        if (!is.nil(transaction)) {
            try { transaction.abort(); } catch (error) { /* Ignore already aborted error. */ }
            try { await transactionPromise; } catch (error) { /* Ignore any error. */ }
        }
        return;
    }

    private openDb(): Promise<void>
    {
        if (!is.nil(this.db)) {
            return new Promise<void>((resolve, reject) => resolve());
        }
        const dbConnectionRequest = indexedDB.open('chathistory', 3);
        dbConnectionRequest.onupgradeneeded = (ev) => {
            this.dbOnUpgradeNeeded(dbConnectionRequest.transaction, ev.oldVersion);
        };
        const resultPromise = new Promise<void>((resolve, reject) => {
            dbConnectionRequest.onsuccess = (ev) => {
                this.db = dbConnectionRequest.result;
                resolve();
            };
            dbConnectionRequest.onblocked = (ev) => {
                const msg = 'Database is already open and of older version!';
                reject(new ErrorWithData(msg, {originalError: dbConnectionRequest.error}));
            };
            dbConnectionRequest.onerror = (ev) => {
                const msg = 'Database open failed!';
                reject(new ErrorWithData(msg, {originalError: dbConnectionRequest.error}));
            };
        });
        return resultPromise;
    }

    //--------------------------------------------------------------------------
    // Schema initialization and updates

    private dbOnUpgradeNeeded(transaction: IDBTransaction, oldVersion: number): void
    {
        if (oldVersion < 2) { // Initialize fresh database.
            this.initDb(transaction);
        }
        if (oldVersion < 3) {
            this.initUnreadChatIndex(transaction);
        }
    }

    private initDb(transaction: IDBTransaction): void
    {
        const db = transaction.db;
        this.deleteObjectStoreIfExist(db, 'Meta');
        db.createObjectStore('Meta', {keyPath: 'name'});

        this.deleteObjectStoreIfExist(db, 'Chat');
        const chatTable = db.createObjectStore('Chat', {keyPath: 'id'});
        chatTable.createIndex('iTypeRoomJidNick', ['type', 'roomJid', 'roomNick'], {unique: true});
        chatTable.createIndex('iLastMaintained', 'lastMaintained', {unique: false});

        this.deleteObjectStoreIfExist(db, 'ChatMessage');
        const chatmessageTable = db.createObjectStore('ChatMessage', {keyPath: ['chatId', 'id']});
        chatmessageTable.createIndex('iChatTimestamp', ['chatId', 'timestamp'], {unique: false});
    }

    private initUnreadChatIndex(transaction: IDBTransaction): void
    {
        const chatTable = transaction.objectStore('Chat');
        chatTable.createIndex('iTypeUnread', ['type', 'unreadMessageCount'], {unique: false});
    }

    private deleteObjectStoreIfExist(db: IDBDatabase, name: string): void
    {
        try {
            db.deleteObjectStore(name);
        } catch (error) {
            // Store doesn't exist.
        }
    }

}
