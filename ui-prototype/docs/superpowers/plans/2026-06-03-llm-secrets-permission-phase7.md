# LLM Secrets Permission Phase 7 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development while implementing this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe LLM provider, secret status, permission approval, and tool dry-run skeletons without calling real models, sending messages, executing tools, or starting Agent runtime.

**Architecture:** Keep Renderer on the existing `usePageData -> dataProvider -> localProvider/window.api` route. Add contract builders in `src/shared`, safe local skeleton adapters in `src/electron`, centralized IPC methods in `ipcChannels.js`, and lightweight UI binding in the existing Settings, Agent Chat, and Agent Management surfaces.

**Tech Stack:** Electron preload IPC, React, Vitest, Node runtime only in `src/electron`.

---

### Task 1: LLM / Secret / Permission Contracts

**Files:**
- Create: `src/shared/llmSecurityContracts.js`
- Test: `src/shared/llmSecurityContracts.test.js`

- [ ] Define builders for `LlmProviderProfile`, `LlmModelProfile`, `SecretRef`, `SecretStatus`, `PermissionRequest`, `PermissionDecision`, `ToolExecutionPolicy`, and `DryRunResult`.
- [ ] Redact API key, token, password, authorization, and `sk-*` text from every renderer-facing field.
- [ ] Normalize `status`, `permissionLevel`, `requiresApproval`, `hasSecret`, `secretHint`, `message`, and `updatedAt`.

### Task 2: Local Skeleton Adapters

**Files:**
- Create: `src/electron/llmProviderAdapter.js`
- Create: `src/electron/permissionAdapter.js`
- Test: `src/electron/llmProviderAdapter.test.js`
- Test: `src/electron/permissionAdapter.test.js`

- [ ] `llmProviderAdapter` returns provider/model/secret status only, validates config as dry-run only, and never requests remote APIs.
- [ ] `permissionAdapter` lists pending-safe requests, evaluates Level 0/1 as allowed dry-run, Level 2 as approval required, Level 3/4 as denied, and never executes tools.
- [ ] Dangerous execution methods return data suitable for `PERMISSION_DENIED` or `NOT_IMPLEMENTED`.

### Task 3: IPC and Provider Wiring

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

- [ ] Add `llm.listProviders`, `llm.listModels`, `llm.getProviderStatus`, `llm.validateProviderConfig`, and `llm.sendMessage`.
- [ ] Add `permission.listRequests`, `permission.evaluateToolRequest`, `permission.decideRequest`.
- [ ] Add `tool.dryRun` and `tool.execute`.
- [ ] Keep `llm.sendMessage`, `permission.decideRequest`, and `tool.execute` as `NOT_IMPLEMENTED` or `PERMISSION_DENIED`.

### Task 4: Settings and Agent Page Binding

**Files:**
- Modify: `src/pages/Settings.jsx`
- Modify: `src/pages/AgentChat.jsx`
- Modify: `src/pages/AgentManagement.jsx`
- Test: `src/pages/Settings.test.jsx`
- Test: `src/pages/AgentChat.test.jsx`
- Test: `src/pages/AgentManagement.test.jsx`

- [ ] Settings shows provider/model/secret status with masked hints only.
- [ ] Agent Chat shows provider readiness and permission/dry-run status without sending.
- [ ] Agent Management cards and policy matrix prefer local provider/model/permission status when present.
- [ ] Preserve current layout classes and visual structure.

### Task 5: Final Verification

- [ ] Run focused Phase 7 tests.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `npm run electron:smoke`.
- [ ] Use Browser/in-app browser only for visual regression: Home, Settings overlay, Agent Chat, Agent Management, Page Switcher 8 cards, RadialWheel 8 nodes, console no warn/error.
