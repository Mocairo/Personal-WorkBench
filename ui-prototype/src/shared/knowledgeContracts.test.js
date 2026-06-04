import { describe, expect, it } from "vitest";
import {
  buildKnowledgeDocument,
  buildKnowledgeIndexStatus,
  buildKnowledgeScanSummary,
  buildKnowledgeSearchResult,
  buildKnowledgeSource,
} from "./knowledgeContracts";

describe("knowledge contracts", () => {
  it("normalizes local document metadata without absolute paths", () => {
    const document = buildKnowledgeDocument({
      id: "doc-readme",
      inferredTags: ["markdown", "docs"],
      preview: "A short local preview.",
      relativePath: "notes/README.md",
      size: 128,
      source: "local",
      status: "indexed",
      title: "README.md",
      type: "md",
      updatedAt: "2026-06-01T09:00:00.000Z",
    });

    expect(document).toEqual({
      chunks: 1,
      excerpt: "A short local preview.",
      id: "doc-readme",
      inferredTags: ["markdown", "docs"],
      kind: "md",
      name: "README.md",
      preview: "A short local preview.",
      relativePath: "notes/README.md",
      size: 128,
      source: "local",
      state: "indexed",
      status: "indexed",
      tag: "markdown",
      title: "README.md",
      type: "md",
      updatedAt: "2026-06-01T09:00:00.000Z",
    });
  });

  it("builds stable source, scan, index and search result shapes", () => {
    expect(buildKnowledgeSource({ documentCount: 2, path: "Docs", status: "ready" })).toMatchObject({
      configured: true,
      documentCount: 2,
      id: "knowledge-base",
      source: "local",
      status: "ready",
      type: "directory",
    });

    expect(buildKnowledgeScanSummary({ indexed: 2, scanned: 3, skipped: 1 })).toMatchObject({
      errors: 0,
      indexed: 2,
      scanned: 3,
      skipped: 1,
      source: "local",
    });

    expect(buildKnowledgeIndexStatus({ docs: 2, indexed: 1, pending: 1 })).toMatchObject({
      chunks: 1,
      docs: 2,
      failed: 0,
      pending: 1,
      progress: "50%",
      source: "local",
    });

    expect(
      buildKnowledgeSearchResult({
        excerpt: "Needle appears here.",
        id: "doc-1",
        query: "needle",
        relativePath: "notes/a.md",
        title: "a.md",
      }),
    ).toMatchObject({
      excerpt: "Needle appears here.",
      id: "doc-1",
      query: "needle",
      relativePath: "notes/a.md",
      score: expect.any(Number),
      source: "local",
      title: "a.md",
    });
  });
});
