import { describe, expect, it } from "vitest";
import { searchKnowledgeIndex } from "./knowledgeIndexSearch";

describe("knowledge index search", () => {
  it("returns bounded chunk-level keyword results from the persistent index", () => {
    const index = {
      chunks: [
        {
          chunkId: "doc-1:chunk-0",
          documentId: "doc-1",
          preview: `Alpha needle ${"x".repeat(600)} token=sk-search-secret D:\\private\\vault\\a.md`,
          relativePath: "notes/a.md",
          title: "Alpha",
          titlePath: ["Intro"],
          updatedAt: "2026-06-05T00:00:00.000Z",
        },
        {
          chunkId: "doc-2:chunk-0",
          documentId: "doc-2",
          preview: "Beta needle",
          relativePath: "notes/b.md",
          title: "Beta needle",
          titlePath: ["Beta"],
          updatedAt: "2026-06-05T00:00:00.000Z",
        },
        {
          chunkId: "doc-3:chunk-0",
          documentId: "doc-3",
          preview: "No match",
          relativePath: "notes/c.md",
          title: "Gamma",
        },
      ],
      documents: [
        { id: "doc-1", relativePath: "notes/a.md", title: "Alpha", type: "md", updatedAt: "2026-06-05T00:00:00.000Z" },
        { id: "doc-2", relativePath: "notes/b.md", title: "Beta", type: "txt", updatedAt: "2026-06-05T00:00:00.000Z" },
      ],
      status: "ready",
      updatedAt: "2026-06-05T00:00:00.000Z",
    };

    const result = searchKnowledgeIndex(index, {
      maxResultChars: 120,
      maxResultItems: 1,
      query: "needle",
    });

    expect(result).toMatchObject({
      query: "needle",
      source: "knowledge-index",
      status: "ready",
      total: 2,
      results: [
        expect.objectContaining({
          chunkId: "doc-2:chunk-0",
          documentId: "doc-2",
          preview: expect.stringContaining("Beta needle"),
          relativePath: "notes/b.md",
          score: expect.any(Number),
          source: "knowledge-index",
          title: "Beta needle",
          titlePath: ["Beta"],
        }),
      ],
    });
    expect(result.results[0].preview.length).toBeLessThanOrEqual(120);
    expect(JSON.stringify(result)).not.toMatch(/sk-search-secret|token=|D:\\private/);
  });

  it("returns an unindexed status when no usable index is present", () => {
    const result = searchKnowledgeIndex({ chunks: [], documents: [], status: "missing" }, { query: "needle" });

    expect(result).toEqual({
      query: "needle",
      results: [],
      source: "knowledge-index",
      status: "unindexed",
      total: 0,
    });
  });

  it("returns semantic matches from cached vectors when query embedding is available", () => {
    const index = {
      chunks: [
        {
          chunkId: "doc-1:chunk-0",
          documentId: "doc-1",
          preview: "Project Apollo launch notes",
          relativePath: "space/apollo.md",
          title: "Apollo",
        },
        {
          chunkId: "doc-2:chunk-0",
          documentId: "doc-2",
          preview: "Garden tomato notes",
          relativePath: "garden/tomato.md",
          title: "Tomato",
        },
      ],
      documents: [
        { id: "doc-1", relativePath: "space/apollo.md", title: "Apollo", type: "md" },
        { id: "doc-2", relativePath: "garden/tomato.md", title: "Tomato", type: "md" },
      ],
      status: "ready",
    };

    const result = searchKnowledgeIndex(index, {
      maxResultItems: 1,
      query: "orbital mechanics",
      queryEmbedding: [0.98, 0.02],
      vectors: [
        { chunkId: "doc-1:chunk-0", embedding: [1, 0], textHash: "a" },
        { chunkId: "doc-2:chunk-0", embedding: [0, 1], textHash: "b" },
      ],
    });

    expect(result).toMatchObject({
      matchMode: "semantic",
      results: [
        expect.objectContaining({
          chunkId: "doc-1:chunk-0",
          matchType: "semantic",
          relativePath: "space/apollo.md",
          score: expect.any(Number),
          vectorScore: expect.any(Number),
        }),
      ],
      semanticStatus: "ready",
      status: "ready",
    });
  });

  it("merges keyword and vector scores into hybrid results", () => {
    const index = {
      chunks: [
        {
          chunkId: "doc-1:chunk-0",
          documentId: "doc-1",
          preview: "Needle design system notes",
          relativePath: "design/system.md",
          title: "Design needle",
        },
        {
          chunkId: "doc-2:chunk-0",
          documentId: "doc-2",
          preview: "Needle but less relevant",
          relativePath: "design/archive.md",
          title: "Archive",
        },
      ],
      documents: [
        { id: "doc-1", relativePath: "design/system.md", title: "Design", type: "md" },
        { id: "doc-2", relativePath: "design/archive.md", title: "Archive", type: "md" },
      ],
      status: "ready",
    };

    const result = searchKnowledgeIndex(index, {
      maxResultItems: 1,
      query: "needle",
      queryEmbedding: [1, 0],
      vectors: [
        { chunkId: "doc-1:chunk-0", embedding: [1, 0], textHash: "a" },
        { chunkId: "doc-2:chunk-0", embedding: [0.2, 0.8], textHash: "b" },
      ],
    });

    expect(result).toMatchObject({
      matchMode: "hybrid",
      results: [
        expect.objectContaining({
          chunkId: "doc-1:chunk-0",
          keywordScore: expect.any(Number),
          matchType: "hybrid",
          vectorScore: expect.any(Number),
        }),
      ],
      semanticStatus: "ready",
    });
  });

  it("falls back to keyword-only matches when semantic search is unavailable", () => {
    const index = {
      chunks: [
        {
          chunkId: "doc-1:chunk-0",
          documentId: "doc-1",
          preview: "Needle apiKey=sk-search-secret D:\\private\\vault\\note.md",
          relativePath: "notes/a.md",
          title: "Needle",
        },
      ],
      documents: [
        { id: "doc-1", relativePath: "notes/a.md", title: "Needle", type: "md" },
      ],
      status: "ready",
    };

    const result = searchKnowledgeIndex(index, {
      maxResultChars: 80,
      query: "needle",
      semanticStatus: "unavailable",
    });

    expect(result).toMatchObject({
      matchMode: "keyword",
      results: [
        expect.objectContaining({
          chunkId: "doc-1:chunk-0",
          matchType: "keyword",
        }),
      ],
      semanticStatus: "unavailable",
    });
    expect(result.results[0].preview.length).toBeLessThanOrEqual(80);
    expect(JSON.stringify(result)).not.toMatch(/sk-search-secret|apiKey=|D:\\private/);
  });
});
