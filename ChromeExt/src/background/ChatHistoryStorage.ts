import { is } from '../lib/is';
import { as } from '../lib/as';
import { BackgroundApp } from './BackgroundApp';
import log = require('loglevel');
import { Config } from '../lib/Config';
import { ErrorWithData, Utils } from '../lib/Utils';

import { ChatUtils } from '../lib/ChatUtils'
import ChatChannelType = ChatUtils.ChatChannelType
import ChatChannel = ChatUtils.ChatChannel
import ChatMessageType = ChatUtils.ChatMessageType
import ChatMessage = ChatUtils.ChatMessage

// Schema:
// Chat 1:∞ ChatMessage
// Meta containing only a single {name: 'lastChatId', value: number} record.

type ChatChannelRecord = {
    id:             number; // Autoincrement
    type:           ChatChannelType;
    roomJid:        string;
    roomNick:       string;
    lastMaintained: string;
}

type ChatMessageRecord = {
    chatId:    number; // ChatChannelRecord.id
    timestamp: string;
    id:        string;
    type:      ChatMessageType;
    nick:      string;
    text:      string;
}

export class ChatHistoryStorage {

    private app: BackgroundApp;
    private debugLogEnabled: boolean = true;
    private messageMaxAgeSecByType: Map<ChatChannelType,number> = new Map<ChatChannelType, number>();
    private messageDeduplicationMaxAgeSec: number = 1;
    private maintenanceIntervalSec: number = 10e20;
    private maintenanceCheckIntervalSec: number = 10;
    private maintenanceWriteCount: number = 1000;
    private maintainanceLastTime: number = 0;
    private db: IDBDatabase|null;

    //--------------------------------------------------------------------------
    // Public API

    public constructor(app: BackgroundApp)
    {
        this.app = app;
    }

    public onUserConfigUpdate(): void
    {
        this.debugLogEnabled = Utils.logChannel('chatHistory', true);
        const roompublicMaxAgeSecRaw = Config.get('chatHistory.roompublicMaxAgeSec');
        this.messageMaxAgeSecByType.set('roompublic', as.Float(roompublicMaxAgeSecRaw, 10e20));
        const roomprivateMaxAgeSecRaw = Config.get('chatHistory.roomprivateMaxAgeSec');
        this.messageMaxAgeSecByType.set('roomprivate', as.Float(roomprivateMaxAgeSecRaw, 10e20));
        this.messageDeduplicationMaxAgeSec = as.Float(Config.get('chatHistory.messageDeduplicationMaxAgeSec'), 1);
        this.maintenanceIntervalSec = as.Float(Config.get('chatHistory.maintenanceIntervalSec'), 10e20);
        this.maintenanceCheckIntervalSec = as.Float(Config.get('chatHistory.maintenanceCheckIntervalSec'), 10);
        this.maintenanceWriteCount = as.Float(Config.get('chatHistory.maintenanceWriteCount'), 1000);
        if (this.debugLogEnabled) {
            log.debug('ChatHistoryStorage.onUserConfigUpdate: Done.', {this: {...this}});
        }
    }

