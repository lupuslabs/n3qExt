/**
 * Implements the single item transfer feature.
 *
 * Communication between item sender and item recipient and local actions:
 *
 *
 * Sender 1.a.                                                          |
 *  |                                                                   |
 *  |--local-timeout--> Sender 2.a.                                     |
 *  |                                                                   |
 *  |--local-cancel---> Sender 2.b.                                     |
 *  |                                 .--local-timeout--> Sender 3.a. --|--msg-cancel-timeout---------.
 *  '--local-confirm--> Sender 2.c. --|                                 |                             |-> Recipient 2.a.
 *                       |            '--local-cancel---> Sender 3.b. --|--msg-cancel-senderCanceled--'
 *                       |                                              |
 * ---------------------------------------------------------------------'
 *                       |
 *                   msg offer
 *                       v
 *                 Recipient 1.a.                             .---------------------------------------------------------
 *                       |                                    |
 *                       |--local-timeout--> Recipient 2.b. --|--msg-reject-timeout------------.
 *                       |                                    |                                |--> Sender 4.a.
 *                       |--local-reject---> Recipient 2.c. --|--msg-reject-recipientRejected--'
 *                       |                                    |
 *                       '--local-accept---> Recipient 2.d.   |
 *                                            |               |
 * -----------------------------------------------------------'
 *                                            |
 *                                       msg accept
 *                                            v
 *                                       Sender 4.b.
 *
 *
 * Sender 1.a: user triggered single item transfer ->
 * Adds item to controller memory with state SimpleItemTransferSenderState.askingUser.
 * Show item transfer question toast.
 *
 * Sender 2.a.: User doesn't react in time ->
 * Delete item from controller memory.
 *
 * Sender 2.b.: User cancels transfer ->
 * Delete item from controller memory.
 *
 * Sender: 2.c.: User confirmed transfer ->
 * XMPP Message vp:transfer/x.type = SimpleItemTransferMsgType.offer.
 * Adds item to controller memory
 * Authorizes recipient for item per API call to item server.
 * Sets state to SimpleItemTransferSenderState.offered in controller memory.
 * Show transfer cancel dialog.
 *
 * Sender 3.a.: Receives no reaction in time ->
 * Delete item from controller memory.
 * XMPP Message vp:transfer/x.type = SimpleItemTransferMsgType.cancel.
 * .cause = SimpleItemTransferRejectCause.timeout.
 * Show timeout error toast.
 *
 * Sender 3.b.: User cancels transfer ->
 * Delete item from controller memory.
 * XMPP Message vp:transfer/x.type = SimpleItemTransferMsgType.cancel.
 * .cause = SimpleItemTransferRejectCause.senderCanceled.
 * Show appropriate confirmation toast.
 *
 * Sender 4.a.: Receives rejection message ->
 * Delete item from controller memory
 * Show appropriate error toast - message depending on vp:transfer/x.cause.
 *
 * Sender 4.b.: Receives acceptance message ->
 * Delete item from controller memory.
 * Check that transfer actually happened.
 * Show transfer success toast.
 *
 * Recipient 1.a.: Receives offer message ->
 * Add item to local list with state SimpleItemTransferRecipientState.asking.
 * Show item accept question in toast to user.
 *
 * Recipient 2.a.: Receives cancel message ->
 * Delete item from controller memory.
 * Show appropriate failure toast.
 *
 * Recipient 2.b.: User doesn't react in time ->
 * Delete item from controller memory.
 * XMPP Message vp:transfer/x.type = SimpleItemTransferMsgType.reject,
 * .cause = SimpleItemTransferRejectCause.timeout.
 *
 * Recipient 2.c.: User rejects item ->
 * Delete item from controller memory.
 * XMPP Message vp:transfer/x.type = SimpleItemTransferMsgType.reject,
 * .cause = SimpleItemTransferRejectCause.recipientRejected.
 *
 * Recipient 2.d.: User accepts item ->
 * Delete item from controller memory.
 * Accept transfer for item per API call to item server.
 * XMPP Message vp:transfer/x.type = SimpleItemTransferMsgType.accept.
 * Show transfer success toast.
 */
import log = require('loglevel');
import { ErrorWithData, Utils } from '../lib/Utils';
import { Room } from './Room';
import { Participant } from './Participant';
import { ContentApp } from './ContentApp';
import { BackgroundMessage } from '../lib/BackgroundMessage';
import { ItemProperties, Pid } from '../lib/ItemProperties';
import { ItemException } from '../lib/ItemException';
import * as jid from '@xmpp/jid';
import * as ltx from 'ltx';
import { Config } from '../lib/Config';
import { SimpleErrorToast, SimpleToast, Toast } from './Toast';
import { is } from '../lib/is';
import { as } from '../lib/as';

type ItemWithId = ItemProperties & {[Pid.Id]: string, [Pid.Provider]: string, [Pid.InventoryId]: string};

type Translatable
    = undefined
    | null
    | string
    | [TranslatableType, string]
    | [TranslatableType, string, Translatable]
    | [TranslatableType, string, TranslatableModifiers]
    | [TranslatableType, string, Translatable, TranslatableModifiers];

type TranslatableType = 'text' | 'textid';

type TranslatableModifiers = {
    fallback?: Translatable,
    replacements?: TranslatableReplacement[],
};

type TranslatableReplacement = [string, Translatable];

