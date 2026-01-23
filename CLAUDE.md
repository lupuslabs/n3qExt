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

## Code Style

- **TypeScript** targeting ES2021
- **4-space indentation**
- **Single quotes** (backticks allowed)
- **jQuery** is deprecated and will eventually be phased out
- Components use `start()` / `stop()` lifecycle pattern with cleanup

## Multi-Platform

The codebase supports:
- Chrome (Manifest V3) - `manifest.json`
- Firefox - `manifest-firefox.json` with CORS workarounds
- Embedded widget - No extension required
