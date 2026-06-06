# Knowledge Base File Explorer Reader MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Knowledge Base into a safe local file browser and reader with attach-to-Agent-Chat actions, while keeping indexing/search details in collapsed advanced UI.

**Architecture:** Keep all filesystem reads in Electron main/provider code. Renderer receives only safe relative paths, bounded redacted previews/content, tree metadata, search results, and attach status through existing preload/local provider APIs. The page becomes a three-column library workspace: file tree, reader/search results, inspector.

**Tech Stack:** Electron main/provider adapters, existing IPC/preload/localProvider pattern, React 19, Vitest, no new runtime dependency.

---

## File Structure

- Modify `src/electron/knowledgeBaseAdapter.js`
  - Add safe tree walking, relative path validation, text preview/content loading, `.docx` metadata support, and no absolute path returns.
- Modify `src/electron/knowledgeBaseAdapter.test.js`
  - Cover ignored folders/files, tree shape, safe preview/content, truncation, unreadable metadata files, full-text open behavior, and sanitization.
- Modify `src/electron/mainProvider.js`
  - Expose tree/preview through configured Settings KB root and allow sanitized snippet attachments when no indexed context exists.
- Modify `src/electron/mainProvider.test.js`
  - Cover configured KB tree/preview, selected-text attachment sanitization, and no source-root writes.
- Modify `src/electron/ipcChannels.js`, `src/electron/ipcChannels.test.js`, `src/electron/ipcHandlers.test.js`, `src/electron/desktopApiFactory.test.js`
  - Add `kb:listTree` and keep existing `kb:getDocumentPreview` compatible.
- Modify `src/services/localProvider.js`, `src/services/localProvider.test.js`
  - Add `listKnowledgeFileTree()` and object-capable `getKnowledgeDocumentPreview(input)`.
- Modify `src/services/mockProvider.js`
  - Add mock tree/preview content for unconfigured/demo mode.
- Modify `src/pages/KnowledgeBase.jsx`
  - Replace graph-first layout with file tree, reader/results, inspector, attach actions, raw/markdown toggle, local filter, and Enter/full-search flow.
- Modify `src/pages/KnowledgeBase.test.jsx`
  - Cover helper behavior for tree filtering, markdown/raw mode data, search result opening, current/selected attach payloads, sanitization, and graph not default.
- Modify `src/styles.css`
  - Add scoped KB reader/tree/inspector styles and keep global shell/Page Switcher/RadialWheel untouched.
- Keep `src/rendererSafety.test.js`
  - Verify renderer still has no direct Node/Electron imports.

## Tasks

### Task 1: Safe Tree And Preview Adapter

- [ ] Add failing tests in `src/electron/knowledgeBaseAdapter.test.js`:
  - `getKnowledgeFileTree({ rootDir })` returns folder/file nodes with `id`, `name`, `relativePath`, `type`, `ext`, `size`, `updatedAt`, `children`, and `readable`.
  - tree skips `.git`, hidden folders/files, `node_modules`, `dist`, `build`, temp/junk files, `.env`, and unsupported files.
  - JSON output never contains `rootDir` or any absolute path.
  - `.md`, `.txt`, `.json`, `.csv` are readable; `.pdf` and `.docx` are valid but unreadable/metadata-only.
  - `getKnowledgeDocumentPreview({ relativePath, rootDir })` loads bounded redacted markdown/text content and marks large content truncated.
  - invalid absolute or traversal paths return missing/error without reading outside root.
- [ ] Run `npm test -- src/electron/knowledgeBaseAdapter.test.js` and verify the new tests fail.
- [ ] Implement the smallest safe tree/preview helpers in `src/electron/knowledgeBaseAdapter.js`.
- [ ] Run `npm test -- src/electron/knowledgeBaseAdapter.test.js` and verify it passes.

### Task 2: Provider, IPC, And Local Provider Surface

- [ ] Add failing tests:
  - `src/electron/mainProvider.test.js`: configured Settings KB root returns safe file tree and safe preview.
  - `src/electron/mainProvider.test.js`: selected-text attachment stores sanitized bounded context when no indexed document lookup exists.
  - `src/electron/ipcChannels.test.js`: `kb.listTree` maps to `listKnowledgeFileTree`.
  - `src/electron/ipcHandlers.test.js`: `kb:fileTree:list` wraps provider results.
  - `src/electron/desktopApiFactory.test.js`: preload exposes `api.kb.listTree()`.
  - `src/services/localProvider.test.js`: local provider unwraps `listKnowledgeFileTree()` and object preview input.
- [ ] Run targeted tests and verify failure.
- [ ] Wire `listKnowledgeFileTree` through main provider, IPC, desktop API, local provider, and mock provider.
- [ ] Add bounded fallback attachment sanitization in main provider using existing Agent Chat knowledge context store.
- [ ] Run the same targeted tests and verify they pass.

### Task 3: Knowledge Base Page Helpers And UI

- [ ] Add failing tests in `src/pages/KnowledgeBase.test.jsx`:
  - local tree filter matches by name/path.
  - Enter/full search calls `provider.searchKnowledgeLocal`.
  - search result open produces a preview request from `documentId`/`relativePath`.
  - current file attach and selected text attach create sanitized bounded payloads.
  - raw/markdown mode state is represented by helper output.
  - rendered default markup contains reader/tree/inspector labels and does not render `Knowledge graph`.
- [ ] Run `npm test -- src/pages/KnowledgeBase.test.jsx src/rendererSafety.test.js` and verify failure.
- [ ] Refactor `src/pages/KnowledgeBase.jsx` to the reader layout using existing provider APIs only.
- [ ] Add scoped CSS for `.kb-reader-layout`, file tree rows, reader body, result rows, inspector rows, and collapsed index health.
- [ ] Run focused page/safety tests and verify they pass.

### Task 4: Regression Guard

- [ ] Run `npm test -- src/electron/knowledgeBaseAdapter.test.js src/electron/mainProvider.test.js src/electron/ipcChannels.test.js src/electron/ipcHandlers.test.js src/electron/desktopApiFactory.test.js src/services/localProvider.test.js src/pages/KnowledgeBase.test.jsx src/pages/AgentChat.test.jsx src/rendererSafety.test.js`.
- [ ] Verify Agent Chat attach/citation tests still pass.
- [ ] Verify Settings/Page Switcher related tests still pass.

### Task 5: Final Verification

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `npm run electron:smoke`.
- [ ] Use Browser/in-app browser or Playwright CLI for visual regression:
  - Knowledge Base shows left tree, center reader/results, right inspector.
  - Agent Chat opens and existing attach/citation UI still works.
  - Settings overlay still opens.
  - Page Switcher still shows the existing eight pages and RadialWheel.
  - Console has no relevant errors or warnings.

## Self-Review

- Spec coverage: safe main/provider file tree, reader preview/content, two-layer search, attach current/selected text, right inspector, collapsed index health, sanitization, renderer safety, and required verification are covered.
- Scope exclusions: no global shell redesign, no new top-level pages, no renderer filesystem/model access, no local-intel startup, no network collection, no dependency additions.
- Type consistency: `relativePath`, `documentId`, `chunkId`, `fileTree`, `readable`, `content`, `truncated`, and provider method names are consistent with existing contracts and the new tests.
