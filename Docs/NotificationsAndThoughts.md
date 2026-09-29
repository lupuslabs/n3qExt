# System Notifications and Thoughts

## Notifications

A notification is an instant message from the system user with message type `notification`.
The client accepts no other message type from the system user, and no notification from any other author.
The message text is a JSON object described by the `NotificationData` type and feature-specific derived types in `NotificationsWindow`.

The Notifications menu entry is gated by configured `instantMessages.enabled` and `notifications.enabled`.

The notifications window doesn't show `notes` notifications when configured `thoughts.enabled` isn't true.

The system pseudo-user's ID is a fixed constant (`Utils.getSystemUserId()`).
Configured `systemUser.userName` and `systemUser.userImageUrl` define its display name and avatar image.

## Thoughts

To open the thoughts frame, `ContentItemFrames` merges the configured `thoughts.itemFrameProperties` over the N3q system item's properties and opens a room item frame from them.

Opened from a notification, the frame URL gets the query parameters
`clientRoomId`, `postId`, `noteId`. In absence of the `clientRoomId` parameter, context's room is used.