enum SimpleItemTransferMsgType {
    offer = 'offer',
    cancel = 'cancel',
    accept = 'accept',
    reject = 'reject',
}

class SimpleItemTransferMsg {
    constructor(
        public readonly from: Participant,
        public readonly item: ItemWithId,
        public readonly type: SimpleItemTransferMsgType,
        public readonly cause: undefined|SimpleItemTransferCancelCause,
    ) {}
}

class SimpleItemTransferMsgOffer extends SimpleItemTransferMsg {
    constructor(
        from: Participant,
        item: ItemWithId,
        public readonly transferToken: string,
    ) {
        super(from, item, SimpleItemTransferMsgType.offer, undefined);
    }
}

enum SimpleItemTransferCancelCause {
    senderTimeout = 'senderTimeout',
    senderCanceled = 'senderCanceled',
    recipientTimeout = 'recipientTimeout',
    recipientRejected = 'recipientRejected',
}

const enum SimpleItemTransferSenderState {
    askingUser,
    offered,
    cleanup,
}

const enum SimpleItemTransferRecipientState {
    askingUser,
    cleanup,
}

abstract class SimpleItemTransferRecord {
    public transferState: SimpleItemTransferSenderState|SimpleItemTransferRecipientState;
    public toast:         undefined|Toast;
    public timeoutHandle: undefined|number;
    protected constructor(
        public item: ItemWithId
    ) {}
    abstract getMsgReceiver(): Participant;
}

class SimpleItemTransferSenderRecord extends SimpleItemTransferRecord {
    transferState: SimpleItemTransferSenderState = SimpleItemTransferSenderState.askingUser;
    transferToken: undefined|string = undefined;
    constructor(
        public readonly recipient: Participant,
        item: ItemWithId,
    ) {
        super(item);
    }
    getMsgReceiver(): Participant { return this.recipient; }
}

class SimpleItemTransferRecipientRecord extends SimpleItemTransferRecord {
    transferState: SimpleItemTransferRecipientState = SimpleItemTransferRecipientState.askingUser;
    constructor(
        public readonly sender: Participant,
        item: ItemWithId,
        public readonly transferToken: string,
    ) {
        super(item);
    }
    getMsgReceiver(): Participant { return this.sender; }
}

export class SimpleItemTransferController
{
    protected readonly app: ContentApp;
    protected readonly room: Room;
    protected readonly myParticipant: Participant;

    protected readonly itemsSending: {[itemId: string]: SimpleItemTransferSenderRecord};
    protected readonly itemsReceiving: {[itemId: string]: SimpleItemTransferRecipientRecord};

    constructor(app: ContentApp)
    {
        this.app = app;
        this.room = app.getRoom();
        const participant = app.getMyParticipant();
        if (is.nil(participant)) {
            const msg = 'Bug found: Constructing SimpleItemTransferController before local participant has been initialized!';
            throw new ErrorWithData(msg);
        }
        this.myParticipant = participant;
        this.itemsSending = {};
        this.itemsReceiving = {};
    }

    /**
     * Handles a simple item transfer stanza.
     *
     * Returns, whether the stanza has been handled.
     */
    public onStanza(stanza: ltx.Element): boolean
    {
        if (!as.Bool(Config.get('SimpleItemTransfer.enabled'))) {
            return false;
        }
        let stanzaHandled = false;
        try {
            const msg = this.parseTransferNodeOfStanza(stanza);
            if (!is.nil(msg)) {
                stanzaHandled = true;
                switch (msg.type) {
                    case SimpleItemTransferMsgType.offer: {
                        // Sender offered an item.
                        this.recipientOnOfferMsg(<SimpleItemTransferMsgOffer>msg);
                    } break;
                    case SimpleItemTransferMsgType.cancel: {
                        // Sender offered an item.
                        this.recipientOnCancelMsg(msg);
                    } break;
                    case SimpleItemTransferMsgType.accept: {
                        // Recipient accepted the item.
                        this.senderOnAcceptMsg(msg);
                    } break;
                    case SimpleItemTransferMsgType.reject: {
                        // Recipient rejected transfer.
                        this.senderOnRejectMsg(msg);
                    } break;
                    default: {
                        // noinspection JSUnusedLocalSymbols
                        const _: never = msg.type; // Exhaustiveness check.
                    } break;
                }
            }
        } catch (error) {
            this.app.onError(ErrorWithData.ofError(error, undefined, {this: this}));
        }
        return stanzaHandled;
    }

    /**
     * To be called whenever a Participant disappears
     * or a BackpackItem is altered or deleted.
     */
    public onUpdate(): void {
        // Todo: Actually call this whenever a Participant disappears
        //       or a BackpackItem is altered or deleted.
        // Todo: Check all records and react to disappearing
        //       item/sender/recipient by closing open toasts, displaying
        //       a cancellation toast and removing the local record.
    }

    //==========================================================================
    // Sender steps

    //--------------------------------------------------------------------------
    // Step: Sender 1.a.

    public senderInitiateItemTransfer(recipient: Participant, item: ItemProperties): void
    {
        if (!isItemWithId(item)) {
            return;
        }
        const itemId: string = item[Pid.Id];
        if (itemId in this.itemsSending || !ItemProperties.isSimpleTransferable(item)) {
            this.senderShowItemNontransferableToast();
            return;
        }

        const record: SimpleItemTransferSenderRecord = new SimpleItemTransferSenderRecord(recipient, item);
        record.toast = this.senderShowConfirmDlg(record);
        this.itemsSending[itemId] = record;
    }

