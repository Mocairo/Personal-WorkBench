# Tool-Augmented Agent MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe Agent Chat loop where approved Level 1 read-only tool results are summarized by the LLM and saved into the local userData session timeline.

**Architecture:** Keep the renderer layout intact and move all tool registration, validation, execution, sanitization, and persistence into the Electron/main-process provider layer. Agent Chat will ask the provider for a tool-augmented message result; the provider will plan tools locally or from structured LLM text, gate execution by decision policy, run only registered Level 1 provider methods, pass a compact sanitized summary into the second LLM call, and persist only redacted session records.

**Tech Stack:** Electron main/preload IPC, React/Vite renderer, Vitest, existing OpenAI-compatible Chat Completions adapter, existing read-only local providers.

---

## Assumptions And Non-Goals

- This phase does not add shell, git, writer, network collection, local-intel runtime start, or Level 2+ execution capability.
- OpenAI API usage stays on the existing `sendLlmTextMessage` / `streamLlmTextMessage` provider contract. Structured plans are parsed from model text when present; otherwise the local planner handles intent.
- `npm run electron:smoke` is a development verification command, not an app-exposed shell tool.
- This project path is not a git repository, so no commit steps are included.

## Files

- Create: `src/electron/agentToolRegistry.js` for registered tool definitions, argument validation, result sanitization, and execution formatting.
- Create: `src/electron/agentToolPlanner.js` for dry-run/mock and structured/model tool-plan parsing plus local keyword intent extraction.
- Create: `src/electron/agentToolOrchestrator.js` for approval policy, tool execution, summary prompt input, and timeline events.
- Modify: `src/electron/mainProvider.js` to call the orchestrator from Agent Chat send/stream flows and persist tool events.
- Modify: `src/electron/agentChatSessionStore.js` to persist sanitized tool plans, decisions, result summaries, final answer metadata, and timestamps.
- Modify: `src/pages/AgentChat.jsx` to display planned/running/completed/denied/error timeline rows, context summaries, one-shot approve controls, and an auto-allow Level 1 toggle without changing the page layout.
- Modify: `src/services/localProvider.js`, `src/electron/ipcChannels.js`, and `src/electron/desktopApiFactory.js` only if a small IPC method is needed for explicit tool approval.
- Test: `src/electron/agentToolRegistry.test.js`, `src/electron/agentToolPlanner.test.js`, `src/electron/agentToolOrchestrator.test.js`, updates to `src/electron/mainProvider.test.js`, `src/electron/agentChatSessionStore.test.js`, `src/pages/AgentChat.test.jsx`, and `src/rendererSafety.test.js`.

## Tasks

### Task 1: Registry And Sanitizer

- [ ] **Step 1: Write failing tests**

Add tests proving:

- unknown tool IDs return denied events and never call a provider method.
- Level 2/3/4 definitions are never executable even if present in a plan.
- all allowed tool results are redacted for `apiKey`, `token`, `secret`, bearer auth, `sk-*`, and Windows absolute paths.
- all results are capped by `maxResultItems` and `maxResultChars`.

Run: `npm test -- src/electron/agentToolRegistry.test.js`
Expected: fail because the module does not exist.

- [ ] **Step 2: Implement minimal registry**

Register only:

- `kb.searchLocal`
- `kb.getDocumentPreview`
- `codeRepo.listFiles`
- `codeRepo.getGitSummary`
- `codeRepo.getMetrics`
- `intel.listReports`
- `intel.listLogs`
- `agent.listAgents`
- `agent.listSessions`

Each entry includes `toolId`, `label`, `permissionLevel: 1`, `validateArgs`, `providerMethod`, `maxResultItems`, `maxResultChars`, and `sanitizeResult`.

- [ ] **Step 3: Verify green**

Run: `npm test -- src/electron/agentToolRegistry.test.js`
Expected: pass.

### Task 2: Planner

- [ ] **Step 1: Write failing tests**

Add tests proving:

- structured JSON text with `toolPlan.items` parses registered tool IDs and args.
- dry-run/mock plan items map to registered IDs where possible.
- local planner maps user intent such as “search docs”, “show repo files”, “git summary”, “intel logs”, “list agents”, and “sessions” to registered tools.
- unregistered, write, shell, git mutation, network, and local-intel runtime intents are represented as denied events.

Run: `npm test -- src/electron/agentToolPlanner.test.js`
Expected: fail because planner module does not exist.

- [ ] **Step 2: Implement minimal parser/planner**

Prefer structured plan items when valid. If missing or unusable, infer a short plan from sanitized user text. Never invent Level 2+ execution.

- [ ] **Step 3: Verify green**

Run: `npm test -- src/electron/agentToolPlanner.test.js`
Expected: pass.

