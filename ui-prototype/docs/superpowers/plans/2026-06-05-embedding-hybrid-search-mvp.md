# Embedding Hybrid Search MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe Electron main-process embedding provider abstraction, app-owned vector cache, and hybrid-ready Knowledge Base search that degrades to keyword search when embeddings are unavailable.

**Architecture:** Keep all embedding calls and vector persistence in Electron main/provider code. Extend the existing persistent Knowledge index flow with an optional embedding pass that writes only `userData/knowledge/knowledge-vectors.json`; upgrade `kb.searchLocal` to merge keyword and vector scores while preserving bounded, redacted chunk results for Agent Chat Context Builder. The renderer only receives sanitized status/counts/results through existing provider APIs.

**Tech Stack:** Electron main/provider layer, Node `fs/promises`, OpenAI-compatible `/v1/embeddings` over injected/fetch transport, deterministic fake embeddings for tests, React/Vite renderer via existing provider APIs, Vitest.

---

## Baseline

- Fresh baseline command: `npm test` before production code changes.
- Already present: persistent Knowledge index under `userData/knowledge/knowledge-index.json`, scanner/parser/chunker, keyword chunk-level search, `kb.searchLocal` Agent Chat integration, Context Builder/session memory, streaming/cancel/session persistence, Tool MVP Level 1 approval and Level 2/3/4 denial.
- Current gap: no embedding provider abstraction, no app-owned vector cache, and `knowledgeIndexSearch` is keyword-only.
- Scope exclusions: no embedding/vector store service, no external crawl, no local-intel startup, no shell/write tools, no Renderer secret access, no UI redesign.

## Files

- Create: `src/electron/embeddingProviderAdapter.js`
  - Owns deterministic fake embeddings, OpenAI-compatible embeddings, provider status, request input clamping, and sanitized ApiResult errors.
- Create: `src/electron/embeddingProviderAdapter.test.js`
  - Covers stable fake vectors, unconfigured/missing-secret no-request behavior, OpenAI-compatible request shape, sanitized failures, and input size limits.
- Create: `src/electron/knowledgeVectorStore.js`
  - Owns `userData/knowledge/knowledge-vectors.json`, read/write/clear, metadata normalization, secret/path redaction, and changed-chunk detection by `chunkId`/`textHash`.
- Create: `src/electron/knowledgeVectorStore.test.js`
  - Covers app-owned writes, no secrets/raw text/absolute paths, unchanged chunk reuse, changed chunk refresh, and clear/read behavior.
- Modify: `src/electron/knowledgeIndexSearch.js`
  - Add semantic/hybrid ranking helpers while keeping keyword-only fallback behavior.
- Modify: `src/electron/knowledgeIndexSearch.test.js`
  - Cover vector similarity, hybrid score merge, keyword fallback, result size limits, and redaction.
- Modify: `src/electron/knowledgeBaseAdapter.js`
  - Add optional embedding pass during reindex, vector cache writes, embedding summary, and hybrid-ready `searchKnowledgeLocal`.
- Modify: `src/electron/knowledgeBaseAdapter.test.js`
  - Cover reindex embedding summary, unavailable fallback, chunk failure isolation, vector cache writes, and hybrid/semantic search.
- Modify: `src/electron/mainProvider.js`
  - Pass injected embedding options to KB reindex/search, return sanitized embedding metadata/status, and keep Agent Chat tool path unchanged.
- Modify: `src/electron/mainProvider.test.js`
  - Cover provider-level embedding summary and Agent Chat tool result with hybrid-ready KB output.
- Modify: `src/pages/KnowledgeBase.jsx`, `src/pages/KnowledgeBase.test.jsx`
  - Add small embedding status/count rows using the existing Index state panel only.

## Tasks

### Task 1: Embedding Provider Adapter

- [ ] Write failing tests in `src/electron/embeddingProviderAdapter.test.js`:
  - fake provider returns stable finite vectors for the same text.
  - unconfigured provider returns `unconfigured` and never calls transport.
  - missing secret returns `missing_secret` and never calls transport.
  - OpenAI-compatible provider POSTs `{ model, input }` to `/embeddings` and returns `data[].embedding`.
  - API/network errors are returned as sanitized ApiResult failures.
  - long inputs are redacted and clamped before transport.
- [ ] Run `npm test -- src/electron/embeddingProviderAdapter.test.js` and verify failure because the module is missing.
- [ ] Implement the adapter with `embedTexts(input, options)` and `getEmbeddingProviderStatus(options)`.
- [ ] Run the same test and verify it passes.

### Task 2: Vector Cache Store

