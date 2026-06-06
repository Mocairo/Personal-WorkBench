import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  getKnowledgeBaseData,
  getKnowledgeDocumentPreview,
  getKnowledgeFileTree,
  reindexKnowledgeBase,
  searchKnowledgeLocal,
} from "./knowledgeBaseAdapter";
import {
  getKnowledgeVectorPath,
  readKnowledgeVectors,
} from "./knowledgeVectorStore";

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

function flattenTreeNodes(nodes = []) {
  return nodes.flatMap((node) => [
    node,
    ...flattenTreeNodes(node.children ?? []),
  ]);
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

  it("builds a safe Knowledge file tree without ignored folders or absolute paths", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-file-tree-"));
    await fs.mkdir(path.join(rootDir, "notes"), { recursive: true });
    await fs.mkdir(path.join(rootDir, ".git"), { recursive: true });
    await fs.mkdir(path.join(rootDir, ".hidden"), { recursive: true });
    await fs.mkdir(path.join(rootDir, "node_modules", "pkg"), { recursive: true });
    await fs.mkdir(path.join(rootDir, "dist"), { recursive: true });
    await fs.mkdir(path.join(rootDir, "build"), { recursive: true });
    await fs.writeFile(path.join(rootDir, "README.md"), "# Readme\n");
    await fs.writeFile(path.join(rootDir, "notes", "daily.txt"), "Daily note\n");
    await fs.writeFile(path.join(rootDir, "data.json"), "{ \"ok\": true }\n");
    await fs.writeFile(path.join(rootDir, "sheet.csv"), "title,value\nPlan,1\n");
    await fs.writeFile(path.join(rootDir, "manual.pdf"), "%PDF-1.4\n");
    await fs.writeFile(path.join(rootDir, "brief.docx"), "PK fake docx\n");
    await fs.writeFile(path.join(rootDir, ".env"), "TOKEN=sk-hidden\n");
    await fs.writeFile(path.join(rootDir, ".git", "secret.md"), "# secret\n");
    await fs.writeFile(path.join(rootDir, ".hidden", "hidden.md"), "# hidden\n");
    await fs.writeFile(path.join(rootDir, "node_modules", "pkg", "README.md"), "# dependency\n");
    await fs.writeFile(path.join(rootDir, "dist", "bundle.md"), "# generated\n");
    await fs.writeFile(path.join(rootDir, "build", "bundle.md"), "# generated\n");
    await fs.writeFile(path.join(rootDir, "scratch.tmp"), "junk\n");
    await fs.writeFile(path.join(rootDir, "image.png"), "not a document\n");

    const tree = await getKnowledgeFileTree({ rootDir });
    const nodes = flattenTreeNodes(tree.root.children);
    const relativePaths = nodes.map((node) => node.relativePath);

    expect(tree).toMatchObject({
      root: {
        children: expect.any(Array),
        name: "Knowledge Base",
        relativePath: "",
        type: "folder",
      },
      source: "local",
      status: "ready",
    });
    expect(relativePaths).toEqual(expect.arrayContaining([
      "README.md",
      "notes",
      "notes/daily.txt",
      "data.json",
      "sheet.csv",
      "manual.pdf",
      "brief.docx",
    ]));
    expect(nodes.find((node) => node.relativePath === "README.md")).toMatchObject({
      ext: "md",
      readable: true,
      type: "file",
    });
    expect(nodes.find((node) => node.relativePath === "manual.pdf")).toMatchObject({
      ext: "pdf",
      readable: false,
      type: "file",
    });
    expect(nodes.find((node) => node.relativePath === "brief.docx")).toMatchObject({
      ext: "docx",
      readable: false,
      type: "file",
    });
    expect(relativePaths).not.toEqual(expect.arrayContaining([
      ".env",
      ".git/secret.md",
      ".hidden/hidden.md",
      "node_modules/pkg/README.md",
      "dist/bundle.md",
      "build/bundle.md",
      "scratch.tmp",
      "image.png",
    ]));
    expect(JSON.stringify(tree)).not.toContain(rootDir);
  });

  it("loads a safe bounded document reader preview by relative path", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-reader-preview-"));
    await fs.writeFile(
      path.join(rootDir, "guide.md"),
      `# Guide\n\nNeedle body apiKey=sk-preview-secret Authorization: Bearer hidden D:\\private\\vault\\guide.md\n\n${"x".repeat(240)}`,
    );
    await fs.writeFile(path.join(rootDir, "manual.pdf"), "%PDF-1.4\n");
    await fs.writeFile(path.join(os.tmpdir(), "outside-knowledge.md"), "# outside\n");

    const preview = await getKnowledgeDocumentPreview({
      maxContentChars: 140,
      relativePath: "guide.md",
      rootDir,
    });

    expect(preview).toMatchObject({
      content: expect.stringContaining("# Guide"),
      id: expect.any(String),
      readable: true,
      relativePath: "guide.md",
      source: "local",
      status: "ready",
      title: "guide.md",
      truncated: true,
      type: "md",
    });
    expect(preview.content.length).toBeLessThanOrEqual(143);
    expect(JSON.stringify(preview)).not.toMatch(/sk-preview-secret|apiKey|Authorization|Bearer hidden|D:\\private/);
    expect(JSON.stringify(preview)).not.toContain(rootDir);

    await expect(getKnowledgeDocumentPreview({
      relativePath: "manual.pdf",
      rootDir,
    })).resolves.toMatchObject({
      readable: false,
      relativePath: "manual.pdf",
      status: "metadata-only",
    });

    await expect(getKnowledgeDocumentPreview({
      relativePath: "../outside-knowledge.md",
      rootDir,
    })).resolves.toMatchObject({
      readable: false,
      status: "missing",
    });
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

  it("reindexes local docs into an app-owned userData knowledge index", async () => {
    const rootDir = await createKnowledgeFixture();
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-user-data-"));

    const result = await reindexKnowledgeBase({
      now: "2026-06-05T00:00:00.000Z",
      rootDir,
      userDataDir,
    });

    expect(result).toMatchObject({
      indexPath: path.join(userDataDir, "knowledge", "knowledge-index.json"),
      source: "knowledge-index",
      status: "ready",
      summary: {
        chunks: expect.any(Number),
        docs: 8,
        failed: 0,
        indexed: 7,
        scanned: 8,
        skipped: 0,
      },
    });
    expect(JSON.stringify(result)).not.toContain(rootDir);

    const indexJson = await fs.readFile(path.join(userDataDir, "knowledge", "knowledge-index.json"), "utf8");
    expect(indexJson).toContain("requirements/desktop.md");
    expect(indexJson).not.toContain(rootDir);
    await expect(fs.access(path.join(rootDir, "knowledge", "knowledge-index.json"))).rejects.toThrow();
  });

  it("uses the persisted index for Knowledge Base data and chunk-level search", async () => {
    const rootDir = await createKnowledgeFixture();
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-indexed-search-"));
    await fs.writeFile(
      path.join(rootDir, "secrets.md"),
      "# Secret\n\nneedle apiKey=sk-adapter-secret Authorization: Bearer hidden D:\\private\\vault\\secret.md\n",
    );
    await reindexKnowledgeBase({ rootDir, userDataDir });

    const data = await getKnowledgeBaseData({ rootDir, userDataDir });
    expect(data).toMatchObject({
      indexStats: {
        docs: 9,
        source: "knowledge-index",
        status: "ready",
      },
      knowledgeDocuments: expect.arrayContaining([
        expect.objectContaining({ relativePath: "secrets.md", source: "knowledge-index" }),
      ]),
    });

    const result = await searchKnowledgeLocal({
      maxResultChars: 140,
      maxResultItems: 2,
      query: "needle",
      rootDir,
      userDataDir,
    });

    expect(result).toMatchObject({
      source: "knowledge-index",
      status: "ready",
      total: expect.any(Number),
      results: expect.arrayContaining([
        expect.objectContaining({
          chunkId: expect.any(String),
          documentId: expect.any(String),
          preview: expect.stringContaining("needle"),
          relativePath: expect.any(String),
          source: "knowledge-index",
        }),
      ]),
    });
    expect(result.results.length).toBeLessThanOrEqual(2);
    expect(JSON.stringify(result)).not.toMatch(/sk-adapter-secret|apiKey=|Bearer hidden|D:\\private|knowledge-indexed-search/);
    expect(result.results.every((item) => item.preview.length <= 140)).toBe(true);
  });

  it("falls back to read-only scanning with an unindexed status when no index exists", async () => {
    const rootDir = await createKnowledgeFixture();
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-no-index-"));

    const data = await getKnowledgeBaseData({ rootDir, userDataDir });
    const result = await searchKnowledgeLocal({ query: "needle", rootDir, userDataDir });

    expect(data.indexStats).toMatchObject({
      source: "scan-fallback",
      status: "unindexed",
    });
    expect(result).toMatchObject({
      results: [expect.objectContaining({ relativePath: "notes.txt", source: "scan-fallback" })],
      source: "scan-fallback",
      status: "unindexed",
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

  it("reindexes embeddings into an app-owned vector cache when the provider is ready", async () => {
    const rootDir = await createKnowledgeFixture();
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-embedding-user-data-"));

    const result = await reindexKnowledgeBase({
      embeddingConfig: { model: "fake-embedding", provider: "fake" },
      now: "2026-06-05T00:00:00.000Z",
      rootDir,
      userDataDir,
    });

    expect(result).toMatchObject({
      embeddingSummary: {
        embedded: expect.any(Number),
        failed: 0,
        model: "fake-embedding",
        provider: "fake",
        providerStatus: "ready",
      },
      summary: {
        chunks: expect.any(Number),
        embedding: {
          providerStatus: "ready",
        },
      },
    });
    expect(result.embeddingSummary.embedded).toBeGreaterThan(0);

    const vectorPath = getKnowledgeVectorPath({ userDataDir });
    const vectorsJson = await fs.readFile(vectorPath, "utf8");
    expect(vectorsJson).toContain("fake-embedding");
    expect(vectorsJson).not.toMatch(/apiKey|token|secret|Authorization|Bearer|sk-|D:\\private/);
    expect(JSON.stringify(result)).not.toContain(vectorPath);
  });

  it("keeps reindex successful and marks embeddings unavailable when the provider is unconfigured", async () => {
    const rootDir = await createKnowledgeFixture();
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-embedding-unavailable-"));

    const result = await reindexKnowledgeBase({
      embeddingConfig: { provider: "", model: "", apiKey: "" },
      rootDir,
      userDataDir,
    });

    expect(result).toMatchObject({
      source: "knowledge-index",
      status: "ready",
      summary: {
        docs: 8,
        embedding: {
          embedded: 0,
          failed: 0,
          providerStatus: "unconfigured",
        },
      },
    });
    expect(result.summary.embedding.skipped).toBe(result.summary.chunks);
  });

  it("reuses unchanged vectors and re-embeds changed chunks by textHash", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-embedding-delta-"));
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-embedding-delta-cache-"));
    await fs.writeFile(path.join(rootDir, "note.md"), "# Note\n\nFirst body.\n");
    const embedTexts = vi.fn(async (texts) => ({
      ok: true,
      data: {
        embeddings: texts.map(() => [1, 0]),
        metadata: { model: "fake-embedding", provider: "fake" },
        providerStatus: "ready",
      },
    }));

    await reindexKnowledgeBase({
      embedTexts,
      embeddingConfig: { model: "fake-embedding", provider: "fake" },
      now: "2026-06-05T00:00:00.000Z",
      rootDir,
      userDataDir,
    });
    expect(embedTexts).toHaveBeenCalledTimes(1);

    embedTexts.mockClear();
    await reindexKnowledgeBase({
      embedTexts,
      embeddingConfig: { model: "fake-embedding", provider: "fake" },
      now: "2026-06-05T00:00:00.000Z",
      rootDir,
      userDataDir,
    });
    expect(embedTexts).not.toHaveBeenCalled();

    await fs.writeFile(path.join(rootDir, "note.md"), "# Note\n\nChanged body.\n");
    await reindexKnowledgeBase({
      embedTexts,
      embeddingConfig: { model: "fake-embedding", provider: "fake" },
      now: "2026-06-05T00:00:00.000Z",
      rootDir,
      userDataDir,
    });
    expect(embedTexts).toHaveBeenCalledTimes(1);
  });

  it("does not block reindex when one chunk embedding fails", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-embedding-partial-"));
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-embedding-partial-cache-"));
    await fs.writeFile(path.join(rootDir, "one.md"), "# One\n\nFirst chunk.\n");
    await fs.writeFile(path.join(rootDir, "two.md"), "# Two\n\nSecond chunk.\n");
    const embedTexts = vi.fn(async (texts) => {
      if (texts[0].includes("Two")) {
        return { ok: false, error: { code: "EMBEDDING_REQUEST_FAILED", message: "failed", retryable: true } };
      }
      return {
        ok: true,
        data: {
          embeddings: [[1, 0]],
          metadata: { model: "fake-embedding", provider: "fake" },
          providerStatus: "ready",
        },
      };
    });

    const result = await reindexKnowledgeBase({
      embedTexts,
      embeddingConfig: { model: "fake-embedding", provider: "fake" },
      rootDir,
      userDataDir,
    });
    const vectors = await readKnowledgeVectors({ userDataDir });

    expect(result).toMatchObject({
      status: "ready",
      summary: {
        embedding: {
          embedded: 1,
          failed: 1,
          providerStatus: "ready",
        },
      },
    });
    expect(vectors.vectors.length).toBe(1);
  });

  it("uses semantic and hybrid-ready vector results for indexed local search", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-hybrid-search-"));
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-hybrid-search-cache-"));
    await fs.writeFile(path.join(rootDir, "space.md"), "# Space\n\nApollo launch guidance.\n");
    await fs.writeFile(path.join(rootDir, "garden.md"), "# Garden\n\nTomato planting guidance.\n");
    const embedTexts = vi.fn(async (texts) => ({
      ok: true,
      data: {
        embeddings: texts.map((text) => (text.includes("Space") || text.includes("orbital") ? [1, 0] : [0, 1])),
        metadata: { model: "fake-embedding", provider: "fake" },
        providerStatus: "ready",
      },
    }));

    await reindexKnowledgeBase({
      embedTexts,
      embeddingConfig: { model: "fake-embedding", provider: "fake" },
      rootDir,
      userDataDir,
    });
    const result = await searchKnowledgeLocal({
      embedTexts,
      embeddingConfig: { model: "fake-embedding", provider: "fake" },
      maxResultItems: 1,
      query: "orbital",
      rootDir,
      userDataDir,
    });

    expect(result).toMatchObject({
      matchMode: "semantic",
      results: [
        expect.objectContaining({
          matchType: "semantic",
          relativePath: "space.md",
          vectorScore: expect.any(Number),
        }),
      ],
      semanticStatus: "ready",
      source: "knowledge-index",
    });
    expect(JSON.stringify(result)).not.toContain(rootDir);
  });

  it("keeps indexed search keyword-only when embeddings are unavailable", async () => {
    const rootDir = await createKnowledgeFixture();
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-keyword-only-cache-"));
    await reindexKnowledgeBase({ rootDir, userDataDir });

    const result = await searchKnowledgeLocal({
      embeddingConfig: { provider: "", model: "", apiKey: "" },
      query: "needle",
      rootDir,
      userDataDir,
    });

    expect(result).toMatchObject({
      matchMode: "keyword",
      results: [
        expect.objectContaining({
          matchType: "keyword",
          relativePath: "notes.txt",
        }),
      ],
      semanticStatus: "unavailable",
      source: "knowledge-index",
    });
  });

  it("uses local bge-m3 runtime embeddings for indexed semantic search", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-local-bge-search-"));
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-local-bge-cache-"));
    const modelPath = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-local-bge-model-"));
    await fs.writeFile(path.join(modelPath, "config.json"), "{}");
    await fs.writeFile(path.join(rootDir, "space.md"), "# Space\n\nApollo launch guidance.\n");
    await fs.writeFile(path.join(rootDir, "garden.md"), "# Garden\n\nTomato planting guidance.\n");
    const runtimeClient = vi.fn(async (request) => ({
      dimension: 2,
      elapsed: 7,
      embeddings: request.texts.map((text) => (text.includes("Space") || text.includes("orbital") ? [1, 0] : [0, 1])),
      model: "bge-m3",
      ok: true,
    }));

    const reindex = await reindexKnowledgeBase({
      embeddingConfig: { modelPath, provider: "local-bge-m3" },
      rootDir,
      runtimeClient,
      userDataDir,
    });
    const result = await searchKnowledgeLocal({
      embeddingConfig: { modelPath, provider: "local-bge-m3" },
      maxResultItems: 1,
      query: "orbital",
      rootDir,
      runtimeClient,
      userDataDir,
    });
    const vectors = await readKnowledgeVectors({ userDataDir });

    expect(reindex).toMatchObject({
      embeddingSummary: {
        embedded: 2,
        failed: 0,
        model: "bge-m3",
        provider: "local-bge-m3",
        providerStatus: "ready",
      },
    });
    expect(vectors.metadata).toMatchObject({
      dimension: 2,
      model: "bge-m3",
      provider: "local-bge-m3",
    });
    expect(result).toMatchObject({
      matchMode: "semantic",
      results: [
        expect.objectContaining({
          matchType: "semantic",
          relativePath: "space.md",
        }),
      ],
      semanticStatus: "ready",
    });
    expect(JSON.stringify({ reindex, result, vectors })).not.toContain(modelPath);
  });

  it("batches local bge-m3 chunk embeddings so the model loads once per reindex batch", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-local-bge-batch-"));
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-local-bge-batch-cache-"));
    const modelPath = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-local-bge-batch-model-"));
    await fs.writeFile(path.join(modelPath, "config.json"), "{}");
    await fs.writeFile(path.join(rootDir, "one.md"), "# One\n\nAlpha content.\n");
    await fs.writeFile(path.join(rootDir, "two.md"), "# Two\n\nBeta content.\n");
    await fs.writeFile(path.join(rootDir, "three.md"), "# Three\n\nGamma content.\n");
    const runtimeClient = vi.fn(async (request) => ({
      dimension: 2,
      elapsed: 9,
      embeddings: request.texts.map((_, index) => [index + 1, 0]),
      model: "bge-m3",
      ok: true,
    }));

    const reindex = await reindexKnowledgeBase({
      embeddingConfig: { modelPath, provider: "local-bge-m3" },
      rootDir,
      runtimeClient,
      userDataDir,
    });

    expect(reindex).toMatchObject({
      embeddingSummary: {
        embedded: 3,
        failed: 0,
        providerStatus: "ready",
      },
    });
    expect(runtimeClient).toHaveBeenCalledTimes(1);
    expect(runtimeClient.mock.calls[0][0].texts).toHaveLength(3);
  });

  it("falls back to keyword-only search when local bge-m3 runtime is unavailable", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-local-bge-unavailable-"));
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-local-bge-unavailable-cache-"));
    const modelPath = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-local-bge-unavailable-model-"));
    await fs.writeFile(path.join(modelPath, "config.json"), "{}");
    await fs.writeFile(path.join(rootDir, "notes.md"), "# Notes\n\nNeedle fallback text.\n");
    const runtimeClient = vi.fn(async () => ({
      error: {
        code: "missing_dependency",
        message: "sentence-transformers missing at D:\\private\\python token=sk-runtime",
      },
      ok: false,
    }));

    const reindex = await reindexKnowledgeBase({
      embeddingConfig: { modelPath, provider: "local-bge-m3" },
      rootDir,
      runtimeClient,
      userDataDir,
    });
    const result = await searchKnowledgeLocal({
      embeddingConfig: { modelPath, provider: "local-bge-m3" },
      query: "needle",
      rootDir,
      runtimeClient,
      userDataDir,
    });

    expect(reindex).toMatchObject({
      source: "knowledge-index",
      status: "ready",
      summary: {
        embedding: {
          embedded: 0,
          failed: 1,
          providerStatus: "missing_dependency",
        },
      },
    });
    expect(result).toMatchObject({
      matchMode: "keyword",
      results: [expect.objectContaining({ matchType: "keyword", relativePath: "notes.md" })],
      semanticStatus: "unavailable",
      source: "knowledge-index",
    });
    expect(JSON.stringify({ reindex, result })).not.toMatch(/D:\\private|sk-runtime|token=|sentence-transformers missing at D:\\/);
  });
});
