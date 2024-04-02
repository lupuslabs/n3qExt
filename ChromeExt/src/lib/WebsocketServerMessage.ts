import { is } from './is'

export namespace WebsocketServerMessage {

    export function makeId(): string {
        return crypto.randomUUID(); // Not available in non-HTTPS contexts.
    }

    export function OfObject(messageData: {[p: string]: object}): Message {
        const type: string = String(messageData.Type);
        switch (type) {
            // Only messages sent by server:
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
            )

            case UserAuthResponse.name: return new UserAuthResponse(
                String(messageData.Id),
                String(messageData.RequestId),
            )

            case RoomEnterResponse.name: return new RoomEnterResponse(
                String(messageData.Id),
                String(messageData.RequestId),
            )
            case RoomLeaveResponse.name: return new RoomLeaveResponse(
                String(messageData.Id),
                String(messageData.RequestId),
            )
            case RoomChatResponse.name: return new RoomChatResponse(
                String(messageData.Id),
                String(messageData.RequestId),
            )
            case RoomEnterNotification.name: return new RoomEnterNotification(
                String(messageData.Id),
                String(messageData.RoomId),
                String(messageData.RoomChatMessageId),
                String(messageData.Time),
                String(messageData.UserId),
                String(messageData.UserNick),
            )
            case RoomLeaveNotification.name: return new RoomLeaveNotification(
                String(messageData.Id),
                String(messageData.RoomId),
                String(messageData.RoomChatMessageId),
                String(messageData.Time),
                String(messageData.UserId),
                String(messageData.UserNick),
            )
            case RoomPresenceNotification.name: return new RoomPresenceNotification(
                String(messageData.Id),
                String(messageData.RoomId),
                String(messageData.RoomChatMessageId),
                String(messageData.Time),
                String(messageData.UserId),
                String(messageData.UserNick),
            )
            case RoomChatNotification.name: return new RoomChatNotification(
                String(messageData.Id),
                String(messageData.RoomId),
                String(messageData.RoomChatMessageId),
                String(messageData.Time),
                String(messageData.UserId),
                String(messageData.UserNick),
                String(messageData.ChatMessage),
            )
            case ItemsNotification.name: {
                if (!is.array<object>(messageData.ItemsUpdatedOrCreated)) {
                    throw new Error(`Invalid data for type ${type}: ItemsUpdatedOrCreated is not an object array!`)
                }
                if (messageData.ItemsUpdatedOrCreated.some(props => !is.stringsObject(props))) {
                    throw new Error(`Invalid data for type ${type}: ItemsUpdatedOrCreated contains a non-object or an object having a non-string key or value!`)
                }
                if (!is.array<string>(messageData.ItemsDeleted)) {
                    throw new Error(`Invalid data for type ${type}: ItemsDeleted is not a string array!`)
                }
                return new ItemsNotification(
                    String(messageData.Id),
                    String(messageData.InventoryId),
                    <{[p: string]: string}[]>messageData.ItemsUpdatedOrCreated,
                    messageData.ItemsDeleted,
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

    export abstract class OkResponse extends Response {
        protected constructor(Id: string, RequestId: string) { super(Id, RequestId) }
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
        public constructor(Id: string, RequestId: string) { super(Id, RequestId) }
    }

    export class UserAuthRequest extends Request {
        public constructor(
            Id: string,
            public readonly UserId: string,
            public readonly UserToken: string,
        ) { super(Id) }
    }

    export class UserAuthResponse extends OkResponse {
        public constructor(Id: string, RequestId: string) { super(Id, RequestId) }
    }

    export class RoomRequest extends Request {
        public constructor(Id: string, public readonly RoomId: string) { super(Id) }
    }

    export class RoomOkResponse extends OkResponse {
        public constructor(Id: string, RequestId: string) { super(Id, RequestId) }
    }

    export abstract class RoomNotification extends Notification {
        protected constructor(
            Id: string,
            public readonly RoomId: string,
            public readonly RoomChatMessageId: string,
            public readonly Time: string
        ) { super(Id) }
    }

    export abstract class RoomUserActionNotification extends RoomNotification {
        protected constructor(
            Id: string,
            RoomId: string,
            RoomChatMessageId: string,
            Time: string,
            public readonly UserId: string,
            public readonly UserNick: string,
        ) { super(Id, RoomId, RoomChatMessageId, Time) }
    }

    export class RoomEnterRequest extends RoomRequest {
        public constructor(
            Id: string,
            RoomId: string,
            readonly RoomUserNick: string,
        ) { super(Id, RoomId) }
    }

    export class RoomEnterResponse extends RoomOkResponse {
        public constructor(Id: string, RequestId: string) { super(Id, RequestId) }
    }

    export class RoomLeaveRequest extends RoomRequest {
        public constructor(
            Id: string,
            RoomId: string,
        ) { super(Id, RoomId) }
    }

    export class RoomLeaveResponse extends RoomOkResponse {
        public constructor(Id: string, RequestId: string) { super(Id, RequestId) }
    }

    export class RoomChatRequest extends RoomRequest {
        public constructor(
            Id: string,
            RoomId: string,
            public readonly ChatMessage: string,
        ) { super(Id, RoomId) }
    }

    export class RoomChatResponse extends RoomOkResponse {
        public constructor(Id: string, RequestId: string) { super(Id, RequestId) }
    }

    export class RoomEnterNotification extends RoomUserActionNotification {
        public constructor(
            Id: string,
            RoomId: string,
            RoomChatMessageId: string,
            Time: string,
            UserId: string,
            UserNick: string,
        ) { super(Id, RoomId, RoomChatMessageId, Time, UserId, UserNick) }
    }

    export class RoomLeaveNotification extends RoomUserActionNotification {
        public constructor(
            Id: string,
            RoomId: string,
            RoomChatMessageId: string,
            Time: string,
            UserId: string,
            UserNick: string,
        ) { super(Id, RoomId, RoomChatMessageId, Time, UserId, UserNick) }
    }

    export class RoomPresenceNotification extends RoomUserActionNotification {
        public constructor(
            Id: string,
            RoomId: string,
            RoomChatMessageId: string,
            Time: string,
            UserId: string,
            UserNick: string,
        ) { super(Id, RoomId, RoomChatMessageId, Time, UserId, UserNick) }
    }

    export class RoomChatNotification extends RoomUserActionNotification {
        public constructor(
            Id: string,
            RoomId: string,
            RoomChatMessageId: string,
            Time: string,
            UserId: string,
            UserNick: string,
            public readonly ChatMessage: string,
        ) { super(Id, RoomId, RoomChatMessageId, Time, UserId, UserNick) }
    }

    export class ItemsNotification extends Notification {
        public constructor(
            Id: string,
            public readonly InventoryId: string,
            public readonly ItemsUpdatedOrCreated: Readonly<Readonly<{[p: string]: string}>[]>,
            public readonly ItemsDeleted: Readonly<string[]>,
        ) { super(Id) }
    }

}
