/**
 * Implements the single item transfer feature.
 *
 * Communication between item sender and item recipient and local actions:
 *
 * 1.a. Sender: user triggered single item transfer ->
 * Adds item to controller memory
 * with state SimpleItemTransferSenderState.askingUser.
 * Shows item transfer question in toast to user.
 *
 * 2.a. Sender: User cancels transfer ->
 * Deletes item from controller memory.
 *
 * 2.b. Sender: User doesn't react in time ->
 * Deletes item from controller memory.
 *
 * 2.c. Sender: User confirmed transfer ->
 * XMPP Message vp:transfer/x.type = SimpleItemTransferMsgType.offer.
 * Adds item to controller memory
 * Sets state to SimpleItemTransferSenderState.offered in controller memory.
 * Show transfer cancel dialog (cancel and timeout handled in 5.a / 5.b).
 *
 * 3.a. Recipient: Receives offer message ->
 * Adds item to local list with state SimpleItemTransferRecipientState.asking.
 * Shows item accept question in toast to user.
 *
 * 4.a. Recipient: User rejects item ->
 * XMPP Message vp:transfer/x.type = SimpleItemTransferMsgType.reject,
 * .cause = SimpleItemTransferRejectCause.recipientRejected.
 * Deletes item from controller memory.
 *
 * 4.b. Recipient: User doesn't react in time ->
 * XMPP Message vp:transfer/x.type = SimpleItemTransferMsgType.reject,
 * .cause = SimpleItemTransferRejectCause.timeout.
 * Deletes item from controller memory.
 *
 * 4.c. Recipient: User accepts item ->
 * XMPP Message vp:transfer/x.type = SimpleItemTransferMsgType.accept.
 * Sets state to SimpleItemTransferSenderState.accepted in controller memory.
 *
 * 5.a. Sender: User cancels transfer ->
 * Shows appropriate confirmation toast.
 * Deletes item from controller memory.
 * XMPP Message vp:transfer/x.type = SimpleItemTransferMsgType.cancel.
 * .cause = SimpleItemTransferRejectCause.senderCanceled.
 * Next step: 6.b
 *
 * 5.b. Sender: Receives no reaction in time ->
 * Shows timeout error toast.
 * Deletes item from controller memory.
 * XMPP Message vp:transfer/x.type = SimpleItemTransferMsgType.cancel.
 * .cause = SimpleItemTransferRejectCause.timeout.
 * Next step: 6.b
 *
 * 5.c. Sender: Receives rejection message ->
 * Shows appropriate error toast - message depending on vp:transfer/x.cause.
 * Deletes item from controller memory
 *
 * 5.d. Sender: Receives acceptance message ->
 * XMPP Message vp:transfer/x.type = 'confirm'.
 * Deletes the item from own backpack.
 * Shows transfer success toast.
 * Deletes item from controller memory.
 *
 * 6.a. Recipient: Sender doesn't react in time ->
 * Shows appropriate failure toast if user already accepted the transfer.
 * Deletes item from controller memory.
 *
 * 6.b. Recipient: Receives cancel message ->
 * Shows appropriate failure toast if user already accepted the transfer.
 * Deletes item from controller memory.
 *
 * 6.c. Recipient: Receives confirmation message ->
 * Adds the item to own backpack.
 * Shows transfer success toast.
 * Deletes item from controller memory.
 */
import log = require('loglevel');
import { Utils } from '../lib/Utils';
import { Room } from './Room';
import { Participant } from './Participant';
import { ContentApp } from './ContentApp';
import { BackgroundMessage } from '../lib/BackgroundMessage';
import { ItemProperties, Pid } from '../lib/ItemProperties';
import { ItemException } from '../lib/ItemException';
import * as xml from '@xmpp/xml';
import * as jid from '@xmpp/jid';
import { Element } from 'ltx';
import { Config } from '../lib/Config';
import { SimpleErrorToast, SimpleToast, Toast } from './Toast';
import { JID } from '@xmpp/jid';
import { is } from '../lib/is';

type ItemWithId = ItemProperties & {[Pid.Id]: string};

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
    accept = 'accept',
    reject = 'reject',
    cancel = 'cancel',
    confirm = 'confirm',
}

