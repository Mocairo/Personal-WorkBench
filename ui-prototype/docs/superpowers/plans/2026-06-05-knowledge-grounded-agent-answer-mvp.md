# Knowledge-Grounded Agent Answer MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agent Chat answers that use Knowledge Base context show bounded, redacted, persisted source citations, and Home Dashboard jump points navigate to existing pages.

**Architecture:** Keep citations in Electron main/provider data flow, not Renderer filesystem access. Context Builder derives compact `sourceRefs` from attached Knowledge contexts, context items, and `kb.searchLocal` tool result summaries, injects source markers into the LLM prompt, and persists citation metadata through the existing session store. Renderer receives only sanitized citation metadata and renders small chips under assistant messages.

**Tech Stack:** Electron main/provider adapters, React 19, Vitest, existing IPC/preload/localProvider patterns, no new runtime dependency.

---

## File Structure

- Modify `src/electron/agentContextBuilder.js`
  - Normalize source references and include them in prompt/contextSummary.
- Modify `src/electron/agentContextBuilder.test.js`
  - TDD coverage for source refs, prompt markers, trimming, redaction.
- Modify `src/electron/mainProvider.js`
  - Attach citation metadata to assistant messages for success and LLM failure fallback.
- Modify `src/electron/mainProvider.test.js`
  - Integration coverage for attached KB citations, `kb.searchLocal` citations, persistence, fallback.
- Modify `src/electron/agentChatSessionStore.js`
  - Persist sanitized assistant `metadata.citations`.
- Modify `src/electron/agentChatSessionStore.test.js`
  - Persist citation metadata and reject secrets/absolute paths/full text.
- Modify `src/electron/agentChatAdapter.js`
  - Read persisted citation metadata back to Renderer.
- Modify `src/electron/agentChatAdapter.test.js`
  - Verify persisted citations are redacted on read.
- Modify `src/pages/AgentChat.jsx`
  - Render citation chips under assistant messages and expose current answer citations in Context panel.
- Modify `src/pages/AgentChat.test.jsx`
  - Helper tests for citation extraction/render data and merge behavior.
- Modify `src/components/ui/QuickEntry.jsx`
  - Add `onSelect`, disabled/not implemented handling, and accessible button type.
- Modify `src/pages/HomeDashboard.jsx`
  - Accept `onNavigate` prop and pass it to `QuickEntry`.
- Modify `src/components/shell/AppShell.jsx`
  - Pass existing page navigation callback to `HomeDashboard`.
- Modify `src/hooks/usePageNavigation.js`
  - Return `navigateToPageId`.
- Modify navigation/Home tests.

## Task 1: Source Refs In Context Builder

**Files:**
- Modify: `src/electron/agentContextBuilder.js`
- Test: `src/electron/agentContextBuilder.test.js`

- [ ] **Step 1: Write failing tests**

Add tests that call `buildAgentLlmContext` with an attached Knowledge context and a `kb.searchLocal` tool summary containing result metadata. Expected:
- `contextSummary.sourceRefs` contains `[S1]`, `[S2]` refs.
- LLM system context includes `Source References`.
- Secrets and Windows absolute paths are redacted.

Run: `npm test -- src/electron/agentContextBuilder.test.js`
Expected: FAIL because `sourceRefs` does not exist.

- [ ] **Step 2: Implement minimal source ref normalization**

Add helpers:

```js
function normalizeSourceRef(raw = {}, index = 0, fallbackSourceType = "knowledge", limits) {
  const sourceType = normalizeSourceType(firstString(raw.sourceType, raw.type, raw.source), fallbackSourceType);
  const title = limitText(firstString(raw.title, raw.label, raw.relativePath, raw.documentId, `Source ${index + 1}`), 140);
  const preview = limitText(firstString(raw.preview, raw.excerpt, raw.summary, raw.message), 240);
  return {
    chunkId: limitText(firstString(raw.chunkId), 180),
    documentId: limitText(firstString(raw.documentId, raw.id), 160),
    matchType: limitText(firstString(raw.matchType), 80),
    preview,
    relativePath: limitText(firstString(raw.relativePath, raw.path), 220),
    score: Number.isFinite(raw.score) ? raw.score : undefined,
    sourceRefId: `S${index + 1}`,
    sourceType,
    title,
  };
}
```

Include selected refs in `contextSummary.sourceRefs` and prompt:

```text
Source References:
[S1] title (knowledge; path; matchType): preview
```

- [ ] **Step 3: Verify**

Run: `npm test -- src/electron/agentContextBuilder.test.js`
Expected: PASS.

## Task 2: Assistant Citation Metadata And Persistence

**Files:**
- Modify: `src/electron/mainProvider.js`
- Modify: `src/electron/agentChatSessionStore.js`
- Modify: `src/electron/agentChatAdapter.js`
- Test: `src/electron/mainProvider.test.js`
- Test: `src/electron/agentChatSessionStore.test.js`
- Test: `src/electron/agentChatAdapter.test.js`

- [ ] **Step 1: Write failing tests**

Add tests proving:
- successful assistant message includes `metadata.citations`.
- if LLM answer has no `[S1]` marker, fallback citations still attach from `contextSummary.sourceRefs`.
- persisted session JSON includes compact citation metadata.
- persisted/read data excludes `sk-*`, `apiKey`, `token`, `Authorization`, `D:\private`, and long full text.

Run:

```powershell
npm test -- src/electron/mainProvider.test.js src/electron/agentChatSessionStore.test.js src/electron/agentChatAdapter.test.js
```

Expected: FAIL because citations are not persisted or exposed.

- [ ] **Step 2: Implement minimal metadata flow**

In `mainProvider.js`, add:

