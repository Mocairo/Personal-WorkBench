# Code Repository Readonly Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Code Repository into a safe local read-only repository scan loop while preserving the current UI, mock fallback, and Electron security boundary.

**Architecture:** Keep Renderer pages consuming the existing `usePageData` and provider abstractions. Add a focused Code Repository contract and a main-process-only scanner that walks configured repository directories, returns relative file metadata, derives lightweight structure nodes, and exposes only Level 1 read APIs through centralized IPC/preload methods. Git is limited to read-only status output through the existing injectable `gitStatusReader`; failures return explainable state instead of crashing pages.

**Tech Stack:** Electron preload + IPC, React/Vite Renderer, Vitest, Node `fs/promises` read-only adapter, existing mock/local provider pattern.

---

## Assumptions

- `codeRepositoryPath` from Settings maps to `codeRepositoryRoot` in `localSourcesConfig`.
- Phase 4 scans only file metadata and simple extension/directory summaries; it does not parse ASTs, build a code index, run package managers, or modify repositories.
- Git status is read-only and injectable in tests. If Git is unavailable or the path is not a Git repository, the app returns `git-unavailable`, `not-repository`, or `error` as a non-fatal status.
- The current 8 pages, Settings drawer, Page Switcher, RadialWheel, and visual language remain unchanged.

## File Structure

- Create `src/shared/codeRepositoryContracts.js`: pure helpers and contract builders for `RepositorySource`, `RepositoryFileNode`, `GitSummary`, `RepositoryMetrics`, `CodeStructureNode`, and `RepositoryScanSummary`.
- Modify `src/electron/codeRepositoryAdapter.js`: main-process read-only scanner, safe file tree walker, Git summary parsing, and structure summary generation.
- Modify `src/electron/mainProvider.js`: expose `listCodeRepositoryFiles`, `getCodeRepositoryMetrics`, and `getCodeRepositoryStructure` while keeping mock/unconfigured behavior.
- Modify `src/electron/ipcChannels.js`: add Phase 4 `codeRepo.listFiles`, `codeRepo.getMetrics`, and `codeRepo.getStructure` channels; keep `scanRepository` denied.
- Modify `src/services/localProvider.js`: call the new `window.api.codeRepo.*` methods and unwrap `ApiResult`.
- Modify `src/services/mockProvider.js`: add mock implementations for the new Code Repository read APIs.
- Modify `src/pages/CodeRepository.jsx`: consume richer backend fields without changing layout or visual style.
- Tests: update/add `src/shared/codeRepositoryContracts.test.js`, `src/electron/codeRepositoryAdapter.test.js`, `src/electron/mainProvider.test.js`, `src/electron/ipcChannels.test.js`, `src/electron/ipcHandlers.test.js`, `src/services/localProvider.test.js`, `src/services/dataProvider.test.js`, and `src/pages/CodeRepository.test.jsx`.

## Task 1: Code Repository Contract Helpers

**Files:**
- Create: `D:\python_code\Electron\ui-prototype\src\shared\codeRepositoryContracts.js`
- Test: `D:\python_code\Electron\ui-prototype\src\shared\codeRepositoryContracts.test.js`

- [ ] **Step 1: Write failing tests**

Add tests asserting file node normalization keeps `id`, `name`, `type`, `relativePath`, `depth`, `size`, `updatedAt`, `status`, `language`, `source`, and Git state. Add tests for source, git summary, metrics, structure node, and scan summary defaults.

Run: `npm test -- src/shared/codeRepositoryContracts.test.js`
Expected: FAIL because `codeRepositoryContracts.js` does not exist.

- [ ] **Step 2: Implement minimal pure helpers**

Create builders for the six contract shapes. Do not import Node modules in this file.

- [ ] **Step 3: Verify focused tests**

Run: `npm test -- src/shared/codeRepositoryContracts.test.js`
Expected: PASS.

## Task 2: Read-Only Repository Scanner And Git Summary

**Files:**
- Modify: `D:\python_code\Electron\ui-prototype\src\electron\codeRepositoryAdapter.js`
- Test: `D:\python_code\Electron\ui-prototype\src\electron\codeRepositoryAdapter.test.js`

- [ ] **Step 1: Write failing tests**

Add tests for configured temp directory scanning nested file trees, ignoring `.git`, `node_modules`, `dist`, `build`, `coverage`, hidden directories, unsupported/oversized files, non-Git status, and Git reader failures.

Run: `npm test -- src/electron/codeRepositoryAdapter.test.js`
Expected: FAIL because nested file nodes, scan summary, structure nodes, and explicit Git states are missing.

- [ ] **Step 2: Implement scanner**

Use only `fs/promises` and the existing injectable Git status reader. Enforce max file count and max file size. Return skipped/error counts instead of throwing on single-file failures. Return relative paths only.

- [ ] **Step 3: Verify focused tests**

Run: `npm test -- src/electron/codeRepositoryAdapter.test.js`
Expected: PASS.

