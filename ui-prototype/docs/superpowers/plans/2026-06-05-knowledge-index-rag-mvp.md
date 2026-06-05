# Knowledge Index RAG MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Electron main-process persistent Knowledge Base index under `userData` and use it for bounded chunk-level keyword retrieval in Knowledge Base and Agent Chat.

**Architecture:** Keep Renderer behind preload/local provider APIs. Add focused Electron-only index store, scanner/parser/chunker, and search helpers; wire `mainProvider` to reindex only the Settings-configured knowledge root and write only `userData/knowledge/knowledge-index.json`; preserve existing scan fallback when no index exists. Agent Chat continues to use the existing Level 1 `kb.searchLocal` tool, so indexed chunk summaries flow into the existing Context Builder without UI redesign.

**Tech Stack:** Electron main/provider layer, Node `fs/promises` and `path` in `src/electron` only, React/Vite renderer via existing provider APIs, Vitest.

---

## Baseline

- Fresh baseline command: `npm test`
- Baseline result: 57 test files and 214 tests passed.
- Completed capabilities confirmed in code and plan docs: Settings local paths, read-only local source loops, Agent Chat dry-run, real non-streaming LLM, streaming/cancel/session persistence, Tool-Augmented Agent MVP, and run-level Context Builder/session memory.
- Current gap confirmed in `src/electron/knowledgeBaseAdapter.js`: Knowledge Base still scans files on each request and `searchKnowledgeLocal` returns document-level results.
- This phase does not implement embeddings/vector store, network collection, local-intel startup, shell tools, write tools, player features, or Agent runtime automation.

## Files

- Create: `src/electron/knowledgeIndexStore.js`
  - Owns `userData/knowledge/knowledge-index.json`, read/write/clear, schema normalization, redaction, and size limits.
- Create: `src/electron/knowledgeIndexBuilder.js`
  - Owns document scanning, supported extension parsing, Markdown chunking, metadata-only PDF handling, skipped/failed summaries, and source hashing.
- Create: `src/electron/knowledgeIndexSearch.js`
  - Owns bounded keyword search over stored chunks and chunk-level result shaping.
- Modify: `src/electron/knowledgeBaseAdapter.js`
  - Add `reindexKnowledgeBase`, prefer persisted index for data/search/preview, and keep scan fallback/unindexed status when no index exists.
- Modify: `src/electron/mainProvider.js`
  - Pass `userDataDir` into Knowledge Base reads/search/preview and expose `startKnowledgeIndex`.
- Modify: `src/electron/ipcChannels.js`, `src/electron/ipcChannels.test.js`, `src/electron/ipcHandlers.test.js`, `src/electron/desktopApiFactory.test.js`
  - Make `kb.startIndex` call the safe provider method instead of returning denied.
- Modify: `src/services/localProvider.js`, `src/services/localProvider.test.js`
  - Add `startKnowledgeIndex()` wrapper.
- Modify: `src/hooks/usePageData.js`, `src/pages/KnowledgeBase.jsx`, `src/pages/KnowledgeBase.test.jsx`
  - Add a tiny Reindex button flow and index status display without changing the layout.
- Modify: `src/electron/mainProvider.test.js`
  - Cover provider reindex/search integration and Agent Chat tool prompt inclusion.
- Keep: `src/electron/agentToolRegistry.js`, `src/electron/agentToolPlanner.js`, `src/electron/agentToolOrchestrator.js`
  - Existing Level 1-only execution and Level 2/3/4 denied behavior must remain unchanged.

## Tasks

### Task 1: Index Store

- [ ] Add failing tests in `src/electron/knowledgeIndexStore.test.js`:
  - index path is `userData/knowledge/knowledge-index.json`.
  - writes go under `userData` and do not create files inside the source root.
  - read/write/clear round trip document and chunk metadata.
  - persisted JSON redacts `apiKey`, `token`, `secret`, `Authorization: Bearer`, `sk-*`, and Windows absolute paths.
  - long chunk text is clamped to preview/excerpt-sized fields.
- [ ] Run `npm test -- src/electron/knowledgeIndexStore.test.js` and verify the tests fail because the module is missing.
- [ ] Implement `getKnowledgeIndexPath`, `readKnowledgeIndex`, `writeKnowledgeIndex`, and `clearKnowledgeIndex`.
- [ ] Run `npm test -- src/electron/knowledgeIndexStore.test.js` and verify it passes.

### Task 2: Scanner, Parser, Chunker

- [ ] Add failing tests in `src/electron/knowledgeIndexBuilder.test.js`:
  - supports `md`, `markdown`, `txt`, `json`, `yaml`, `yml`, `csv`, and `puml`.
  - PDF is indexed as metadata-only with zero text chunks.
  - ignores `.git`, `node_modules`, `dist`, `build`, `.env`, hidden directories, and hidden files.
  - oversized files are skipped with a reason.
  - Markdown chunks split by headings/paragraphs and include title path, ordinal, hash, preview, and relative path.
  - a single injected file read failure increments `failed` and does not stop the whole reindex.
