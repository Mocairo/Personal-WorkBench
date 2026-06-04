# Settings Local Sources Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect Settings local path configuration to read-only data source status across the existing desktop console UI while preserving mock fallback and the current visual system.

**Architecture:** Keep Settings as a floating drawer opened from the existing shell controls, and keep all 8 first-level pages unchanged in the Page Registry. Main-process adapters own path/config checks and return `SourceConfig`, `SourceHealth`, and `ProviderStatus` summaries through existing data-provider flow; Renderer pages only render those summaries and never import Node/Electron modules. When a configured local provider is unavailable or unconfigured, page data uses mock content with an explicit `mock` or `unconfigured` status instead of silent fake success.

**Tech Stack:** React/Vite Renderer, Electron preload/IPC skeleton, Node `fs/promises` read-only adapters in `src/electron`, Vitest, Browser/in-app browser for visual smoke checks only.

---

## File Structure

- Modify `D:\python_code\Electron\ui-prototype\src\services\contracts.js`: document `SourceConfig`, `SourceHealth`, and `ProviderStatus` shapes for Renderer-safe data.
- Create `D:\python_code\Electron\ui-prototype\src\shared\sourceStatus.js`: pure helpers for canonical source ids, status normalization, summary building, and mock/unconfigured provider status objects.
- Modify `D:\python_code\Electron\ui-prototype\src\electron\localSourcesConfig.js`: accept canonical phase-2 keys (`knowledgeBasePath`, `codeRepositoryPath`, `localIntelPath`, `musicLibraryPath`) while preserving existing phase-1 internal keys.
- Modify `D:\python_code\Electron\ui-prototype\src\electron\localSourcesActions.js`: allow saving either legacy source ids (`knowledge-base`) or canonical keys (`knowledgeBasePath`).
- Modify `D:\python_code\Electron\ui-prototype\src\electron\localSourcesAdapter.js`: return source rows with `id`, `label`, `path`, `configured`, `status`, `message`, `updatedAt`, plus compatibility `state/detail/tone`.
- Modify `D:\python_code\Electron\ui-prototype\src\electron\mainProvider.js`: attach provider/source status to Knowledge Base, Code Repository, Intel Center, Local Music, Home Dashboard, and lightweight mock-first modules.
- Modify `D:\python_code\Electron\ui-prototype\src\electron\localIntelAdapter.js`: expose read-only path probe data without executing scripts or starting services.
- Modify `D:\python_code\Electron\ui-prototype\src\services\mockProvider.js`: add explicit mock provider/source statuses to mock page data and mock Settings data.
- Modify `D:\python_code\Electron\ui-prototype\src\services\localProvider.js` and `src\hooks\usePageData.js`: keep `window.api` preferred, unwrap `ApiResult`, and retain mock fallback on failure.
- Modify `D:\python_code\Electron\ui-prototype\src\pages\Settings.jsx`: show the four required configurable paths, secret placeholder state, and clear unconfigured/mock status without changing the drawer concept.
- Modify `D:\python_code\Electron\ui-prototype\src\pages\HomeDashboard.jsx`, `KnowledgeBase.jsx`, `CodeRepository.jsx`, `IntelCenter.jsx`, `LocalMusic.jsx`, `AgentChat.jsx`, `AgentManagement.jsx`, and `Widgets.jsx`: render concise source/provider status in existing panels only; no layout rewrite.
- Tests to add/update: `src/shared/sourceStatus.test.js`, `src/electron/localSourcesConfig.test.js`, `src/electron/localSourcesActions.test.js`, `src/electron/localSourcesAdapter.test.js`, `src/electron/mainProvider.test.js`, `src/electron/localIntelAdapter.test.js`, `src/services/dataProvider.test.js`, `src/services/localProvider.test.js`, `src/hooks/usePageData.test.js`, `src/pages/Settings.test.jsx`, `src/pages/DataBindingPriority.test.jsx`, and focused page display tests where helper functions already exist.

## Task 1: Shared Source Status Model