### Task 3: Orchestrator And Approval Policy

- [ ] **Step 1: Write failing tests**

Add tests proving:

- Level 1 planned tools remain pending when neither `approvedToolIds` nor `autoAllowLevel1ReadOnly` is present.
- approving one executes only that tool.
- approving all Level 1 executes all Level 1 tools.
- auto-allow executes Level 1 only for the current request/session input.
- Level 2/3/4 plans stay denied under every policy.
- provider errors return error events and do not throw to the page.
- summaries passed to the LLM include tool result summaries and exclude secrets and absolute paths.

Run: `npm test -- src/electron/agentToolOrchestrator.test.js`
Expected: fail because orchestrator module does not exist.

- [ ] **Step 2: Implement orchestrator**

Build `runAgentToolLoop({ draft, contextPack, provider, llmClient, toolPolicy })`. It returns `toolPlan`, `toolDecisions`, `toolResultsSummary`, `contextItems`, `timelineEvents`, and `summaryLlmInput`. It never calls any provider method outside the registry.

- [ ] **Step 3: Verify green**

Run: `npm test -- src/electron/agentToolOrchestrator.test.js`
Expected: pass.

### Task 4: Main Provider Agent Chat Flow

- [ ] **Step 1: Write failing tests**

Update `src/electron/mainProvider.test.js` to prove:

- pending tools are returned without execution when not approved.
- approved or auto-allowed Level 1 tools run and their summaries are included in the second LLM prompt.
- LLM failure after tool execution still returns tool result summaries and an error-status assistant message.
- persisted userData session includes user message, tool plan, decisions, result summaries, final answer, timestamps, and sanitized provider/model metadata.
- persisted session excludes API key, token, secret, request headers, and large full file contents.

Run: `npm test -- src/electron/mainProvider.test.js`
Expected: fail against current no-tool behavior.

- [ ] **Step 2: Wire send/stream**

Use the same provider methods for non-stream and stream. For streaming, keep the first LLM streaming behavior intact for normal text responses and return tool-augmented final results through the existing result merge. If tool execution is needed before a final answer, emit concise status events and preserve cancellation for active streams.

- [ ] **Step 3: Verify green**

Run: `npm test -- src/electron/mainProvider.test.js`
Expected: pass.

### Task 5: Session Store

- [ ] **Step 1: Write failing tests**

Update `src/electron/agentChatSessionStore.test.js` to assert sanitized persisted fields for `toolPlan`, `toolDecisions`, `toolResultsSummary`, `toolCalls`, `finalAnswer`, timestamps, and metadata.

Run: `npm test -- src/electron/agentChatSessionStore.test.js`
Expected: fail because extra fields are currently dropped.

- [ ] **Step 2: Extend sanitizer**

Persist compact event objects only. Reuse the existing redaction rules and cap text fields.

- [ ] **Step 3: Verify green**

Run: `npm test -- src/electron/agentChatSessionStore.test.js`
Expected: pass.

### Task 6: Renderer Light Enhancement

- [ ] **Step 1: Write failing tests**

Update `src/pages/AgentChat.test.jsx` to prove helper functions:

- preserve timeline states `planned`, `running`, `completed`, `denied`, `error`, and `pending`.
- expose tool result summaries as context rows.
- expose an auto-allow Level 1 toggle state without enabling Level 2+ execution.
- merge tool-augmented results without leaking secrets.

Run: `npm test -- src/pages/AgentChat.test.jsx src/rendererSafety.test.js`
Expected: fail until helpers are updated.

- [ ] **Step 2: Implement small UI changes**

Keep the current three-column layout. Add a compact checkbox/toggle in the composer actions area and small approve buttons in existing timeline rows. Do not add or remove primary pages, do not move Settings out of the overlay, and do not import Node/Electron into renderer code.

- [ ] **Step 3: Verify green**

Run: `npm test -- src/pages/AgentChat.test.jsx src/rendererSafety.test.js`
Expected: pass.

### Task 7: Full Verification

- [ ] Run: `npm test`
  Expected: all tests pass.
- [ ] Run: `npm run build`
  Expected: Vite build exits with code `0`.
- [ ] Run: `npm run electron:smoke`
  Expected: smoke test exits with code `0`.
- [ ] Browser visual regression check only:
  - Agent Chat opens.
  - Streaming reply path still responds.
  - Tool plan appears.
  - approve executes a read-only tool.
  - auto-allow Level 1 executes Level 1 only.
  - tool result summary is represented in final answer/context.
  - Settings opens as overlay.
  - Page Switcher still has 8 cards and 8 radial nodes.
  - console has no error/warning.
  - visual style/layout has no regression.
