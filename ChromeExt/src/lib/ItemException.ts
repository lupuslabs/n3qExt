import { as } from './as';
import { is } from './is';

export class ItemException extends Error
{
    public fact: ItemException.Fact;
    public reason: ItemException.Reason;
    public detail: null|string;

    constructor(
        fact: ItemException.Fact|number|string,
        reason: ItemException.Reason|number|string,
        detail: string = null,
        msg?: string,
        data?: {[p: string]: unknown},
    ) {
        super(msg ?? 'Item error!');
        this.fact = ItemException.factFrom(fact);
        this.reason = ItemException.reasonFrom(reason);
        this.detail = detail;
        Object.assign(this, data ?? {});
    }

    static fact2String(fact: ItemException.Fact): string
    {
        if (typeof fact === 'string') {
            return fact;
        } else if (typeof fact === 'number') {
            const o: object = ItemException.Fact;
            if (o[fact]) { return o[fact]; }
        }
        return 'UnknownError';
    }

    static reason2String(reason: ItemException.Reason): string
    {
        if (typeof reason === 'string') {
            return reason;
        } else if (typeof reason === 'number') {
            const o: object = ItemException.Reason;
            if (o[reason]) { return o[reason]; }
        }
        return 'UnknownReason';
    }

    static factFrom(fact: any): ItemException.Fact
    {
        if (typeof fact === 'string') {
            const o: object = ItemException.Fact;
            if (o[fact]) { return o[fact]; }
            return ItemException.Fact.UnknownError;
        } else if (typeof fact === 'number') {
            const o: object = ItemException.Fact;
            if (o[fact]) { return fact; }
            return ItemException.Fact.UnknownError;
        }
        return fact;
    }

    static reasonFrom(reason: any): ItemException.Reason
    {
        if (typeof reason === 'string') {
            const o: object = ItemException.Reason;
            if (o[reason]) { return o[reason]; }
            return ItemException.Reason.UnknownReason;
        } else if (typeof reason === 'number') {
            const o: object = ItemException.Reason;
            if (o[reason]) { return reason; }
            return ItemException.Reason.UnknownReason;
        }
        return reason;
    }

    static isInstance(error: unknown): error is ItemException
    {
        // Use duck-typing check because ItemException becomes a standard object when
        // marshalled - leading to instanceof not working for errors received by messaging:
        return true
            && is.object(error)
            && (is.number(error.fact) || is.string(error.fact)) && as.Int(error.fact) in ItemException.Fact
            && (is.number(error.reason) || is.string(error.reason)) && as.Int(error.reason) in ItemException.Reason
            && (is.nil(error.detail) || is.string(error.detail));
    }
}

export namespace ItemException
{
    export enum Fact
    {
        ClaimFailed,
        InternalError,
        NoItemsReceived,
        NotAdded,
        NotApplied,
        NotCanceled,
        NotChanged,
        NotCreated,
        NotDeleted,
        NotDerezzed,
        NotDropped,
        NotExecuted,
        NotMoved,
        NotRezzed,
        NotStacked,
        NotTransferred,
        NotSent,
        NotProcessed,
        Refused,
        UnknownError,
    }

    export enum Reason
    {
        AccessDenied,
        Ambiguous,
        CantDropOnSelf,
        CapacityLimit,
        Expired,
        IdenticalItems,
        Insufficient,
        InternalError,
        InvalidArgument,
        InvalidCommandArgument,
        InvalidItemAddress,
        InvalidPropertyName,
        InvalidPropertyValue,
        InvalidSignature,
        InvalidValue,
        ItemAlreadyRezzed,
        ItemCapacityLimit,
        ItemDepleted,
        ItemIsAlreadyRezzed,
        ItemIsNotMovable,
        ItemIsNotRezable,
        ItemIsNotRezzed,
        ItemIsNotTransferable,
        ItemMustBeStronger,
        ItemNotRezzedHere,
        ItemsNotAvailable,
        MissingPropertyValue,
        MissingResource,
        NetworkProblem,
        NoAccessTokens,
        NoClientItem,
        NoItemProviderForItem,
        NoMatch,
        NoSuchAction,
        NoSuchAspect,
        NoSuchItem,
        NoSuchItemProvider,
        NoSuchProperty,
        NoSuchTemplate,
        NotDeletable,
        NotStarted,
        NotYourItem,
        NoUserId,
        NoUserToken,
        PropertyMismatch,
        SeeDetail,
        ServiceUnavailable,
        StillInCooldown,
        StillInProgress,
        Test,
        TooLarge,
        TransferFailed,
        UnknownReason,
    }
}

