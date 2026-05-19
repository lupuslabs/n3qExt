import { is } from './is'

export namespace WebsocketMessage {

    export function makeId(): string {
        return crypto.randomUUID(); // Not available in non-HTTPS contexts.
    }

    export function OfObject(messageData: {[p: string]: object}): Message {
        const type: string = String(messageData.Type);
        switch (type) {
            case OkResponse.name: return new OkResponse(
                String(messageData.Id),
                String(messageData.RequestId),
            );
            case ErrorResponse.name: return new ErrorResponse(
                String(messageData.Id),
                String(messageData.RequestId),
                String(messageData.Fact),
                String(messageData.Reason),
                String(messageData.Detail),
            )
            case PingRequest.name: return new PingRequest(
                String(messageData.Id),
            )
            case PingResponse.name: return new PingResponse(
                String(messageData.Id),
                String(messageData.RequestId),
            );
            case UserAuthResponse.name: return new UserAuthResponse(
                String(messageData.Id),
                String(messageData.RequestId),
            );

            case RoomPresencesNotification.name: {
                if (!is.object(messageData.PresencesUpdatedOrEntered)) {
                    throw new Error(`Invalid data for type ${type}: PresencesUpdatedOrEntered is not an object!`);
                }
                const presences: { [userId: string]: RoomPresence } = {};
                for (const [userId, presenceData] of Object.entries(messageData.PresencesUpdatedOrEntered)) {
                    if (!is.stringsObject(presenceData)) {
                        throw new Error(`Invalid data for type ${type}: PresencesUpdatedOrEntered contains a non-object or an object having a non-string key or value!`);
                    }
                    presences[userId] = { UserId: String(presenceData.UserId) };
                }
                if (!is.array(messageData.PresencesLeft, is.string)) {
                    throw new Error(`Invalid data for type ${type}: PresencesLeft is not a string array!`);
                }
                return new RoomPresencesNotification(
                    String(messageData.Id),
                    String(messageData.RoomId),
                    String(messageData.Time),
                    presences,
                    messageData.PresencesLeft,
                    Boolean(messageData.IsSnapshot),
                );
            }
            case RoomItemsNotification.name: {
                if (!is.array<object>(messageData.ItemsUpdatedOrCreated, is.stringsObject)) {
                    throw new Error(`Invalid data for type ${type}: ItemsUpdatedOrCreated is not an array of string objects!`)
                }
                if (!is.array<string>(messageData.ItemsDeleted, is.string)) {
                    throw new Error(`Invalid data for type ${type}: ItemsDeleted is not a string array!`)
                }
                return new RoomItemsNotification(
                    String(messageData.Id),
                    String(messageData.RoomId),
                    String(messageData.Time),
                    <{[p: string]: string}[]>messageData.ItemsUpdatedOrCreated,
                    messageData.ItemsDeleted,
                    Boolean(messageData.IsSnapshot),
                )
            }
            case RoomChatNotification.name: return new RoomChatNotification(
                String(messageData.Id),
                String(messageData.RoomId),
                String(messageData.Time),
                String(messageData.UserId),
                String(messageData.ChatMessage),
            )

            case ItemsNotification.name: {
                if (!is.array(messageData.ItemsUpdatedOrCreated, is.stringsObject)) {
                    throw new Error(`Invalid data for type ${type}: ItemsUpdatedOrCreated is not an array of objects having only string keys and values!`);
                }
                if (!is.array(messageData.ItemsDeleted, is.string)) {
                    throw new Error(`Invalid data for type ${type}: ItemsDeleted is not a string array!`)
                }
                return new ItemsNotification(
                    String(messageData.Id),
                    String(messageData.InventoryId),
                    messageData.ItemsUpdatedOrCreated,
                    messageData.ItemsDeleted,
                )
            }

            case FriendshipProposalNotification.name: return new FriendshipProposalNotification(
                String(messageData.Id),
                String(messageData.ActorId),
                String(messageData.ActorName),
                String(messageData.ActorImageUrl),
                String(messageData.OtherId),
            )
            case FriendshipProposalCanceledNotification.name: return new FriendshipProposalCanceledNotification(
                String(messageData.Id),
                String(messageData.ActorId),
                String(messageData.OtherId),
            )

            case SendInstantMessageOkResponse.name: {
                const time = new Date(String(messageData.Time))
                if (!is.Date(time)) {
                    throw new Error(`Invalid data for type ${type}: Time is not a valid Date!`)
                }
                return new SendInstantMessageOkResponse(
                    String(messageData.Id),
                    String(messageData.RequestId),
                    String(messageData.InstantMessageId),
                    time,
                )
            }
            case InstantMessageNotification.name: {
                const time = new Date(String(messageData.Time))
                if (!is.Date(time)) {
                    throw new Error(`Invalid data for type ${type}: Time is not a valid Date!`)
                }
                return new InstantMessageNotification(
                    String(messageData.Id),
                    String(messageData.AuthorUserId),
                    String(messageData.AuthorName),
                    String(messageData.AuthorImageUrl),
                    String(messageData.RecipientUserId),
                    String(messageData.InstantMessageId),
                    time,
                    String(messageData.InstantMessageType),
                    String(messageData.InstantMessage),
                )
            }
        }
        throw new Error(`Unknown type ${type}!`)
    }

    export abstract class Message {
        public readonly Type: string;

        protected constructor(public readonly Id: string) {
            this.Type = this.constructor.name;
        }

        public toJson(): string {
            return JSON.stringify(this)
        }
    }

    export abstract class Request extends Message {
        protected constructor(Id: string) { super(Id) }
    }

    export abstract class Response extends Message {
        protected constructor(Id: string, public readonly RequestId: string) { super(Id) }
    }

