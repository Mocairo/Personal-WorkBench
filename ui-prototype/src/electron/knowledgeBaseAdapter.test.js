import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getKnowledgeBaseData,
  getKnowledgeDocumentPreview,
  searchKnowledgeLocal,
} from "./knowledgeBaseAdapter";

async function createKnowledgeFixture() {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-base-"));
  await fs.mkdir(path.join(rootDir, "requirements"), { recursive: true });
  await fs.mkdir(path.join(rootDir, "diagrams"), { recursive: true });
  await fs.writeFile(path.join(rootDir, "README.md"), "# Readme\n\nSome notes.\n");
  await fs.writeFile(path.join(rootDir, "requirements", "desktop.md"), "# Desktop\n\nMore notes.\n");
  await fs.writeFile(path.join(rootDir, "diagrams", "architecture.puml"), "@startuml\n@enduml\n");
  await fs.writeFile(path.join(rootDir, "notes.txt"), "plain text with needle\n");
  await fs.writeFile(path.join(rootDir, "data.json"), "{ \"title\": \"JSON note\" }\n");
  await fs.writeFile(path.join(rootDir, "brief.yaml"), "title: YAML note\n");
  await fs.writeFile(path.join(rootDir, "sheet.csv"), "title,value\nPlan,1\n");
  await fs.writeFile(path.join(rootDir, "paper.pdf"), "%PDF-1.4\n");

  return rootDir;
}

describe("knowledge base adapter", () => {
  it("builds Knowledge Base data from a local docs directory", async () => {
    const rootDir = await createKnowledgeFixture();

    const data = await getKnowledgeBaseData({ rootDir });

    expect(data.knowledgeDocuments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: expect.any(String),
          preview: expect.stringContaining("Some notes"),
          relativePath: "README.md",
          source: "local",
          state: "indexed",
          tag: "markdown",
          title: "README.md",
          type: "md",
        }),
        expect.objectContaining({
          preview: expect.stringContaining("needle"),
          relativePath: "notes.txt",
          source: "local",
          state: "indexed",
          tag: "text",
          title: "notes.txt",
          type: "txt",
        }),
        expect.objectContaining({
          relativePath: "paper.pdf",
          source: "local",
          state: "metadata-only",
          tag: "pdf",
          title: "paper.pdf",
          type: "pdf",
        }),
      ]),
    );
    expect(data.knowledgeDocuments.map((doc) => doc.relativePath)).not.toContain(rootDir);
    expect(data.graphNodes).toEqual(expect.arrayContaining(["README", "notes", "desktop"]));
    expect(data.indexStats).toMatchObject({
      docs: 8,
      failed: 0,
      pending: 1,
      source: "local",
    });
    expect(data.scanSummary).toMatchObject({
      indexed: 7,
      scanned: 8,
      skipped: 0,
      source: "local",
    });
    expect(data.knowledgeSources).toEqual([
      expect.objectContaining({
        documentCount: 8,
        id: "knowledge-base",
        source: "local",
        status: "ready",
      }),
    ]);
  });

  it("returns safe empty data when the docs directory is missing", async () => {
    const data = await getKnowledgeBaseData({
      rootDir: path.join(os.tmpdir(), "missing-knowledge-base"),
    });

    expect(data).toMatchObject({
      graphNodes: ["No docs"],
      indexStats: { chunks: 0, docs: 0, failed: 0, pending: 0, progress: "0%", source: "local" },
      knowledgeDocuments: [],
      scanSummary: { indexed: 0, scanned: 0, skipped: 0, source: "local", status: "missing" },
    });
  });

  it("ignores hidden, generated, unsupported and oversized files", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-base-safe-"));
    await fs.mkdir(path.join(rootDir, ".git"), { recursive: true });
    await fs.mkdir(path.join(rootDir, ".hidden"), { recursive: true });
    await fs.mkdir(path.join(rootDir, "node_modules", "pkg"), { recursive: true });
    await fs.mkdir(path.join(rootDir, "dist"), { recursive: true });
    await fs.mkdir(path.join(rootDir, "build"), { recursive: true });
    await fs.writeFile(path.join(rootDir, "visible.md"), "# Visible\n");
    await fs.writeFile(path.join(rootDir, ".git", "secret.md"), "# secret\n");
    await fs.writeFile(path.join(rootDir, ".hidden", "note.md"), "# hidden\n");
    await fs.writeFile(path.join(rootDir, "node_modules", "pkg", "README.md"), "# dependency\n");
    await fs.writeFile(path.join(rootDir, "dist", "bundle.md"), "# generated\n");
    await fs.writeFile(path.join(rootDir, "build", "bundle.md"), "# generated\n");
    await fs.writeFile(path.join(rootDir, ".env"), "TOKEN=secret\n");
    await fs.writeFile(path.join(rootDir, "image.png"), "not a document\n");
    await fs.writeFile(path.join(rootDir, "too-big.txt"), "x".repeat(64));

    const data = await getKnowledgeBaseData({ maxFileSizeBytes: 16, rootDir });

    expect(data.knowledgeDocuments).toEqual([
      expect.objectContaining({ relativePath: "visible.md", title: "visible.md" }),
    ]);
    expect(data.scanSummary.skipped).toBeGreaterThanOrEqual(7);
    expect(JSON.stringify(data)).not.toContain("TOKEN=secret");
    expect(JSON.stringify(data)).not.toContain(rootDir);
  });

  it("searches local text documents by keyword and returns relative result paths", async () => {
    const rootDir = await createKnowledgeFixture();

    const result = await searchKnowledgeLocal({ query: "needle", rootDir });

    expect(result).toMatchObject({
      query: "needle",
      source: "local",
      total: 1,
      results: [
        expect.objectContaining({
          excerpt: expect.stringContaining("needle"),
          relativePath: "notes.txt",
          source: "local",
          title: "notes.txt",
        }),
      ],
    });
    expect(JSON.stringify(result)).not.toContain(rootDir);
  });

  it("returns a read-only preview for a scanned document id", async () => {
    const rootDir = await createKnowledgeFixture();
    const data = await getKnowledgeBaseData({ rootDir });
    const readme = data.knowledgeDocuments.find((doc) => doc.relativePath === "README.md");

    const preview = await getKnowledgeDocumentPreview({ id: readme.id, rootDir });

    expect(preview).toMatchObject({
      chunkPreviews: [
        expect.objectContaining({
          documentId: readme.id,
          preview: expect.stringContaining("Some notes"),
          source: "local",
        }),
      ],
      id: readme.id,
      preview: expect.stringContaining("Some notes"),
      relativePath: "README.md",
      source: "local",
      title: "README.md",
    });
    expect(JSON.stringify(preview)).not.toContain(rootDir);
  });
});
