# Agent Context Builder Session Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a main-process Context Builder so Agent Chat LLM calls use recent session history, local/source summaries, and tool result summaries through a bounded, redacted, auditable prompt.

**Architecture:** Keep Renderer behind the existing preload/local provider boundary and preserve the Agent Chat three-column layout. Add a focused Electron-only `agentContextBuilder` that normalizes session, tool, knowledge, code, intel, and agent context into redacted LLM messages plus a compact context summary; wire `mainProvider` to build that context before non-streaming and streaming LLM calls; extend session persistence to save the context summary without secrets, headers, raw files, or absolute private paths.

**Tech Stack:** Electron main/provider layer, React/Vite renderer helpers, Vitest, existing OpenAI-compatible Chat Completions adapter, existing read-only local source adapters.

---

## Assumptions And Current Baseline

- Baseline verification before this plan: `npm test` passed with 56 test files and 206 tests.
- Existing completed capabilities include Settings local path config, read-only Knowledge Base / Code Repository / Intel Center loops, Agent Management / Agent Chat read-only session/config loading, LLM/secret/permission skeletons, dry-run messages, real non-streaming LLM calls, streaming/cancel/session persistence, and Tool-Augmented Agent MVP with Level 1 read-only approval/auto-allow execution.
- This phase does not add embedding/vector store, shell execution, write tools, local-intel startup, network collection, music playback, or automatic Agent runtime.
- `.env` remains main-process-only and is not read into Renderer or persisted output.
- This project path is not assumed to be a git repository, and this plan contains no commit/push/checkout/reset steps.

## Files

- Create: `src/electron/agentContextBuilder.js` for context normalization, redaction, budgeting, LLM message construction, and audit summary generation.
- Test: `src/electron/agentContextBuilder.test.js` for history inclusion, budget trimming, source tracking, tool summary inclusion, secret/path redaction, and current-message retention.
- Modify: `src/electron/llmProviderAdapter.js` to accept prebuilt `messages` from the main/provider layer while preserving the existing fallback message builder.
- Modify: `src/electron/llmProviderAdapter.test.js` to prove prebuilt messages are sent and sanitized fallback behavior remains.
- Modify: `src/electron/mainProvider.js` to build context before LLM calls and return/persist `contextSummary` for success and LLM failure after tools.
- Modify: `src/electron/mainProvider.test.js` to prove session history reaches LLM input, tool summaries enter the prompt through Context Builder, failures still preserve summaries, and unsafe data is redacted.
- Modify: `src/electron/agentChatSessionStore.js` to persist sanitized `contextSummary`.
- Modify: `src/electron/agentChatSessionStore.test.js` to prove `contextSummary` is saved and unsafe metadata is excluded.
- Modify: `src/pages/AgentChat.jsx` to surface compact context/memory summary rows in the existing left Context panel without changing layout.
- Modify: `src/pages/AgentChat.test.jsx` to prove context summary rows merge into existing Context panel helpers without leaking secrets.
- Keep: IPC/preload surface and `src/services/localProvider.js` unchanged unless an existing method contract needs a returned-field pass-through.

## Tasks

### Task 1: Context Builder Contract

- [ ] **Step 1: Write failing tests**

Add `src/electron/agentContextBuilder.test.js` covering:

- recent user/assistant session messages are included in order.
- current user message is always retained.
- old history is trimmed first when `maxMessages` or `maxChars` is exceeded.
- tool result summaries enter final LLM prompt as explicit `tool` context.
- context summary records source types and trimmed counts.
- `apiKey`, `token`, `secret`, `Authorization: Bearer`, `sk-*`, and Windows absolute paths are redacted.

Run: `npm test -- src/electron/agentContextBuilder.test.js`
Expected: fail because `agentContextBuilder.js` does not exist.

- [ ] **Step 2: Implement minimal builder**

Create:

- `redactContextText(value)`
- `buildAgentLlmContext(input, limits)`

The builder returns:

- `messages`: Chat Completions-compatible `{ role, content }[]`.
- `contextSummary`: compact audit object containing `usedHistoryCount`, `usedContextItems`, `usedToolResults`, `trimmed`, `providerMetadata`, and `limits`.

Priority order when over budget:

1. system instructions
2. explicit tool result summaries
3. recent session history
4. local source summaries
5. current user message, always retained as the final user message

- [ ] **Step 3: Verify green**

Run: `npm test -- src/electron/agentContextBuilder.test.js`
Expected: pass.

### Task 2: LLM Adapter Message Plumbing

- [ ] **Step 1: Write failing tests**

Update `src/electron/llmProviderAdapter.test.js` to prove:

- when `input.messages` is provided, the request body uses those messages.
- unsafe content in model response/events is still redacted.
- when `input.messages` is absent, the current fallback `Context Pack Summary` behavior still works.

Run: `npm test -- src/electron/llmProviderAdapter.test.js`
Expected: fail because the adapter currently always calls its internal message builder.

- [ ] **Step 2: Implement minimal adapter support**

Add a small `resolveTextMessages(input)` helper:

- accepts only arrays of objects with role `system`, `user`, or `assistant`.
- redacts and trims each content string.
- falls back to the existing `buildTextMessages(input)` when no valid prebuilt messages exist.