type SimpleItemTransferMsg = {
    from: Participant,
    item: ItemWithId,
    type: SimpleItemTransferMsgType,
    cause: undefined|SimpleItemTransferCancelCause,
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
    accepted,
    cleanup,
}

type SimpleItemTransferSenderRecord = {
    recipient: Participant,
    item: ItemWithId,
    transferState: SimpleItemTransferSenderState,
    toast?: undefined|Toast,
};
type SimpleItemTransferRecipientRecord = {
    sender: Participant,
    item: ItemWithId,
    transferState: SimpleItemTransferRecipientState,
    toast?: undefined|Toast,
    timeoutHandle?: undefined|number,
};

export class SimpleItemTransferController
{
    protected readonly app: ContentApp;
    protected readonly room: Room;
    protected readonly myParticipant: Participant;

    protected readonly itemsSending:
        {[itemId: string]: SimpleItemTransferSenderRecord};
    protected readonly itemsReceiving:
        {[itemId: string]: SimpleItemTransferRecipientRecord};

    constructor(app: ContentApp) {
        this.app = app;
        this.room = app.getRoom();
        const participant = app.getMyParticipant();
        if (is.nil(participant)) {
            throw new Error('Bug found:'
            + ' Constructing SimpleItemTransferController'
            + ' before local participant has been initialized!');
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
    public onStanza(stanza: xml.Element): boolean
    {
        if (!Config.getBoolean('SimpleItemTransfer.enabled')) {
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
                        this.recipientOnOfferMsg(msg);
                    } break;
                    case SimpleItemTransferMsgType.accept: {
                        // Recipient accepted the item.
                        this.senderOnAcceptMsg(msg);
                    } break;
                    case SimpleItemTransferMsgType.reject: {
                        // Recipient rejected transfer.
                        this.senderOnRejectMsg(msg);
                    } break;
                    case SimpleItemTransferMsgType.cancel: {
                        // Sender offered an item.
                        this.recipientOnCancelMsg(msg);
                    } break;
                    case SimpleItemTransferMsgType.confirm: {
                        // Sender confirmed the accepted transfer.
                        this.recipientOnConfirmMsg(msg);
                    } break;
                    default: {
                        // noinspection JSUnusedLocalSymbols
                        const _: never = msg.type; // Exhaustiveness check.
                    } break;
                }
            }
        } catch (error) { this.app.onError(
            'SimpleItemTransferController.onStanza',
            'Error caught!',
            error, 'stanza', stanza);
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

    //--------------------------------------------------------------------------
    // Step 1.a.

    public senderInitiateItemTransfer(
        recipient: Participant,
        item: ItemProperties
    ): void {
        if (!Config.getBoolean('SimpleItemTransfer.enabled')
        || !isItemWithId(item)) {
            return;
        }

        const itemId: string = item[Pid.Id];
        if (itemId in this.itemsSending
        || (item[Pid.IsTransferable] ?? '1') !== '1') {
            this.senderShowItemNontransferableToast();
            return;
        }
        const record: SimpleItemTransferSenderRecord = {
            recipient: recipient,
            item: item,
            transferState: SimpleItemTransferSenderState.askingUser,
        };
        record.toast = this.senderShowConfirmDlg(record);
        this.itemsSending[itemId] = record;
    }

    protected senderShowItemNontransferableToast(): void {
        // Todo: Mention item name in message.
        const fact = ItemException.Fact.NotTransferred;
        const factText = ItemException.fact2String(fact);
        const reason = ItemException.Reason.ItemIsNotTransferable;
        const reasonText = ItemException.reason2String(reason);
        const toastType = `Warning-${factText}-${reasonText}`;
        const toastDurationKey = 'room.applyItemErrorToastDurationSec';
        const toastDuration = Config.getNumber(toastDurationKey);
        const toast = new SimpleErrorToast(
            this.app, toastType, toastDuration,
            'warning', factText, reasonText, '');
        toast.show();
    }

    protected senderShowConfirmDlg(
        record: SimpleItemTransferSenderRecord
    ): Toast {
        const itemId: string = record.item[Pid.Id];
        return this.showUserToast(
            'SimpleItemTransferSenderConfirm',
            this.makeUserMsgTranslationModifiers(record),
            'question',
            'SimpleItemTransfer.senderConfirmQuestionTitle',
            'SimpleItemTransfer.senderConfirmQuestionText',
            'SimpleItemTransfer.senderConfirmToastDurationSec',
            false,
            () => this.senderConfirmDlgOnClose(itemId),
            [
                ['SimpleItemTransfer.senderConfirmQuestionYes',
                    () => this.senderConfirmDlgOnYes(itemId),
                ],
                ['SimpleItemTransfer.senderConfirmQuestionNo',
                    () => this.senderConfirmDlgOnNo(itemId),
                ],
            ],
        );
    }

    //--------------------------------------------------------------------------
    // Step 2.a. / 2.b.

    protected senderConfirmDlgOnNo(itemId: string): void {
        const record = this.itemsSending[itemId];
        const transferState = record?.transferState;
        if (transferState !== SimpleItemTransferSenderState.askingUser) {
            return; // Transfer canceled while waiting for user action.
        }
        this.senderCleanupItem(itemId, true);
    }

    protected senderConfirmDlgOnClose(itemId: string): void {
        this.senderConfirmDlgOnNo(itemId);
    }

    //--------------------------------------------------------------------------
    // Step 2.c.

    protected senderConfirmDlgOnYes(itemId: string): void {
        (async (): Promise<void> => {
            const expectedState = SimpleItemTransferSenderState.askingUser;
            const record = this.itemsSending[itemId];
            if (record?.transferState !== expectedState) {
                return; // Safety net.
            }
            const item =
                await BackgroundMessage.getBackpackItemProperties(itemId);
            if (!isItemWithId(item)) {
                throw new Error('Backpack item has no ID!');
            }
            if (record.transferState !== expectedState) {
                return; // Safety net.
            }
            this.senderCleanupItem(itemId, false);
            record.item = item;
            record.transferState = SimpleItemTransferSenderState.offered;
            record.toast = this.senderShowOfferWaitDlg(record);
            const msgType = SimpleItemTransferMsgType.offer;
            this.sendMsg(record.recipient, item, msgType);
        })().catch(error => {
            this.senderCleanupItem(itemId, true);
            this.app.onError(
                'SimpleItemTransferController.senderConfirmDlgOnYes',
                'Error caught!',
                error, 'this', this, 'itemId', itemId);
        });
    }

    protected senderShowOfferWaitDlg(
        record: SimpleItemTransferSenderRecord
    ): Toast {
        const itemId: string = record.item[Pid.Id];
        const timeoutKey = 'SimpleItemTransfer.recipientAcceptToastDurationSec';
        const extraKey = 'SimpleItemTransfer.senderOfferWaitToastExtraDurationSec';
        const timeout
            = Config.getNumber(timeoutKey)
            + Config.getNumber(extraKey);
        return this.showUserToast(
            'SimpleItemTransferSenderOfferWait',
            this.makeUserMsgTranslationModifiers(record),
            'question',
            'SimpleItemTransfer.senderOfferWaitTitle',
            'SimpleItemTransfer.senderOfferWaitText',
            timeout,
            false,
            () => this.senderOfferWaitDlgOnTimeout(itemId),
            [
                ['SimpleItemTransfer.senderOfferWaitCancel',
                    () => this.senderOfferWaitDlgOnCancel(itemId),
                ],
            ],
        );
    }

    //--------------------------------------------------------------------------
    // Step 3.a.

    protected recipientOnOfferMsg(msg: SimpleItemTransferMsg): void
    {
        const item = msg.item;
        const itemId = item[Pid.Id];
        if (!is.nil(this.itemsReceiving[itemId])) {
            return;
        }
        const record: SimpleItemTransferRecipientRecord = {
            sender: msg.from,
            item: item,
            transferState: SimpleItemTransferRecipientState.askingUser,
        };
        record.toast = this.recipientShowAcceptDlg(record);
        this.itemsReceiving[itemId] = record;
    }

    protected recipientShowAcceptDlg(
        record: SimpleItemTransferRecipientRecord
    ): Toast {
        const itemId: string = record.item[Pid.Id];
        return this.showUserToast(
            'SimpleItemTransferRecipientAccept',
            this.makeUserMsgTranslationModifiers(record),
            'question',
            'SimpleItemTransfer.recipientAcceptQuestionTitle',
            'SimpleItemTransfer.recipientAcceptQuestionText',
            'SimpleItemTransfer.recipientAcceptToastDurationSec',
            false,
            () => this.recipientAcceptDlgOnClose(itemId),
            [
                ['SimpleItemTransfer.recipientAcceptQuestionYes',
                    () => this.recipientAcceptDlgYes(itemId),
                ],
                ['SimpleItemTransfer.recipientAcceptQuestionNo',
                    () => this.recipientAcceptDlgOnNo(itemId),
                ],
            ],
        );
    }

    //--------------------------------------------------------------------------
    // Step 4.a. / 4.b.

    protected recipientAcceptDlgOnReject(
        itemId: string,
        cause: SimpleItemTransferCancelCause,
    ): void {
        const expectedState = SimpleItemTransferRecipientState.askingUser;
        const record = this.itemsReceiving[itemId];
        if (record?.transferState !== expectedState) {
            return; // Safety net.
        }
        this.recipientCleanupItem(itemId, true);
        const item = record.item;
        const msgType = SimpleItemTransferMsgType.reject;
        this.sendMsg(record.sender, item, msgType, cause);
    }

    protected recipientAcceptDlgOnNo(itemId: string): void {
        this.recipientAcceptDlgOnReject(
            itemId, SimpleItemTransferCancelCause.recipientRejected);
    }

    protected recipientAcceptDlgOnClose(itemId: string): void {
        this.recipientAcceptDlgOnReject(
            itemId, SimpleItemTransferCancelCause.senderTimeout);
    }

    //--------------------------------------------------------------------------
    // Step 4.c.

    protected recipientAcceptDlgYes(itemId: string): void {
        const expectedState = SimpleItemTransferRecipientState.askingUser;
        const record = this.itemsReceiving[itemId];
        if (record?.transferState !== expectedState) {
            return; // Safety net.
        }
        this.recipientCleanupItem(itemId, false);
        record.transferState = SimpleItemTransferRecipientState.accepted;
        const timeoutKey = 'SimpleItemTransfer.recipientConfirmMsgTimeoutSec';
        const timeoutSecs = Config.getNumber(timeoutKey);
        const timeoutMs = timeoutSecs * 1000;
        const onTimeout = () => this.recipientOnConfirmMsgTimeout(itemId);
        record.timeoutHandle = window.setTimeout(onTimeout, timeoutMs);
        const [from, item] = [record.sender, record.item];
        this.sendMsg(from, item, SimpleItemTransferMsgType.accept);
    }

    //--------------------------------------------------------------------------
    // Step 5.a., 5.b., 5.c.

    protected senderOfferWaitDlgCancelTransfer(
        itemId: string,
        cause: SimpleItemTransferCancelCause,
    ): void {
        const expectedState = SimpleItemTransferSenderState.offered;
        const record = this.itemsSending[itemId];
        if (record?.transferState !== expectedState) {
            return; // Safety net.
        }
        this.senderCleanupItem(itemId, true);

        let toastType: string;
        let toastIconId: string;
        let toastTitleId: string;
        let toastTextId: string;
        const toastDurationId = 'SimpleItemTransfer.errorToastDurationSec';
        let supressible: boolean;
        let sendMsg = false;
        switch (cause) {
            case SimpleItemTransferCancelCause.senderTimeout: {
                toastType = 'SimpleItemTransferSenderSenderTimeout';
                toastIconId = 'notice';
                toastTitleId = 'SimpleItemTransfer.senderSenderTimeoutTitle';
                toastTextId = 'SimpleItemTransfer.senderSenderTimeoutText';
                supressible = false;
                sendMsg = true;
            } break;
            case SimpleItemTransferCancelCause.senderCanceled: {
                toastType = 'SimpleItemTransferSenderSenderCanceled';
                toastIconId = 'notice';
                toastTitleId = 'SimpleItemTransfer.senderSenderCanceledTitle';
                toastTextId = 'SimpleItemTransfer.senderSenderCanceledText';
                supressible = true;
                sendMsg = true;
            } break;
            case SimpleItemTransferCancelCause.recipientTimeout: {
                toastType = 'SimpleItemTransferSenderRecipientTimeout';
                toastIconId = 'notice';
                toastTitleId = 'SimpleItemTransfer.senderRecipientTimeoutTitle';
                toastTextId = 'SimpleItemTransfer.senderRecipientTimeoutText';
                supressible = false;
            } break;
            case SimpleItemTransferCancelCause.recipientRejected: {
                toastType = 'SimpleItemTransferSenderRecipientRejected';
                toastIconId = 'notice';
                toastTitleId = 'SimpleItemTransfer.senderRecipientRejectedTitle';
                toastTextId = 'SimpleItemTransfer.senderRecipientRejectedText';
                supressible = false;
            } break;
            default: {
                // noinspection JSUnusedLocalSymbols
                const _: never = cause; // Exhaustiveness check.
            } break;
        }

        const translationMods = this.makeUserMsgTranslationModifiers(record);
        this.showUserToast(
            toastType, translationMods, toastIconId,
            toastTitleId, toastTextId, toastDurationId, supressible);

        if (sendMsg) {
            const msgType = SimpleItemTransferMsgType.cancel;
            this.sendMsg(record.recipient, record.item, msgType, cause);
        }
    }

    protected senderOfferWaitDlgOnCancel(itemId: string): void
    {
        this.senderOfferWaitDlgCancelTransfer(
            itemId, SimpleItemTransferCancelCause.senderCanceled);
    }

    protected senderOfferWaitDlgOnTimeout(itemId: string): void
    {
        this.senderOfferWaitDlgCancelTransfer(
            itemId, SimpleItemTransferCancelCause.senderTimeout);
    }

    protected senderOnRejectMsg(msg: SimpleItemTransferMsg): void
    {
        const itemId = msg.item[Pid.Id];
        const cause
            = msg.cause
            ?? SimpleItemTransferCancelCause.recipientTimeout;
        this.senderOfferWaitDlgCancelTransfer(itemId, cause);
    }

    //--------------------------------------------------------------------------
    // Step 5.d.

    protected senderOnAcceptMsg(msg: SimpleItemTransferMsg): void
    {
        const itemId = msg.item[Pid.Id];
        (async (itemId: string): Promise<void> => {
            const expectedState = SimpleItemTransferSenderState.offered;
            const record = this.itemsSending[itemId];
            if (record?.transferState !== expectedState) {
                return; // Safety net.
            }
            this.senderCleanupItem(itemId, false);

            const item =
                await BackgroundMessage.getBackpackItemProperties(itemId);
            if (!isItemWithId(item)) {
                throw new Error('Backpack item has no ID!');
            }
            record.item = item;

            // Delete first to avoid duplication timing attack:
            // noinspection JSUnusedGlobalSymbols
            await BackgroundMessage.deleteBackpackItem(itemId, {});

            const msgType = SimpleItemTransferMsgType.confirm;
            this.sendMsg(record.recipient, item, msgType);

            this.showUserToast(
                'SimpleItemTransferSenderSent',
                this.makeUserMsgTranslationModifiers(record),
                'notice',
                'SimpleItemTransfer.senderSentCompleteTitle',
                'SimpleItemTransfer.senderSentCompleteText',
                'SimpleItemTransfer.senderSentCompleteToastDurationSec',
            );
        })(itemId).catch(error => { this.app.onError(
            'SimpleItemTransferController.senderOnAcceptMsg',
            'Error caught!',
            error, 'this', this, 'msg', msg);
        });
    }

    //--------------------------------------------------------------------------
    // Step 6.a.

    protected recipientOnConfirmMsgTimeout(itemId: string): void
    {
        const expectedState = SimpleItemTransferRecipientState.accepted;
        const record = this.itemsReceiving[itemId];
        if (record?.transferState !== expectedState) {
            return; // Safety net.
        }
        this.recipientCleanupItem(itemId, true);
        this.showUserToast(
            'SimpleItemTransferRecipientConfirmTimeout',
            this.makeUserMsgTranslationModifiers(record),
            'warning',
            'SimpleItemTransfer.recipientConfirmTimeoutTitle',
            'SimpleItemTransfer.recipientConfirmTimeoutText',
            'SimpleItemTransfer.errorToastDurationSec',
        );
    }

    //--------------------------------------------------------------------------
    // Step 6.b.

    protected recipientOnCancelMsg(msg: SimpleItemTransferMsg): void
    {
        const itemId = msg.item[Pid.Id];
        const record = this.itemsReceiving[itemId];
        const state = record?.transferState;
        if (state !== SimpleItemTransferRecipientState.askingUser
        && state !== SimpleItemTransferRecipientState.accepted) {
            return; // Safety net.
        }
        this.recipientCleanupItem(itemId, true);
        this.showUserToast(
            'SimpleItemTransferRecipientCanceled',
            this.makeUserMsgTranslationModifiers(record),
            'warning',
            'SimpleItemTransfer.recipientCanceledTitle',
            'SimpleItemTransfer.recipientCanceledText',
            'SimpleItemTransfer.errorToastDurationSec',
        );
    }

    //--------------------------------------------------------------------------
    // Step 6.c.

    protected recipientOnConfirmMsg(msg: SimpleItemTransferMsg): void
    {
        (async (item: ItemWithId): Promise<void> => {
            const itemId = item[Pid.Id];
            const expectedState = SimpleItemTransferRecipientState.accepted;
            const record = this.itemsReceiving[itemId];
            if (record?.transferState !== expectedState) {
                return; // Safety net.
            }
            this.recipientCleanupItem(itemId, false);
            if (!await BackgroundMessage.isBackpackItem(itemId)) {
                // Only if we don't already have an item with same ID (dupe).
                delete item[Pid.InventoryX];
                delete item[Pid.InventoryY];

                await BackgroundMessage.addBackpackItem(
                    itemId, item, {});

                this.showUserToast(
                    'SimpleItemTransferRecipientRetrieveComplete',
                    this.makeUserMsgTranslationModifiers(record),
                    'notice',
                    'SimpleItemTransfer.recipientRetrieveCompleteTitle',
                    'SimpleItemTransfer.recipientRetrieveCompleteText',
                    'SimpleItemTransfer.recipientRetrieveCompleteToastDurationSec',
                );
            }
            this.recipientCleanupItem(itemId, true);
        })(msg.item).catch(error => { this.app.onError(
            'SimpleItemTransferController.recipientOnConfirmMsg',
            'Error caught!',
            error, 'this', this, 'msg', msg);
        });
    }

    //--------------------------------------------------------------------------
    // Dynamic helpers

    protected logInfo(src: string, msg: string, ...data: unknown[]): void {
        if (Utils.logChannel('SimpleItemTransfer', true)) {
            log.info(`${src}: ${msg}`, ...data);
        }
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
            record.toast?.close();
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
            record.toast?.close();
            record.toast = undefined;
            window.clearTimeout(record.timeoutHandle);
            record.timeoutHandle = undefined;
            if (forget) {
                delete this.itemsReceiving[itemId];
            }
        }
    }

