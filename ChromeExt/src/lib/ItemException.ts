export class ItemException
{
    constructor(public fact: ItemException.Fact, public reason: ItemException.Reason, public detail: string = null)
    {
    }

    static fact2String(fact: ItemException.Fact): string
    {
        if (typeof fact === 'string') {
            return fact;
        } else if (typeof fact === 'number') {
            let o: object = ItemException.Fact;
            if (o[fact]) { return o[fact]; }
        }
        return 'UnknownError';
    }

    static reason2String(reason: ItemException.Reason): string
    {
        if (typeof reason === 'string') {
            return reason;
        } else if (typeof reason === 'number') {
            let o: object = ItemException.Reason;
            if (o[reason]) { return o[reason]; }
        }
        return 'UnknownReason';
    }

    static factFrom(fact: any): ItemException.Fact
    {
        if (typeof fact === 'string') {
            let o: object = ItemException.Fact;
            if (o[fact]) { return o[fact]; }
            return ItemException.Fact.UnknownError;
        } else if (typeof fact === 'number') {
            let o: object = ItemException.Fact;
            if (o[fact]) { return fact; }
            return ItemException.Fact.UnknownError;
        }
        return fact;
    }

    static reasonFrom(reason: any): ItemException.Reason
    {
        if (typeof reason === 'string') {
            let o: object = ItemException.Reason;
            if (o[reason]) { return o[reason]; }
            return ItemException.Reason.UnknownReason;
        } else if (typeof reason === 'number') {
            let o: object = ItemException.Reason;
            if (o[reason]) { return reason; }
            return ItemException.Reason.UnknownReason;
        }
        return reason;
    }
}

export namespace ItemException
{
    export enum Fact
    {
        UnknownError,
        InternalError,
        NotRezzed,
        NotDerezzed,
        NotAdded,
        NotDeleted,
        NotChanged,
        NoItemsReceived,
        NotExecuted,
        NotApplied,
        NotTransferred,
        NotMoved,
        NotCreated,
        NotStacked,
        ClaimFailed,
        SubmissionIgnored,
    }

    export enum Reason
    {
        UnknownReason,
        ItemAlreadyRezzed,
        ItemNotRezzedHere,
        ItemsNotAvailable,
        ItemDoesNotExist,
        NoUserId,
        SeeDetail,
        NotYourItem,
        ItemMustBeStronger,
        ItemIsNotTransferable,
        InternalError,
        ItemIsNotRezable,
        NotStarted,
        ItemCapacityLimit,
        ServiceUnavailable,
        ItemIsNotMovable,
        ItemDepleted,
        IdenticalItems,
        StillInCooldown,
        MissingPropertyValue,
        NoSuchItem,
        InvalidItemAddress,
        NoSuchTemplate,
        TransferFailed,
        InvalidCommandArgument,
        NoSuchAspect,
        InvalidPropertyValue,
        AccessDenied,
        NoMatch,
        NoSuchProperty,
        InvalidArgument,
        InvalidSignature,
        PropertyMismatch,
        Ambiguous,
        Insufficient,
        StillInProgress,
        MissingResource,
        CapacityLimit,
        NetworkProblem,
    }
}