- [ ] **Step 3: Verify green**

Run: `npm test -- src/electron/llmProviderAdapter.test.js`
Expected: pass.

### Task 3: Main Provider Context Flow

- [ ] **Step 1: Write failing tests**

Update `src/electron/mainProvider.test.js` to prove:

- an existing persisted session's recent messages are included in the LLM client input.
- the current user message appears even under a tiny context budget.
- approved tool result summaries enter the LLM input through `messages`, not ad hoc prompt strings.
- returned result includes `contextSummary`.
- LLM failure after tool execution still returns `contextSummary` and `toolResultsSummary`.
- provider/model metadata in `contextSummary` is redacted and does not include API keys or headers.

Run: `npm test -- src/electron/mainProvider.test.js`
Expected: fail because current provider passes only `contextPack` and `toolResultsSummary`, not built messages/context summary.

- [ ] **Step 2: Wire builder into non-stream and stream paths**

In `sendAgentChatMessage` and `streamAgentChatMessage`:

- build context after the tool loop and before the LLM call.
- use the current `agentChat` session snapshot as history.
- pass `messages` into `sendLlmTextMessage` / `streamLlmTextMessage`.
- attach `contextSummary` to success and tool+LLM-error results.
- persist `contextSummary` with the turn.

- [ ] **Step 3: Verify green**

Run: `npm test -- src/electron/mainProvider.test.js`
Expected: pass.

### Task 4: Session Persistence Audit Summary

- [ ] **Step 1: Write failing tests**

Update `src/electron/agentChatSessionStore.test.js` to prove:

- persisted session includes compact `contextSummary`.
- `contextSummary` includes used source types and trimmed counts.
- persisted session excludes `apiKey`, `token`, `secret`, `Authorization`, request headers, `sk-*`, and raw Windows absolute paths.

Run: `npm test -- src/electron/agentChatSessionStore.test.js`
Expected: fail because `contextSummary` is currently dropped.

- [ ] **Step 2: Extend sanitizer**

Add `sanitizeContextSummary(summary)` and include it in `normalizeSession`.
Only persist counts, source types, titles/labels, statuses, redacted provider/model metadata, and trimmed counters.

- [ ] **Step 3: Verify green**

Run: `npm test -- src/electron/agentChatSessionStore.test.js`
Expected: pass.

### Task 5: Renderer Light Context Display

- [ ] **Step 1: Write failing tests**

Update `src/pages/AgentChat.test.jsx` to prove:

- `getContextRows` can include compact context-summary rows.
- memory/context summary rows do not expose secret-like text or raw Windows paths.
- existing context rows, tool timeline rows, streaming/cancel helper behavior, and auto-allow UI helper behavior stay intact.

Run: `npm test -- src/pages/AgentChat.test.jsx src/rendererSafety.test.js`
Expected: fail until the helper includes context summary data.

- [ ] **Step 2: Implement minimal helper/UI pass-through**

Keep the three-column layout. In the existing Context panel, show current `contextItems` plus compact `sendResult.contextSummary` rows. Add a tiny status string such as `memory/context used` using existing `settings-save-state` styling. Do not add pages, move Settings, or import Node/Electron in Renderer.

- [ ] **Step 3: Verify green**

Run: `npm test -- src/pages/AgentChat.test.jsx src/rendererSafety.test.js`
Expected: pass.

### Task 6: Regression Safety

- [ ] Run targeted tool tests:

`npm test -- src/electron/agentToolRegistry.test.js src/electron/agentToolPlanner.test.js src/electron/agentToolOrchestrator.test.js`

Expected: Level 1 approval/auto-allow behavior passes and Level 2/3/4 execution remains denied.

- [ ] Run targeted streaming/session tests:

`npm test -- src/electron/llmProviderAdapter.test.js src/electron/mainProvider.test.js src/electron/agentChatSessionStore.test.js src/pages/AgentChat.test.jsx src/rendererSafety.test.js`

Expected: streaming/cancel, dry-run fallback, persistence, context summary, and renderer boundary tests pass.

### Task 7: Full Verification

- [ ] Run: `npm test`
  Expected: all tests pass.
- [ ] Run: `npm run build`
  Expected: Vite build exits with code `0`.
- [ ] Run: `npm run electron:smoke`
  Expected: Electron smoke exits with code `0`.
- [ ] Browser visual regression check only:
  - Agent Chat opens.
  - historical messages influence a later mocked/real reply path.
  - approved or auto-allowed Level 1 tool results remain in final summary context.
  - pending / approve / auto-allow Level 1 controls remain visible and usable.
  - cancel/stop does not throw.
  - Settings opens as overlay.
  - Page Switcher still has 8 cards and RadialWheel has 8 circular nodes.
  - browser console has no error or warning.
  - layout and visual style do not regress.

## Self-Review

- Spec coverage: covers Context Builder, session history in LLM, source/tool audit summary, tool coordination, light UI, session persistence, and verification.
- Scope exclusions: no embedding/vector store, no shell/write/network tools, no local-intel startup, no music playback, no page/layout redesign.
- Placeholder scan: no TBD/TODO/fill-later markers.
- Type consistency: `messages`, `contextSummary`, `toolResultsSummary`, and `providerMetadata` names match existing provider/session naming.
