import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  clearKnowledgeIndex,
  getKnowledgeIndexPath,
  readKnowledgeIndex,
  writeKnowledgeIndex,
} from "./knowledgeIndexStore";

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

describe("knowledge index store", () => {
  it("writes the knowledge index under Electron userData only", async () => {
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "kb-user-data-"));
    const sourceRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "kb-source-root-"));

    const indexPath = getKnowledgeIndexPath({ userDataDir });
    await writeKnowledgeIndex({
      chunks: [
        {
          chunkId: "chunk-1",
          documentId: "doc-1",
          preview: "Needle apiKey=sk-store-secret Authorization: Bearer hidden D:\\private\\notes\\secret.md",
          relativePath: "notes/secret.md",
          title: "Secret note",
        },
      ],
      documents: [
        {
          id: "doc-1",
          preview: `${"A".repeat(1200)} token=sk-doc-secret`,
          relativePath: "D:\\private\\notes\\secret.md",
          sourceHash: "hash-1",
          title: "apiKey=sk-title-secret",
        },
      ],
      summary: { chunks: 1, docs: 1, failed: 0, indexed: 1, scanned: 1, skipped: 0 },
      updatedAt: "2026-06-05T00:00:00.000Z",
    }, { sourceRootDir, userDataDir });

    expect(indexPath).toBe(path.join(userDataDir, "knowledge", "knowledge-index.json"));
    expect(await pathExists(indexPath)).toBe(true);
    expect(await pathExists(path.join(sourceRootDir, "knowledge", "knowledge-index.json"))).toBe(false);

    const rawJson = await fs.readFile(indexPath, "utf8");
    expect(rawJson).not.toMatch(/sk-store-secret|sk-doc-secret|Bearer hidden|apiKey=|token=|D:\\private/);

    const index = await readKnowledgeIndex({ userDataDir });
    expect(index).toMatchObject({
      chunks: [
        expect.objectContaining({
          chunkId: "chunk-1",
          documentId: "doc-1",
          preview: expect.stringContaining("[redacted]"),
          relativePath: "notes/secret.md",
        }),
      ],
      documents: [
        expect.objectContaining({
          id: "doc-1",
          relativePath: "[redacted-path]",
          title: "[redacted]",
        }),
      ],
      status: "ready",
      summary: { chunks: 1, docs: 1, failed: 0, indexed: 1, scanned: 1, skipped: 0 },
    });
    expect(index.documents[0].preview.length).toBeLessThanOrEqual(520);
  });

  it("clears an existing app-owned index file", async () => {
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "kb-clear-"));
    await writeKnowledgeIndex({
      documents: [{ id: "doc-1", relativePath: "README.md", title: "README.md" }],
      summary: { docs: 1 },
    }, { userDataDir });

    expect(await pathExists(getKnowledgeIndexPath({ userDataDir }))).toBe(true);

    await clearKnowledgeIndex({ userDataDir });

    expect(await readKnowledgeIndex({ userDataDir })).toMatchObject({
      chunks: [],
      documents: [],
      status: "missing",
    });
    expect(await pathExists(getKnowledgeIndexPath({ userDataDir }))).toBe(false);
  });
});
