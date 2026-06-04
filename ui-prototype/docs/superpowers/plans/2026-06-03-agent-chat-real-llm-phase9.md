# Agent Chat Real LLM Phase 9 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development and superpowers:verification-before-completion to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the smallest main-process-only, non-streaming LLM text reply path for Agent Chat.

**Architecture:** Keep Renderer on preload/local provider APIs. Load `.env` only from the Electron main layer, resolve provider/model/base URL/API key there, call an OpenAI-compatible `/chat/completions` endpoint through an injectable transport, and return only assistant text plus masked metadata. Agent Chat keeps the current layout and appends either a real text reply or a clear local error while dry-run remains available.

**Tech Stack:** Electron IPC/preload, React/Vite Renderer, Vitest, Node `fs/promises`, OpenAI-compatible Chat Completions JSON.

---

## Assumptions

- The `.env` file lives at `D:\python_code\Electron\.env`; tests may pass a temporary `envPath` so no real secret is read.
- `process.env` values override file values.
- `LLM_PROVIDER` may default to `openai` only when a model or secret is present. If no provider/model/secret exists, status is `unconfigured`.
- This phase uses non-streaming text only. No tool definitions are sent, no tool execution path is called, and no Agent runtime starts.

## File Structure

- Create `src/electron/llmEnvLoader.js`: main-only `.env` parser and LLM config resolver.
- Modify `src/electron/llmProviderAdapter.js`: provider status, model listing, non-streaming text call, masked metadata, error normalization.
- Modify `src/electron/mainProvider.js`: expose `sendLlmTextMessage` and `sendAgentChatMessage`.
- Modify `src/electron/ipcChannels.js`: add `llm.sendTextMessage` and `agentChat.sendMessage`; keep `agent.sendMessage` not implemented and `tool.execute` denied.
- Modify `src/services/localProvider.js` and `src/services/mockProvider.js`: renderer-side API wrappers and mock fallback.
- Modify `src/pages/AgentChat.jsx`: data-only submit behavior; keep layout and classes.
- Update focused tests beside those files plus `src/rendererSafety.test.js` coverage through existing scan.

## Task 1: Main-Only Env Loader

**Files:**
- Create: `D:\python_code\Electron\ui-prototype\src\electron\llmEnvLoader.js`
- Test: `D:\python_code\Electron\ui-prototype\src\electron\llmEnvLoader.test.js`

- [ ] **Step 1: Write failing tests**

Cover reading `LLM_PROVIDER`, `LLM_MODEL`, `OPENAI_API_KEY`, and `OPENAI_BASE_URL` from a parent-style `.env` path, `process.env` overrides, missing `.env` returning unconfigured/missing secret status, and no API key leakage in returned public config.

Run: `npm test -- src/electron/llmEnvLoader.test.js`
Expected: FAIL because `llmEnvLoader.js` is not implemented.

- [ ] **Step 2: Implement minimal env loader**

Parse simple `KEY=value` lines, merge process overrides, default base URL to `https://api.openai.com/v1`, expose a private config with `apiKey`, and expose public status through existing LLM security builders.

- [ ] **Step 3: Verify focused tests**

Run: `npm test -- src/electron/llmEnvLoader.test.js`
Expected: PASS.

## Task 2: LLM Provider Adapter

**Files:**
- Modify: `D:\python_code\Electron\ui-prototype\src\electron\llmProviderAdapter.js`
- Test: `D:\python_code\Electron\ui-prototype\src\electron\llmProviderAdapter.test.js`

- [ ] **Step 1: Write failing tests**

Cover unconfigured provider not calling transport, missing secret not calling transport, OpenAI-compatible non-streaming send returning assistant text, API/network errors returning ApiResult-shaped errors, and fake key never appearing in public data.

Run: `npm test -- src/electron/llmProviderAdapter.test.js`
Expected: FAIL because sendTextMessage and env-backed config are missing.

- [ ] **Step 2: Implement minimal adapter**

