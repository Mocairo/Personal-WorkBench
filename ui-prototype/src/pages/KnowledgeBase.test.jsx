import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  attachKnowledgeDocumentToAgentChat,
  filterKnowledgeFileTree,
  filterKnowledgeDocumentRows,
  getKnowledgeFileAttachmentInput,
  getKnowledgeAttachmentInput,
  getKnowledgeDisplayData,
  getKnowledgeDocumentRows,
  getKnowledgeIndexStatusRows,
  getKnowledgePreviewInput,
  getKnowledgeReaderView,
  KnowledgeBase,
  MarkdownBlocks,
  runKnowledgeReindex,
  runKnowledgeFullTextSearch,
} from "./KnowledgeBase";

describe("KnowledgeBase page data", () => {
  it("normalizes index stats with mock-safe defaults", () => {
    expect(
      getKnowledgeDisplayData({
        graphNodes: ["README"],
        indexStats: { chunks: 2, docs: 1, pending: 0, progress: "100%" },
        knowledgeDocuments: [{ title: "README.md", tag: "markdown", state: "indexed" }],
        providerStatus: { message: "Read from local folder", status: "ready" },
        sourceHealth: { path: "D:\\docs", status: "ready" },
      }),
    ).toMatchObject({
      graphNodes: ["README"],
      indexStats: { chunks: 2, docs: 1, pending: 0, progress: "100%" },
      knowledgeDocuments: [{ title: "README.md" }],
      providerStatus: { status: "ready" },
      sourceHealth: { path: "D:\\docs" },
    });
  });

  it("preserves backend document metadata and filters rows by local query", () => {
    const rows = getKnowledgeDocumentRows([
      {
        chunks: 2,
        inferredTags: ["markdown", "plans"],
        preview: "Contains phase three needle.",
        relativePath: "plans/phase3.md",
        source: "local",
        state: "indexed",
        tag: "markdown",
        title: "phase3.md",
        type: "md",
        updatedAt: "2026-06-01T09:00:00.000Z",
      },
      {
        preview: "Different file.",
        relativePath: "notes/other.txt",
        source: "local",
        title: "other.txt",
      },
    ]);

    expect(rows[0]).toMatchObject({
      inferredTags: ["markdown", "plans"],
      preview: "Contains phase three needle.",
      relativePath: "plans/phase3.md",
      source: "local",
      type: "md",
    });
    expect(filterKnowledgeDocumentRows(rows, "needle")).toEqual([rows[0]]);
    expect(filterKnowledgeDocumentRows(rows, "notes/other")).toEqual([rows[1]]);
    expect(filterKnowledgeDocumentRows(rows, "")).toEqual(rows);
  });

  it("builds safe index status rows with skipped and failed counts", () => {
    const rows = getKnowledgeIndexStatusRows({
      docs: 2,
      chunks: 4,
      embedding: {
        embedded: 2,
        failed: 1,
        model: "text-embedding-3-small",
        provider: "openai",
        providerStatus: "missing_secret",
        skipped: 3,
      },
      failed: 1,
      skipped: 3,
      pending: 0,
      source: "knowledge-index",
      status: "ready",
    }, {
      message: "token=sk-provider-secret",
      status: "ready",
    }, {
      path: "D:\\private\\vault\\docs",
    }, {
      status: "done",
      message: "Indexed apiKey=sk-index-secret",
    });

    expect(rows).toEqual([
      { label: "source", value: "ready" },
      { label: "path", value: "[redacted-path]" },
      { label: "queue", value: "0 pending" },
      { label: "failed", value: "1 chunk" },
      { label: "skipped", value: "3 item" },
      { label: "embedding", value: "openai/text-embedding-3-small (missing_secret)" },
      { label: "vectors", value: "2 embedded / 3 skipped" },
      { label: "embedding failed", value: "1 chunk" },
      { label: "last indexed", value: "not indexed" },
      { label: "reindex", value: "Indexed [redacted]" },
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/sk-provider-secret|sk-index-secret|apiKey|token=|D:\\private/);
  });

  it("runs Knowledge Base reindex through the provider and reloads data", async () => {
    const provider = {
      startKnowledgeIndex: vi.fn(async () => ({
        source: "knowledge-index",
        status: "ready",
        summary: { chunks: 3, docs: 2, failed: 0, indexed: 2, scanned: 2, skipped: 1 },
      })),
    };
    const reload = vi.fn();

    const result = await runKnowledgeReindex(provider, reload);

    expect(provider.startKnowledgeIndex).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      message: "2 docs / 3 chunks",
      status: "done",
    });
  });

  it("reports reindex embedding status when the provider returns embedding summary", async () => {
    const provider = {
      startKnowledgeIndex: vi.fn(async () => ({
        source: "knowledge-index",
        status: "ready",
        summary: {
          chunks: 3,
          docs: 2,
          embedding: {
            embedded: 0,
            failed: 0,
            providerStatus: "unconfigured",
            skipped: 3,
          },
          failed: 0,
          indexed: 2,
          scanned: 2,
          skipped: 1,
        },
      })),
    };

    const result = await runKnowledgeReindex(provider, vi.fn());

    expect(result).toMatchObject({
      message: "2 docs / 3 chunks / embeddings unconfigured",
      status: "done",
    });
    expect(JSON.stringify(result)).not.toMatch(/apiKey|token|secret|Authorization|sk-/);
  });

  it("reports ready local embedding vectors and waits for reload after reindex", async () => {
    const provider = {
      startKnowledgeIndex: vi.fn(async () => ({
        source: "knowledge-index",
        status: "ready",
        summary: {
          chunks: 12,
          docs: 4,
          embedding: {
            embedded: 12,
            failed: 0,
            providerStatus: "ready",
            skipped: 0,
          },
          failed: 0,
          indexed: 4,
          scanned: 4,
          skipped: 0,
        },
      })),
    };
    const events = [];
    const reload = vi.fn(async () => {
      events.push("reload");
    });

    const result = await runKnowledgeReindex(provider, reload);

    expect(events).toEqual(["reload"]);
    expect(result).toMatchObject({
      message: "4 docs / 12 chunks / 12 vectors ready",
      status: "done",
    });
  });

  it("attaches a Knowledge document row through the provider without leaking unsafe fields", async () => {
    const provider = {
      attachKnowledgeContextToAgentChat: vi.fn(async (input) => ({
        attachedKnowledgeContexts: [{ contextId: "doc-1:document", title: input.title }],
        status: "saved",
      })),
    };
    const doc = {
      chunks: 3,
      id: "doc-1",
      preview: "Preview apiKey=sk-doc-secret",
      relativePath: "D:\\private\\vault\\doc.md",
      source: "knowledge-index",
      title: "Doc token=sk-title-secret",
      updatedAt: "2026-06-05T10:00:00.000Z",
    };

    const input = getKnowledgeAttachmentInput(doc, "local-session");
    const result = await attachKnowledgeDocumentToAgentChat(doc, provider, "local-session");

    expect(input).toMatchObject({
      documentId: "doc-1",
      sessionId: "local-session",
      sourceType: "knowledge",
    });
    expect(provider.attachKnowledgeContextToAgentChat).toHaveBeenCalledWith(input);
    expect(result).toMatchObject({ status: "saved" });
    expect(JSON.stringify({ input, result })).not.toMatch(/sk-doc-secret|sk-title-secret|apiKey|token=|D:\\private/);
  });

  it("filters the file tree locally by file name and relative path while preserving parents", () => {
    const tree = [
      {
        children: [
          { id: "kb-notes-daily", name: "daily.txt", readable: true, relativePath: "notes/daily.txt", type: "file" },
          { id: "kb-notes-plan", name: "plan.md", readable: true, relativePath: "notes/plan.md", type: "file" },
        ],
        id: "folder-notes",
        name: "notes",
        relativePath: "notes",
        type: "folder",
      },
      { id: "kb-readme", name: "README.md", readable: true, relativePath: "README.md", type: "file" },
    ];

    expect(filterKnowledgeFileTree(tree, "daily")).toEqual([
      expect.objectContaining({
        name: "notes",
        children: [expect.objectContaining({ relativePath: "notes/daily.txt" })],
      }),
    ]);
    expect(filterKnowledgeFileTree(tree, "README.md")).toEqual([
      expect.objectContaining({ relativePath: "README.md" }),
    ]);
    expect(filterKnowledgeFileTree(tree, "")).toEqual(tree);
  });

  it("builds preview inputs for file nodes and search results", () => {
    expect(getKnowledgePreviewInput({
      id: "kb-docs-reader-md",
      readable: true,
      relativePath: "docs/reader.md",
      type: "file",
    })).toEqual({
      id: "kb-docs-reader-md",
      relativePath: "docs/reader.md",
    });
    expect(getKnowledgePreviewInput({
      chunkId: "chunk-1",
      documentId: "doc-1",
      id: "chunk-1",
      relativePath: "docs/result.md",
    })).toEqual({
      id: "doc-1",
      relativePath: "docs/result.md",
    });
  });

  it("represents markdown and raw reader modes without changing content", () => {
    const preview = {
      content: "# Heading\n\nBody text",
      relativePath: "notes/heading.md",
      type: "md",
    };

    expect(getKnowledgeReaderView(preview, "markdown")).toMatchObject({
      content: "# Heading\n\nBody text",
      mode: "markdown",
      renderAsMarkdown: true,
    });
    expect(getKnowledgeReaderView(preview, "raw")).toMatchObject({
      content: "# Heading\n\nBody text",
      mode: "raw",
      renderAsMarkdown: false,
    });
  });

  it("renders bold markdown inside list items without showing delimiters", () => {
    const markup = renderToStaticMarkup(<MarkdownBlocks content="- **Title**: Adaptive Memory" />);

    expect(markup).toContain("<strong>Title</strong>");
    expect(markup).not.toContain("**Title**");
  });

  it("keeps content that appears after a heading in the same markdown block", () => {
    const markup = renderToStaticMarkup(
      <MarkdownBlocks content={"# 2026-04-14\n今天准备做什么\n- 复盘 Memory reader"} />,
    );

    expect(markup).toContain("2026-04-14");
    expect(markup).toContain("今天准备做什么");
    expect(markup).toContain("复盘 Memory reader");
  });

  it("runs full-text Knowledge search through the provider on Enter/search action", async () => {
    const provider = {
      searchKnowledgeLocal: vi.fn(async (query) => ({ query, results: [{ relativePath: "notes/daily.txt" }], total: 1 })),
    };

    await expect(runKnowledgeFullTextSearch(" needle ", provider)).resolves.toMatchObject({
      query: "needle",
      total: 1,
    });
    expect(provider.searchKnowledgeLocal).toHaveBeenCalledWith("needle");
  });

  it("builds sanitized attach payloads for current file and selected reader text", () => {
    const currentFile = {
      content: "Full apiKey=sk-file-secret body",
      id: "kb-docs-reader-md",
      preview: "Preview body",
      relativePath: "docs/reader.md",
      title: "Reader token=sk-title-secret",
      updatedAt: "2026-06-06T10:00:00.000Z",
    };

    const currentInput = getKnowledgeFileAttachmentInput(currentFile, "local-session");
    const selectionInput = getKnowledgeFileAttachmentInput(
      currentFile,
      "local-session",
      `Selected apiKey=sk-selection-secret Authorization: Bearer hidden ${"x".repeat(700)}`,
    );

    expect(currentInput).toMatchObject({
      documentId: "kb-docs-reader-md",
      matchType: "document",
      preview: "Preview body",
      relativePath: "docs/reader.md",
      sessionId: "local-session",
      sourceType: "knowledge",
    });
    expect(selectionInput).toMatchObject({
      contextId: "kb-docs-reader-md:selection",
      documentId: "kb-docs-reader-md",
      matchType: "selection",
      relativePath: "docs/reader.md",
      sourceType: "knowledge",
    });
    expect(selectionInput.preview).toContain("Selected");
    expect(selectionInput.preview.length).toBeLessThanOrEqual(480);
    expect(JSON.stringify({ currentInput, selectionInput })).not.toMatch(/sk-file-secret|sk-title-secret|sk-selection-secret|apiKey|Authorization|Bearer hidden/);
  });

  it("renders the Knowledge Base as a reader workspace instead of a graph console by default", () => {
    const markup = renderToStaticMarkup(<KnowledgeBase />);

    expect(markup).toContain("File tree");
    expect(markup).toContain("Reader");
    expect(markup).toContain("Inspector");
    expect(markup).toContain("Index Health");
    expect(markup).not.toContain("Knowledge graph");
  });
});
