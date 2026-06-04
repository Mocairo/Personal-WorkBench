# Agent Chat Dry-Run Phase 8 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a non-executing Agent Chat dry-run flow that previews the draft message, context pack, tool plan, permissions, and mock assistant response.

**Architecture:** Renderer keeps using `dataProvider` and never touches Node/Electron APIs. Main/preload expose new `window.api.agentChat.*` preview methods through shared IPC constants. The dry-run adapter builds small, redacted previews from existing read-only provider data and never calls a real LLM, executes tools, starts runtime, or writes business-source files.

**Tech Stack:** Electron preload IPC, React, Vitest, existing mock/local data provider pattern.

---

### Task 1: Dry-Run Contracts

**Files:**
- Create: `src/shared/agentDryRunContracts.js`
- Test: `src/shared/agentDryRunContracts.test.js`

- [ ] Write tests for `buildAgentDraftMessage`, `buildAgentContextPack`, `buildPromptPreview`, `buildToolPlanPreview`, `buildPermissionPreview`, `buildDryRunAssistantResponse`, and `buildAgentDryRunResult`.
- [ ] Verify red with `npm test -- src/shared/agentDryRunContracts.test.js`.
- [ ] Implement contract builders with secret/path redaction and hard limits.
- [ ] Verify green with `npm test -- src/shared/agentDryRunContracts.test.js`.

### Task 2: Main Adapter

**Files:**
- Create: `src/electron/agentDryRunAdapter.js`
- Test: `src/electron/agentDryRunAdapter.test.js`

- [ ] Test that `prepareMessageDraft` creates a stable sanitized draft.
- [ ] Test that `previewContextPack` uses only summarized KB, repo, intel, and agent data.
- [ ] Test that `previewToolPlan` marks read-only tools as allowed and write/shell/network/model tools as approval/denied.
- [ ] Test that `runDryMessage` returns mock response and never calls injected LLM/tool executors.
- [ ] Verify red with `npm test -- src/electron/agentDryRunAdapter.test.js`.
- [ ] Implement adapter using provider callbacks only; no writes and no external calls.
- [ ] Verify green with `npm test -- src/electron/agentDryRunAdapter.test.js`.

### Task 3: IPC And Providers

**Files:**
- Modify: `src/electron/ipcChannels.js`
- Modify: `src/electron/mainProvider.js`
- Modify: `src/services/localProvider.js`
- Modify: `src/services/mockProvider.js`
- Test: `src/electron/ipcChannels.test.js`
- Test: `src/electron/ipcHandlers.test.js`
- Test: `src/electron/desktopApiFactory.test.js`
- Test: `src/electron/mainProvider.test.js`
- Test: `src/services/localProvider.test.js`
- Test: `src/services/dataProvider.test.js`

- [ ] Add red tests for `agentChat.prepareMessageDraft`, `agentChat.previewContextPack`, `agentChat.previewToolPlan`, and `agentChat.runDryMessage`.
- [ ] Keep `agent.sendMessage`, `llm.sendMessage`, and `tool.execute` non-executing.
- [ ] Implement provider methods and fallback mock methods.
- [ ] Verify focused provider tests pass.

### Task 4: Agent Chat UI Hookup

**Files:**
- Modify: `src/pages/AgentChat.jsx`
- Test: `src/pages/AgentChat.test.jsx`

- [ ] Test that the composer can accept text and that send triggers dry-run without enabling real send.
- [ ] Test that dry-run results append a user draft and mock assistant preview.
- [ ] Test that context panel and tool timeline render dry-run context/tool plan.
- [ ] Implement local React state and call `dataProvider.runAgentChatDryMessage`.
- [ ] Keep layout classes and page structure unchanged.

### Task 5: Verification

**Commands:**
- `npm test`
- `npm run build`
- `npm run electron:smoke`

**Browser checks:**
- Home opens.
- Agent Chat opens.
- Composer accepts text and dry-run updates chat/context/timeline.
- Settings overlay opens.
- Page Switcher keeps 8 cards and 8 radial nodes.
- Browser console has no warn/error.

**Desktop note:** Treat Electron smoke as the primary desktop safety check for preload/API behavior; Browser is only used for visual regression.