```js
function citationMetadataFromContextSummary(contextSummary = {}) {
  const citations = Array.isArray(contextSummary.sourceRefs) ? contextSummary.sourceRefs.slice(0, 8) : [];
  return citations.length > 0 ? { citations } : null;
}
```

Merge into assistant metadata in success/error builders.

In `agentChatSessionStore.js`, allow only sanitized `metadata.citations`:

```js
function sanitizeCitations(citations = []) {
  return citations.slice(0, 8).map((citation) => ({
    sourceRefId: limitPersistedText(citation.sourceRefId, 20),
    documentId: limitPersistedText(citation.documentId, 120),
    chunkId: limitPersistedText(citation.chunkId, 160),
    title: limitPersistedText(citation.title, 160),
    relativePath: limitPersistedText(citation.relativePath, 220),
    preview: limitPersistedText(citation.preview, 240),
    matchType: limitPersistedText(citation.matchType, 80),
    sourceType: limitPersistedText(citation.sourceType, 80) || "knowledge",
  })).filter((citation) => citation.title || citation.documentId || citation.relativePath);
}
```

Mirror sanitizer in `agentChatAdapter.js` for read safety.

- [ ] **Step 3: Verify**

Run the same focused tests.
Expected: PASS.

## Task 3: Agent Chat Citation UI

**Files:**
- Modify: `src/pages/AgentChat.jsx`
- Modify: `src/styles.css`
- Test: `src/pages/AgentChat.test.jsx`

- [ ] **Step 1: Write failing tests**

Add helper tests:
- `getMessageCitationChips(message)` returns sanitized citation chips from `message.metadata.citations`.
- `mergeStreamResultIntoChatData` preserves assistant citation metadata.
- no secrets/absolute paths appear in chip data.

Run: `npm test -- src/pages/AgentChat.test.jsx`
Expected: FAIL because citation chip helper does not exist.

- [ ] **Step 2: Implement citation chips**

Add helper:

```js
export function getMessageCitationChips(message = {}) {
  return (Array.isArray(message.metadata?.citations) ? message.metadata.citations : [])
    .slice(0, 8)
    .map((citation) => ({
      sourceRefId: redactDisplayText(citation.sourceRefId),
      title: redactDisplayText(citation.title ?? citation.relativePath ?? citation.documentId ?? "Knowledge source"),
      detail: redactDisplayText(citation.relativePath ?? citation.matchType ?? citation.sourceType ?? "source"),
      preview: redactDisplayText(citation.preview ?? ""),
    }))
    .filter((citation) => citation.sourceRefId || citation.title);
}
```

Render under assistant messages:

```jsx
{getMessageCitationChips(message).length > 0 && (
  <div className="citation-chip-row">
    {getMessageCitationChips(message).map((citation) => (
      <button className="citation-chip" type="button" key={citation.sourceRefId || citation.title}>
        <strong>{citation.sourceRefId}</strong>
        <span>{citation.title}</span>
      </button>
    ))}
  </div>
)}
```

- [ ] **Step 3: Verify**

Run: `npm test -- src/pages/AgentChat.test.jsx`
Expected: PASS.

## Task 4: Home Dashboard Jump Points

**Files:**
- Modify: `src/hooks/usePageNavigation.js`
- Modify: `src/components/shell/AppShell.jsx`
- Modify: `src/pages/HomeDashboard.jsx`
- Modify: `src/components/ui/QuickEntry.jsx`
- Test: `src/components/ui/QuickEntry.test.jsx` or existing shell/home tests

- [ ] **Step 1: Write failing tests**

Test that `QuickEntry` calls `onSelect(page.id)` when clicked and that disabled entries do not call it.

Run: `npm test -- src/components/ui/QuickEntry.test.jsx src/components/shell/ShellNavigation.test.jsx`
Expected: FAIL before handler exists.

- [ ] **Step 2: Implement existing navigation integration**

In `usePageNavigation.js`, add:

```js
const navigateToPageId = (pageId) => {
  const nextIndex = pages.findIndex((page) => page.id === pageId);
  if (nextIndex < 0) return;
  setActiveIndex(nextIndex);
  setSelectedIndex(nextIndex);
  setSwitcherOpen(false);
};
```

In `AppShell.jsx`, render:

```jsx
<CurrentPage onNavigate={navigateToPageId} />
```

In `HomeDashboard.jsx`:

```jsx
export function HomeDashboard({ onNavigate }) {
  ...
  <QuickEntry page={page} key={page.id} onSelect={onNavigate} />
}
```

In `QuickEntry.jsx`, call `onSelect(page.id)` if supplied.

- [ ] **Step 3: Verify**

Run focused navigation tests.
Expected: PASS.

## Task 5: Full Verification

**Files:**
- No new code unless verification finds a bug.

- [ ] **Step 1: Renderer safety**

Run:

```powershell
rg -n "node:fs|node:path|child_process|from \"electron\"|from 'electron'|require\\(" src/pages src/components src/hooks src/services -S
```

Expected: no Renderer direct Node/Electron imports.

- [ ] **Step 2: Full tests**

Run: `npm test`
Expected: 0 failures.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: exit code 0.

- [ ] **Step 4: Electron smoke**

Run: `npm run electron:smoke`
Expected: exit code 0. Chromium GPU/cache noise can be noted if present.

- [ ] **Step 5: Browser/in-app Browser**

If Browser tools are exposed, verify:
- Home Jump points switch pages.
- Knowledge Base attach then Agent Chat shows linked context.
- Agent Chat answer shows citation chips.
- Settings overlay opens.
- Page Switcher remains eight cards and eight radial nodes.

If Browser tools are not exposed, state that limitation and rely on automated smoke/build/tests.