## Task 3: IPC, Main Provider, Local Provider

**Files:**
- Modify: `D:\python_code\Electron\ui-prototype\src\electron\ipcChannels.js`
- Modify: `D:\python_code\Electron\ui-prototype\src\electron\mainProvider.js`
- Modify: `D:\python_code\Electron\ui-prototype\src\services\localProvider.js`
- Modify: `D:\python_code\Electron\ui-prototype\src\services\mockProvider.js`
- Test: `D:\python_code\Electron\ui-prototype\src\electron\ipcChannels.test.js`
- Test: `D:\python_code\Electron\ui-prototype\src\electron\ipcHandlers.test.js`
- Test: `D:\python_code\Electron\ui-prototype\src\electron\mainProvider.test.js`
- Test: `D:\python_code\Electron\ui-prototype\src\services\localProvider.test.js`
- Test: `D:\python_code\Electron\ui-prototype\src\services\dataProvider.test.js`

- [ ] **Step 1: Write failing tests**

Assert the new channels:

```js
expect(IPC_CHANNELS.codeRepo.listFiles).toBe("codeRepo:file:list");
expect(IPC_CHANNELS.codeRepo.getMetrics).toBe("codeRepo:metrics:get");
expect(IPC_CHANNELS.codeRepo.getStructure).toBe("codeRepo:structure:get");
```

Assert `createMainDataProvider()` returns mock/unconfigured state when no code path exists, scans a persisted code path when configured, exposes `listCodeRepositoryFiles`, `getCodeRepositoryMetrics`, and `getCodeRepositoryStructure`, and `localProvider` unwraps the corresponding `window.api.codeRepo` calls.

Run: `npm test -- src/electron/ipcChannels.test.js src/electron/ipcHandlers.test.js src/electron/mainProvider.test.js src/services/localProvider.test.js src/services/dataProvider.test.js`
Expected: FAIL because the new methods do not exist yet.

- [ ] **Step 2: Implement provider wiring**

Add IPC method descriptors, main provider methods, local provider functions, and mock provider fallbacks. Keep `codeRepo.scanRepository` denied.

- [ ] **Step 3: Verify focused tests**

Run: `npm test -- src/electron/ipcChannels.test.js src/electron/ipcHandlers.test.js src/electron/mainProvider.test.js src/services/localProvider.test.js src/services/dataProvider.test.js`
Expected: PASS.

## Task 4: Code Repository UI Data Binding

**Files:**
- Modify: `D:\python_code\Electron\ui-prototype\src\pages\CodeRepository.jsx`
- Test: `D:\python_code\Electron\ui-prototype\src\pages\CodeRepository.test.jsx`

- [ ] **Step 1: Write failing tests**

Assert `getRepositoryDisplayData` preserves backend `scanSummary`, `repositorySource`, `structureNodes`, and explicit Git status; assert row mapping preserves `relativePath`, `depth`, `language`, and Git file state.

Run: `npm test -- src/pages/CodeRepository.test.jsx`
Expected: FAIL because the UI helpers only normalize a small subset today.

- [ ] **Step 2: Implement data-only UI changes**

Use backend file nodes and structure nodes in existing tree/overview/structure panels. Keep the same page grid, panels, actions, and visual classes.

- [ ] **Step 3: Verify focused tests**

Run: `npm test -- src/pages/CodeRepository.test.jsx`
Expected: PASS.

## Task 5: Final Verification

**Files:**
- No production files unless verification finds a bug.

- [ ] **Step 1: Full tests**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: Vite build exits with code `0`.

- [ ] **Step 3: Electron smoke**

Run: `npm run electron:smoke`
Expected: Electron smoke exits with code `0`.

- [ ] **Step 4: Renderer safety boundary**

Run: `rg -n "node:|fs/promises|child_process|sqlite|process\\.|electron" src --glob "!src/electron/**" --glob "!**/*.test.js" --glob "!**/*.test.jsx"`
Expected: no Renderer-side direct Node/Electron capability usage.

- [ ] **Step 5: Browser smoke check**

Open the current dev URL. Check Home, Code Repository, Settings drawer, Page Switcher, 8 switcher cards, 8 radial nodes, and console errors/warnings.

Expected: no obvious visual regression and no console errors/warnings.

## Self-Review

- Spec coverage: contract, scanner, Git summary, preload/IPC/main provider, dataProvider fallback, UI data binding, TDD tests, full verification, Electron smoke, and browser smoke check are covered.
- Placeholder scan: no `TBD`, no deferred behavior, no unspecified implementation steps.
- Type consistency: `RepositorySource`, `RepositoryFileNode`, `GitSummary`, `RepositoryMetrics`, `CodeStructureNode`, `RepositoryScanSummary`, `listCodeRepositoryFiles`, `getCodeRepositoryMetrics`, and `getCodeRepositoryStructure` names are used consistently across tasks.
