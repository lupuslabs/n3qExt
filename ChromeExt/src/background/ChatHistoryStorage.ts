import { is } from '../lib/is';
import { as } from '../lib/as';
import { BackgroundApp } from './BackgroundApp';
import log = require('loglevel');
import { Config } from '../lib/Config';
import { Chat, ChatMessage, ChatType } from '../lib/ChatMessage';
import { ErrorWithData, Utils } from '../lib/Utils';

// Schema:
// Chat 1:∞ ChatMessage
// Meta containing only a single {name: 'lastChatId', value: number} record.

type ChatRecord = {
    id:             number; // Autoincrement
    type:           ChatType;
    roomJid:        string;
    roomNick:       string;
    lastMaintained: string;
}

type ChatMessageRecord = {
    chatId:    number; // Chat.id
    timestamp: string;
    id:        string;
    nick:      string;
    text:      string;
}

export class ChatHistoryStorage {

    private app: BackgroundApp;
    private debugLogEnabled: boolean = true;
    private messageMaxAgeSecByType: Map<ChatType,number> = new Map<ChatType, number>();
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
        //this.debugLogEnabled = Utils.logChannel('chatHistory', true);
        this.messageMaxAgeSecByType.set(
            ChatType.roompublic, as.Float(Config.get('chatHistory.roompublicMaxAgeSec'), 10e20));
        this.messageMaxAgeSecByType.set(
            ChatType.roomprivate, as.Float(Config.get('chatHistory.roomprivateMaxAgeSec'), 10e20));
        this.maintenanceIntervalSec = as.Float(Config.get('chatHistory.maintenanceIntervalSec'), 10e20);
        this.maintenanceCheckIntervalSec = as.Float(Config.get('chatHistory.maintenanceCheckIntervalSec'), 10);
        this.maintenanceWriteCount = as.Float(Config.get('chatHistory.maintenanceWriteCount'), 1000);
        if (this.debugLogEnabled) {
            log.debug('ChatHistoryStorage.onUserConfigUpdate: Done.', {this: {...this}});
        }
    }

    public async storeChatRecord(chat: Chat, chatMessage: ChatMessage): Promise<void>
    {
        let transaction: IDBTransaction = null;
        let transactionPromise: Promise<void> = null;
        try {
            await this.openDb();
            [transaction, transactionPromise] = this.getNewDbTransaction();
            const chatRecord = await this.getOrCreateChatRecord(
                transaction, chat.type, chat.roomJid, chat.roomNick, chatMessage.timestamp);
            await this.createChatMessage(transaction, chatRecord, chatMessage);
            await transactionPromise;
            if (this.debugLogEnabled) {
                log.debug('ChatHistoryStorage.storeChatRecord: Done.', {chat, chatMessage});
            }
        } catch (error) {
            await this.disposeErroneousTransaction(transaction, transactionPromise);
            const errorMsg = 'ChatHistoryStorage.storeChatRecord: Failed!';
            if (this.debugLogEnabled) {
                log.debug(errorMsg, {error, chat, chatMessage, this: {...this}});
            }
            throw new ErrorWithData(errorMsg, {originalError: error, chat, chatMessage});
        }
    }

    public async getChatHistoryByChat(chat: Chat): Promise<ChatMessage[]>
    {
        let transaction: IDBTransaction = null;
        let transactionPromise: Promise<void> = null;
        try {
            await this.openDb();
            [transaction, transactionPromise] = this.getNewDbTransaction(true);
            const chatRecord = await this.getChatRecordByTypeRoomJidRoomNick(
                transaction, chat.type, chat.roomJid, chat.roomNick);
            const chatHistoryFound = !is.nil(chatRecord);
            let chatMessages = [];
            if (chatHistoryFound) {
                const chatMessageRecords = await this.getChatMessageRecordsByChatId(transaction, chatRecord.id);
                chatMessages = chatMessageRecords.map(record => ({
                    timestamp: record.timestamp,
                    id:        record.id,
                    nick:      record.nick,
                    text:      record.text,
                }));
            }
            await transactionPromise;
            if (this.debugLogEnabled) {
                log.debug('ChatHistoryStorage.getChatHistoryByChat: Done.', {chat, chatHistoryFound, chatMessages});
            }
            return chatMessages;
        } catch (error) {
            await this.disposeErroneousTransaction(transaction, transactionPromise);
            const errorMsg = 'ChatHistoryStorage.getChatHistoryByChat: Failed!';
            if (this.debugLogEnabled) {
                log.debug(errorMsg, {error, chat, this: {...this}});
            }
            throw new ErrorWithData(errorMsg, {originalError: error, chat});
        }
    }

    public async deleteOldChatHistoryByChatOlderThanTime(chat: Chat, olderThanTime: string): Promise<void>
    {
        let transaction: IDBTransaction = null;
        let transactionPromise: Promise<void> = null;
        try {
            await this.openDb();
            [transaction, transactionPromise] = this.getNewDbTransaction();
            const chatRecord = await this.getChatRecordByTypeRoomJidRoomNick(
                transaction, chat.type, chat.roomJid, chat.roomNick);
            const chatFound = !is.nil(chatRecord);
            let messagesDeleted = 0;
            let chatDeleted = false;
            if (chatFound) {
                const pruneResult = await this.deleteOldChatMessageRecordsByChatIdOlderThanTime(
                    transaction, chatRecord.id, olderThanTime);
                messagesDeleted = pruneResult.deletedCount;
                if (pruneResult.chatIsEmpty) {
                    await this.deleteChatRecordById(transaction, chatRecord.id);
                    chatDeleted = true;
                }
            }
            await transactionPromise;
            if (this.debugLogEnabled) {
                const msg = 'ChatHistoryStorage.deleteOldChatHistoryByChatOlderThanTime: Done.';
                log.debug(msg, {chat, olderThanTime, chatFound, chatDeleted, messagesDeleted});
            }
        } catch (error) {
            await this.disposeErroneousTransaction(transaction, transactionPromise);
            const errorMsg = 'ChatHistoryStorage.deleteOldChatHistoryByChat: Failed!';
            if (this.debugLogEnabled) {
                log.debug(errorMsg, {error, chat, olderThanTime, this: {...this}});
            }
            throw new ErrorWithData(errorMsg, {originalError: error, chat, olderThanTime});
        }
    }

    public async maintain(now: Date): Promise<Map<string, {chat: Chat, olderThanTime: string}[]>>
    {
        const deletedHistoriesByRoomJid: Map<string, {chat: Chat, olderThanTime: string}[]> = new Map();

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
            let chatRecord: ChatRecord|null = null;
            let chatRecordFound = true;
            let writeCount = 0;
            while (chatRecordFound && writeCount < this.maintenanceWriteCount) {
                [transaction, transactionPromise] = this.getNewDbTransaction();
                chatRecord = await this.getChatRecordToMaintain(transaction, chatOlderThanTimeStr);
                chatRecordFound = !is.nil(chatRecord);
                if (chatRecordFound) {
                    const retentionSecs = this.messageMaxAgeSecByType.get(chatRecord.type) ?? 10e20;
                    const msgOlderThanTime = Utils.utcStringOfDate(new Date(now.getTime() - retentionSecs * 1000));
                    const pruneResult = await this.deleteOldChatMessageRecordsByChatIdOlderThanTime(
                        transaction, chatRecord.id, msgOlderThanTime);
                    writeCount += pruneResult.deletedCount + 1;
                    if (pruneResult.chatIsEmpty) {
                        await this.deleteChatRecordById(transaction, chatRecord.id);
                    } else {
                        chatRecord.lastMaintained = nowStr;
                        await this.updateChatRecord(transaction, chatRecord);
                    }
                    if (pruneResult.deletedCount !== 0 || pruneResult.chatIsEmpty) {
                        const chat:Chat = {
                            type:           chatRecord.type,
                            roomJid:        chatRecord.roomJid,
                            roomNick:       chatRecord.roomNick,
                        };
                        const jidEntries = deletedHistoriesByRoomJid.get(chat.roomJid) ?? [];
                        jidEntries.push({chat, olderThanTime: msgOlderThanTime});
                        deletedHistoriesByRoomJid.set(chat.roomJid, jidEntries);
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

    private async createChatMessage(transaction: IDBTransaction, chat: ChatRecord, msg: ChatMessage): Promise<void> {
        const chatMessageRecord: ChatMessageRecord = {
            chatId:    chat.id,
            timestamp: msg.timestamp,
            id:        msg.id,
            nick:      msg.nick,
            text:      msg.text,
        };
        const chatMessageTable = transaction.objectStore('ChatMessage');
        await this.awaitDbRequest(chatMessageTable.add(chatMessageRecord));
    }

    private async getChatMessageRecordsByChatId(
        transaction: IDBTransaction, chatId: number,
    ): Promise<ChatMessageRecord[]> {
        const chatMessageTable = transaction.objectStore('ChatMessage');
        const index = chatMessageTable.index('iChatTimestamp');
        const keyRange = IDBKeyRange.bound([chatId, '0'], [chatId, '9'], false, false);
        return this.awaitDbRequest(index.getAll(keyRange));
    }

    private async deleteOldChatMessageRecordsByChatIdOlderThanTime(
        transaction: IDBTransaction, chatId: number, olderThanTime: string,
    ): Promise<{chatIsEmpty: boolean, deletedCount: number}> {
        let chatIsEmpty = true;
        let deletedCount = 0;
        const chatMessageTable = transaction.objectStore('ChatMessage');
        const index = chatMessageTable.index('iChatTimestamp');
        const keyRange = IDBKeyRange.bound([chatId, '0'], [chatId, '9'], false, false);
        const cursorRequest = index.openCursor(keyRange);
        let cursor = await this.awaitDbRequest(cursorRequest);
        while (!is.nil(cursor)) {
            const message: ChatMessage = cursor.value;
            if (message.timestamp >= olderThanTime) {
                chatIsEmpty = false;
                cursor = null;
            } else {
                await this.awaitDbRequest(cursor.delete());
                deletedCount++;
                cursor.continue();
                cursor = await this.awaitDbRequest(cursorRequest);
            }
        }
        return {chatIsEmpty, deletedCount};
    }

    //--------------------------------------------------------------------------
    // ChatRecord

    private async getOrCreateChatRecord(
        transaction: IDBTransaction, type: ChatType, roomJid: string, roomNick: string, lastMaintained: string,
    ): Promise<ChatRecord> {
        const chatFromIndex = await this.getChatRecordByTypeRoomJidRoomNick(
            transaction, type, roomJid, roomNick);
        if (!is.nil(chatFromIndex)) {
            return chatFromIndex;
        }
        const metaTable = transaction.objectStore('Meta');
        const lastId: number = (await this.awaitDbRequest(metaTable.get('lastChatId')))?.value ?? 0;
        const id = lastId + 1;
        await this.awaitDbRequest(metaTable.put({name: 'lastChatId', value: id}));
        const chat: ChatRecord = {
            id:             id,
            type:           type,
            roomJid:        roomJid,
            roomNick:       roomNick,
            lastMaintained: lastMaintained,
        };
        const chatTable = transaction.objectStore('Chat');
        await this.awaitDbRequest(chatTable.add(chat));
        return chat;
    }
    
    private async updateChatRecord(transaction: IDBTransaction, chatRecord: ChatRecord): Promise<void> {
        const chatTable = transaction.objectStore('Chat');
        await this.awaitDbRequest(chatTable.put(chatRecord));
    }

    private async deleteChatRecordById(transaction: IDBTransaction, chatRecordId: number): Promise<void> {
        const chatTable = transaction.objectStore('Chat');
        await this.awaitDbRequest(chatTable.delete(chatRecordId));
    }

    private async getChatRecordByTypeRoomJidRoomNick(
        transaction: IDBTransaction, type: ChatType, roomJid: string, roomNick: string
    ): Promise<ChatRecord|null> {
        const chatTable = transaction.objectStore('Chat');
        const index = chatTable.index('iTypeRoomJidNick');
        return this.awaitDbRequest(index.get(IDBKeyRange.only([type, roomJid, roomNick])));
    }

    private async getChatRecordToMaintain(transaction: IDBTransaction, olderThanTime: string): Promise<ChatRecord|null> {
        const chatTable = transaction.objectStore('Chat');
        const index = chatTable.index('iLastMaintained');
        return this.awaitDbRequest(index.get(IDBKeyRange.upperBound(olderThanTime, true)));
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
            const msg = 'Only transaction or transactionPromise is nil - but not both!';
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
        const dbConnectionRequest = indexedDB.open('chathistory', 1);
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
    // Schema iniztialization and updates

    private dbOnUpgradeNeeded(db: IDBDatabase, ev: IDBVersionChangeEvent): void
    {
        if (ev.oldVersion <= 0) { // Database didn't exist before.
            this.initDb(db);
        }
        // Add version upgrade code here.
    }

    private initDb(db: IDBDatabase): void
    {
        db.createObjectStore('Meta', {keyPath: 'name'});
        const chatTable = db.createObjectStore('Chat', {keyPath: 'id'});
        chatTable.createIndex('iTypeRoomJidNick', ['type', 'roomJid', 'roomNick'], {unique: true});
        chatTable.createIndex('iLastMaintained', 'lastMaintained', {unique: false});
        const chatmessageTable = db.createObjectStore('ChatMessage', {keyPath: ['chatId', 'id']});
        chatmessageTable.createIndex('iChatTimestamp', ['chatId', 'timestamp'], {unique: false});
    }

}
