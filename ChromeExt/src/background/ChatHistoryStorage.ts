import { BackgroundApp } from './BackgroundApp';
import { as } from '../lib/as';
import { Config } from '../lib/Config';
import { is } from '../lib/is';
import { ChatMessage, ChatType } from '../lib/ChatMessage';
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
    private publicMaxAgeSec: number = Number.MAX_VALUE;
    private privateMaxAgeSec: number = Number.MAX_VALUE;
    private db: IDBDatabase|null;

    constructor(app: BackgroundApp)
    {
        this.app = app;
    }

    public onUserConfigUpdate(): void
    {
        this.publicMaxAgeSec = as.Float(Config.get('chatHistory.publicMaxAgeSec'), Number.MAX_VALUE);
        this.privateMaxAgeSec = as.Float(Config.get('chatHistory.privateMaxAgeSec'), Number.MAX_VALUE);
    }

    public async storeChatRecord(msg: ChatMessage): Promise<void>
    {
        try {
            await this.openDb();
            const [transaction, transactionPromise] = this.getNewDbTransaction();
            const chat = await this.getOrCreateChatRecord(transaction, msg.type, msg.roomJid, msg.roomNick);
            await this.createChatMessage(transaction, chat, msg);
            await transactionPromise;
        } catch (error) {
            const errorMsg = 'ChatHistoryStorage:storeChatRecord: Failed!';
            throw new ErrorWithData(errorMsg, {originalError: error, chatMessage: msg});
        }
    }

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

    private async getOrCreateChatRecord(
        transaction: IDBTransaction, type: ChatType, roomJid: string, roomNick: string
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
            lastMaintained: Utils.utcStringOfDate(new Date()),
        };
        const chatTable = transaction.objectStore('Chat');
        await this.awaitDbRequest(chatTable.add(chat));
        return chat;
    }

    private async getChatRecordByTypeRoomJidRoomNick(
        transaction: IDBTransaction, type: ChatType, roomJid: string, roomNick: string
    ): Promise<ChatRecord> {
        const chatTable = transaction.objectStore('Chat');
        const index = chatTable.index('iTypeRoomJidNick');
        return this.awaitDbRequest(index.get([type, roomJid, roomNick]));
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
            transaction.oncomplete = (ev) => resolve();
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
                try {
                    this.db?.close();
                } catch (error) {
                    // Ignore error.
                }
                this.db = null;
                const msg = 'Database is already open and of older version!';
                reject(new ErrorWithData(msg, {originalError: dbConnectionRequest.error}));
                try {
                    dbConnectionRequest.result.close();
                } catch (error) {
                    // Ignore error.
                }
            };
            dbConnectionRequest.onerror = (ev) => {
                const msg = 'Database open failed!';
                reject(new ErrorWithData(msg, {originalError: dbConnectionRequest.error}));
            };
        });
        return resultPromise;
    }

    private dbOnUpgradeNeeded(db: IDBDatabase, ev: IDBVersionChangeEvent): void
    {
        if (ev.oldVersion <= 0) { // Database didn't exist before.
            this.initDb(db);
        }
        // Add version upgrade code here.
    }

    private initDb(db: IDBDatabase): void
    {
        const metaTable = db.createObjectStore('Meta', {keyPath: 'name'});
        const chatTable = db.createObjectStore('Chat', {keyPath: 'id'});
        chatTable.createIndex('iRoomJid', 'roomJid', {unique: false});
        chatTable.createIndex('iRoomNick', 'roomNick', {unique: false});
        chatTable.createIndex('iTypeRoomJidNick', ['type', 'roomJid', 'roomNick'], {unique: true});
        chatTable.createIndex('iLastMaintained', 'lastMaintained', {unique: false});
        const chatmessageTable = db.createObjectStore('ChatMessage', {keyPath: ['chatId', 'id']});
        chatmessageTable.createIndex('iChat', 'chatId', {unique: false});
        chatmessageTable.createIndex('iChatTime', ['chatId', 'timestamp'], {unique: false});
    }

}
