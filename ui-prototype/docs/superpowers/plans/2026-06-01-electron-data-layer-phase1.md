# Electron Data Layer Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the React prototype to a first-stage Electron data-layer skeleton with stable preload/IPC contracts, read-only local adapters, and safe fallback behavior while preserving the current UI.

**Architecture:** Keep Renderer pages consuming the existing `dataProvider` and hooks. Add a documented `window.api.*` preload surface backed by centralized IPC channel constants and `ApiResult` wrapping; keep dangerous/write/service-control capabilities as permission-denied or not-implemented stubs. Main-process provider methods aggregate existing read-only adapters and local configuration without exposing Node APIs, secrets, process handles, raw SQLite connections, or sensitive paths to Renderer.

**Tech Stack:** Electron preload + IPC, React/Vite Renderer, Vitest, Node `fs/promises` read-only adapters.

---

## File Structure

- Create `src/electron/apiResult.js`: owns `ok`, `fail`, `permissionDenied`, `notImplemented`, `unwrapApiResult`, and redaction helpers.
- Modify `src/electron/ipcChannels.js`: replaces scattered legacy names with centralized namespace/resource/action constants and compatibility mappings.
- Modify `src/electron/desktopApiFactory.js`: exposes `window.api.*` namespaces and keeps `desktopApi` compatibility where needed by tests/local provider.
- Modify `src/electron/preload.js`: exposes both `api` and compatibility `desktopApi`; no Node APIs exposed.
- Modify `src/electron/ipcHandlers.js`: wraps all handler returns in `ApiResult`, maps provider exceptions into sanitized errors, and preserves safe legacy page-data channels.
- Modify `src/services/localProvider.js`: calls `window.api.*`, unwraps `ApiResult`, and falls back to mock through load helpers when API is missing or failing.
- Modify `src/services/dataProvider.js`: resolves local provider only when `window.api` or compatibility `window.desktopApi` exists.
- Modify `src/hooks/usePageData.js` and `src/hooks/useHomeDashboardData.js`: keep mock data on provider failures.
- Modify `src/electron/mainProvider.js`: adds first-stage read-only APIs for `system`, `kb`, `codeRepo`, `agent`, `intel`, and `music`.
- Modify `src/electron/localIntelAdapter.js`: adds safe read-only probe methods for local-intel status, summary, source health, reports, and dashboard-compatible data.
- Test files: add or update `src/electron/apiResult.test.js`, `src/electron/ipcChannels.test.js`, `src/electron/desktopApiFactory.test.js`, `src/electron/ipcHandlers.test.js`, `src/services/dataProvider.test.js`, `src/hooks/usePageData.test.js`, `src/electron/localIntelAdapter.test.js`, and `src/electron/mainProvider.test.js`.

## Task 1: ApiResult Contract

**Files:**
- Create: `D:\python_code\Electron\ui-prototype\src\electron\apiResult.js`
- Test: `D:\python_code\Electron\ui-prototype\src\electron\apiResult.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, expect, it } from "vitest";
import { fail, notImplemented, ok, permissionDenied, unwrapApiResult } from "./apiResult";

describe("ApiResult contract", () => {
  it("wraps success and safe errors with a stable shape", () => {
    expect(ok({ value: 1 })).toEqual({ ok: true, data: { value: 1 } });
    expect(permissionDenied("Level 3 is disabled in phase 1")).toMatchObject({
      ok: false,
      error: { code: "PERMISSION_DENIED", message: "Level 3 is disabled in phase 1", retryable: false },
    });
    expect(notImplemented("LLM calls are phase 2")).toMatchObject({
      ok: false,
      error: { code: "NOT_IMPLEMENTED", message: "LLM calls are phase 2" },
    });
    expect(fail({ code: "UNKNOWN_ERROR", message: "D:\\secret\\token.txt failed" }).error.detail).not.toContain("token.txt");
  });

  it("unwraps ApiResult for existing data hooks", () => {
    expect(unwrapApiResult(ok({ page: "home" }))).toEqual({ page: "home" });
    expect(() => unwrapApiResult(permissionDenied("Denied"))).toThrow("Denied");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/electron/apiResult.test.js`
Expected: FAIL with module not found for `./apiResult`.

- [ ] **Step 3: Implement minimal contract helpers**

Implement the helper functions in `apiResult.js` with only the codes needed in phase 1: `PERMISSION_DENIED`, `NOT_IMPLEMENTED`, `UNKNOWN_ERROR`, `VALIDATION_ERROR`, `SERVICE_UNAVAILABLE`, and `NOT_FOUND`.