    protected senderShowItemNontransferableToast(): void
    {
        // Todo: Mention item name in message.
        const fact = ItemException.Fact.NotTransferred;
        const factText = ItemException.fact2String(fact);
        const reason = ItemException.Reason.ItemIsNotTransferable;
        const reasonText = ItemException.reason2String(reason);
        const toastType = `Warning-${factText}-${reasonText}`;
        const toastDurationKey = 'room.applyItemErrorToastDurationSec';
        const toastDuration = as.Float(Config.get(toastDurationKey));
        const toast = new SimpleErrorToast(this.app, toastType, toastDuration,
            'warning', factText, reasonText, '');
        toast.show();
    }

    protected senderShowConfirmDlg(record: SimpleItemTransferSenderRecord): Toast
    {
        const itemId: string = record.item[Pid.Id];
        const translationMods = this.makeUserMsgTranslationModifiers(record);
        const toastType = 'SimpleItemTransferSenderConfirm';
        const toastTitleId = 'SimpleItemTransfer.senderConfirmQuestionTitle';
        const toastTextId = 'SimpleItemTransfer.senderConfirmQuestionText';
        const toastDurationId = 'SimpleItemTransfer.senderConfirmToastDurationSec';
        const closeAction = () => this.senderConfirmDlgOnClose(itemId);
        return this.showUserToast(toastType, translationMods, 'question',
            toastTitleId, toastTextId, toastDurationId, false, closeAction, [
                ['SimpleItemTransfer.senderConfirmQuestionYes', () => this.senderConfirmDlgOnYes(itemId)],
                ['SimpleItemTransfer.senderConfirmQuestionNo', () => this.senderConfirmDlgOnNo(itemId)],
            ]);
    }

    //--------------------------------------------------------------------------
    // Steps: Sender 2.a., Sender 2.b.

    protected senderConfirmDlgOnClose(itemId: string): void
    {
        this.senderConfirmDlgOnNo(itemId);
    }

    protected senderConfirmDlgOnNo(itemId: string): void
    {
        const record = this.itemsSending[itemId];
        if (record?.transferState !== SimpleItemTransferSenderState.askingUser) {
            return; // Transfer canceled while waiting for user action.
        }
        this.senderCleanupItem(itemId, true);
    }

    //--------------------------------------------------------------------------
    // Step: Sender 2.c.

    protected senderConfirmDlgOnYes(itemId: string): void
    {
        (async (): Promise<void> => {
            let record = this.itemsSending[itemId];
            if (record?.transferState !== SimpleItemTransferSenderState.askingUser) {
                return; // Safety net.
            }
            const item = await BackgroundMessage.getBackpackItemProperties(itemId);
            if (!isItemWithId(item)) {
                throw new ErrorWithData('Backpack item has no ID!', {itemId: itemId, item: item});
            }
            record = this.itemsSending[itemId];
            if (record?.transferState !== SimpleItemTransferSenderState.askingUser) { // Race protection.
                return;
            }
            this.senderCleanupItem(itemId, false);

            const itemGone = await this.senderHandleItemUpdate(record, false);
            if (itemGone) {
                // Final toast already shown by senderHandleItemUpdate.
            } else {
                await this.senderAutorize(record);
                record.item = item;
                record.transferState = SimpleItemTransferSenderState.offered;
                record.toast = this.senderShowOfferWaitDlg(record);
                this.sendMsg(record, SimpleItemTransferMsgType.offer);
            }
        })().catch(error => {
            this.senderCleanupItem(itemId, true);
            this.app.onError(new ItemException(
                ItemException.Fact.NotTransferred, ItemException.Reason.InternalError, '',
                undefined, {error: error, this: this, itemId: itemId}));
        });
    }

    protected getOfferWaitDlgTimeout(): number
    {
        const timeoutKey = 'SimpleItemTransfer.recipientAcceptToastDurationSec';
        const extraKey = 'SimpleItemTransfer.senderOfferWaitToastExtraDurationSec';
        return as.Float(Config.get(timeoutKey)) + as.Float(Config.get(extraKey));
    }

    protected senderShowOfferWaitDlg(record: SimpleItemTransferSenderRecord): Toast
    {
        const itemId: string = record.item[Pid.Id];
        const translationMods = this.makeUserMsgTranslationModifiers(record);
        const toastType = 'SimpleItemTransferSenderOfferWait';
        const toastTitleId = 'SimpleItemTransfer.senderOfferWaitTitle';
        const toastTextId = 'SimpleItemTransfer.senderOfferWaitText';
        const toastDuration = this.getOfferWaitDlgTimeout();
        const closeAction = () => this.senderOfferWaitDlgOnTimeout(itemId);
        return this.showUserToast(toastType, translationMods, 'question',
            toastTitleId, toastTextId, toastDuration, false, closeAction, [
                ['SimpleItemTransfer.senderOfferWaitCancel', () => this.senderOfferWaitDlgOnCancel(itemId)],
            ]);
    }

    //--------------------------------------------------------------------------
    // Steps: Sender 3.a., Sender 3.b.