    protected parseTransferNodeOfStanza(stanza: Element
    ): undefined|SimpleItemTransferMsg {
        const fromStr: unknown = stanza.attrs.from;
        let fromJid: undefined|JID = undefined;
        let from: undefined|Participant = undefined;
        if (is.string(fromStr)) {
            fromJid = jid(fromStr);
            from = this.room.getParticipant(fromJid.getResource());
        }
        const transferNode = stanza.getChild('x', 'vp:transfer');
        const itemNode = transferNode?.getChild('item');
        const item = ItemProperties.getStrings(itemNode?.attrs ?? {});
        const type: unknown = transferNode?.attrs?.type;
        const cause: unknown = transferNode?.attrs?.cause;
        let result: undefined|SimpleItemTransferMsg = undefined;
        if (true
            && !is.nil(from)
            && !is.nil(item) && isItemWithId(item)
            && isSimpleItemTransferMsgType(type)
            && (is.nil(cause) || isSimpleItemTransferRejectCause(cause))
        ) {
            result = {from: from, item: item, type: type, cause: cause};
        }
        this.logInfo(
            'SimpleItemTransfer.parseTransferNodeOfStanza',
            'Parsed stanza.',
            'args', ['stanza', stanza],
            'fromStr', fromStr, 'fromJid', fromJid, 'from', from,
            'transferNode', transferNode,
            'itemNode', itemNode, 'item', item,
            'type', type, 'cause', cause,
            'result', result);
        return result;
    }

