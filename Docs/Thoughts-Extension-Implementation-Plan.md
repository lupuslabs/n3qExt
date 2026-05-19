# Extension Implementation Plan: Thoughts + Notifications

Companion to the server-side *Thoughts Feature Design*. Covers only the
extension-side changes: the two new client features (Notifications and
Thoughts), the wire-up to the existing instant-message infrastructure, and
config keys/assets the client needs.

## Architecture summary

Two new client-side features, layered:

- **Notifications** — generic. Owns the system-user IM channel, the sticky
  toast lifecycle, and the read-only chat window for system notifications.
- **Thoughts** — consumer. Adds the `'notes'` `ChatMessageType` rendering, the
  per-message View link, and the participant-menu entry for opening the SPA in
  the current room.

---

## Server-pushed config keys (new)

```
thoughts.enabled                              bool
thoughts.itemFrameProperties                  ItemProperties-like
                                              (IframeUrl, IframeOptions, Label,
                                               ImageUrl, Width, Height)

notifications.enabled                         bool
notifications.systemUserId                    string
notifications.systemUserName                  string
notifications.systemUserImageUrl              string  (may be empty → default avatar)
```

### Translation keys (also config-pushed)

```
menu.Thoughts
menu.Notifications
notifications.windowTitle
notifications.openNotificationsButton         (e.g. "All notifications")
thoughts.notification.openThoughtButton
thoughts.notification.replyMessage
thoughts.notification.reactionMessage
thoughts.notification.moderatorEditMessage
thoughts.notification.moderatorDeleteMessage
thoughts.notification.parentAuthorEditMessage
thoughts.notification.parentAuthorDeleteMessage
thoughts.notification.parentModeratorEditMessage
thoughts.notification.parentModeratorDeleteMessage
thoughts.notification.cullingDeleteMessage
```

---

## New asset files

| File | Source |
|---|---|
| `ChromeExt/src/assets/icons/mdi_lightbulb-outline.svg` | Iconify `mdi:lightbulb-outline` |
| `ChromeExt/src/assets/icons/mdi_information-outline.svg` | Iconify `mdi:information-outline` |

---

## New code files

### `ChromeExt/src/contentscript/NotificationsWindow.ts`

Extends `InstantMessagesWindow`. Responsibilities:

- Constructor takes the app and a pseudo-`PersonData` synthesized from config
  (`notifications.systemUser*`).
- `windowCssClasses.push('notificationswindow')`; `titleText` from
  `notifications.windowTitle`.
- Override `makeVidconfButton()` → `return null`.
- Mark window as read-only (drives reply-input hiding — see `ChatWindow` change
  below).
- Override `makeMessageTextHtmlElement(message)` with a **hardcoded switch**:
  - `case 'notes'`: parse `message.text` as JSON (fields: `boardId`, `event`,
    `postId`, `noteId`, `triggerUserId?`, `triggerUserName?`,
    `triggerUserImageUrl?`). Render the localised
    `thoughts.notification.{event}` text with the trigger-user name
    interpolated, plus a clickable "View" link calling
    `app.itemFrames.openItemFrame(thoughts.itemFrameProperties, anchor, …,
    urlWithQuery)` where the URL has
    `?clientRoomId=<from boardId strip 'r-'>&postId=<…>&noteId=<…>` appended.
    `View` click also calls `this.markMessageAsRead(message)`.
  - `default`: delegate to `super.makeMessageTextHtmlElement(message)`.
- `onVisible()`: in addition to super, mark all unread messages in the channel
  as read.

### Toast handling — reuse parent's `unreadMessageToast` mechanism

`InstantMessagesWindow` already implements the toast lifecycle we want:
single toast per window, sticky (`new SimpleToast(..., 0, ...)` at line 232),
content replaced when a later unread message arrives, auto-hidden when the
window becomes visible (`updateUnreadMessageToast` at line 188). Reuse this.
`NotificationsWindow` overrides only the parts that differ for `'notes'`:

- **Override the toastable-type filter.** Parent uses
  `ChatUtils.isUserChatMessageType` (`'chat' | 'emote'`) at line 195. Refactor
  parent to expose `protected isToastableMessageType(type): boolean { return
  ChatUtils.isUserChatMessageType(type) }`. `NotificationsWindow` overrides
  to return `type === 'notes'`.