**Files:**
- Create: `D:\python_code\Electron\ui-prototype\src\shared\sourceStatus.js`
- Modify: `D:\python_code\Electron\ui-prototype\src\services\contracts.js`
- Test: `D:\python_code\Electron\ui-prototype\src\shared\sourceStatus.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, expect, it } from "vitest";
import {
  buildProviderStatus,
  buildSourceHealth,
  normalizeSourceStatus,
  summarizeSourceHealth,
} from "./sourceStatus";

describe("source status contracts", () => {
  it("normalizes SourceHealth rows for configured, missing and mock sources", () => {
    const ready = buildSourceHealth({
      id: "knowledgeBasePath",
      label: "Knowledge Base",
      path: "D:\\docs",
      readable: true,
    });
    const missing = buildSourceHealth({
      id: "codeRepositoryPath",
      label: "Code Repository",
      path: "D:\\missing",
      readable: false,
      reason: "Path not found",
    });
    const mock = buildSourceHealth({
      id: "musicLibraryPath",
      label: "Local Music",
      path: "",
      mock: true,
    });

    expect(ready).toMatchObject({ configured: true, status: "ready", message: "Ready" });
    expect(missing).toMatchObject({ configured: true, status: "missing", message: "Path not found" });
    expect(mock).toMatchObject({ configured: false, status: "mock", message: "Using mock data" });
    expect(normalizeSourceStatus("type mismatch")).toBe("error");
  });

  it("summarizes ProviderStatus without exposing secrets", () => {
    const summary = summarizeSourceHealth([
      buildSourceHealth({ id: "knowledgeBasePath", label: "Knowledge Base", path: "", mock: true }),
      buildSourceHealth({ id: "localIntelPath", label: "local-intel", path: "D:\\intel", readable: true }),
    ]);

    expect(summary).toEqual({ error: 0, missing: 0, mock: 1, ready: 1, total: 2, unconfigured: 0 });
    expect(buildProviderStatus({ sourceId: "localIntelPath", status: "mock" })).toMatchObject({
      sourceId: "localIntelPath",
      status: "mock",
      configured: false,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/shared/sourceStatus.test.js`
Expected: FAIL because `sourceStatus.js` does not exist.

- [ ] **Step 3: Implement minimal pure helpers**

Create helpers with only the required statuses: `unconfigured`, `ready`, `missing`, `error`, `mock`.

- [ ] **Step 4: Run focused test**

Run: `npm test -- src/shared/sourceStatus.test.js`
Expected: PASS.

## Task 2: Config Read/Write Compatibility

**Files:**
- Modify: `D:\python_code\Electron\ui-prototype\src\electron\localSourcesConfig.js`
- Modify: `D:\python_code\Electron\ui-prototype\src\electron\localSourcesActions.js`
- Test: `D:\python_code\Electron\ui-prototype\src\electron\localSourcesConfig.test.js`
- Test: `D:\python_code\Electron\ui-prototype\src\electron\localSourcesActions.test.js`

- [ ] **Step 1: Write failing tests**

Add tests proving canonical keys are accepted and legacy ids still work:

```js
await saveLocalSourcesConfig(
  {
    paths: {
      knowledgeBasePath: path.join(rootDir, "docs"),
      codeRepositoryPath: path.join(rootDir, "repo"),
      localIntelPath: path.join(rootDir, "intel"),
      musicLibraryPath: path.join(rootDir, "music"),
      ignoredSecret: "sk-should-not-save",
    },
  },
  { configPath },
);

await expect(loadLocalSourcesConfig({ configPath })).resolves.toEqual({
  paths: {
    codeRepositoryRoot: path.join(rootDir, "repo"),
    knowledgeBaseRoot: path.join(rootDir, "docs"),
    localIntelRoot: path.join(rootDir, "intel"),
    localMusicRoot: path.join(rootDir, "music"),
  },
});
```

For actions:

```js
await saveLocalSourcePath("knowledgeBasePath", docsDir, { configPath });
await saveLocalSourcePath("knowledge-base", otherDocsDir, { configPath });
const saved = await loadLocalSourcesConfig({ configPath });
expect(saved.paths.knowledgeBaseRoot).toBe(otherDocsDir);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/electron/localSourcesConfig.test.js src/electron/localSourcesActions.test.js`
Expected: FAIL because canonical phase-2 keys are not accepted yet.

- [ ] **Step 3: Implement alias normalization**

Map `knowledgeBasePath -> knowledgeBaseRoot`, `codeRepositoryPath -> codeRepositoryRoot`, `localIntelPath -> localIntelRoot`, and `musicLibraryPath -> localMusicRoot`. Drop unknown keys and never persist secret-like fields.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- src/electron/localSourcesConfig.test.js src/electron/localSourcesActions.test.js`
Expected: PASS.

## Task 3: Local Source Health Adapter

**Files:**
- Modify: `D:\python_code\Electron\ui-prototype\src\electron\localSourcesAdapter.js`
- Test: `D:\python_code\Electron\ui-prototype\src\electron\localSourcesAdapter.test.js`

- [ ] **Step 1: Write failing tests**

Add a test where four phase-2 paths are missing from config and assert they are `unconfigured`, not fake `ready`:

```js
const data = await getLocalSourcesData({ widgetsDiskRoot: rootDir });
expect(data.sources).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ id: "knowledge-base", configured: false, status: "unconfigured" }),
    expect.objectContaining({ id: "code-repository", configured: false, status: "unconfigured" }),
    expect.objectContaining({ id: "local-intel", configured: false, status: "unconfigured" }),
    expect.objectContaining({ id: "local-music", configured: false, status: "unconfigured" }),
  ]),
);
```

Keep the existing ready/missing test for explicit paths.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/electron/localSourcesAdapter.test.js`
Expected: FAIL because adapter currently falls back to default paths and can show fake ready.