    protected senderOfferWaitDlgCancelTransfer(itemId: string, cause: SimpleItemTransferCancelCause): void
    {
        (async (): Promise<void> => {
            const record = this.itemsSending[itemId];
            if (record?.transferState !== SimpleItemTransferSenderState.offered) {
                return; // Safety net.
            }
            this.senderCleanupItem(itemId, true);

            this.senderUnauthorize(record).catch(error => {
                this.app.onError(ErrorWithData.ofError(
                    error, 'senderDeauthorize failed!', {record: record}, false));
            });
            this.sendMsg(record, SimpleItemTransferMsgType.cancel, cause);

            const itemGone = await this.senderHandleItemUpdate(record, true);
            if (itemGone) {
                // Item disappeared for non-transfer-related reasons.
            } else {
                const translationMods = this.makeUserMsgTranslationModifiers(record);
                switch (cause) {
                    case SimpleItemTransferCancelCause.senderTimeout: {
                        const toastType = 'SimpleItemTransferSenderSenderTimeout';
                        const toastTitleId = 'SimpleItemTransfer.senderSenderTimeoutTitle';
                        const toastTextId = 'SimpleItemTransfer.senderSenderTimeoutText';
                        const toastDurationId = 'SimpleItemTransfer.errorToastDurationSec';
                        this.showUserToast(toastType, translationMods, 'notice',
                            toastTitleId, toastTextId, toastDurationId, false);
                    } break;
                    default: {
                        const toastType = 'SimpleItemTransferSenderSenderCanceled';
                        const toastTitleId = 'SimpleItemTransfer.senderSenderCanceledTitle';
                        const toastTextId = 'SimpleItemTransfer.senderSenderCanceledText';
                        const toastDurationId = 'SimpleItemTransfer.errorToastDurationSec';
                        this.showUserToast(toastType, translationMods, 'notice',
                            toastTitleId, toastTextId, toastDurationId, true);
                    } break;
                }
            }
        })().catch(error => {
            this.app.onError(new ItemException(
                ItemException.Fact.NotTransferred, ItemException.Reason.InternalError, '',
                undefined, {error: error, this: this, itemId: itemId}));
        });
    }

    protected senderOfferWaitDlgOnTimeout(itemId: string): void
    {
        this.senderOfferWaitDlgCancelTransfer(itemId, SimpleItemTransferCancelCause.senderTimeout);
    }

    protected senderOfferWaitDlgOnCancel(itemId: string): void
    {
        this.senderOfferWaitDlgCancelTransfer(itemId, SimpleItemTransferCancelCause.senderCanceled);
    }

    //--------------------------------------------------------------------------
    // Step: Sender 4.a.

    protected senderOnRejectMsg(msg: SimpleItemTransferMsg): void
    {
        const itemId = msg.item[Pid.Id];
        (async (): Promise<void> => {
            const record = this.itemsSending[itemId];
            if (record?.transferState !== SimpleItemTransferSenderState.offered) {
                return; // Safety net.
            }
            this.senderCleanupItem(itemId, true);

            this.senderUnauthorize(record).catch(error => {
                this.app.onError(ErrorWithData.ofError(
                    error, 'senderDeauthorize failed!', {record: record}, false));
            });

            const itemGone = await this.senderHandleItemUpdate(record, true);
            if (itemGone) {
                // Item transfered regardless and final toast already shown by senderHandleItemUpdate.
            } else {
                const translationMods = this.makeUserMsgTranslationModifiers(record);
                switch (msg.cause) {
                    case SimpleItemTransferCancelCause.recipientTimeout: {
                        const toastType = 'SimpleItemTransferSenderRecipientTimeout';
                        const toastTitleId = 'SimpleItemTransfer.senderRecipientTimeoutTitle';
                        const toastTextId = 'SimpleItemTransfer.senderRecipientTimeoutText';
                        const toastDurationId = 'SimpleItemTransfer.errorToastDurationSec';
                        this.showUserToast(toastType, translationMods, 'notice',
                            toastTitleId, toastTextId, toastDurationId, false);
                    } break;
                    default: {
                        const toastType = 'SimpleItemTransferSenderRecipientRejected';
                        const toastTitleId = 'SimpleItemTransfer.senderRecipientRejectedTitle';
                        const toastTextId = 'SimpleItemTransfer.senderRecipientRejectedText';
                        const toastDurationId = 'SimpleItemTransfer.errorToastDurationSec';
                        this.showUserToast(toastType, translationMods, 'notice',
                            toastTitleId, toastTextId, toastDurationId, false);
                    } break;
                }
            }
        })().catch(error => {
            this.app.onError(new ItemException(
                ItemException.Fact.NotTransferred, ItemException.Reason.InternalError, '',
                undefined, {error: error, this: this, itemId: itemId}));
        });
    }

    //--------------------------------------------------------------------------
    // Step: Sender 4.b.

    protected senderOnAcceptMsg(msg: SimpleItemTransferMsg): void
    {
        const itemId = msg.item[Pid.Id];
        (async (): Promise<void> => {
            const record = this.itemsSending[itemId];
            if (record?.transferState !== SimpleItemTransferSenderState.offered) {
                return; // Safety net.
            }
            this.senderCleanupItem(itemId, true);

            const itemGone = await this.senderHandleItemUpdate(record, true);
            if (itemGone) {
                // Item indeed transfered and final toast already shown by senderHandleItemUpdate.
            } else {
                this.app.onError(new ItemException(
                    ItemException.Fact.NotTransferred, ItemException.Reason.InternalError, '',
                    'Item still in item repository!',
                    {record: record, itemId: itemId}));
            }
        })().catch(error => {
            this.app.onError(new ItemException(
                ItemException.Fact.NotTransferred, ItemException.Reason.InternalError, '',
                undefined, {error: error, this: this, itemId: itemId}));
        });
    }