- [ ] **Step 4: Run focused test**

Run: `npm test -- src/electron/apiResult.test.js`
Expected: PASS.

## Task 2: IPC Channel Constants And Preload Surface

**Files:**
- Modify: `D:\python_code\Electron\ui-prototype\src\electron\ipcChannels.js`
- Modify: `D:\python_code\Electron\ui-prototype\src\electron\desktopApiFactory.js`
- Modify: `D:\python_code\Electron\ui-prototype\src\electron\preload.js`
- Test: `D:\python_code\Electron\ui-prototype\src\electron\ipcChannels.test.js`
- Test: `D:\python_code\Electron\ui-prototype\src\electron\desktopApiFactory.test.js`

- [ ] **Step 1: Write failing tests**

Assert the phase-1 `window.api.*` methods and channels:

```js
expect(IPC_CHANNELS.system.getAppStatus).toBe("system:app:status");
expect(IPC_CHANNELS.system.getSettingsSummary).toBe("system:settings:summary");
expect(IPC_CHANNELS.system.listTasks).toBe("system:task:list");
expect(IPC_CHANNELS.intel.getServiceStatus).toBe("intel:service:status");
expect(IPC_CHANNELS.intel.getDashboardSummary).toBe("intel:dashboard:summary");
expect(IPC_CHANNELS.intel.getSourceHealth).toBe("intel:source:health");
expect(IPC_CHANNELS.intel.listReports).toBe("intel:report:list");
expect(IPC_CHANNELS.codeRepo.listRepositories).toBe("codeRepo:repository:list");
expect(IPC_CHANNELS.codeRepo.getGitSummary).toBe("codeRepo:git:summary");
expect(IPC_CHANNELS.kb.listSources).toBe("kb:source:list");
expect(IPC_CHANNELS.kb.getIndexStatus).toBe("kb:index:status");
expect(IPC_CHANNELS.agent.listAgents).toBe("agent:agent:list");
expect(IPC_CHANNELS.agent.listSessions).toBe("agent:session:list");
expect(IPC_CHANNELS.music.getPlaybackState).toBe("music:playback:state");
```

Also assert that blocked phase-1 actions exist as stubs:

```js
expect(IPC_CHANNELS.intel.startService).toBe("intel:service:start");
expect(IPC_CHANNELS.kb.startIndex).toBe("kb:index:start");
```

- [ ] **Step 2: Verify tests fail**

Run: `npm test -- src/electron/ipcChannels.test.js src/electron/desktopApiFactory.test.js`
Expected: FAIL because the existing surface uses legacy page getter namespaces.

- [ ] **Step 3: Implement the minimal API surface**

Keep legacy page getters for current UI compatibility, but add the documented namespaces: `system`, `kb`, `codeRepo`, `agent`, `intel`, `music`, and `voice`.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- src/electron/ipcChannels.test.js src/electron/desktopApiFactory.test.js`
Expected: PASS.

## Task 3: ApiResult IPC Handler Wrapping And Permission Stubs

**Files:**
- Modify: `D:\python_code\Electron\ui-prototype\src\electron\ipcHandlers.js`
- Test: `D:\python_code\Electron\ui-prototype\src\electron\ipcHandlers.test.js`

- [ ] **Step 1: Write failing tests**

Test that safe read handlers return `{ ok: true, data }`, thrown errors become sanitized `{ ok: false, error }`, and Level 3/4 actions return `PERMISSION_DENIED` or `NOT_IMPLEMENTED`.

- [ ] **Step 2: Verify tests fail**

Run: `npm test -- src/electron/ipcHandlers.test.js`
Expected: FAIL because handlers currently return raw provider values.

- [ ] **Step 3: Implement handler wrapping**

Wrap all configured IPC methods with `ok(...)`. For methods marked `permission: "denied"` return `permissionDenied(...)`; for missing provider methods return `notImplemented(...)`.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- src/electron/ipcHandlers.test.js`
Expected: PASS.

## Task 4: Local Provider Fallback And ApiResult Unwrap

**Files:**
- Modify: `D:\python_code\Electron\ui-prototype\src\services\localProvider.js`
- Modify: `D:\python_code\Electron\ui-prototype\src\services\dataProvider.js`
- Modify: `D:\python_code\Electron\ui-prototype\src\hooks\usePageData.js`
- Modify: `D:\python_code\Electron\ui-prototype\src\hooks\useHomeDashboardData.js`
- Test: `D:\python_code\Electron\ui-prototype\src\services\dataProvider.test.js`
- Test: `D:\python_code\Electron\ui-prototype\src\hooks\usePageData.test.js`
- Test: `D:\python_code\Electron\ui-prototype\src\hooks\useHomeDashboardData.test.js`

