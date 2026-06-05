# Local BGE-M3 Embedding Runtime Provider MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe Electron main-process `local-bge-m3` embedding provider that can use the local `D:\models\bge-m3` model through a fixed app-owned Python runtime and degrade to keyword-only search when the runtime is unavailable.

**Architecture:** Extend the existing `embeddingProviderAdapter` instead of adding renderer APIs. The provider validates the model directory in Electron main, invokes only a fixed Python script with fixed arguments, reads/writes the existing app-owned vector cache, and returns sanitized provider status and summaries. Knowledge Base and Agent Chat keep using the existing `kb.searchLocal` and Context Builder paths.

**Tech Stack:** Electron main/provider layer, Node `fs/promises` and `child_process.spawn` in `src/electron`, Python one-shot runtime script using `sentence-transformers` when installed, existing `userData/knowledge/knowledge-vectors.json`, Vitest.

---

## Baseline

- Fresh baseline command: `npm test`.
- Baseline result: 62 test files and 246 tests passed.
- Current local model directory exists at `D:\models\bge-m3` and contains sentence-transformers model files such as `config_sentence_transformers.json`, `modules.json`, tokenizer files, and `pytorch_model.bin`.
- Already present: fake/OpenAI-compatible embedding provider, app-owned vector cache, hybrid search, KB UI embedding status, Agent Chat tool summary integration, streaming/cancel/session memory, Tool MVP permission boundaries.
- Scope exclusions: no UI redesign, no renderer model loading, no arbitrary command execution, no local-intel startup, no git operations, no writing user source files, no external network collection.

## Files

- Create: `scripts/embed_bge_m3.py`
  - Fixed one-shot local embedding runtime.
  - Reads JSON from stdin: `{ "texts": [...] }`.
  - Loads `sentence_transformers.SentenceTransformer(model_path)`.
  - Outputs JSON with `ok`, `embeddings`, `model`, `dimension`, and `elapsed`.
  - Emits structured JSON errors for `missing_model`, `missing_dependency`, and `runtime_error`.
- Modify: `src/electron/embeddingProviderAdapter.js`
  - Add `local-bge-m3` config normalization, status checks, fixed runtime command building, child-process invocation, timeout handling, and sanitized ApiResult failures.
- Modify: `src/electron/embeddingProviderAdapter.test.js`
  - Add RED tests for local model status, missing model status, runtime success, runtime unavailable, fixed command behavior, and no path/secret leakage.
- Modify: `src/electron/knowledgeVectorStore.js`
  - Preserve vector dimension metadata while continuing to omit raw text, headers, secrets, and absolute paths.
- Modify: `src/electron/knowledgeVectorStore.test.js`
  - Add dimension metadata assertions.
- Modify: `src/electron/knowledgeBaseAdapter.js`
  - Surface runtime failure status in embedding summary while keeping keyword index/search available.
- Modify: `src/electron/knowledgeBaseAdapter.test.js`
  - Add local-bge-m3 reindex/search tests with injected runtime success and failure.
- Modify: `src/electron/main.js`
  - Configure desktop runtime with default `local-bge-m3` model path `D:\models\bge-m3`.
- Modify: `src/electron/mainProvider.test.js`
  - Cover provider injection of local-bge-m3 without exposing absolute model paths.
- Keep: Renderer pages and IPC shape
  - No new renderer filesystem/process/model API.

## Tasks

### Task 1: Local BGE-M3 Provider Status And Runtime Contract

- [x] Add failing tests in `src/electron/embeddingProviderAdapter.test.js`:
  - `getEmbeddingProviderStatus({ config: { provider: "local-bge-m3", modelPath } })` returns `ready` when `modelPath` exists.
  - missing `modelPath` returns `missing_model` and does not call runtime.
  - runtime success returns embeddings, `providerStatus: "ready"`, model `bge-m3`, dimension, and elapsed metadata.
  - runtime errors return sanitized ApiResult failures and do not expose `D:\models\bge-m3`, `apiKey`, `token`, `Authorization`, or `sk-*`.
  - command construction ignores config-provided `command`/`args` and uses only a fixed Python executable plus fixed script path and fixed arguments.
- [x] Run `npm test -- src/electron/embeddingProviderAdapter.test.js` and verify the new tests fail.
- [x] Implement local provider status helpers, fixed command builder, runtime invocation, and local response parsing.
- [x] Run the same test and verify it passes.