    //==========================================================================
    // Recipient steps

    //--------------------------------------------------------------------------
    // Step: Recipient 1.a.

    protected recipientOnOfferMsg(msg: SimpleItemTransferMsgOffer): void
    {
        const item = msg.item;
        const itemId = item[Pid.Id];
        if (!is.nil(this.itemsReceiving[itemId])) {
            return;
        }

        const record = new SimpleItemTransferRecipientRecord(msg.from, item, msg.transferToken);
        record.toast = this.recipientShowAcceptDlg(record);
        this.itemsReceiving[itemId] = record;
    }

    protected recipientShowAcceptDlg(record: SimpleItemTransferRecipientRecord): Toast
    {
        const itemId: string = record.item[Pid.Id];
        const translationMods = this.makeUserMsgTranslationModifiers(record);
        const toastType = 'SimpleItemTransferRecipientAccept';
        const toastTitleId = 'SimpleItemTransfer.recipientAcceptQuestionTitle';
        const toastTextId = 'SimpleItemTransfer.recipientAcceptQuestionText';
        const toastDurationId = 'SimpleItemTransfer.recipientAcceptToastDurationSec';
        const closeAction = () => this.recipientAcceptDlgOnClose(itemId);
        return this.showUserToast(toastType, translationMods, 'question',
            toastTitleId, toastTextId, toastDurationId, false, closeAction, [
                ['SimpleItemTransfer.recipientAcceptQuestionYes', () => this.recipientAcceptDlgYes(itemId)],
                ['SimpleItemTransfer.recipientAcceptQuestionNo', () => this.recipientAcceptDlgOnNo(itemId)],
            ]);
    }

    //--------------------------------------------------------------------------
    // Step: Recipient 2.a.

    protected recipientOnCancelMsg(msg: SimpleItemTransferMsg): void
    {
        const itemId = msg.item[Pid.Id];
        const record = this.itemsReceiving[itemId];
        if (record?.transferState !== SimpleItemTransferRecipientState.askingUser) {
            return; // Safety net.
        }
        this.recipientCleanupItem(itemId, true);

        const translationMods = this.makeUserMsgTranslationModifiers(record);
        const toastType = 'SimpleItemTransferRecipientCanceled';
        const toastTitleId = 'SimpleItemTransfer.recipientCanceledTitle';
        const toastTextId = 'SimpleItemTransfer.recipientCanceledText';
        const toastDurationId = 'SimpleItemTransfer.errorToastDurationSec';
        this.showUserToast(toastType, translationMods, 'warning',
            toastTitleId, toastTextId, toastDurationId, false);
    }

    //--------------------------------------------------------------------------
    // Steps: Recipient 2.b.

    protected recipientAcceptDlgOnClose(itemId: string): void
    {
        const record = this.itemsReceiving[itemId];
        if (record?.transferState !== SimpleItemTransferRecipientState.askingUser) {
            return; // Safety net.
        }
        this.recipientCleanupItem(itemId, true);

        this.sendMsg(record, SimpleItemTransferMsgType.reject, SimpleItemTransferCancelCause.senderTimeout);
    }

    //--------------------------------------------------------------------------
    // Steps: Recipient 2.c.

    protected recipientAcceptDlgOnNo(itemId: string): void
    {
        const record = this.itemsReceiving[itemId];
        if (record?.transferState !== SimpleItemTransferRecipientState.askingUser) {
            return; // Safety net.
        }
        this.recipientCleanupItem(itemId, true);

        this.sendMsg(record, SimpleItemTransferMsgType.reject, SimpleItemTransferCancelCause.recipientRejected);
    }

    //--------------------------------------------------------------------------
    // Step: Recipient 2.d.

    protected recipientAcceptDlgYes(itemId: string): void
    {
        (async (): Promise<void> => {
            const expectedState = SimpleItemTransferRecipientState.askingUser;
            const record = this.itemsReceiving[itemId];
            if (record?.transferState !== expectedState) {
                return; // Safety net.
            }
            this.recipientCleanupItem(itemId, true);

            await this.recipientAccept(record);
            this.sendMsg(record, SimpleItemTransferMsgType.accept);

            this.showReceivedItemEffect(itemId);
            const translationMods = this.makeUserMsgTranslationModifiers(record);
            const toastType = 'SimpleItemTransferRecipientRetrieveComplete';
            const toastTitleId = 'SimpleItemTransfer.recipientRetrieveCompleteTitle';
            const toastTextId = 'SimpleItemTransfer.recipientRetrieveCompleteText';
            const toastDurationId = 'SimpleItemTransfer.recipientRetrieveCompleteToastDurationSec';
            this.showUserToast(toastType, translationMods, 'notice',
                toastTitleId, toastTextId, toastDurationId, true);
        })().catch(error => {
            this.app.onError(new ItemException(
                ItemException.Fact.NotTransferred, ItemException.Reason.InternalError, '',
                undefined, {error: error, this: this, itemId: itemId}));
        });
    }

