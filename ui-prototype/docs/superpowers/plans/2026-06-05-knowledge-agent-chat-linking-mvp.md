# Knowledge Agent Chat Linking MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users explicitly attach Knowledge Base documents, chunks, or search results to the current Agent Chat session, then have Agent Chat display and prioritize those bounded contexts in Context Builder.

**Architecture:** Keep all persistence and validation in Electron main/provider code. Store only sanitized attachment summaries in `userData/sessions/agent-chat-knowledge-contexts.json`, expose add/remove/clear/list through existing preload/localProvider APIs, and feed attached knowledge contexts into the existing `agentContextBuilder` as high-priority knowledge items.

**Tech Stack:** Electron main process, Vitest, React 19, existing provider/preload IPC table, app-owned userData JSON stores.

---

## Current State

- Persistent Knowledge index, vector cache, hybrid search, local BGE-M3 provider, Agent Chat Context Builder, session memory, streaming/cancel, and Tool MVP already exist.
- `kb.searchLocal` tool summaries already flow into Agent Chat Context Builder.
- Missing capability: explicit Knowledge Base -> Agent Chat attachment store, provider APIs, small attach buttons, and Agent Chat Context panel remove/clear controls.

## File Structure

- Create: `src/electron/agentKnowledgeContextStore.js` for userData-only attachment persistence and sanitization.
- Test: `src/electron/agentKnowledgeContextStore.test.js` for add/list/remove/clear, size limits, path/secret redaction, and no writes to source docs.
- Modify: `src/electron/mainProvider.js` to validate attached document/chunk/search result against the Knowledge index/search path and merge attached contexts into LLM context payload.
- Modify: `src/electron/ipcChannels.js`, `src/services/localProvider.js`, and `src/services/mockProvider.js` to expose safe attach/list/remove/clear APIs.
- Modify: `src/electron/agentContextBuilder.js` and tests to prioritize `attachedKnowledgeContexts` above ordinary context pack/source summaries while preserving tool summaries and current user text.
- Modify: `src/electron/agentChatSessionStore.js` and tests to persist `contextSummary.usedContextItems` without full files or secrets.
- Modify: `src/pages/KnowledgeBase.jsx` and tests to add small attach/ask actions on document rows without layout changes.
- Modify: `src/pages/AgentChat.jsx` and tests to show attached contexts in the existing left Context panel with remove/clear controls.
- Verify: `src/rendererSafety.test.js`, Tool MVP tests, streaming/cancel/session memory tests.

## Tasks

### Task 1: Attachment Store

- [ ] Write failing tests in `src/electron/agentKnowledgeContextStore.test.js`.

Run: `npm test -- src/electron/agentKnowledgeContextStore.test.js`
Expected: fail because `agentKnowledgeContextStore.js` does not exist.

- [ ] Implement `agentKnowledgeContextStore.js` with `addAgentKnowledgeContext`, `removeAgentKnowledgeContext`, `clearAgentKnowledgeContexts`, and `listAgentKnowledgeContexts`.
- [ ] Store only bounded fields: `contextId`, `documentId`, `chunkId`, `title`, `relativePath`, `preview`, `sourceType`, `score`, `matchType`, `updatedAt`.
- [ ] Redact `apiKey`, `token`, `secret`, `Authorization`, `sk-*`, and Windows absolute paths before persistence.
- [ ] Run the store test and confirm it passes.

### Task 2: Provider And IPC

- [ ] Add failing provider/API tests for `attachKnowledgeContextToAgentChat`, `removeKnowledgeContextFromAgentChat`, `clearAgentChatKnowledgeContexts`, and `listAgentChatKnowledgeContexts`.
- [ ] Add IPC method entries under `agentChat` and localProvider wrappers.
- [ ] In `mainProvider`, validate document/chunk attachments against `listKnowledgeDocuments`, `getKnowledgeDocumentPreview`, or indexed search results before storing.
- [ ] Return only sanitized attachment summaries to Renderer.
- [ ] Run provider, IPC, localProvider, and desktop API tests.

### Task 3: Context Builder Priority

- [ ] Add failing tests showing attached knowledge contexts appear in LLM messages ahead of ordinary context items and survive tighter budgets before low-priority context.
- [ ] Extend `buildAgentLlmContext` input with `attachedKnowledgeContexts`, normalized as `sourceType: "knowledge"` and `status: "attached"`.
- [ ] Include used attached items in `contextSummary.usedContextItems` while preserving current user message, recent history, and tool summaries.
- [ ] Run `agentContextBuilder` and `mainProvider` tests.

### Task 4: Knowledge Base UI

- [ ] Add failing tests for document-row attach action calling the provider with sanitized document metadata.
- [ ] Add a small icon button inside existing document rows using existing button styles and lucide icons.
- [ ] Keep current three-column layout, Settings overlay, page count, and search behavior unchanged.
- [ ] Run `KnowledgeBase.test.jsx`.

### Task 5: Agent Chat UI

- [ ] Add failing tests for attached context rows, remove action, and clear action.
- [ ] Load attached contexts through `getAgentChat` data and display them in the existing Context panel.
- [ ] Add compact remove/clear buttons without moving panels or changing overall style.
- [ ] Ensure send/stream payloads continue to use the current session while main/provider reads attached contexts from userData.
- [ ] Run `AgentChat.test.jsx`.

### Task 6: Regression And Verification

- [ ] Run focused tests: `npm test -- src/electron/agentKnowledgeContextStore.test.js src/electron/mainProvider.test.js src/electron/agentContextBuilder.test.js src/pages/KnowledgeBase.test.jsx src/pages/AgentChat.test.jsx src/services/localProvider.test.js src/electron/ipcChannels.test.js src/electron/desktopApiFactory.test.js`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `npm run electron:smoke`.
- [ ] Use Browser/in-app browser only for visual regression: Knowledge Base opens, attach works, Agent Chat Context panel shows/remove/clear contexts, Settings opens, Page Switcher still has 8 cards and 8 round nodes, console has no app error/warning.

## Acceptance Checklist

- [ ] Attach/list/remove/clear write only app-owned userData context state.
- [ ] No user source Knowledge Base files are modified.
- [ ] Renderer still has no direct Node/Electron imports.
- [ ] Secrets and absolute private paths do not enter Renderer, prompt, session file, or context state.
- [ ] Context Builder prioritizes explicit attached knowledge contexts.
- [ ] `contextSummary.usedContextItems` records attached contexts.
- [ ] `kb.searchLocal`, local BGE-M3 hybrid search, Tool MVP permissions, streaming/cancel, and session memory continue passing.