- **Override `showUnreadMessageToast(lastMessage, unreadMessageCount)`** for
  `'notes'`-specific construction. Pattern adapted from the vidconf invite
  flow at `ContentInstantMessageManager.ts:95–139`: every dismissal path —
  default close, View click, All-notifications click — runs the same
  `onCloseAction` that marks all `'notes'` messages as read.
  - Parse `lastMessage.text` JSON. Avatar/name from
    `triggerUser*` fields → fall back to `lastMessage.authorImageUrl/Name` →
    fall back to default participant avatar.
  - Title from `thoughts.notification.{event}` translation (interpolating
    trigger-user name).
  - `const onCloseAction = () => this.markMessagesAsReadByType('notes')`.
  - `toast.setDefaultAction(onCloseAction)` — required for cross-tab
    dismissal (every tab sees the persisted-with-`isUnread=false` event and
    the parent's `updateUnreadMessageToast` flow auto-hides) and to prevent
    re-pop on every new tab from `sendUnreadChannelsToTab` replay. The
    parent's IM toast omits this; for system notifications it's necessary.
  - `toast.addClosingActionButton('View', () => { onCloseAction(); … })` —
    parses JSON, builds the SPA URL with `?clientRoomId&postId&noteId`, opens
    via `app.itemFrames.openItemFrame`. `onCloseAction` runs first.
  - `toast.addClosingActionButton('All notifications', () => { onCloseAction(); this.show(options) })`
    — opens `this` window. `onCloseAction` is still called explicitly even
    though `onVisible` would also mark-all-read — matches the vidconf pattern
    where the same on-close fires regardless of which button.

---

## Modified code files

### `ChromeExt/src/lib/ChatUtils.ts`

- Add `'notes'` to `chatMessageTypes` const tuple. (No change to
  `instantMessageTypes` — system-user bypass handles that path; see below.)

### `ChromeExt/src/contentscript/ContentItemFrames.ts` (line 54 onward)

- Make `properties[Pid.Id]` optional. After
  `const itemId = ItemProperties.getId(properties)`, if
  `!is.nonEmptyString(itemId)`, compute a deterministic hash:
  - Use `CryptoUtils.getSha256Hasher` with the same sorted-key pattern as
    `ItemFrameContextFactory.calcHash`. Hash over the properties' entries.
  - Prefix the hex digest with a marker (e.g. `'syn-'`) so synthetic ids never
    collide with real `Pid.Id` values.
- The synthetic id flows through `itemFrameWindows` keying, `ItemFrameWindow`
  ctor, and the HMAC-signed context unchanged — fine for the Thoughts SPA
  which doesn't use `itemId` for inventory lookups.

### `ChromeExt/src/background/BackgroundInstantMessageManager.ts` (line 69 onward)

- In `handleInstantMessageNotification`, before the existing
  `isInstantMessageType` check, read
  `Config.get('notifications.systemUserId')`. If
  `notification.AuthorUserId === systemUserId && notification.RecipientUserId === this.app.getUserId()`,
  bypass the type guard and fall through to `handle_newChatMessage` with a
  `ChatChannel` of `{type: 'instantMessage', roomJid: systemUserId, roomNick: ''}`
  and `ChatMessage` whose `type` is the raw `notification.InstantMessageType`.
  `deduplicate: true` (server retries until confirmed).
- Otherwise: existing path unchanged.

### `ChromeExt/src/contentscript/ChatWindow.ts`

Add `protected isReadOnly(): boolean { return false }`. In `makeChatElems`
(line 151), when `isReadOnly()` returns `true`, skip the splitter + chat-input
row + send button creation (only the `chatlog` element is built). The
`chatInputFieldElem` field stays `null` in that case.

Null-guard the four current call sites that touch `chatInputFieldElem`:
- `onVisible` (line 180): wrap `.focus()` in `if (this.chatInputFieldElem)`.
- `onBeforeClose` (line 193–194): assignment is null-safe already.
- `onChatinKeydown` (line 431) and `onSendChatUserAction` (line 451): not
  reachable when the input element doesn't exist (no event source to fire
  them, no send button to click) — defensive guard optional.

