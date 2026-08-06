# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

n3qExt is the **weblin.io** browser extension - a social layer for the web that displays avatars and interactive items on web pages. Users on the same page can see each other, chat, and interact with items.

## Build & Development Commands

All commands run from the `ChromeExt/` directory:

```bash
# Install dependencies
npm install

# Development with watch mode (rebuilds on file changes)
npm run watch

# Production build for Chrome/Firefox extension
npm run release-extension

# Production build for embedded widget (CDN-served)
npm run release-embedded

# Individual build targets
npm run build:contentscript-background  # Main extension
npm run build:embedded                   # Embedded widget
npm run build:test                       # Test files
```

Output:
- `dist/` - Chrome extension files
- `dist-firefox/` - Firefox extension files
- `extension.zip` / `extension-firefox.xpi` - Packaged extensions

## Architecture

### Entry Points

1. **Content Script** (`src/contentscript/contentscript.ts`)
   - Injected into every web page via `ContentApp`
   - Renders avatars, items, and UI windows in shadow DOM
   - Handles tab visibility and user interactions

2. **Background Service Worker** (`src/background/background.ts`)
   - Manifest V3 service worker via `BackgroundApp`
   - Manages XMPP connections, WebSocket connections, and state
   - Communicates with content scripts via Chrome port messaging

3. **Embedded Mode** (`src/embedded/embedded.ts`)
   - Standalone widget that can run without browser extension
   - Used when served via CDN on participating websites
   - Can run BackgroundApp in-thread when extension not installed

### Directory Structure

```
ChromeExt/src/
├── background/     # Service worker - BackgroundApp, XMPP, WebSocket, state
├── contentscript/  # Page UI - ContentApp, windows, avatars, items
├── lib/            # Shared code - communication, config, utilities
├── embedded/       # CDN-served widget entry point
└── test/           # Unit tests (Chai)
```

### Key Classes

- **BackgroundApp** (`src/background/BackgroundApp.ts`) - Central orchestrator for background worker
- **ContentApp** (`src/contentscript/ContentApp.ts`) - Central orchestrator for content script UI
- **WindowBase** (`src/contentscript/WindowBase.ts`) - Base class for all UI windows (BackpackWindow, ChatWindow, etc.)
- **Participant** (`src/contentscript/Participant.ts`) - Represents users in a room
- **RoomItem** (`src/contentscript/RoomItem.ts`) - Interactive items placed in rooms
- **Config** (`src/lib/Config.ts`) - Centralized configuration with typed get/set

### Communication Pattern

Content scripts and background worker communicate via Chrome port messaging with a request-response pattern:
- `ContentToBackgroundCommunicator` / `BackgroundToContentCommunicator`
- Messages use `BackgroundRequest` / `BackgroundResponse` types with message IDs
- `SamethreadMessagePipe` used in embedded mode when running in same thread

### Protocols

- **XMPP** - Real-time messaging via `@xmpp/client` (XmppConnectionManager)
- **WebSocket** - Server connections (WebsocketManager)
- **iframe API** - For interactive items (see `Docs/Protocol/iframeApi.md`)

## General Code Style