    export class OkResponse extends Response {
        public constructor(Id: string, RequestId: string) { super(Id, RequestId); }
    }

    export class ErrorResponse extends Response {
        public constructor(
            Id: string,
            RequestId: string,
            public readonly Fact: string,
            public readonly Reason: string,
            public readonly Detail: string,
        ) { super(Id, RequestId) }
    }

    export abstract class Notification extends Message {
        protected constructor(Id: string) { super(Id) }
    }

    export class PingRequest extends Request {
        public constructor(Id: string) { super(Id) }
    }

    export class PingResponse extends OkResponse {
        public constructor(Id: string, RequestId: string) { super(Id, RequestId); }
    }

    export class UserAuthRequest extends Request {
        public constructor(
            Id: string,
            public readonly UserId: string,
            public readonly UserToken: string,
        ) { super(Id) }
    }

    export class UserAuthResponse extends OkResponse {
        public constructor(Id: string, RequestId: string) { super(Id, RequestId); }
    }

    export class RoomRequest extends Request {
        public constructor(Id: string, public readonly RoomId: string) { super(Id) }
    }

    export abstract class RoomNotification extends Notification {
        protected constructor(
            Id: string,
            public readonly RoomId: string,
            public readonly Time: string
        ) { super(Id) }
    }

    export abstract class RoomUserActionNotification extends RoomNotification {
        protected constructor(
            Id: string,
            RoomId: string,
            Time: string,
            public readonly UserId: string,
        ) { super(Id, RoomId, Time) }
    }

    export class RoomEnterRequest extends RoomRequest {
        public constructor(
            Id: string,
            RoomId: string,
            public readonly Destination: null|string,
        ) { super(Id, RoomId) }
    }

    export class RoomLeaveRequest extends RoomRequest {
        public constructor(
            Id: string,
            RoomId: string,
        ) { super(Id, RoomId) }
    }

    export class RoomPingRequest extends RoomRequest {
        public constructor(
            Id: string,
            RoomId: string,
        ) { super(Id, RoomId) }
    }

    export class RoomChatRequest extends RoomRequest {
        public constructor(
            Id: string,
            RoomId: string,
            public readonly ChatMessage: string,
        ) { super(Id, RoomId) }
    }

    /** A user present in a room: some client of that user is in the room. */
    export interface RoomPresence {
        readonly UserId: string;
    }

    /**
     * Room presence changes: entered or updated presences keyed by userId, left userIds, or a
     * complete snapshot (IsSnapshot: replace the room's presences instead of merging).
     */
    export class RoomPresencesNotification extends RoomNotification {
        public constructor(
            Id: string,
            RoomId: string,
            Time: string,
            public readonly PresencesUpdatedOrEntered: Readonly<{ [userId: string]: RoomPresence }>,
            public readonly PresencesLeft: ReadonlyArray<string>,
            public readonly IsSnapshot: boolean,
        ) { super(Id, RoomId, Time); }
    }

    export class RoomItemsNotification extends RoomNotification {
        public constructor(
            Id: string,
            RoomId: string,
            Time: string,
            public readonly ItemsUpdatedOrCreated: Readonly<Readonly<{[p: string]: string}>[]>,
            public readonly ItemsDeleted: Readonly<string[]>,
            public readonly IsSnapshot: boolean,
        ) { super(Id, RoomId, Time) }
    }

    export class RoomChatNotification extends RoomUserActionNotification {
        public constructor(
            Id: string,
            RoomId: string,
            Time: string,
            UserId: string,
            public readonly ChatMessage: string,
        ) { super(Id, RoomId, Time, UserId) }
    }

    export class ItemsNotification extends Notification {
        public constructor(
            Id: string,
            public readonly InventoryId: string,
            public readonly ItemsUpdatedOrCreated: Readonly<Readonly<{[p: string]: string}>[]>,
            public readonly ItemsDeleted: Readonly<string[]>,
        ) { super(Id) }
    }

    export abstract class PersonActionNotification extends Notification {
        public constructor(
            Id: string,
            public readonly ActorId: string,
            public readonly OtherId: string,
        ) { super(Id) }
    }

    export class FriendshipProposalNotification extends PersonActionNotification {
        public constructor(
            Id: string,
            ActorId: string,
            public readonly ActorName: string,
            public readonly ActorImageUrl: string,
            OtherId: string,
        ) { super(Id, ActorId, OtherId) }
    }

    export class FriendshipProposalCanceledNotification extends PersonActionNotification {
        public constructor(
            Id: string,
            ActorId: string,
            OtherId: string,
        ) { super(Id, ActorId, OtherId) }
    }

    export abstract class InstantMessageRequest extends Request {
        protected constructor(Id: string) { super(Id) }
    }

    export class SendInstantMessageRequest extends InstantMessageRequest {
        public constructor(
            Id: string,
            public RecipientUserId: string,
            public InstantMessageType: string,
            public InstantMessage: string
        ) { super(Id) }
    }

    export class SendInstantMessageOkResponse extends OkResponse {
        public constructor(
            Id: string,
            RequestId: string,
            public InstantMessageId: string,
            public Time: Date,
        ) { super(Id, RequestId) }
    }

    export class InstantMessageNotification extends Notification {
        public constructor(
            Id: string,
            public AuthorUserId: string,
            public AuthorName: string,
            public AuthorImageUrl: string,
            public RecipientUserId: string,
            public InstantMessageId: string,
            public Time: Date,
            public InstantMessageType: string,
            public InstantMessage: string,
        ) { super(Id) }
    }

    export class InstantMessageHasBeenReceivedRequest extends InstantMessageRequest {
        public constructor(
            Id: string,
            public InstantMessageId: string,
        ) { super(Id) }
    }

}