- [ ] **Step 1: Write failing tests**

Add tests showing `window.api` is preferred, `window.desktopApi` remains compatible, and hooks retain mock data if the local API rejects or is missing.

- [ ] **Step 2: Verify tests fail**

Run: `npm test -- src/services/dataProvider.test.js src/hooks/usePageData.test.js src/hooks/useHomeDashboardData.test.js`
Expected: FAIL because the current provider only knows `desktopApi` and hooks leave stale error states.

- [ ] **Step 3: Implement local provider unwrap and fallback**

Use `unwrapApiResult` in local provider. If an API call rejects, the hooks keep their initial mock data and set `error` without crashing.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- src/services/dataProvider.test.js src/hooks/usePageData.test.js src/hooks/useHomeDashboardData.test.js`
Expected: PASS.

## Task 5: Read-Only Main Provider Methods

**Files:**
- Modify: `D:\python_code\Electron\ui-prototype\src\electron\mainProvider.js`
- Test: `D:\python_code\Electron\ui-prototype\src\electron\mainProvider.test.js`

- [ ] **Step 1: Write failing tests**

Assert first-stage read-only methods exist:

```js
await expect(provider.getAppStatus()).resolves.toMatchObject({ status: "ready" });
await expect(provider.getSettingsSummary()).resolves.toMatchObject({ total: expect.any(Number) });
await expect(provider.listTasks()).resolves.toEqual(expect.any(Array));
await expect(provider.listKnowledgeSources()).resolves.toEqual(expect.any(Array));
await expect(provider.getKnowledgeIndexStatus()).resolves.toMatchObject({ docs: expect.any(Number) });
await expect(provider.listRepositories()).resolves.toEqual(expect.any(Array));
await expect(provider.getGitSummary()).resolves.toMatchObject({ branch: expect.any(String) });
await expect(provider.listAgents()).resolves.toEqual(expect.any(Array));
await expect(provider.listAgentSessions()).resolves.toEqual(expect.any(Array));
await expect(provider.getMusicPlaybackState()).resolves.toMatchObject({ state: expect.any(String) });
```

- [ ] **Step 2: Verify tests fail**

Run: `npm test -- src/electron/mainProvider.test.js`
Expected: FAIL because these provider methods do not exist yet.

- [ ] **Step 3: Implement read-only provider methods**

Reuse existing adapters and mock data. Do not add RAG, LLM calls, code parsing, service startup, or playback control.

- [ ] **Step 4: Run focused test**

Run: `npm test -- src/electron/mainProvider.test.js`
Expected: PASS.

## Task 6: local-intel Safe Probe

**Files:**
- Modify: `D:\python_code\Electron\ui-prototype\src\electron\localIntelAdapter.js`
- Test: `D:\python_code\Electron\ui-prototype\src\electron\localIntelAdapter.test.js`

- [ ] **Step 1: Write failing tests**

Create a temp local-intel-like root with `data/intel.sqlite`, `data/web.pid`, `reports/*.md`, and `logs/*.jsonl`; assert the probe returns status, dashboard summary, source health, and report refs without starting any service.

- [ ] **Step 2: Verify tests fail**

Run: `npm test -- src/electron/localIntelAdapter.test.js`
Expected: FAIL because the specific probe methods do not exist.

- [ ] **Step 3: Implement read-only probe methods**

Add `getLocalIntelServiceStatus`, `getLocalIntelDashboardSummary`, `getLocalIntelSourceHealth`, and `listLocalIntelReports`. Use only `fs` reads and path existence checks.

- [ ] **Step 4: Run focused test**

Run: `npm test -- src/electron/localIntelAdapter.test.js`
Expected: PASS.

## Task 7: Final Verification

**Files:**
- No new production files.

- [ ] **Step 1: Run full tests**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 2: Run production build**

Run: `npm run build`
Expected: Vite build exits `0`.

- [ ] **Step 3: Verify Renderer safety boundary**

Run: `rg -n "node:|fs/promises|child_process|sqlite|process\\.|electron" src --glob "!src/electron/**"`
Expected: no Renderer-side direct Node capability imports/usages.

- [ ] **Step 4: Confirm UI boundary**

Check that `src/data/pageRegistry.js` still has exactly 8 primary pages and no Settings entry; no visual/layout files need to change.