Use injected `transport` or global `fetch`, POST to `${baseUrl}/chat/completions`, pass `model`, `messages`, `stream:false`, and `tool_choice:"none"`, then return `{ text, role:"assistant", metadata }`. Do not log or return `apiKey`.

- [ ] **Step 3: Verify focused tests**

Run: `npm test -- src/electron/llmProviderAdapter.test.js`
Expected: PASS.

## Task 3: IPC And Provider Wiring

**Files:**
- Modify: `D:\python_code\Electron\ui-prototype\src\electron\ipcChannels.js`
- Modify: `D:\python_code\Electron\ui-prototype\src\electron\ipcHandlers.test.js`
- Modify: `D:\python_code\Electron\ui-prototype\src\electron\desktopApiFactory.test.js`
- Modify: `D:\python_code\Electron\ui-prototype\src\electron\mainProvider.js`
- Modify: `D:\python_code\Electron\ui-prototype\src\services\localProvider.js`
- Modify: `D:\python_code\Electron\ui-prototype\src\services\mockProvider.js`
- Tests: matching existing test files

- [ ] **Step 1: Write failing tests**

Assert `llm.sendTextMessage` maps to `llm:message:sendText`, `agentChat.sendMessage` maps to `agentChat:message:send`, localProvider unwraps both, mainProvider calls LLM text without tool execution, and `tool.execute` remains denied.

Run: `npm test -- src/electron/ipcChannels.test.js src/electron/ipcHandlers.test.js src/electron/desktopApiFactory.test.js src/electron/mainProvider.test.js src/services/localProvider.test.js`
Expected: FAIL because new provider methods and channels are missing.

- [ ] **Step 2: Implement minimal wiring**

Remove the not-implemented gate from the LLM text channel only. Keep legacy `llm.sendMessage` as compatibility if present, keep `agent.sendMessage` not implemented, and add `agentChat.sendMessage` as the UI's safe text-only path.

- [ ] **Step 3: Verify focused tests**

Run: `npm test -- src/electron/ipcChannels.test.js src/electron/ipcHandlers.test.js src/electron/desktopApiFactory.test.js src/electron/mainProvider.test.js src/services/localProvider.test.js`
Expected: PASS.

## Task 4: Agent Chat Data Binding

**Files:**
- Modify: `D:\python_code\Electron\ui-prototype\src\pages\AgentChat.jsx`
- Test: `D:\python_code\Electron\ui-prototype\src\pages\AgentChat.test.jsx`

- [ ] **Step 1: Write failing tests**

Assert configured provider enables real send, real replies merge into chat with `no tools executed`, dry-run merge still works, and error results produce a non-crashing status message.

Run: `npm test -- src/pages/AgentChat.test.jsx`
Expected: FAIL because real-send helpers are missing.

- [ ] **Step 2: Implement data-only UI behavior**

Keep the current panels, controls, icons, and classes. Change submit to prefer real send when ready, fall back to dry-run when unconfigured/missing secret, and keep dry-run available.

- [ ] **Step 3: Verify focused tests**

Run: `npm test -- src/pages/AgentChat.test.jsx`
Expected: PASS.

## Task 5: Final Verification

- [ ] Run `npm test`
- [ ] Run `npm run build`
- [ ] Run `npm run electron:smoke`
- [ ] Run renderer safety scan: `rg -n "node:|fs/promises|child_process|sqlite|process\.|electron" src --glob "!src/electron/**" --glob "!**/*.test.js" --glob "!**/*.test.jsx"`
- [ ] Use Browser only for visual regression at `http://127.0.0.1:5175/`: Agent Chat opens, dry-run still works, provider status is visible, Settings drawer shows masked provider/secret status, Page Switcher has 8 cards and 8 radial nodes, console has no errors/warnings, and UI layout remains intact.

## Self-Review

- Spec coverage: main-only env loading, OpenAI-compatible non-streaming text call, IPC/preload/local provider, Agent Chat data binding, secret masking, no tools/runtime, fallback and error states, and final verification are covered.
- Placeholder scan: no deferred implementation placeholders.
- Type consistency: `sendTextMessage`, `sendAgentChatMessage`, provider status, and metadata names are used consistently.
