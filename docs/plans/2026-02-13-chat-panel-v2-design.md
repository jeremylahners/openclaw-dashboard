# Chat Panel v2 — Architecture Redesign

**Date:** 2026-02-13
**Status:** Approved

## Problem

The current chat panel has duplicate messages, late deliveries, out-of-order messages, and visual flicker. Root cause: three competing sources of truth (frontend caches, server JSON file, Gateway history) synchronized by polling and heuristic deduplication. The extensive defensive code (generation counters, fingerprinting, timing-based dedupe windows) addresses symptoms but can't prevent the architectural race conditions.

## Design Principles

1. **Single source of truth** — SQLite database on the server. Every message gets a monotonic sequence number.
2. **Event-driven updates** — Server pushes new messages to all connected frontends via WebSocket. No polling.
3. **Gateway is transport only** — Gateway WebSocket handles real-time streaming. Once finalized, the message is committed to SQLite and the Gateway's copy is irrelevant (Gateway sessions are cleared routinely).
4. **Incremental DOM** — Messages are appended individually, never full innerHTML re-render unless switching agents.

## Data Flow

```
User sends message
  → Frontend shows optimistic bubble + sends via Gateway WS
  → Gateway routes to agent
  → Agent streams deltas back via Gateway WS
  → Frontend shows streaming indicator (real-time, not persisted)
  → Agent finishes (onFinal)
  → Frontend commits final message to server (POST /api/messages)
  → Server writes to SQLite with auto-increment sequence number
  → Server pushes {type: "message_committed", agent, seq, message} to ALL connected frontends
  → Frontend appends the message element to DOM (or increments unread badge)
```

## Components

### 1. SQLite Message Store (`office/db.js`)

Table schema:
```sql
CREATE TABLE messages (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  agent TEXT NOT NULL,
  role TEXT NOT NULL,        -- 'user' or 'assistant'
  content TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  idempotency_key TEXT UNIQUE,
  metadata TEXT              -- JSON, optional
);
CREATE INDEX idx_messages_agent ON messages(agent, seq);
```

- Atomic writes, no race conditions on concurrent access
- Query: `SELECT * FROM messages WHERE agent = ? AND seq > ? ORDER BY seq` for incremental sync
- Sequence numbers provide global ordering — no Date.now() collisions
- Idempotency key column with UNIQUE constraint prevents duplicates at the database level

### 2. Server WebSocket (`gateway-api.js`)

A WebSocket server on the backend for frontend ↔ server communication (separate from the Gateway WS).

**Client → Server messages:**
- `{type: "subscribe", agent: "isla"}` — subscribe to an agent's messages
- `{type: "unsubscribe", agent: "isla"}` — stop receiving updates

**Server → Client messages:**
- `{type: "history", agent, messages: [...]}` — full history on subscribe
- `{type: "message_committed", agent, message: {...}}` — new message committed
- `{type: "typing", agent, active: true/false}` — agent typing indicator

On connect: client subscribes to an agent. Server responds with full message history, then pushes live updates.

### 3. Frontend Message Manager (replaces all cache/poll logic)

- Single `Map<agentKey, Message[]>` as read-only cache, populated exclusively from server
- On subscribe response: set cache, render full message list
- On `message_committed`: append to cache, append single DOM element
- On agent switch: unsubscribe old, subscribe new, clear DOM, render from response
- No polling, no fingerprinting, no generation counters, no dual caches

### 4. Streaming Layer (simplified)

- Gateway WebSocket callbacks stay similar but simplified
- Streaming state is purely visual — a temporary DOM element showing typing indicator
- On `onFinal`: POST to server → server commits to SQLite → server pushes to all frontends → frontend appends permanent message element
- Streaming element removed and replaced by committed message element

### 5. DOM Rendering

- On agent switch: clear container, render all messages from subscribe response using `appendChild` loop
- On new message: create single message element, `appendChild` to container
- Streaming messages: temporary element appended/removed, never part of committed history
- Scroll management: only auto-scroll if user is near bottom

## What Gets Eliminated

| Current | Replaced By |
|---------|-------------|
| `messages.json` flat file | SQLite database |
| `chatMessagesCache` (legacy array) | Gone |
| `agentMessageCaches` (per-agent Map) | Single Map populated from server only |
| `pollChatMessages()` + 3s interval | Server WebSocket push |
| `lastMessageIds` Set | Sequence numbers |
| Content fingerprinting (100-char truncation) | Sequence numbers |
| Generation counter + staleness guards | Subscribe/unsubscribe model |
| 5-second backend dedupe window | Idempotency keys in SQLite |
| Dual cache writes | Single server commit |
| `innerHTML` full replacement | Incremental `appendChild` |

## What Stays

- Gateway WebSocket connection and protocol (connect, chat.send, streaming events)
- Agent session key format (`agent:{name}:webchat:user`)
- Visual design of message bubbles
- `extractMessageText()` and `formatMarkdown()`
- Push notifications on agent reply
- `serve.js` proxy structure

## Migration

- One-time migration script reads existing `messages.json` and imports into SQLite
- Old polling/cache code removed entirely (not feature-flagged)
- Frontend changes are in-place in `index.html`
