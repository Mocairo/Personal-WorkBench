# Local Intel Reports Readonly Phase 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect Intel Center to a configured local-intel workspace with read-only reports, logs, status, and source-health summaries.

**Architecture:** Keep Renderer on the existing `usePageData -> dataProvider -> localProvider/window.api` path. Add focused Intel contract builders in `src/shared`, enhance `src/electron/localIntelAdapter.js` to perform bounded read-only filesystem inspection, then expose only structured summaries through IPC/provider methods.

**Tech Stack:** Electron preload IPC, React, Vitest, Node `fs/promises` only in `src/electron`.

---

### Task 1: Intel Data Contracts

**Files:**
- Create: `src/shared/intelContracts.js`
- Test: `src/shared/intelContracts.test.js`

- [ ] **Step 1: Write failing contract tests**

Run: `npm test -- src/shared/intelContracts.test.js`
Expected: FAIL because `src/shared/intelContracts.js` does not exist yet.

- [ ] **Step 2: Implement builders**

Create builders for:
- `buildIntelWorkspaceStatus`
- `buildIntelSourceHealth`
- `buildIntelReport`
- `buildIntelCollectionStatus`
- `buildIntelLogEntry`
- `buildIntelDashboardSummary`

- [ ] **Step 3: Verify contracts**

Run: `npm test -- src/shared/intelContracts.test.js`
Expected: PASS.

### Task 2: Read-Only local-intel Adapter

**Files:**
- Modify: `src/electron/localIntelAdapter.js`
- Test: `src/electron/localIntelAdapter.test.js`

- [ ] **Step 1: Write failing adapter tests**

Cover:
- missing workspace returns safe empty/missing states
- temporary local-intel workspace with `reports`, `logs`, `data/intel.sqlite`, and `status.json` is detected
- `.md` and `.json` reports are listed with title, relative path, excerpt, priority
- hidden directories, temporary files, unsupported files, and oversized files are ignored
- logs are bounded and token/API key text is redacted
- missing `reports` or `logs` directories returns `missing`/`stale` statuses instead of throwing

Run: `npm test -- src/electron/localIntelAdapter.test.js`
Expected: FAIL with missing fields/functions.

- [ ] **Step 2: Implement bounded read-only scans**

Rules:
- no service start
- no scripts
- no writes
- no SQLite parsing
- no absolute report/log paths returned
- redact suspicious secrets from logs and report excerpts

- [ ] **Step 3: Verify adapter**

Run: `npm test -- src/electron/localIntelAdapter.test.js`
Expected: PASS.

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

- [ ] **Step 1: Write failing provider tests**

Add `intel.listLogs` / `listIntelLogs` and richer report/status expectations.

Run: `npm test -- src/electron/ipcChannels.test.js src/electron/ipcHandlers.test.js src/electron/desktopApiFactory.test.js src/electron/mainProvider.test.js src/services/localProvider.test.js src/services/dataProvider.test.js`
Expected: FAIL until provider wiring exists.

- [ ] **Step 2: Wire methods**

Expose:
- `intel.getServiceStatus`
- `intel.getDashboardSummary`
- `intel.getSourceHealth`
- `intel.listReports`
- `intel.listLogs`

- [ ] **Step 3: Verify provider wiring**

Run the same focused command.
Expected: PASS.

### Task 4: Intel Center Data Binding

**Files:**
- Modify: `src/pages/IntelCenter.jsx`
- Test: `src/pages/IntelCenter.test.jsx`

- [ ] **Step 1: Write failing page data tests**

Assert real report/source/log-derived fields are preferred over fallback decoration.

Run: `npm test -- src/pages/IntelCenter.test.jsx`
Expected: FAIL until display helpers handle new fields.

- [ ] **Step 2: Minimal UI data binding**

Keep existing layout and visual classes. Only map richer fields:
- source health labels/state/checks
- report title/excerpt/priority/tags/time
- collection readiness steps from workspace/status/logs/reports

- [ ] **Step 3: Verify page tests**

Run: `npm test -- src/pages/IntelCenter.test.jsx`
Expected: PASS.

### Task 5: Final Verification

**Files:**
- No new implementation files.

- [ ] **Step 1: Renderer safety check**

Run: `rg -n "node:|fs/promises|child_process|sqlite|process\.|electron" src --glob "!src/electron/**" --glob "!**/*.test.js" --glob "!**/*.test.jsx"`
Expected: no runtime Renderer matches.

- [ ] **Step 2: Full automated verification**

Run:
- `npm test`
- `npm run build`
- `npm run electron:smoke`

Expected: all exit 0.

- [ ] **Step 3: Browser visual regression**

Check:
- Home opens
- Intel Center opens
- Settings overlay opens
- Page Switcher still has 8 cards
- RadialWheel still has 8 nodes
- console has no error/warning
- no obvious visual regression