`sendChat(text)` is `protected abstract` at line 472. `NotificationsWindow`
must still implement it — provide a no-op (or throw a descriptive error;
no caller path can reach it when there's no input UI).

### `ChromeExt/src/contentscript/ContentInstantMessageManager.ts`

Minimal changes — toast handling lives in `NotificationsWindow`, reusing the
parent class's `unreadMessageToast` mechanism. Only the routing changes here.

- `getOrCreateImWindow(otherUser)` (line 322): branch in **two** places:
  - During the `string → PersonData` conversion (lines 324–327): when
    `otherUser === Config.get('notifications.systemUserId')`, build a
    config-based `PersonData` (`{userId: systemUserId, userName:
    systemUserName, userImageUrl: systemUserImageUrl, ownPersonItem: null,
    ownFriendStatus: 'No'}`) instead of going through `PersonManager`. Skipping
    `PersonManager` is required — `getDummyPersonData` would return empty
    `userName`/`userImageUrl`, losing the configured display values.
  - During window instantiation: when
    `otherUserId === Config.get('notifications.systemUserId')`, instantiate
    `NotificationsWindow` instead of `InstantMessagesWindow`.
- No new private fields. No `onChatMessagePersisted` branch. No
  `handleSystemNotification`. The parent class's existing
  `onChatMessagePersisted` → `imWindow.onChatMessagePersisted` →
  `storeChatMessage` → `updateUnreadMessageToast` flow runs naturally for
  `NotificationsWindow` instances.
- Gate the routing branch by `Config.get('notifications.enabled')` —
  off → fall through to the existing `InstantMessagesWindow` path. (With
  `notifications.enabled = false` the system user id check still has nothing
  to match against if no system-user IMs arrive, so this gate is mostly
  defence-in-depth.)

### `ChromeExt/src/contentscript/OwnParticipantMenu.ts` (line 34 `makeMenuTree`)

After the existing `chat / chatHistory / emotes / persons` block:

- **Thoughts entry.** Gated by
  `Config.get('thoughts.enabled') &&
   is.nonEmptyString(thoughts.itemFrameProperties.IframeUrl) &&
   !!this.app.getRoom()`.
  `addActionItem('thoughts', 'Thoughts', lightbulbIconUrl, true,
   () => this.app.itemFrames.openItemFrame(thoughtsProps, this.participant.getElem()))`.
  Translation key: `menu.Thoughts`.
- **Notifications entry.** Gated by
  `Config.get('notifications.enabled') && is.nonEmptyString(notifications.systemUserId)`.
  `addActionItem('notifications', 'Notifications', infoCircleIconUrl, true,
   () => this.app.instantMessageManager.openInstantMessagesWindow(systemUserId))`.
  Translation key: `menu.Notifications`.

Two new asset imports at top: `mdi_lightbulb-outline.svg`,
`mdi_information-outline.svg`.

### `ChromeExt/src/lib/_Changes.ts`

Append entries to the topmost release's change array:

- `['Add', 'Thoughts: open the room thoughts panel from the own participant menu.']`
- `['Add', 'Notifications: system notifications inbox in the own participant menu.']`

---

## Implementation order

1. **`ChatUtils.ts`** — add `'notes'` to `chatMessageTypes`. Compiles in
   isolation; everything else depends on this type being known.
2. **`ContentItemFrames.openItemFrame`** — Id-optional with hash fallback.
   Self-contained, easy to verify by opening the existing system shop and
   backpack frames (regression check).
3. **`ChatWindow`** — add the read-only seam (whichever shape fits cleanest
   after reading the file). Quick test: existing chat windows render unchanged.
4. **`InstantMessagesWindow`** — small refactor only: extract
   `protected isToastableMessageType(type)` so `NotificationsWindow` can
   override. No behaviour change to existing IM windows.
5. **`NotificationsWindow`** — new file. Overrides
   `isToastableMessageType` and `showUnreadMessageToast`. Won't be
   instantiated yet; just compiles.
6. **`BackgroundInstantMessageManager`** — system-user bypass. With no
   system-user configured, behaviour is unchanged.
7. **`ContentInstantMessageManager`** — just the `getOrCreateImWindow`
   branch. Gated by `notifications.enabled`; off → no behaviour change.
8. **`OwnParticipantMenu`** — Thoughts and Notifications entries. Gated by
   their flags; both off → menu unchanged.
9. **Assets** — drop in the two SVGs.
10. **`_Changes.ts`** — changelog entries.
11. **End-to-end test** — needs server config pushed for the two `enabled`
    flags, `itemFrameProperties`, `systemUserId/Name/ImageUrl`, and translation
    keys. Until that lands, the feature is dormant on the client; that's the
    intended behaviour.

---

## Locked design decisions (rationale)

- **`'notes'` notifications stored under the `instantMessage` channel keyed by
  the configured system pseudo-user**, not under any `roompublic` channel of
  the thought's room. Reason: reuse the existing cross-tab read-state
  lifecycle (`onChatMessagePersisted` listening for `isUnread: false`).
- **Sticky toast (duration 0)**. Reason: user wants the notification visible
  until acted on.
- **Toast default close must call `markMessageAsRead`.** Reason: cross-tab
  dismissal works by the persisted-message-with-`isUnread=false` event reaching
  every tab; without the mark, the toast stays open in every other tab. Also,
  `BackgroundInstantMessageManager.sendUnreadChannelsToTab` replays unread
  channels to every new content script — without the mark, the toast re-pops
  on every new tab open.
- **`thoughts.enabled` flag only gates the participant menu entry.** Reason:
  the room Thoughts item is a generic room item and stays clickable; the View
  link in notifications stays functional because `thoughts.itemFrameProperties`
  is independent of `thoughts.enabled`. The flag is "tidy my menu," not a kill
  switch.
- **Thoughts menu entry also requires the user to be in a room.** Reason: the
  SPA falls back to the context's `roomId` when no `clientRoomId` query param
  is present, and an empty context room yields a broken open.
- **View link always built with empty context `roomId`.** Reason: the SPA's
  `clientRoomId` query param overrides the context, and room boards are
  world-readable, so no room-scoped check needs the context `roomId`. Avoids a
  current-room lookup at link-build time.
- **`ContentItemFrames.openItemFrame`: synthetic id when `Pid.Id` absent.**
  Reason: needed for the Thoughts menu entry which opens a frame from config
  properties, not from a real item. Hash over canonical properties keeps the
  id stable (so reopen-from-menu doesn't duplicate the frame) and the `'syn-'`
  prefix avoids collisions with real ids.
- **One window class for both menu-entry and toast-button entry into
  notifications.** Reason: there's only one notification message type today,
  so a filter parameter buys nothing; if future types appear, the window
  naturally shows them as an inbox.
- **`Notifications` menu entry not gated by `thoughts.*`.** Reason: it's a
  generic feature; other annotation surfaces may later send notifications
  through the same system user.

---

## Verified findings (formerly: risks)

All planning-phase risks have been verified against the current code:

- **`ChatWindow` reply-input shape** — `chatInputFieldElem` is referenced at
  four sites (`onVisible.focus()` line 180, `onBeforeClose` line 193,
  `onChatinKeydown` line 431, `onSendChatUserAction` line 451). `sendChat` is
  `protected abstract` at line 472. Resolution: `protected isReadOnly()`
  checked in `makeChatElems` to skip splitter + input row + send button;
  null-guard on `onVisible.focus()`; `NotificationsWindow` provides a no-op
  `sendChat`. See the `ChatWindow.ts` section above.
- **`markMessageAsRead` API surface** — confirmed: `protected
  markMessageAsRead(message)` at `ChatWindow.ts:257`; `public
  markMessagesAsReadByType(type)` at line 79 (already iterates unread and
  delegates per message). Both inherited by `NotificationsWindow`.
- **Synthetic-id collision proof** — real ids come from `Utils.randomString`
  with charset `0123456789abcdefghijklmnopqrstuvwxyz` (`Utils.ts:131`). The
  `-` in `'syn-'` is structurally absent from that charset, so the prefix
  cannot collide with a real `Pid.Id`.
- **`Config.get` fallback** — confirmed:
  `static get(key, defaultValue = undefined): any` at `Config.ts:1439`.
  `Config.get('thoughts.itemFrameProperties', {})` returns `{}` when missing.
- **Tab-content-data persistence** — confirmed automatic.
  `onTabContentDataInit` at `ContentInstantMessageManager.ts:305` reads
  `openImWindowUserIds` (string array) and calls
  `openInstantMessagesWindow(otherUserId)` per id. With the
  `getOrCreateImWindow` branch in place, the system user id routes to
  `NotificationsWindow` with no extra wiring.
- **`getOrCreateImWindow` needs two branches**, not one — discovered during
  verification:
  - At the `string → PersonData` conversion, skip `PersonManager` and build
    a config-based `PersonData` (otherwise `getDummyPersonData` would
    overwrite the configured display name and avatar with empty strings).
  - At window instantiation, pick `NotificationsWindow` vs
    `InstantMessagesWindow`.
  See the `ContentInstantMessageManager.ts` section above.
