import { describe, expect, it } from "vitest";
import { filterKnowledgeDocumentRows, getKnowledgeDisplayData, getKnowledgeDocumentRows } from "./KnowledgeBase";

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
});
