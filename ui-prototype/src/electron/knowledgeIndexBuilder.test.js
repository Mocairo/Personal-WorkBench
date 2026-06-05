import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildKnowledgeIndexFromRoot } from "./knowledgeIndexBuilder";

async function createBuilderFixture() {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "kb-builder-"));
  await fs.mkdir(path.join(rootDir, ".git"), { recursive: true });
  await fs.mkdir(path.join(rootDir, ".hidden"), { recursive: true });
  await fs.mkdir(path.join(rootDir, "node_modules", "pkg"), { recursive: true });
  await fs.mkdir(path.join(rootDir, "dist"), { recursive: true });
  await fs.mkdir(path.join(rootDir, "build"), { recursive: true });
  await fs.mkdir(path.join(rootDir, "notes"), { recursive: true });
  await fs.writeFile(path.join(rootDir, "README.md"), "# Intro\n\nNeedle first paragraph.\n\n## Details\n\nNeedle second paragraph.\n");
  await fs.writeFile(path.join(rootDir, "notes", "plain.txt"), "plain text with keyword\n\nsecond paragraph\n");
  await fs.writeFile(path.join(rootDir, "data.json"), "{ \"title\": \"JSON note\", \"token\": \"sk-json-secret\" }\n");
  await fs.writeFile(path.join(rootDir, "brief.yaml"), "title: YAML note\n");
  await fs.writeFile(path.join(rootDir, "config.yml"), "name: Config note\n");
  await fs.writeFile(path.join(rootDir, "sheet.csv"), "title,value\nPlan,1\n");
  await fs.writeFile(path.join(rootDir, "diagram.puml"), "@startuml\nAlice -> Bob\n@enduml\n");
  await fs.writeFile(path.join(rootDir, "paper.pdf"), "%PDF-1.4\n");
  await fs.writeFile(path.join(rootDir, ".env"), "SECRET=sk-hidden\n");
  await fs.writeFile(path.join(rootDir, ".hidden", "note.md"), "# hidden\n");
  await fs.writeFile(path.join(rootDir, ".git", "secret.md"), "# secret\n");
  await fs.writeFile(path.join(rootDir, "node_modules", "pkg", "README.md"), "# dependency\n");
  await fs.writeFile(path.join(rootDir, "dist", "bundle.md"), "# dist\n");
  await fs.writeFile(path.join(rootDir, "build", "bundle.md"), "# build\n");
  await fs.writeFile(path.join(rootDir, "oversized.txt"), "x".repeat(128));
  await fs.writeFile(path.join(rootDir, "unsupported.png"), "png\n");

  return rootDir;
}

describe("knowledge index builder", () => {
  it("scans supported documents, chunks markdown, and records skipped files", async () => {
    const rootDir = await createBuilderFixture();

    const index = await buildKnowledgeIndexFromRoot({
      maxFileSizeBytes: 96,
      now: "2026-06-05T00:00:00.000Z",
      rootDir,
    });

    expect(index.documents.map((doc) => doc.relativePath)).toEqual(expect.arrayContaining([
      "README.md",
      "notes/plain.txt",
      "data.json",
      "brief.yaml",
      "config.yml",
      "sheet.csv",
      "diagram.puml",
      "paper.pdf",
    ]));
    expect(index.documents.map((doc) => doc.relativePath)).not.toEqual(expect.arrayContaining([
      ".env",
      ".git/secret.md",
      "node_modules/pkg/README.md",
      "dist/bundle.md",
      "build/bundle.md",
      ".hidden/note.md",
    ]));
    expect(index.documents.find((doc) => doc.relativePath === "paper.pdf")).toMatchObject({
      chunks: 0,
      status: "metadata-only",
      type: "pdf",
    });

    const readmeChunks = index.chunks.filter((chunk) => chunk.relativePath === "README.md");
    expect(readmeChunks).toEqual([
      expect.objectContaining({
        ordinal: 0,
        preview: expect.stringContaining("Needle first paragraph"),
        titlePath: ["Intro"],
      }),
      expect.objectContaining({
        ordinal: 1,
        preview: expect.stringContaining("Needle second paragraph"),
        titlePath: ["Intro", "Details"],
      }),
    ]);
    expect(readmeChunks[0]).toMatchObject({
      chunkId: expect.stringContaining(":chunk-0"),
      documentId: expect.any(String),
      source: "local",
      textHash: expect.any(String),
      updatedAt: expect.any(String),
    });

    expect(index.summary).toMatchObject({
      docs: 8,
      failed: 0,
      indexed: 7,
      scanned: 8,
    });
    expect(index.summary.chunks).toBeGreaterThanOrEqual(7);
    expect(index.skipped).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: "ignored-directory", relativePath: ".git" }),
      expect.objectContaining({ reason: "ignored-file", relativePath: ".env" }),
      expect.objectContaining({ reason: "file-too-large", relativePath: "oversized.txt" }),
      expect.objectContaining({ reason: "unsupported-extension", relativePath: "unsupported.png" }),
    ]));
    expect(JSON.stringify(index)).not.toMatch(/sk-hidden|D:\\/);
  });

  it("records a single file read failure without stopping the whole reindex", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "kb-builder-failure-"));
    await fs.writeFile(path.join(rootDir, "good.md"), "# Good\n\nUsable text\n");
    await fs.writeFile(path.join(rootDir, "bad.md"), "# Bad\n\nThis read will fail\n");

    const index = await buildKnowledgeIndexFromRoot({
      now: "2026-06-05T00:00:00.000Z",
      readFile(filePath, encoding) {
        if (filePath.endsWith(`${path.sep}bad.md`)) {
          throw new Error("Injected read failure");
        }
        return fs.readFile(filePath, encoding);
      },
      rootDir,
    });

    expect(index.documents).toEqual([
      expect.objectContaining({ relativePath: "good.md", status: "indexed" }),
      expect.objectContaining({ message: "Could not parse document", relativePath: "bad.md", status: "error" }),
    ]);
    expect(index.chunks).toEqual([
      expect.objectContaining({ relativePath: "good.md", preview: expect.stringContaining("Usable text") }),
    ]);
    expect(index.summary).toMatchObject({
      docs: 2,
      failed: 1,
      indexed: 1,
      scanned: 2,
    });
    expect(index.failed).toEqual([
      expect.objectContaining({ reason: "parse-failed", relativePath: "bad.md" }),
    ]);
  });
});