    protected showReceivedItemEffect(itemId: string, tries: number = 12) {
        // RoomItem might not be created yet or may still be the old owner's one.
        const roomItem = this.room.getItemByItemId(itemId);
        if (is.nil(roomItem) || !roomItem.isMyItem()) {
            if (tries > 1) {
                const doRetryFun = this.showReceivedItemEffect.bind(this, itemId, tries - 1);
                window.setTimeout(doRetryFun, 250);
            }
        } else {
            roomItem.showEffect('pulse');
        }
    }

    //==========================================================================

    //--------------------------------------------------------------------------
    // Dynamic helpers

    protected logInfo(src: string, msg: string, data?: {[p: string]: unknown}): void
    {
        if (Utils.logChannel('SimpleItemTransfer')) {
            log.info(`${src}: ${msg}`, data ?? {});
        }
    }

    protected async senderAutorize(record: SimpleItemTransferSenderRecord): Promise<void>
    {
        const itemId = record.item.Id;
        const timeoutSecs = this.getOfferWaitDlgTimeout() + 3.0; // Actual timeout plus safety margin.
        record.transferToken = await BackgroundMessage.backpackTransferAuthorize(itemId, timeoutSecs);
    }

    protected async senderUnauthorize(record: SimpleItemTransferSenderRecord): Promise<void>
    {
        const itemId = record.item.Id;
        await BackgroundMessage.backpackTransferUnauthorize(itemId);
    }

    protected async recipientAccept(record: SimpleItemTransferRecipientRecord): Promise<void>
    {
        const itemId = record.item.Id;
        const providerId = record.item.Provider;
        const senderInvId = record.item.InventoryId;
        const transferToken = record.transferToken;
        const item = await BackgroundMessage.backpackTransferComplete(providerId, senderInvId, itemId, transferToken);
        if (!isItemWithId(item)) {
            throw new ErrorWithData(
                'BackgroundMessage.backpackTransferComplete returned incomplete ItemProperties!',
                {record: record, item: item});
        }
        record.item = item;
    }

    protected async senderHandleItemUpdate(
        record: SimpleItemTransferSenderRecord, mayBeTransferred: boolean
    ): Promise<boolean> {
        const itemId = record.item.Id;

        // Check backpack:
        let itemGoneFromBackpack: boolean;
        try {
            let itemProps = await BackgroundMessage.getBackpackItemProperties(itemId);
            if (isItemWithId(itemProps)) {
                itemGoneFromBackpack = false;
                record.item = itemProps;
            } else {
                itemGoneFromBackpack = true;
            }
        } catch (error) {
            itemGoneFromBackpack = true;
        }

        let itemGone = itemGoneFromBackpack;
        if (!itemGone && !await BackgroundMessage.backpackIsItemStillInRepo(itemId)) {
            itemGone = true;
        }

        // Handle completion and external item use:
        if (itemGone) {
            this.senderCleanupItem(itemId, true);
            // Todo: Remove check for itemGoneFromBackpack after implementing server-side push updates:
            if (!itemGoneFromBackpack && mayBeTransferred) {
                // Probably successfully transfered.
                const translationMods = this.makeUserMsgTranslationModifiers(record);
                const toastType = 'SimpleItemTransferSenderSent';
                const toastTitleId = 'SimpleItemTransfer.senderSentCompleteTitle';
                const toastTextId = 'SimpleItemTransfer.senderSentCompleteText';
                const toastDurationId = 'SimpleItemTransfer.senderSentCompleteToastDurationSec';
                this.showUserToast(toastType, translationMods, 'notice',
                    toastTitleId, toastTextId, toastDurationId, true);
            } else {
                // Probably something non-transfer-related made the item disappear, so abort silently.
            }
        }
        return itemGone;
    }

    /**
     * Cleans up an item sending state
     *
     * - Sets transferState to cleanup to signal obsoleteness to even thandlers.
     * - Closes .toast and sets it to undefined.
     * - When forget is true: Forgets the item state.
     */
    protected senderCleanupItem(itemId: string, forget: boolean): void
    {
        const record = this.itemsSending[itemId];
        if (!is.nil(record)) {
            record.transferState = SimpleItemTransferSenderState.cleanup;
            this.cleanupItemRecord(record);
            if (forget) {
                delete this.itemsSending[itemId];
            }
        }
    }

    /**
     * Cleans up an item sending state
     *
     * - Sets transferState to cleanup to signal obsoleteness to even thandlers.
     * - Closes .toast and sets it to undefined.
     * - Cancels timeout and sets .timeoutHandle to undefined.
     * - When forget is true: Forgets the item state.
     */
    protected recipientCleanupItem(itemId: string, forget: boolean): void
    {
        const record = this.itemsReceiving[itemId];
        if (!is.nil(record)) {
            record.transferState = SimpleItemTransferRecipientState.cleanup;
            this.cleanupItemRecord(record);
            if (forget) {
                delete this.itemsReceiving[itemId];
            }
        }
    }

    protected cleanupItemRecord(record: SimpleItemTransferRecord): void
    {
        record.toast?.close();
        record.toast = undefined;
        window.clearTimeout(record.timeoutHandle);
        record.timeoutHandle = undefined;
    }

    //--------------------------------------------------------------------------
    // Inter client communication