    protected sendMsg(
        to:     Participant,
        item:   ItemWithId,
        type:   SimpleItemTransferMsgType,
        cause?: SimpleItemTransferCancelCause,
    ): void {
        let itemFiltered = item;
        if (type !== SimpleItemTransferMsgType.offer
        && type !== SimpleItemTransferMsgType.confirm) {
            itemFiltered = {[Pid.Id]: item[Pid.Id]};
        }
        const itemNode = xml('item', itemFiltered);
        const transferNode = xml('x', {
            'xmlns': 'vp:transfer',
            'type':  type,
        }, itemNode);
        if (!is.nil(cause)) {
            transferNode.setAttrs({cause: cause});
        }
        const roomJidStr = this.room.getJid();
        const toJid = jid(roomJidStr);
        toJid.setResource(to.getRoomNick());
        const fromJid = jid(roomJidStr);
        fromJid.setResource(this.myParticipant.getRoomNick());
        const stanza = xml('message', {
            type: 'chat',
            to:   toJid.toString(),
            from: fromJid.toString(),
        }, transferNode);
        this.app.sendStanza(stanza);
        this.logInfo(
            'SimpleItemTransfer.sendMsg','Sent stanza.',
            'args', ['to', to, 'item', item, 'type', type, 'cause', cause],
            'stanza', stanza);
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
            timeoutSecs = Config.getNumber(timeoutOrId);
        }
        const title = this.translate(
            ['textid', titleId, translationModifiers]);
        const text = this.translate(
            ['textid', textId, translationModifiers]);
        const toast = new SimpleToast(
            this.app, toastType, timeoutSecs, iconId, title, text);
        for (const [btnTextId, btnAction] of buttons) {
            const btnText = this.translate(
                ['textid', btnTextId, translationModifiers]);
            toast.actionButton(btnText, btnAction);
        }
        toast.setDontShow(suppressible);
        toast.show(closeAction);
        this.logInfo(
            'SimpleItemTransfer.showUserToast','Shown toast.',
            'args', [
                'toastType', toastType,
                'translationModifiers', translationModifiers,
                'iconId', iconId, 'titleId', titleId, 'textId', textId,
                'timeoutOrId', timeoutOrId, 'suppressible', suppressible,
                'closeAction', closeAction, 'buttons', buttons],
            'timeoutSecs', timeoutSecs, 'toast', toast,
        );
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

    protected translatableOfParticipant(recipient: Participant): Translatable {
        return ['text', recipient.getDisplayName()];
    }

    protected translatableOfItem(item: ItemProperties): Translatable {
        const text = item[Pid.Label] ?? item[Pid.Template] ?? 'item';
        return ['textid', `ItemLabel.${text}`, text];
    }

    protected translate(translatable: Translatable): string {
        return this._translate(translatable, 1);
    }

    protected _translate(
        translatable: Translatable,
        iteration: number=1
    ): string {
        if (iteration > 100) { this.app.onError(
            'SimpleItemTransferController._translate',
            'Endless recursion detected!',
            undefined,
            'translatable', translatable, 'iteration', iteration);
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

    protected applyReplacements(
        tpl: string,
        modifiers: TranslatableModifiers,
        nextIteration: number,
    ): string {
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

function isItemWithId(item: ItemProperties): item is ItemWithId {
    return is.string(item[Pid.Id]);
}

function isSimpleItemTransferMsgType(type: unknown
): type is SimpleItemTransferMsgType {
    return type in SimpleItemTransferMsgType;
}

function isSimpleItemTransferRejectCause(type: unknown
): type is SimpleItemTransferCancelCause {
    return type in SimpleItemTransferCancelCause;
}