- [ ] **Step 3: Implement SourceHealth rows**

Return `configured`, `status`, `message`, `updatedAt`, plus compatibility fields `state`, `detail`, `tone`.

- [ ] **Step 4: Run focused test**

Run: `npm test -- src/electron/localSourcesAdapter.test.js`
Expected: PASS.

## Task 4: Provider Status And Page Data Linkage

**Files:**
- Modify: `D:\python_code\Electron\ui-prototype\src\electron\mainProvider.js`
- Modify: `D:\python_code\Electron\ui-prototype\src\services\mockProvider.js`
- Test: `D:\python_code\Electron\ui-prototype\src\electron\mainProvider.test.js`
- Test: `D:\python_code\Electron\ui-prototype\src\pages\DataBindingPriority.test.jsx`

- [ ] **Step 1: Write failing tests**

Assert unconfigured local paths use mock data with explicit provider status:

```js
const provider = createMainDataProvider({ localSourcesConfigPath: path.join(rootDir, "missing.json") });
await expect(provider.getKnowledgeBase()).resolves.toMatchObject({
  providerStatus: { sourceId: "knowledgeBasePath", status: "mock", configured: false },
});
await expect(provider.getCodeRepository()).resolves.toMatchObject({
  providerStatus: { sourceId: "codeRepositoryPath", status: "mock", configured: false },
});
await expect(provider.getIntelCenter()).resolves.toMatchObject({
  providerStatus: { sourceId: "localIntelPath", status: "mock", configured: false },
});
await expect(provider.getLocalMusic()).resolves.toMatchObject({
  providerStatus: { sourceId: "musicLibraryPath", status: "mock", configured: false },
});
```

Assert configured paths prefer adapter-returned fields over mock fields and add source health:

```js
expect(data.sourceHealth).toMatchObject({ configured: true, status: "ready" });
expect(data.knowledgeDocuments[0].title).toBe("real-doc.md");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/electron/mainProvider.test.js src/pages/DataBindingPriority.test.jsx`
Expected: FAIL because provider status is not attached yet.

- [ ] **Step 3: Implement provider linkage**

In `mainProvider`, if a phase-2 path is not configured, return the existing mock data plus `providerStatus.status = "mock"` and a source health row. If configured, call the read-only adapter and add `providerStatus.status = "ready"` or `missing/error` based on source health.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- src/electron/mainProvider.test.js src/pages/DataBindingPriority.test.jsx`
Expected: PASS.

## Task 5: Settings Drawer Path Configuration UI

**Files:**
- Modify: `D:\python_code\Electron\ui-prototype\src\pages\Settings.jsx`
- Test: `D:\python_code\Electron\ui-prototype\src\pages\Settings.test.jsx`

- [ ] **Step 1: Write failing tests**

Assert Settings renders the four required configurable sources and secret placeholders:

```js
const display = getSettingsDisplayData({
  sources: [
    { id: "knowledge-base", label: "Knowledge Base", path: "", configured: false, status: "unconfigured", message: "Choose a folder" },
    { id: "code-repository", label: "Code Repository", path: "D:\\repo", configured: true, status: "ready", message: "Ready" },
  ],
  summary: { total: 2, ready: 1, unconfigured: 1 },
  secrets: [{ id: "llm-provider", label: "LLM Provider", configured: false, masked: "not configured" }],
});
expect(display.requiredSources.map((source) => source.id)).toEqual(["knowledge-base", "code-repository"]);
```

Static markup should contain `Knowledge Base`, `Code Repository`, `local-intel`, `Music Library`, and `Secret status`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/pages/Settings.test.jsx`
Expected: FAIL because Settings does not expose phase-2 display groups yet.

- [ ] **Step 3: Implement compact drawer updates**

Keep the drawer, glass panels, and action styling. Filter/highlight the four required path rows, keep optional rows below, and show secret/API key as masked status only.

- [ ] **Step 4: Run focused test**

Run: `npm test -- src/pages/Settings.test.jsx`
Expected: PASS.

## Task 6: Page Local Status Rendering

**Files:**
- Modify: `D:\python_code\Electron\ui-prototype\src\pages\HomeDashboard.jsx`
- Modify: `D:\python_code\Electron\ui-prototype\src\pages\KnowledgeBase.jsx`
- Modify: `D:\python_code\Electron\ui-prototype\src\pages\CodeRepository.jsx`
- Modify: `D:\python_code\Electron\ui-prototype\src\pages\IntelCenter.jsx`
- Modify: `D:\python_code\Electron\ui-prototype\src\pages\LocalMusic.jsx`
- Modify: `D:\python_code\Electron\ui-prototype\src\pages\AgentChat.jsx`
- Modify: `D:\python_code\Electron\ui-prototype\src\pages\AgentManagement.jsx`
- Modify: `D:\python_code\Electron\ui-prototype\src\pages\Widgets.jsx`
- Test: existing focused page helper tests.