    public async storeChatMessage(chatChannel: ChatChannel, chatMessage: ChatMessage, deduplicate: boolean): Promise<boolean>
    {
        let transaction: IDBTransaction = null;
        let transactionPromise: Promise<void> = null;
        try {
            await this.openDb();
            [transaction, transactionPromise] = this.getNewDbTransaction();
            const {type, roomJid, roomNick} = chatChannel;
            const timestamp = chatMessage.timestamp;
            const chatRecord = await this.getOrCreateChatChannelRecord(transaction, type, roomJid, roomNick, timestamp);
            const keepChatMessage = await this.createChatMessageIfNew(transaction, chatRecord, chatMessage, deduplicate);
            await transactionPromise;
            if (this.debugLogEnabled) {
                log.debug('ChatHistoryStorage.storeChatMessage: Done.', {chatChannel, chatMessage, keepChatMessage});
            }
            return keepChatMessage;
        } catch (error) {
            await this.disposeErroneousTransaction(transaction, transactionPromise);
            const errorMsg = 'ChatHistoryStorage.storeChatMessage: Failed!';
            if (this.debugLogEnabled) {
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
                for (const {timestamp, id, type, nick, text} of chatMessageRecords) {
                    chatMessages.push({timestamp, id, type, nick, text});
                }
            }
            await transactionPromise;
            if (this.debugLogEnabled) {
                log.debug('ChatHistoryStorage.getChatHistoryByChatChannel: Done.', {chatChannel, chatHistoryFound, chatMessages});
            }
            return chatMessages;
        } catch (error) {
            await this.disposeErroneousTransaction(transaction, transactionPromise);
            const errorMsg = 'ChatHistoryStorage.getChatHistoryByChatChannel: Failed!';
            if (this.debugLogEnabled) {
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
                const pruneResult = await this.deleteOldChatMessageRecordsByChatChannelIdOlderThanTime(
                    transaction, chatRecord.id, olderThanTime);
                messagesDeleted = pruneResult.deletedCount;
                if (pruneResult.chatIsEmpty) {
                    await this.deleteChatChannelRecordById(transaction, chatRecord.id);
                    chatDeleted = true;
                }
            }
            await transactionPromise;
            if (this.debugLogEnabled) {
                const msg = 'ChatHistoryStorage.deleteOldChatHistoryByChatChannelOlderThanTime: Done.';
                log.debug(msg, {chatChannel, olderThanTime, chatFound, chatDeleted, messagesDeleted});
            }
        } catch (error) {
            await this.disposeErroneousTransaction(transaction, transactionPromise);
            const errorMsg = 'ChatHistoryStorage.deleteOldChatHistoryByChatChannelOlderThanTime: Failed!';
            if (this.debugLogEnabled) {
                log.debug(errorMsg, {error, chatChannel, olderThanTime, this: {...this}});
            }
            throw new ErrorWithData(errorMsg, {originalError: error, chatChannel, olderThanTime});
        }
    }