    protected parseTransferNodeOfStanza(stanza: ltx.Element): undefined|SimpleItemTransferMsg
    {
        const fromStr: unknown = stanza.attrs.from;
        let fromJid: undefined|jid.JID = undefined;
        let from: undefined|Participant = undefined;
        if (is.string(fromStr)) {
            fromJid = jid(fromStr);
            from = this.room.getParticipant(fromJid.getResource());
        }

        const transferNode = stanza.getChild('x', 'vp:transfer');
        const itemNode = transferNode?.getChild('item');
        const item = ItemProperties.getStrings(itemNode?.attrs ?? {});

        const type: unknown = transferNode?.attrs?.type;
        let result: undefined|SimpleItemTransferMsg = undefined;
        if (true
            && !is.nil(from)
            && !is.nil(item) && isItemWithId(item)
            && isSimpleItemTransferMsgType(type)
        ) {
            switch (type) {
                case SimpleItemTransferMsgType.offer:
                    const transferToken: unknown = transferNode?.attrs?.transferToken;
                    if (is.string(transferToken)) {
                        result = new SimpleItemTransferMsgOffer(from, item, transferToken);
                    }
                break;
                default:
                    const cause: unknown = transferNode?.attrs?.cause;
                    if (is.nil(cause) || isSimpleItemTransferRejectCause(cause)) {
                        result = new SimpleItemTransferMsg(from, item, type, cause);
                    }
                break;
            }
        }

        this.logInfo('SimpleItemTransfer.parseTransferNodeOfStanza', 'Parsed stanza.', {
            stanza: stanza,
            fromStr: fromStr, fromJid: fromJid, from: from,
            transferNode: transferNode, itemNode: itemNode, item: item,
            result: result});
        return result;
    }

    protected sendMsg(
        record: SimpleItemTransferRecord,
        type:   SimpleItemTransferMsgType,
        cause?: SimpleItemTransferCancelCause,
    ): void {
        const itemNode     = this.makeMsgItemNode(record, type);
        const transferNode = this.makeMsgTransferNode(record, itemNode, type, cause);
        const stanza       = this.makeMsgStanza(record, transferNode);
        this.app.sendStanza(stanza);
        this.logInfo('SimpleItemTransfer.sendMsg','Sent stanza.', {
            record: record, type: type, cause: cause,
            stanza: stanza});
    }

    protected makeMsgStanza(record: SimpleItemTransferRecord, transferNode: ltx.Element): ltx.Element
    {
        const to = record.getMsgReceiver();
        const roomJidStr = this.room.getJid();
        const toJid = jid(roomJidStr);
        toJid.setResource(to.getRoomNick());
        const fromJid = jid(roomJidStr);
        fromJid.setResource(this.myParticipant.getRoomNick());

        const stanza = new ltx.Element('message', {
            type: 'chat',
            to:   toJid.toString(),
            from: fromJid.toString(),
        });
        stanza.cnode(transferNode);
        return stanza;
    }

    protected makeMsgTransferNode(
        record:   SimpleItemTransferRecord,
        itemNode: ltx.Element,
        type:     SimpleItemTransferMsgType,
        cause?:   SimpleItemTransferCancelCause,
    ): ltx.Element {
        const transferAttrs = {};
        transferAttrs['xmlns'] = 'vp:transfer';
        transferAttrs['type'] = type;
        if (!is.nil(cause)) {
            transferAttrs['cause'] = cause;
        }

        if (type === SimpleItemTransferMsgType.offer) {
            if (!(record instanceof SimpleItemTransferSenderRecord)) {
                throw new ErrorWithData(
                    'Preparing to send an offer msg on reciepient side!', {record: record});
            }
            if (is.nil(record.transferToken)) {
                throw new ErrorWithData(
                    'Preparing to send an offer msg without transferToken!', {record: record});
            }
            transferAttrs['transferToken'] = record.transferToken;
        }

        const transferNode = new ltx.Element('x', transferAttrs);
        transferNode.cnode(itemNode)
        return transferNode;
    }

    protected makeMsgItemNode(record: SimpleItemTransferRecord, type: SimpleItemTransferMsgType): ltx.Element
    {
        let itemFiltered: ItemWithId;
        if (type !== SimpleItemTransferMsgType.offer) {
            itemFiltered = {
                [Pid.Id]:          record.item[Pid.Id],
                [Pid.Provider]:    record.item[Pid.Provider],
                [Pid.InventoryId]: record.item[Pid.InventoryId],
            };
        } else {
            itemFiltered = record.item;
        }
        const itemNode = new ltx.Element('item', itemFiltered);
        return itemNode;
    }

    //--------------------------------------------------------------------------
    // User message and dialog helpers

    protected showUserToast(
        toastType: string,
        translationModifiers: TranslatableModifiers,
        iconId: string,
        titleId: string,
        textId: string,
        timeoutOrId: string|number, // config key or seconds
        suppressible: boolean=false,
        closeAction: () => void = () => {},
        buttons: [string, () => void][] = [],
    ): Toast {
        let timeoutSecs: number;
        if (is.number(timeoutOrId)) {
            timeoutSecs = timeoutOrId;
        } else {
            timeoutSecs = as.Float(Config.get(timeoutOrId));
        }
        const title = this.translate(['textid', titleId, translationModifiers]);
        const text = this.translate(['textid', textId, translationModifiers]);
        const toast = new SimpleToast(this.app, toastType, timeoutSecs, iconId, title, text);
        for (const [btnTextId, btnAction] of buttons) {
            const btnText = this.translate(['textid', btnTextId, translationModifiers]);
            toast.actionButton(btnText, btnAction);
        }
        toast.setDontShow(suppressible);
        toast.show(closeAction);
        this.logInfo('SimpleItemTransfer.showUserToast',`Shown toast ${toastType}.`, {
            toastType: toastType,
            translationModifiers: translationModifiers,
            iconId: iconId, titleId: titleId, textId: textId,
            timeoutOrId: timeoutOrId, suppressible: suppressible,
            closeAction: closeAction, buttons: buttons,
            timeoutSecs: timeoutSecs, toast: toast});
        return toast;
    }