- [ ] Run `npm test -- src/electron/knowledgeIndexBuilder.test.js` and verify the tests fail because the module is missing.
- [ ] Implement `buildKnowledgeIndexFromRoot` with injectable `fs` hooks for failure tests.
- [ ] Run `npm test -- src/electron/knowledgeIndexBuilder.test.js` and verify it passes.

### Task 3: Search And Adapter Reindex

- [ ] Add failing tests in `src/electron/knowledgeBaseAdapter.test.js`:
  - `reindexKnowledgeBase` writes only the app-owned index file.
  - summary returns scanned/indexed/skipped/failed/docs/chunks.
  - `getKnowledgeBaseData` reads persisted docs/chunks when an index exists.
  - `searchKnowledgeLocal` uses the index and returns chunk-level results with score/source/title/relativePath/preview.
  - missing index falls back to scan and marks the source as unindexed/fallback.
  - result count and total characters are limited.
  - unsafe secrets and absolute source paths do not appear in returned data.
- [ ] Run `npm test -- src/electron/knowledgeBaseAdapter.test.js` and verify the new tests fail.
- [ ] Implement adapter reindex/search/index-status behavior with fallback preservation for existing tests.
- [ ] Run `npm test -- src/electron/knowledgeBaseAdapter.test.js` and verify it passes.

### Task 4: Provider And IPC

- [ ] Add failing tests:
  - `src/electron/mainProvider.test.js`: `startKnowledgeIndex` uses the configured knowledge root, writes under `userData`, then `searchKnowledgeLocal` returns indexed chunks.
  - `src/electron/mainProvider.test.js`: Agent Chat with approved/auto-allowed `kb.searchLocal` includes indexed chunk summaries in LLM `messages` and context summary.
  - `src/electron/ipcChannels.test.js`: `kb.startIndex` maps to `startKnowledgeIndex` without denied permission metadata.
  - `src/electron/ipcHandlers.test.js`: `kb:index:start` wraps provider result in ApiResult.
  - `src/electron/desktopApiFactory.test.js` and `src/services/localProvider.test.js`: `startIndex`/`startKnowledgeIndex` are available through preload/localProvider.
- [ ] Run targeted tests and verify failures.
- [ ] Wire `startKnowledgeIndex` through `mainProvider`, `IPC_METHODS`, desktop API factory, and local provider.
- [ ] Run the same targeted tests and verify they pass.

### Task 5: Knowledge Base UI Light Enhancement

- [ ] Add failing tests in `src/pages/KnowledgeBase.test.jsx`:
  - index status includes docs/chunks/pending/failed/skipped without raw paths or secrets.
  - reindex button helper calls provider `startKnowledgeIndex` and then reloads data.
  - existing row filtering remains local and stable.
- [ ] Run `npm test -- src/pages/KnowledgeBase.test.jsx src/rendererSafety.test.js` and verify failure.
- [ ] Add a minimal button handler and tiny status text using existing layout/classes.
- [ ] Run `npm test -- src/pages/KnowledgeBase.test.jsx src/rendererSafety.test.js` and verify it passes.

### Task 6: Regression Guard

- [ ] Run `npm test -- src/electron/agentToolRegistry.test.js src/electron/agentToolPlanner.test.js src/electron/agentToolOrchestrator.test.js`.
- [ ] Verify Level 1 read-only approval/auto-allow still works and Level 2/3/4 remains denied or not implemented.
- [ ] Run `npm test -- src/electron/mainProvider.test.js src/electron/agentContextBuilder.test.js src/electron/agentChatSessionStore.test.js src/electron/llmProviderAdapter.test.js src/pages/AgentChat.test.jsx src/rendererSafety.test.js`.
- [ ] Verify streaming/cancel/session memory/dry-run still pass.

### Task 7: Final Verification

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `npm run electron:smoke`.
- [ ] Use Browser/in-app browser only for visual regression:
  - Knowledge Base opens.
  - Reindex button gives clear status feedback.
  - docs/chunks/index stats display normally.
  - Agent Chat can use `kb.searchLocal` indexed results.
  - tool summaries still enter final answer/context.
  - Settings overlay opens.
  - Page Switcher still has 8 cards and 8 radial nodes.
  - console has no error/warning.
  - UI layout and style do not regress.

## Self-Review

- Spec coverage: persistent app-owned index, scanner/parser/chunker, reindex flow, indexed search, Knowledge Base UI status, Agent Chat tool integration, security redaction, and verification are covered.
- Scope exclusions: no embedding/vector store implementation, no shell/write/network/local-intel startup/music player changes, no page/layout redesign.
- Type consistency: index documents/chunks, adapter `indexStats`, provider `startKnowledgeIndex`, and tool `kb.searchLocal` names match existing contracts.
