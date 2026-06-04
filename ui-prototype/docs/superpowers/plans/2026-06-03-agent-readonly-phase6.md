# Agent Readonly Phase 6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development while implementing this plan. Keep UI structure and visual styling unchanged.

**Goal:** Connect Agent Management and Agent Chat to local read-only agent configuration and saved session files without enabling LLM calls, message sending, tool execution, or agent runtime startup.

**Architecture:** Keep Renderer on the existing `usePageData -> dataProvider -> localProvider/window.api` path. Add focused Agent contract builders in `src/shared`, enhance the Electron-only adapters to read bounded JSON data, and expose only sanitized summaries through existing IPC/provider methods.

**Tech Stack:** Electron preload IPC, React, Vitest, Node `fs/promises` only in `src/electron`.

---

### Task 1: Agent Data Contracts

**Files:**
- Create: `src/shared/agentContracts.js`
- Test: `src/shared/agentContracts.test.js`

- [ ] Define normalized contract builders for Agent profiles, policies, tool bindings, runtime status, sessions, chat messages, tool calls, context items, and model profiles.
- [ ] Redact token/API key/secret/password-like values from returned text.
- [ ] Preserve UI-compatible fields such as `tools`, `toolList`, `model`, `permission`, `lastRun`, `state`, `text`, `title`, and `meta`.

### Task 2: Read-Only Agent Adapters

**Files:**
- Modify: `src/electron/agentManagementAdapter.js`
- Modify: `src/electron/agentChatAdapter.js`
- Test: `src/electron/agentManagementAdapter.test.js`
- Test: `src/electron/agentChatAdapter.test.js`

- [ ] Read `agents.json` and `session.json` as JSON only.
- [ ] Return safe `unconfigured` data when files are missing.
- [ ] Return safe `error` provider/session status when JSON is malformed.
- [ ] Do not expose secrets, absolute privacy paths, system prompts, or raw provider credentials.
- [ ] Do not write files, execute tools, send messages, or start runtimes.

### Task 3: Provider and IPC Wiring

**Files:**
- Modify: `src/electron/mainProvider.js`
- Modify: `src/electron/ipcChannels.js` only if required
- Modify: `src/services/localProvider.js`
- Test: `src/electron/mainProvider.test.js`
- Test: `src/electron/ipcHandlers.test.js`
- Test: `src/electron/ipcChannels.test.js`
- Test: `src/services/localProvider.test.js`
- Test: `src/services/dataProvider.test.js`

- [ ] Keep existing `agent.listAgents`, `agent.listSessions`, `agentChat.getAgentChat`, and `agentManagement.getAgentManagement` paths.
- [ ] Keep `agent.sendMessage` as `NOT_IMPLEMENTED`.
- [ ] Preserve fallback to `mockProvider` when `window.api` is unavailable.

### Task 4: Page Data Binding

**Files:**
- Modify: `src/pages/AgentManagement.jsx`
- Modify: `src/pages/AgentChat.jsx`

- [ ] Keep current layouts and classes.
- [ ] Prefer real agent tools, permissions, model, runtime state, and last run over decorative fallback data.
- [ ] Prefer real session messages, context metadata, and tool-call timeline fields over decorative fallback data.
- [ ] Keep send UI inert; no real message execution.

### Task 5: Final Verification

- [ ] Run focused tests for Agent contracts/adapters/provider.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `npm run electron:smoke`.
- [ ] Use Browser/in-app browser only for visual regression: Home, Agent Management, Agent Chat, Settings overlay, Page Switcher, RadialWheel, console.