    protected makeUserMsgTranslationModifiers(
        record: SimpleItemTransferSenderRecord|SimpleItemTransferRecipientRecord
    ): TranslatableModifiers {
        const sender: Participant
            = (<SimpleItemTransferRecipientRecord>record).sender
            ?? this.myParticipant;
        const recipient: Participant
            = (<SimpleItemTransferSenderRecord>record).recipient
            ?? this.myParticipant;
        const replacements: [string, Translatable][] = [
            ['sender', this.translatableOfParticipant(sender)],
            ['recipient', this.translatableOfParticipant(recipient)],
            ['item', this.translatableOfItem(record.item)],
        ];
        return {
            replacements: replacements,
        };
    }

    protected translatableOfParticipant(recipient: Participant): Translatable
    {
        return ['text', recipient.getDisplayName()];
    }

    protected translatableOfItem(item: ItemProperties): Translatable
    {
        const text = item[Pid.Label] ?? item[Pid.Template] ?? 'item';
        return ['textid', `ItemLabel.${text}`, text];
    }

    protected translate(translatable: Translatable): string
    {
        return this._translate(translatable, 1);
    }

    protected _translate(translatable: Translatable, iteration: number=1): string
    {
        if (iteration > 100) {
            throw new ErrorWithData(
                'Endless recursion detected!', {translatable: translatable, iteration: iteration});
        }
        const nextIteration = iteration + 1;
        const [srcType, srcString, fallback, modifiers]
            = this.unboxTranslatable(translatable);
        const tpl: string = this.translateSrc(
            srcType, srcString, fallback, modifiers, nextIteration);
        const text = this.applyReplacements(tpl, modifiers, nextIteration);
        return text;
    }

    protected unboxTranslatable(
        translatable: Translatable
    ): [TranslatableType, string, Translatable, TranslatableModifiers] {
        let srcType: TranslatableType;
        let srcString: string;
        let fallback: Translatable;
        let modifiers: TranslatableModifiers;
        if (is.nil(translatable)) {
            srcType = 'text';
            srcString = '';
            fallback = ['text', srcString];
            modifiers = {};
        } else if (is.string(translatable)) {
            srcType = 'textid';
            srcString = translatable;
            fallback = ['text', srcString];
            modifiers = {};
        } else {
            srcType = translatable[0];
            srcString = translatable[1];
            const valAt2: undefined|Translatable|TranslatableModifiers
                = translatable[2];
            const valAt3: undefined|TranslatableModifiers = translatable[3];
            if (is.string(valAt2) || is.array(valAt2)) {
                fallback = valAt2;
                modifiers = valAt3 ?? {};
            } else {
                modifiers = valAt2 ?? {};
                fallback = modifiers?.fallback ?? ['text', srcString];
            }
        }
        if (srcString.length === 0) {
            srcType = 'text';
        }
        return [srcType, srcString, fallback, modifiers];
    }

    protected translateSrc(
        srcType: TranslatableType,
        srcString: string,
        fallback: Translatable,
        modifiers: TranslatableModifiers,
        nextIteration: number,
    ): string {
        let srcStringNew: string = '';
        switch (srcType) {
            case 'text': {
                srcStringNew = srcString;
            } break;
            case 'textid': {
                srcStringNew = this.app.translateText(srcString, srcString);
                if (srcStringNew === srcString) {
                    srcStringNew = this._translate(fallback, nextIteration);
                }
            } break;
            default: {
                // noinspection JSUnusedLocalSymbols
                const _: never = srcType; // Exhaustiveness check.
            } break;
        }
        return srcStringNew;
    }

    protected applyReplacements(tpl: string, modifiers: TranslatableModifiers, nextIteration: number): string
    {
        const replacements = modifiers.replacements ?? [];
        const fun = (text: string, rule: TranslatableReplacement): string => {
            const [token, replacement] = rule;
            const replacementText = this._translate(replacement, nextIteration);
            return text.replace(`{${token}}`, replacementText);
        };
        return replacements.reduce(fun, tpl);
    }

}

//------------------------------------------------------------------------------
// Type guards

function isItemWithId(item: ItemProperties): item is ItemWithId
{
    return is.string(item[Pid.Id]) && is.string(item[Pid.Provider]) && is.string(item[Pid.InventoryId]);
}

function isSimpleItemTransferMsgType(type: unknown): type is SimpleItemTransferMsgType
{
    return is.string(type) && type in SimpleItemTransferMsgType;
}

function isSimpleItemTransferRejectCause(type: unknown): type is SimpleItemTransferCancelCause
{
    return is.string(type) && type in SimpleItemTransferCancelCause;
}