    public async maintain(now: Date): Promise<Map<string, {chatChannel: ChatChannel, olderThanTime: string}[]>>
    {
        const deletedHistoriesByRoomJid: Map<string, {chatChannel: ChatChannel, olderThanTime: string}[]> = new Map();

        const nowSecs = now.getTime() / 1000;
        const maintenanceDelaySecs = this.maintainanceLastTime + this.maintenanceCheckIntervalSec - nowSecs;
        if (maintenanceDelaySecs > 0) {
            if (this.debugLogEnabled) {
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
            const chatOlderThanDate = new Date((nowSecs - this.maintenanceIntervalSec) * 1000);
            const chatOlderThanTimeStr = Utils.utcStringOfDate(chatOlderThanDate);
            await this.openDb();
            let chatRecord: ChatChannelRecord|null = null;
            let chatRecordFound = true;
            let writeCount = 0;
            while (chatRecordFound && writeCount < this.maintenanceWriteCount) {
                [transaction, transactionPromise] = this.getNewDbTransaction();
                chatRecord = await this.getChatChannelRecordToMaintain(transaction, chatOlderThanTimeStr);
                chatRecordFound = !is.nil(chatRecord);
                if (chatRecordFound) {
                    const retentionSecs = this.messageMaxAgeSecByType.get(chatRecord.type) ?? 10e20;
                    const msgOlderThanTime = Utils.utcStringOfDate(new Date(now.getTime() - retentionSecs * 1000));
                    const pruneResult = await this.deleteOldChatMessageRecordsByChatChannelIdOlderThanTime(
                        transaction, chatRecord.id, msgOlderThanTime);
                    writeCount += pruneResult.deletedCount + 1;
                    if (pruneResult.chatIsEmpty) {
                        await this.deleteChatChannelRecordById(transaction, chatRecord.id);
                    } else {
                        chatRecord.lastMaintained = nowStr;
                        await this.updateChatChannelRecord(transaction, chatRecord);
                    }
                    if (pruneResult.deletedCount !== 0 || pruneResult.chatIsEmpty) {
                        const {type, roomJid, roomNick} = chatRecord;
                        const chatChannel:ChatChannel = { type, roomJid, roomNick };
                        const jidEntries = deletedHistoriesByRoomJid.get(roomJid) ?? [];
                        jidEntries.push({chatChannel, olderThanTime: msgOlderThanTime});
                        deletedHistoriesByRoomJid.set(roomJid, jidEntries);
                    }
                }
                await transactionPromise;
            }
            if (this.debugLogEnabled) {
                log.debug('ChatHistoryStorage.maintain: Maintainance done.', {deletedHistoriesByRoomJid});
            }
            return deletedHistoriesByRoomJid;
        } catch (error) {
            await this.disposeErroneousTransaction(transaction, transactionPromise);
            const errorMsg = 'ChatHistoryStorage.maintain: Failed!';
            if (this.debugLogEnabled) {
                log.debug(errorMsg, {error, now, this: {...this}});
            }
            throw new ErrorWithData(errorMsg, {originalError: error, now});
        }
    }

    //--------------------------------------------------------------------------
    // ChatMessageRecord

    private async createChatMessageIfNew(
        transaction: IDBTransaction, chatChannel: ChatChannelRecord, msg: ChatMessage, deduplicate: boolean,
    ): Promise<boolean> {
        if (await this.hasChatMessageWithId(transaction, chatChannel.id, msg.id)) {
            return false;
        }
        if (deduplicate && await this.hasDuplicateChatMessage(transaction, chatChannel.id, msg)) {
            return false;
        }
        const chatId = chatChannel.id;
        const {timestamp, id, type, nick, text} = msg;
        const chatMessageRecord: ChatMessageRecord = { chatId, timestamp, id, type, nick, text };
        const chatMessageTable = transaction.objectStore('ChatMessage');
        try {
            await this.awaitDbRequest(chatMessageTable.add(chatMessageRecord));
        } catch (error) {
            const msg = 'ChatHistoryStorage.createChatMessage: chatMessageTable.add failed!';
            throw new ErrorWithData(msg, {chatMessageRecord, error});
        }
        return true;
    }

    private async hasChatMessageWithId(
        transaction: IDBTransaction, chatChannelId: number, chatMessageId: string
    ): Promise<boolean> {
        const chatMessageTable = transaction.objectStore('ChatMessage');
        try {
            return !is.nil(await this.awaitDbRequest(chatMessageTable.get([chatChannelId, chatMessageId])));
        } catch (error) {
            const msg = 'ChatHistoryStorage.hasChatMessageWithId: chatMessageTable.get failed!';
            throw new ErrorWithData(msg, {chatChannelId, chatMessageId, error});
        }
    }

    private async hasDuplicateChatMessage(
        transaction: IDBTransaction, chatChannelId: number, chatMessageNew: ChatMessage
    ): Promise<boolean> {
        const chatMessageTable = transaction.objectStore('ChatMessage');
        const index = chatMessageTable.index('iChatTimestamp');
        const keyRange = IDBKeyRange.bound([chatChannelId, '0'], [chatChannelId, '9'], false, false);
        let cursor: IDBCursorWithValue;
        try {
            cursor = await this.awaitDbRequest(index.openCursor(keyRange, 'prev'));
        } catch (error) {
            const msg = 'ChatHistoryStorage.createChatMessageIfNew: iChatTimestamp.openCursor failed!';
            throw new ErrorWithData(msg, {chatChannelId, error});
        }
        if (!is.nil(cursor)) {
            const chatMessageOld: ChatMessage = cursor.value;
            if (chatMessageOld.nick === chatMessageNew.nick && chatMessageOld.text === chatMessageNew.text) {
                const timeNew = Utils.dateOfUtcString(chatMessageNew.timestamp).getTime();
                const timeMin = timeNew - 1000 *this.messageDeduplicationMaxAgeSec;
                const timeOld = Utils.dateOfUtcString(chatMessageOld.timestamp).getTime();
                if (timeOld >= timeMin) {
                    return true;
                }
            }
        }
        return false;
    }

    private async getChatMessageRecordsByChatChannelId(
        transaction: IDBTransaction, chatChannelId: number,
    ): Promise<ChatMessageRecord[]> {
        const chatMessageTable = transaction.objectStore('ChatMessage');
        const index = chatMessageTable.index('iChatTimestamp');
        const keyRange = IDBKeyRange.bound([chatChannelId, '0'], [chatChannelId, '9'], false, false);
        try {
            return this.awaitDbRequest(index.getAll(keyRange));
        } catch (error) {
            const msg = 'ChatHistoryStorage.getChatMessageRecordsByChatChannelId: iChatTimestamp.getAll failed!';
            throw new ErrorWithData(msg, {chatChannelId, error});
        }
    }

    private async deleteOldChatMessageRecordsByChatChannelIdOlderThanTime(
        transaction: IDBTransaction, chatChannelId: number, olderThanTime: string,
    ): Promise<{chatIsEmpty: boolean, deletedCount: number}> {
        let chatIsEmpty = true;
        let deletedCount = 0;
        const chatMessageTable = transaction.objectStore('ChatMessage');
        const index = chatMessageTable.index('iChatTimestamp');
        const keyRange = IDBKeyRange.bound([chatChannelId, '0'], [chatChannelId, '9'], false, false);
        const cursorRequest = index.openCursor(keyRange);
        let cursor: IDBCursorWithValue;
        try {
            cursor = await this.awaitDbRequest(cursorRequest);
        } catch (error) {
            const msg = 'ChatHistoryStorage.deleteOldChatMessageRecordsByChatChannelIdOlderThanTime: iChatTimestamp.openCursor failed!';
            throw new ErrorWithData(msg, {chatChannelId, error});
        }
        while (!is.nil(cursor)) {
            const chatMessage: ChatMessage = cursor.value;
            if (chatMessage.timestamp >= olderThanTime) {
                chatIsEmpty = false;
                cursor = null;
            } else {
                try {
                    await this.awaitDbRequest(cursor.delete());
                } catch (error) {
                    const msg = 'ChatHistoryStorage.deleteOldChatMessageRecordsByChatChannelIdOlderThanTime: cursor.delete failed!';
                    throw new ErrorWithData(msg, {chatMessage, error});
                }
                deletedCount++;
                cursor.continue();
                try {
                    cursor = await this.awaitDbRequest(cursorRequest);
                } catch (error) {
                    const msg = 'ChatHistoryStorage.deleteOldChatMessageRecordsByChatChannelIdOlderThanTime: cursor.continue failed!';
                    throw new ErrorWithData(msg, {chatChannelId, error});
                }
            }
        }
        return {chatIsEmpty, deletedCount};
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
        const chatChannelRecord: ChatChannelRecord = { id, type, roomJid, roomNick, lastMaintained };
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
            return this.awaitDbRequest(index.get(IDBKeyRange.only([type, roomJid, roomNick])));
        } catch (error) {
            const msg = 'ChatHistoryStorage.getChatChannelRecordByTypeRoomJidRoomNick: iTypeRoomJidNick.get failed!';
            throw new ErrorWithData(msg, {type, roomJid, roomNick, error});
        }
    }