### Task 2: Python Runtime Script

- [x] Add failing test coverage through the adapter for fixed script path existence and structured missing-dependency output.
- [x] Run targeted tests and verify failure because `scripts/embed_bge_m3.py` does not exist.
- [x] Create `scripts/embed_bge_m3.py` with stdin JSON input, input clamping, batch limit, local model validation, `sentence-transformers` loading, normalized embeddings, and structured JSON errors.
- [x] Run targeted tests and verify they pass.

### Task 3: Vector Cache Dimension Metadata

- [x] Add failing tests in `src/electron/knowledgeVectorStore.test.js`:
  - vector cache metadata stores `dimension` when supplied.
  - persisted JSON still excludes secrets, headers, raw text, and absolute paths.
- [x] Run `npm test -- src/electron/knowledgeVectorStore.test.js` and verify failure.
- [x] Extend metadata normalization to include finite numeric `dimension`.
- [x] Run the same test and verify it passes.

### Task 4: Reindex/Search Integration

- [x] Add failing tests in `src/electron/knowledgeBaseAdapter.test.js`:
  - reindex with `local-bge-m3` and injected runtime writes vector cache and reports `embedded/skipped/failed/providerStatus/model`.
  - runtime unavailable keeps document index ready and reports embedding unavailable/missing dependency.
  - search uses local embedding query results for semantic/hybrid ranking.
  - query embedding failure returns keyword-only results without crashing.
- [x] Run `npm test -- src/electron/knowledgeBaseAdapter.test.js` and verify failure.
- [x] Wire local provider failure status into embedding summary and search fallback.
- [x] Run the same test and verify it passes.

### Task 5: Main Process Desktop Default

- [x] Add failing tests in `src/electron/mainProvider.test.js`:
  - provider accepts `local-bge-m3` config and returns sanitized embedding summary.
  - output does not contain raw `D:\models\bge-m3` or arbitrary runtime command fields.
- [x] Run `npm test -- src/electron/mainProvider.test.js` and verify failure.
- [x] Configure `src/electron/main.js` to pass default `embeddingConfig: { provider: "local-bge-m3", model: "bge-m3", modelPath: "D:\\models\\bge-m3" }`.
- [x] Keep `createMainDataProvider` test-friendly by using explicit options in tests.
- [x] Run targeted tests and verify they pass.

### Task 6: Regression And Final Verification

- [x] Run `npm test -- src/electron/embeddingProviderAdapter.test.js src/electron/knowledgeVectorStore.test.js src/electron/knowledgeBaseAdapter.test.js src/electron/mainProvider.test.js src/rendererSafety.test.js`.
- [x] Run `npm test -- src/electron/agentToolRegistry.test.js src/electron/agentToolPlanner.test.js src/electron/agentToolOrchestrator.test.js src/electron/agentContextBuilder.test.js src/electron/agentChatSessionStore.test.js src/electron/llmProviderAdapter.test.js src/pages/AgentChat.test.jsx`.
- [x] Run `npm test`.
- [x] Run `npm run build`.
- [x] Run `npm run electron:smoke`.
- [x] Use Browser/in-app browser for visual regression only:
  - Knowledge Base opens.
  - Reindex status shows local-bge-m3 ready/missing_dependency/unavailable without raw path.
  - Search still works keyword-only if runtime dependencies are missing.
  - Agent Chat can still use `kb.searchLocal`.
  - Settings overlay opens.
  - Page Switcher remains 8 cards and 8 nodes.
  - console has no error/warning.

## Self-Review

- Spec coverage: local-bge-m3 provider, default model path, Python runtime, fixed command boundary, fallback behavior, vector cache reuse, Knowledge reindex/search integration, UI status through existing panel, and final verification are covered.
- Scope exclusions preserved: no renderer model loading, no arbitrary shell exposure, no local-intel startup, no UI redesign, no source-file writes, no git operations.
- Runtime note: this machine currently lacks `sentence-transformers`, so the local provider will report `missing_dependency` until that package is installed in the Python environment used by the app.
- Type consistency: `providerStatus`, `embeddingSummary`, `dimension`, `local-bge-m3`, and existing `kb.searchLocal` names match the current code shape.
