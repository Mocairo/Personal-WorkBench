import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  clearKnowledgeVectors,
  getKnowledgeVectorPath,
  getReusableVector,
  getVectorEmbeddingInput,
  readKnowledgeVectors,
  selectChunksNeedingEmbedding,
  writeKnowledgeVectors,
} from "./knowledgeVectorStore";

describe("knowledge vector store", () => {
  it("stores vectors only in app-owned userData and never persists raw text or secrets", async () => {
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-vectors-user-data-"));
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-vectors-source-"));
    const vectorPath = getKnowledgeVectorPath({ userDataDir });

    expect(vectorPath).toBe(path.join(userDataDir, "knowledge", "knowledge-vectors.json"));

    const writeResult = await writeKnowledgeVectors({
      metadata: {
        apiKey: "sk-vector-secret",
        model: "text-embedding-3-small",
        provider: "openai",
      },
      vectors: [
        {
          chunkId: "doc-1:chunk-0",
          embedding: [0.1, 0.2, 0.3],
          dimension: 3,
          model: "text-embedding-3-small",
          provider: "openai",
          relativePath: "D:\\private\\vault\\note.md",
          text: "raw chunk text token=sk-chunk-secret Authorization: Bearer hidden",
          textHash: "hash-1",
          updatedAt: "2026-06-05T00:00:00.000Z",
        },
      ],
    }, { userDataDir });

    expect(writeResult).toMatchObject({ status: "saved", vectorPath });
    await expect(fs.access(path.join(rootDir, "knowledge", "knowledge-vectors.json"))).rejects.toThrow();

    const storedJson = await fs.readFile(vectorPath, "utf8");
    expect(storedJson).toContain("doc-1:chunk-0");
    expect(storedJson).not.toMatch(/sk-vector-secret|sk-chunk-secret|apiKey|token=|Authorization|Bearer hidden|raw chunk text|D:\\private/);

    const vectors = await readKnowledgeVectors({ userDataDir });
    expect(vectors).toMatchObject({
      schemaVersion: 1,
      status: "ready",
      summary: { vectors: 1 },
      vectors: [
        {
          chunkId: "doc-1:chunk-0",
          embedding: [0.1, 0.2, 0.3],
          dimension: 3,
          model: "text-embedding-3-small",
          provider: "openai",
          textHash: "hash-1",
        },
      ],
    });
    expect(JSON.stringify(vectors)).not.toMatch(/sk-vector-secret|sk-chunk-secret|apiKey|Authorization|D:\\private/);
  });

  it("detects reusable vectors and changed chunks by textHash", async () => {
    const vectorCache = {
      vectors: [
        { chunkId: "doc-1:chunk-0", embedding: [0.1, 0.2], textHash: "same" },
        { chunkId: "doc-2:chunk-0", embedding: [0.3, 0.4], textHash: "old" },
      ],
    };
    const chunks = [
      { chunkId: "doc-1:chunk-0", preview: "unchanged", textHash: "same" },
      { chunkId: "doc-2:chunk-0", preview: "changed", textHash: "new" },
      { chunkId: "doc-3:chunk-0", preview: "new", textHash: "brand-new" },
    ];

    expect(getReusableVector(chunks[0], vectorCache)).toMatchObject({
      chunkId: "doc-1:chunk-0",
      textHash: "same",
    });
    expect(getReusableVector(chunks[1], vectorCache)).toBeNull();
    expect(selectChunksNeedingEmbedding(chunks, vectorCache).map((chunk) => chunk.chunkId)).toEqual([
      "doc-2:chunk-0",
      "doc-3:chunk-0",
    ]);
  });

  it("builds bounded redacted embedding input for a chunk", () => {
    const input = getVectorEmbeddingInput({
      preview: `needle secret=sk-vector-secret D:\\private\\vault\\note.md ${"x".repeat(300)}`,
      relativePath: "notes/plan.md",
      title: "Plan",
      titlePath: ["Root", "Section"],
    }, { maxInputChars: 120 });

    expect(input.length).toBeLessThanOrEqual(120);
    expect(input).toContain("Plan");
    expect(input).not.toMatch(/sk-vector-secret|secret=|D:\\private/);
  });

  it("clears the app-owned vector cache", async () => {
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-vectors-clear-"));
    await writeKnowledgeVectors({
      vectors: [{ chunkId: "doc-1:chunk-0", embedding: [0.1], textHash: "hash-1" }],
    }, { userDataDir });

    const result = await clearKnowledgeVectors({ userDataDir });

    expect(result.status).toBe("cleared");
    await expect(fs.access(getKnowledgeVectorPath({ userDataDir }))).rejects.toThrow();
  });
});