    private async getChatChannelRecordToMaintain(transaction: IDBTransaction, olderThanTime: string): Promise<ChatChannelRecord|null> {
        const chatChannelTable = transaction.objectStore('Chat');
        const index = chatChannelTable.index('iLastMaintained');
        try {
            return this.awaitDbRequest(index.get(IDBKeyRange.upperBound(olderThanTime, true)));
        } catch (error) {
            const msg = 'ChatHistoryStorage.getChatChannelRecordToMaintain: iLastMaintained.get failed!';
            throw new ErrorWithData(msg, {olderThanTime, error});
        }
    }

    //--------------------------------------------------------------------------
    // IndexedDB helpers

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
        const dbConnectionRequest = indexedDB.open('chathistory', 2);
        dbConnectionRequest.onupgradeneeded = (ev) => {
            this.dbOnUpgradeNeeded(dbConnectionRequest.result, ev);
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

    private dbOnUpgradeNeeded(db: IDBDatabase, ev: IDBVersionChangeEvent): void
    {
        if (ev.oldVersion < 2) { // Initialize fresh database.
            this.initDb(db);
        }
    }

    private initDb(db: IDBDatabase): void
    {
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

    private deleteObjectStoreIfExist(db: IDBDatabase, name: string): void
    {
        try {
            db.deleteObjectStore(name);
        } catch (error) {
            // Store doesn't exist.
        }
    }

}