- [ ] Write failing tests in `src/electron/knowledgeVectorStore.test.js`:
  - vector path is `userData/knowledge/knowledge-vectors.json`.
  - write/read/clear round trip chunk vectors and sanitized provider/model metadata.
  - JSON does not contain `apiKey`, `token`, `secret`, `Authorization: Bearer`, `sk-*`, raw chunk text, or Windows absolute paths.
  - unchanged `chunkId`/`textHash` is reusable and changed `textHash` requires recompute.
- [ ] Run `npm test -- src/electron/knowledgeVectorStore.test.js` and verify failure because the module is missing.
- [ ] Implement vector store helpers and changed-chunk selection.
- [ ] Run the same test and verify it passes.

### Task 3: Semantic And Hybrid Search

- [ ] Add failing tests in `src/electron/knowledgeIndexSearch.test.js`:
  - semantic search returns the closest cached vector chunk.
  - hybrid search combines keyword and vector scores with `matchType: "hybrid"`.
  - provider/vector unavailable returns keyword-only results with `matchType: "keyword"`.
  - result count/chars stay bounded and unsafe text is redacted.
- [ ] Run `npm test -- src/electron/knowledgeIndexSearch.test.js` and verify the new tests fail.
- [ ] Extend `searchKnowledgeIndex` with optional `queryEmbedding`, `vectors`, and hybrid ranking.
- [ ] Run the same test and verify it passes.

### Task 4: Reindex Embedding Pass And Adapter Search

- [ ] Add failing tests in `src/electron/knowledgeBaseAdapter.test.js`:
  - reindex with fake provider writes `knowledge-vectors.json` under `userData`.
  - provider unavailable still writes the document index and returns embedding skipped/unavailable summary.
  - unchanged chunks are not re-embedded; changed chunks are re-embedded by `textHash`.
  - single chunk embedding failure increments failed count without blocking index.
  - `searchKnowledgeLocal` uses semantic/hybrid results when embeddings are ready and keyword-only fallback otherwise.
- [ ] Run `npm test -- src/electron/knowledgeBaseAdapter.test.js` and verify the new tests fail.
- [ ] Wire embedding pass and hybrid-ready search through `knowledgeBaseAdapter`.
- [ ] Run the same test and verify it passes.

### Task 5: Main Provider And Agent Chat Integration

- [ ] Add failing tests in `src/electron/mainProvider.test.js`:
  - `startKnowledgeIndex` returns sanitized embedding summary without raw vector path or secrets.
  - `searchKnowledgeLocal` can return hybrid-ready chunk results from the configured knowledge root.
  - approved `kb.searchLocal` tool summaries still reach Agent Chat LLM messages/context summary.
- [ ] Run targeted tests and verify failures.
- [ ] Pass embedding options through `mainProvider` and keep `kb.searchLocal` tool registry unchanged.
- [ ] Run targeted tests and verify they pass.

### Task 6: Knowledge Base UI Status

- [ ] Add failing tests in `src/pages/KnowledgeBase.test.jsx`:
  - index status rows include embedding provider/status and embedded/skipped/failed counts.
  - reindex helper reports embedding skipped/ready status without secrets or raw paths.
- [ ] Run `npm test -- src/pages/KnowledgeBase.test.jsx src/rendererSafety.test.js` and verify failures.
- [ ] Add minimal status rows in the existing Index state panel.
- [ ] Run the same test and verify it passes.

### Task 7: Regression And Final Verification

- [ ] Run `npm test -- src/electron/agentToolRegistry.test.js src/electron/agentToolPlanner.test.js src/electron/agentToolOrchestrator.test.js`.
- [ ] Run `npm test -- src/electron/mainProvider.test.js src/electron/agentContextBuilder.test.js src/electron/agentChatSessionStore.test.js src/electron/llmProviderAdapter.test.js src/pages/AgentChat.test.jsx src/rendererSafety.test.js`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `npm run electron:smoke`.
- [ ] Use Browser/in-app browser for visual regression only:
  - Knowledge Base opens.
  - Reindex status shows embedding skipped/ready.
  - keyword-only search still works without embedding provider.
  - Agent Chat can use `kb.searchLocal` tool results.
  - Settings overlay opens.
  - Page Switcher still has 8 cards and 8 radial nodes.
  - console has no error/warning.

## Self-Review

- Spec coverage: provider abstraction, deterministic fake provider, OpenAI-compatible provider, vector cache, reindex embedding pass, semantic/hybrid search, Agent Chat tool integration, UI status, security redaction, fallback behavior, and verification are covered.
- Scope exclusions preserved: no Renderer secrets, no source-file writes, no external crawl, no background runtime, no UI layout rewrite, no Level 2/3/4 execution.
- Type consistency: `embeddingSummary`, `matchType`, `knowledge-vectors.json`, and `kb.searchLocal` match existing adapter/provider flow.
