# Extension Design: Thoughts + Notifications

Companion to the server-side *Thoughts Feature Design*. Describes the
extension side as built: the two client features (Notifications and Thoughts),
how they sit on the existing instant-message infrastructure, and the config the
client expects.

## Architecture summary

Two client-side features, layered:

- **Notifications** — generic. Owns the system-user IM channel, the sticky
  toast lifecycle, and the read-only inbox window for system notifications.
  Knows nothing about thoughts beyond dispatching on a `feature` field.
- **Thoughts** — consumer. Supplies the `notes` notification rendering (text,
  View link, toast button) and the participant-menu entry that opens the
  Thoughts panel for the current room.

---

## Config

Server-pushed:

```
thoughts.enabled                bool   — shows the Thoughts menu entry and lets
                                         notes notifications through
thoughts.itemFrameProperties    ItemProperties-like (IframeUrl, IframeOptions,
                                         Label, ImageUrl, Width, Height) — the
                                         frame definition for the Thoughts panel
notifications.enabled           bool   — shows the Notifications menu entry and
                                         allows opening the inbox
```

Client-only defaults (never sent by the server):

```
systemUser.userName             display name of the system pseudo-user
systemUser.userImageUrl         avatar of the system pseudo-user (empty → weblin logo)
```

The system pseudo-user's ID is a fixed client constant (`Utils.getSystemUserId()`),
not configuration. Server and client agree on it out of band.

---

## Notifications

### Wire format

A notification is an ordinary instant message from the system user to the
recipient with message type `notification`. Its text is a JSON object:

```
feature        string   — which feature produced it ('notes', …)
event          string   — feature-specific event name
actorUserId    string
actorName      string
actorImageUrl  string
…              feature-specific fields
```

For `feature: 'notes'` the extra fields are `boardId`, `postId`, `noteId`.
A room board's `boardId` is `r-<clientRoomId>`.

### Background

`BackgroundInstantMessageManager` accepts a message from the system user only
if its type is `notification`; from any other author only the regular IM
types. Everything downstream (persistence, cross-tab fan-out, unread replay to
new tabs) is the unchanged IM path, with the channel keyed by the system user
ID like any other IM conversation.

### Content script

- `ContentPersonManager.getSystemUserData()` synthesizes the system user's
  `PersonData` from the client config. The regular person lookup routes the
  system user ID there, so nothing else has to special-case it.
- `ContentInstantMessageManager` routes the system user's channel to a
  `NotificationsWindow` instead of an `InstantMessagesWindow`; both live in the
  same window map, so IM window persistence across tabs and reloads applies
  unchanged. `openNotificationsWindow()` is the public entry used by the menu.
- `NotificationsWindow extends InstantMessagesWindow`:
  - read-only (`ChatWindow.isReadOnly()` suppresses the input row; `sendChat`
    is a no-op), no video-conference button.
  - `storeChatMessage` drops anything that isn't a parseable notification, and
    drops `notes` notifications while thoughts are disabled.
  - message rendering dispatches on `feature`; the `notes` renderer shows the
    event text and a View link opening the Thoughts frame on that thought.
  - becoming visible marks all notifications as read.
- **Toast.** The parent's single-sticky-toast mechanism is reused; the window
  only overrides which messages are toastable (notifications whose `feature`
  is in a per-window allowlist) and how the toast is built. The toast shows the
  actor's avatar and the event text, and offers feature-specific buttons (View
  for `notes`) plus "All notifications", which opens the inbox. Every
  dismissal path — default close, any button — marks all notifications as
  read.

---

## Thoughts

- **Menu entry.** `OwnParticipantMenu` shows a Thoughts item when
  `Utils.isThoughtsEnabled()` (flag set and a frame URL configured) and the
  user is in a room. It opens the panel via `ContentItemFrames.openThoughtsFrame`.
- **Frame opening.** `openThoughtsFrame(anchor, target?)` merges
  `thoughts.itemFrameProperties` over the user's N3q system item, so the frame
  has a real item ID and goes through the ordinary signed-context item frame
  path. With a target (from a notification) it appends `clientRoomId`,
  `postId`, `noteId` as query parameters; the SPA uses `clientRoomId` from the
  query over the context's room. Without a target the SPA falls back to the
  context room, which is why the menu entry requires being in a room.
- **Notifications menu entry.** Shown when the IM feature and
  `notifications.enabled` are on. It is deliberately not gated by `thoughts.*`:
  other features may later notify through the same system user.