- [ ] **Step 1: Write failing tests**

Use existing helper functions where possible:

```js
expect(getKnowledgeDisplayData({ providerStatus: { status: "mock", message: "Using mock data" } }).providerStatus).toMatchObject({ status: "mock" });
expect(getRepositoryDisplayData({ providerStatus: { status: "missing", message: "Path not found" } }).providerStatus.message).toBe("Path not found");
expect(getIntelDisplayData({ providerStatus: { status: "unconfigured" }, intelSources: [] }).providerStatus.status).toBe("unconfigured");
expect(mergeAudioMetadata([{ label: "Library", value: "mock" }], [{ label: "Library", value: "ready" }])).toEqual([{ label: "Library", value: "mock" }]);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/pages/KnowledgeBase.test.jsx src/pages/CodeRepository.test.jsx src/pages/DataBindingPriority.test.jsx`
Expected: FAIL where provider status is not normalized/rendered.

- [ ] **Step 3: Render status without layout rewrites**

Add one compact status pill/row inside existing panels for each page. Do not introduce new top-level sections, cards, navigation, or page switcher changes.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- src/pages/KnowledgeBase.test.jsx src/pages/CodeRepository.test.jsx src/pages/DataBindingPriority.test.jsx src/pages/Settings.test.jsx`
Expected: PASS.

## Task 7: local-intel Path Probe Refinement

**Files:**
- Modify: `D:\python_code\Electron\ui-prototype\src\electron\localIntelAdapter.js`
- Test: `D:\python_code\Electron\ui-prototype\src\electron\localIntelAdapter.test.js`

- [ ] **Step 1: Write failing tests**

Assert the probe includes reports/logs/status readiness and never invokes scripts:

```js
const status = await getLocalIntelServiceStatus({ rootDir });
expect(status).toMatchObject({
  serviceId: "local-intel",
  databaseReady: true,
  reportsReady: true,
  logsReady: true,
});
expect(status.scripts.start).toBe(false);
```

For missing path:

```js
await expect(getLocalIntelServiceStatus({ rootDir: path.join(rootDir, "missing") })).resolves.toMatchObject({
  status: "not_configured",
  workspaceConfigured: false,
});
```

- [ ] **Step 2: Run focused test**

Run: `npm test -- src/electron/localIntelAdapter.test.js`
Expected: FAIL until reports/logs readiness fields are returned.

- [ ] **Step 3: Implement read-only fields**

Only use `fs.access` and `fs.readdir`; do not call `execFile`, scripts, services, ports, or SQLite writes.

- [ ] **Step 4: Run focused test**

Run: `npm test -- src/electron/localIntelAdapter.test.js`
Expected: PASS.

## Task 8: Final Verification

**Files:**
- No new feature files.

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: Vite build exits `0`.

- [ ] **Step 3: Renderer safety boundary**

Run: `rg -n "node:|fs/promises|child_process|sqlite|process\\.|electron" src --glob "!src/electron/**"`
Expected: no Renderer-side direct Node/Electron capability usage.

- [ ] **Step 4: Page registry safety**

Run: `node -e "import('./src/data/pageRegistry.js').then(m=>console.log(m.pages.map(p=>p.id).join(',')))"`
Expected: exactly `home,chat,knowledge,agents,code,music,intel,widgets`; Settings is not listed.

- [ ] **Step 5: Browser smoke check**

Use Browser/in-app browser at `http://127.0.0.1:5175/` or the active Vite URL:
- Home opens.
- Settings drawer opens from the gear and remains a floating panel.
- All 8 pages can switch.
- `Alt+Space` Page Switcher still appears.
- No obvious visual regression, overlap, or console error.

## Self-Review

- Spec coverage: Settings path configuration, SourceConfig/SourceHealth/ProviderStatus, dataProvider fallback, page status linkage, local-intel read-only probing, safety boundaries, and verification are each mapped to a task.
- Placeholder scan: no `TBD`, `TODO`, or “implement later” placeholders.
- Type consistency: source ids remain compatible with existing rows (`knowledge-base`, `code-repository`, `local-intel`, `local-music`) while canonical config keys are explicit (`knowledgeBasePath`, `codeRepositoryPath`, `localIntelPath`, `musicLibraryPath`).
- Scope control: no task adds remote backend calls, RAG, LLM execution, Git deep scan, music playback control, external service startup, or Page Registry changes.