Language-neutral rules for all code. This section is mirrored verbatim between the server repo (`nine3q/CLAUDE.md`) and the extension repo (`n3qExt/CLAUDE.md`): **any change must be applied to both files**. The rules are case-agnostic: identifier examples appear in one language's casing but apply in each language's own member-casing convention (C# `GetFoo`/`IsRunning`, TS `getFoo`/`isRunning`).

- Legacy code is not mass-reformatted: new code follows all rules; existing code is converted when touched. The language sections mark which old forms count as legacy.
- 4-space indentation, LF line endings, UTF-8 without BOM, final newline, no trailing whitespace
- No control structure one-liners: every `if`/`else`/loop body is braced and starts on its own line — neither brace-less bodies (`if (x) throw …;`) nor single-line braced bodies (`if (x) { return; }`)
- Prefer putting long call arguments into variables over multiline calls
- Soft 120-column limit: shorten over-long lines by extracting variables (per the rule above) before going multiline; in the rare case both would be awkward, the line may stay longer
- No multiline ternaries: a conditional expression stays on one line — one that would need wrapping becomes an `if`/`else` instead (assign to a variable declared just above it, or return from both branches)
- Comments documenting a whole declaration (class, method, field, module) are `/** prose */` doc blocks — tooling shows them on hover; comments inside code are `//` lines regardless of length; plain `/* */` blocks are not used
- Few code comments: prefer self-documenting code; keep only terse non-obvious "why" comments (constraints, security) — never restate what the code shows
- Most code needs no section dividers — never comment banners or dash rulers; where sectioning genuinely helps, use the language's dedicated mechanism if it has one (C# `#region Name`; TypeScript has none)
- Member order: static consts and enums, static fields, static methods, instance fields, constructors, instance methods; properties are treated like fields; public before protected/private within each tier. Readability wins over strict order: methods are grouped by function — a small private/protected helper may sit with its public users, and where sections are used, methods go into the thematically fitting section
- Names are plain and literal — no metaphors, colloquialisms, or imported jargon in identifiers (poke, mint, victim, touch, ingest, landing, "heavy read"); conditional behavior is spelled out as `…IfX` / `…OrX`, not a `Maybe` prefix; the house verb for factories and new-ID generation is `Make`. Established domain terms used consistently by the design docs (e.g. culling) are fine; natural English in comment prose is fine.
- Value-returning helper methods carry a `Get` prefix — the generic fallback for side-effect-free value-returning methods (`GetAvatarImageUrlOrDefault`, `getDataUrl`) — unless the surrounding idiom differs (`OnX`; `MakeX` for factories and new IDs); boolean-returning methods are predicates without the prefix (`IsRunning`, `hasBackpackItem`); mutating methods are named after what they do, whether they return something or not (`Claim()`, cursor-style `Next…`) — `Get` promises side-effect-freedom
- Boolean names must sound like booleans: `<name>: true` has to read as a clear "yes". State predicates are prefixed with is/are/has/have/can/should/must/needs/wants/will/was (`isRunning`, not `running`) or use a third-person-singular verb (`SupportsX`, `matchesX`). Members of option/config objects may instead be imperative instructions that the value switches on or off (`AllowDrag`, `showReactions`, `withPinOpenButton`) — they literally tell the component what to do.
- Message naming across a process or service boundary (a socket, worker/tab messaging): the sending method is `SendXxx`/`SendXxxTo…`; a one-way payload is an `XxxNotification`, and an `XxxRequest` is always answered with an `XxxResponse`; the receiver processes each in a `HandleXxxNotification`/`HandleXxxRequest` method
- In-process event naming: registered listeners are fired via the `Callable*` pairs' `callListeners`, and the reacting listener methods are `OnXxx`
- Durations carry their unit: spelled-out `Seconds` and short `Sec` both work (`timeoutSeconds`, `cooldownSec`) — prefer matching nearby identifiers, e.g. the config key a value comes from; plural `Secs` is legacy; milliseconds stay `Ms`, instantly readable as the SI milli prefix plus seconds (nobody measures in megaseconds)
- Docs and prose: write plain "if", not the math shorthand "iff"

## TypeScript Code Style

TypeScript-specific rules; the General Code Style rules above also apply. Tooling encodes what it can: whatever `.editorconfig` can express is in it, and the ESLint config carries the rules that can be checked without being too annoying or breaking compilation for legacy code; the rest — most naming, type, and pattern rules — is prose-only. This section is mirrored verbatim between the server repo (`nine3q/CLAUDE.md`) and the extension repo (`n3qExt/CLAUDE.md`): **any change must be applied to both files**.

### Formatting

- Single quotes (backticks allowed)
- Semicolons always
- K&R braces everywhere (opening brace on the same line, `} else {`); Allman-style declaration braces are legacy
- Spaced object-literal/destructuring braces: `{ x }`, matching the import-brace style
- Trailing commas in multiline literals and parameter lists
- Variables are preferably not reused and declared `const`; where reuse genuinely makes sense, `let` is used; `var` is legacy

### Naming

- Files are named after the contained thing: a file holding a primary type (class, interface, enum, namespace) is PascalCase after that type; files that are a loose collection of stuff — usually legacy, but also entry-point scripts (`background.ts`, `contentscript.ts`, `site.ts`, `itemFrame.ts`) — are camelCase
- Types (classes, interfaces, type aliases, enums): PascalCase; interfaces have **no `I` prefix** (deliberate divergence from the C# server convention; `IFoo` is legacy)
- Acronyms in identifiers are title-cased like ordinary words: `UrlResolver`, `Html`, `Jid`, `IoProvider`, `Id` — never all-caps (`URL`, `IO`)
- Enum members: PascalCase (`Offer = 'offer'`); string-literal union *values* are plain lowercase strings — except unions mirroring a server-side enum's wire serialization, whose values match the wire verbatim (PascalCase C# enum names)
- Members: camelCase; private fields are bare camelCase — no `_` prefix (deliberate divergence from C#: TS always uses `this.`) and no `#` fields; snake-case hybrids (`handle_newChatMessage`) are legacy
- Every member states its accessibility explicitly (`public`/`protected`/`private`), including statics and constructors (`public constructor(...)`)
- Static constants: camelCase (`public static readonly layerWindow = 30`); `snake_case` hybrids and PascalCase constants are legacy
- Native `get`/`set` accessors are exceptional: reserved for the rare case where running code on property *access* is the mechanism itself and no method can express the contract — the benchmark is the `Logger` log methods (see Patterns), whose getters exist solely to keep DevTools call-site attribution. Do not introduce one without a comment justifying why `getFoo()` cannot do it; never as convenience syntax
- Callback/function types are suffixed by role: `Handler` (reacts to an event), `Action` (user-invoked, e.g. toast buttons), `Listener` (subscription); `Fun` is the generic fallback when no role name fits; `Callback` is legacy

### Types & modules

- `T[]`, not `Array<T>` — but the readonly form is written `ReadonlyArray<T>`, not `readonly T[]`: the two are the same type (the modifier makes the *elements* readonly, not the binding), and the generic form avoids a second `readonly` on members — `private readonly items: ReadonlyArray<T>`
- Nullability comes first in unions, written tight: `null|X`. Parameters accepting an absent value use the global `Nil` house type (`type Nil = null|undefined`, `globals.d.ts` — the sole sanctioned global type; others are banned): `date: Nil|Date`. `Nil` stays at the boundary: normalize on entry (`?? null` / `is.nil()`), so fields, locals and return types are `null|X` — own code produces `null`, never `undefined`. `undefined` must never signal anything different from `null` (no "undefined = leave unchanged, null = clear" APIs — model such states explicitly)
- Wire/record types (message payloads, persisted records) declare `readonly` properties; mutation means constructing a new value
- Explicit return types on all methods and functions, including `: void`
- Boundary data (message payloads, XMPP stanzas) is typed `unknown` and narrowed with the `is.*` guards; `any` — explicit or implicit — is legacy
- Named exports only, no default exports; imports at the top of the file, single-level relative paths (`./X`, `../lib/X`)
- Imports are ordered from most basic to most specialized, not alphabetized: external packages and assets first, then own code layered upward (`is`, `as`, `iter` before `DomUtils` before windows/views before `ContentApp`)
- Type-only imports use `import type { Foo }`

### Patterns

- Lifecycle: the constructor sets up, `stop()` tears down; `start()` exists only where it means something (async setup, restartable components); the teardown guard flag is named `isStopped`
- Logging: new code uses the `Logger` interface backed by `ConsoleLogger` (extension: `lib/Logger.ts`, server widget: `Scripts/Logger.ts`) — the log methods are getters returning bound console methods, so DevTools attributes every line to the caller's `file:line` with the instance prefix baked in, while the getter gates each call (a load-bearing accessor per the naming rules). Direct loglevel `log.*` is legacy; raw `console.*` only in bootstrap code before a logger exists. The extension's `logError` emits `console.warn` — prominent but off the browser's extensions page (that is policy); the server's emits `console.error`
- `async`/`await` over `.then()` chains. The `.catch(error => this.app.onError(error))` fire-and-forget idiom is accepted, and chained `.catch().then().catch()` means "non-critical, proceed regardless"
- Null checks use `is.nil()` / the `is.*` helpers; loose `== null` is legacy
- Switch cases are always braced and terminated `} break;` — including after `return`; the unreachable `break` is deliberate uniformity (`no-unreachable` is off in the ESLint config for this)
- DOM building: create elements from template strings via `DomUtils.elemOfHtml()`/`elemsOfHtml()` — with `as.Html()` on every interpolation — and *return* them; helper functions are not handed a parent element to write into (legacy pattern) — but component/view classes may receive their root or mount container via constructor and manage it for their lifetime: the ban is on write-into-parent helpers, not on component mounting. Discrete `createElement` construction is fine where the structure is highly data-dependent (branching/nesting varies with the data); a component's fixed scaffolding is one template string, with part references looked up after parsing. Raw `innerHTML` assignment only for literal trusted HTML without interpolations. Old DOM code may or may not convert when touched

## Changelog

User-visible changes are recorded in **`ChromeExt/src/lib/_Changes.ts`** — the `_Changes.data` array, newest-first. Each entry is `[version, codename, [['Add' | 'Fix' | 'Change', text], ...]]`.

- This file is the source of truth for the app version: `Client.getVersion()` returns `_Changes.data[0][0]`. There is no separate version constant or `package.json` version driving the build.
- The in-app **Changes** window (`src/contentscript/ChangesWindow.ts`) renders the same data.
- To record a change for the in-progress release: append a `['Add' | 'Fix' | 'Change', '<text>']` row to the topmost entry's changes array.
- To cut a new release: prepend a new `[version, codename, [...]]` triple at index 0.

## Multi-Platform

The codebase supports:
- Chrome (Manifest V3) - `manifest.json`
- Firefox - `manifest-firefox.json` with CORS workarounds
- Embedded widget - No extension required
