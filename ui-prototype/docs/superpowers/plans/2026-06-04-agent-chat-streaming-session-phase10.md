# Agent Chat Streaming Session Phase 10 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development and superpowers:verification-before-completion to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add streaming Agent Chat replies, cancellation, recoverable errors, and safe chat session persistence under Electron `userData`.

**Architecture:** Keep Renderer behind preload/local provider APIs. The main/provider layer owns OpenAI-compatible streaming, abort state, session reads/writes, and secret redaction. IPC sends request-scoped sanitized stream events (`start`, `token`, `done`, `error`, `cancelled`) to Renderer, while tools and Agent runtime stay disabled.

**Tech Stack:** Electron IPC/preload, React/Vite Renderer, Vitest, Node `fs/promises`, OpenAI-compatible Chat Completions SSE.

---

## Confirmed Phase 9 Baseline

- `src/electron/llmEnvLoader.js` loads `.env` from main/provider code only.
- `src/electron/llmProviderAdapter.js` has `sendLlmTextMessage` for non-streaming `/chat/completions`.
- `src/electron/mainProvider.js` has `sendAgentChatMessage` and keeps `runAgentChatDryMessage`.
- `src/electron/ipcChannels.js` exposes `llm.sendTextMessage` and `agentChat.sendMessage`.
- `tool.execute` remains `permission: "denied"` and `agent.sendMessage` remains `notImplemented`.
- Renderer code uses `dataProvider`/preload and existing safety tests scan direct Node/Electron imports.

## Assumptions

- `.env` remains at `D:\python_code\Electron\.env` in real use; tests inject temp env/config.
- This phase uses Chat Completions `stream: true` SSE chunks and extracts `choices[0].delta.content`.
- Persisted app session file is `userData/sessions/agent-chat-session.json`.
- The existing local `agent-chat/session.json` remains read-only fallback data.
- Session metadata may include provider/model/status/createdAt, but not API keys, headers, tokens, or raw env.

## File Structure

- Modify `src/electron/llmProviderAdapter.js`: add `streamLlmTextMessage`, SSE parsing, abort handling, sanitized stream events.
- Modify `src/electron/llmProviderAdapter.test.js`: cover token streaming, cancellation, missing provider/secret, and stream errors.
- Create `src/electron/agentChatSessionStore.js`: userData-only session path, load fallback, append/save sanitized messages.
- Create `src/electron/agentChatSessionStore.test.js`: cover userData writes and no secret persistence.
- Modify `src/electron/agentChatAdapter.js`: prefer userData session before local read-only fallback.
- Modify `src/electron/mainProvider.js`: wire `streamAgentChatMessage`, `cancelAgentChatStream`, and session persistence.
- Modify `src/electron/mainProvider.test.js`: cover streaming, cancellation, persistence, and no tool execution.
- Modify `src/electron/ipcChannels.js`, `src/electron/ipcHandlers.js`, `src/electron/desktopApiFactory.js`: add safe stream event channels and cancel channel.
- Modify matching IPC/preload tests: cover channel shape and event subscription cleanup.
- Modify `src/services/localProvider.js` and `src/services/mockProvider.js`: add stream/cancel wrappers and dry-run fallback.
- Modify `src/pages/AgentChat.jsx`: keep layout, add generating state, incremental assistant text, stop action, error merge.
- Modify `src/pages/AgentChat.test.jsx`: cover helper behavior for stream events, cancel, errors, and dry-run fallback.

## Task 1: Streaming LLM Adapter

- [ ] Write failing tests for mock SSE token streaming, cancellation, provider unconfigured, secret missing, and stream error events.
- [ ] Run `npm test -- src/electron/llmProviderAdapter.test.js` and confirm the new tests fail for missing stream support.
- [ ] Implement minimal `streamLlmTextMessage(input, options)` using injected `transport`, `AbortController`, `stream: true`, and `tool_choice: "none"`.
- [ ] Run `npm test -- src/electron/llmProviderAdapter.test.js` and confirm pass.

## Task 2: UserData Session Store

- [ ] Write failing tests for saving only under `userData/sessions/agent-chat-session.json`, loading userData before fallback, and redacting secrets.
- [ ] Run `npm test -- src/electron/agentChatSessionStore.test.js src/electron/agentChatAdapter.test.js` and confirm fail.
- [ ] Implement `agentChatSessionStore.js` and integrate userData-first loading in `getAgentChatData`.
- [ ] Run focused tests and confirm pass.

## Task 3: Main Provider And IPC Streaming

- [ ] Write failing tests for `agentChat.streamMessage`, `agentChat.cancelStream`, sanitized requestId events, event unsubscribe cleanup, and `tool.execute` still denied.
- [ ] Run focused IPC/provider tests and confirm fail.
- [ ] Implement requestId stream state in main provider and stream IPC event registration in desktop API.
- [ ] Run focused IPC/provider tests and confirm pass.

## Task 4: Agent Chat UI Data Behavior

- [ ] Write failing tests for stream event merge helpers: user message preserved, assistant bubble appends tokens, generating status, cancel, error recovery, no tools executed, and dry-run fallback.
- [ ] Run `npm test -- src/pages/AgentChat.test.jsx src/services/localProvider.test.js` and confirm fail.
- [ ] Implement helper-level and component-level stream/cancel behavior without changing layout/classes/pages.
- [ ] Run focused UI/provider tests and confirm pass.

## Task 5: Final Verification

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `npm run electron:smoke`.
- [ ] Run Renderer safety scan for direct Node/Electron imports.
- [ ] Use Browser/in-app browser for visual regression only: Agent Chat opens, streaming/fallback visible, cancel does not error, Settings drawer opens, Page Switcher has 8 cards and 8 radial nodes, console has no errors/warnings, and layout style remains intact.

## Self-Review

- Spec coverage: streaming adapter, IPC events, UI incremental text and cancel, userData-only session persistence, dry-run fallback, tool denial, Renderer safety, and final verification are covered.
- Placeholder scan: no deferred implementation placeholders.
- Type consistency: stream events use `requestId`, `type`, `text`, `token`, `status`, `error`, and sanitized `metadata` consistently.
