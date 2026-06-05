import fs from "node:fs/promises";
import path from "node:path";
import { buildKnowledgeIndexFromRoot } from "./knowledgeIndexBuilder.js";
import { readKnowledgeIndex, writeKnowledgeIndex } from "./knowledgeIndexStore.js";
import { searchKnowledgeIndex } from "./knowledgeIndexSearch.js";
import {
  embedTexts as defaultEmbedTexts,
  getEmbeddingProviderStatus,
} from "./embeddingProviderAdapter.js";
import {
  getReusableVector,
  getVectorEmbeddingInput,
  readKnowledgeVectors,
  selectChunksNeedingEmbedding,
  writeKnowledgeVectors,
} from "./knowledgeVectorStore.js";
import {
  buildKnowledgeChunkPreview,
  buildKnowledgeDocument,
  buildKnowledgeIndexStatus,
  buildKnowledgeScanSummary,
  buildKnowledgeSearchResult,
  buildKnowledgeSource,
  createKnowledgeDocumentId,
} from "../shared/knowledgeContracts.js";

const DOCUMENT_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".json", ".yaml", ".yml", ".csv", ".pdf", ".puml"]);
const TEXT_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".json", ".yaml", ".yml", ".csv", ".puml"]);
const METADATA_ONLY_EXTENSIONS = new Set([".pdf"]);
const IGNORED_DIRECTORIES = new Set([".git", "node_modules", "dist", "build"]);
const DEFAULT_MAX_DOCUMENTS = 200;
const DEFAULT_MAX_FILE_SIZE_BYTES = 512 * 1024;
const DEFAULT_EMBEDDING_BATCH_SIZE = 8;
const TAGS_BY_EXTENSION = {
  ".csv": "csv",
  ".json": "json",
  ".markdown": "markdown",
  ".md": "markdown",
  ".pdf": "pdf",
  ".puml": "diagram",
  ".txt": "text",
  ".yaml": "yaml",
  ".yml": "yaml",
};

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function normalizeRelativePath(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function getType(extension) {
  if (extension === ".markdown") {
    return "md";
  }

  return extension.replace(/^\./, "") || "document";
}

function getTag(extension) {
  return TAGS_BY_EXTENSION[extension] ?? "document";
}

function isIgnoredDirectory(name) {
  return name.startsWith(".") || IGNORED_DIRECTORIES.has(name);
}

function isIgnoredFile(name) {
  return name.startsWith(".") || name.toLowerCase() === ".env";
}

function normalizePreview(content) {
  return content.replace(/\s+/g, " ").trim().slice(0, 260);
}

async function readPreview(filePath, extension) {
  if (METADATA_ONLY_EXTENSIONS.has(extension)) {
    return "PDF metadata only. Text extraction is not enabled in this phase.";
  }

  const content = await fs.readFile(filePath, "utf8");
  return normalizePreview(content);
}

async function walkDocuments(rootDir, options = {}) {
  const documents = [];
  const directories = new Set();
  const maxDocuments = options.maxDocuments ?? DEFAULT_MAX_DOCUMENTS;
  const maxFileSizeBytes = options.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES;
  const summary = {
    errors: 0,
    indexed: 0,
    scanned: 0,
    skipped: 0,
  };

  async function walk(dirPath) {
    let entries = [];
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      summary.errors += 1;
      return;
    }

    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        if (isIgnoredDirectory(entry.name)) {
          summary.skipped += 1;
          continue;
        }

        directories.add(entry.name);
        await walk(entryPath);
        continue;
      }

      if (isIgnoredFile(entry.name)) {
        summary.skipped += 1;
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase();
      if (!DOCUMENT_EXTENSIONS.has(extension)) {
        summary.skipped += 1;
        continue;
      }

      if (documents.length >= maxDocuments) {
        summary.skipped += 1;
        continue;
      }

      let stat;
      try {
        stat = await fs.stat(entryPath);
      } catch {
        summary.errors += 1;
        continue;
      }

      if (stat.size > maxFileSizeBytes) {
        summary.skipped += 1;
        continue;
      }

      const relativePath = normalizeRelativePath(path.relative(rootDir, entryPath));
      const type = getType(extension);
      const status = METADATA_ONLY_EXTENSIONS.has(extension) ? "metadata-only" : "indexed";
      let preview = "";
      let message = "";

      try {
        preview = await readPreview(entryPath, extension);
      } catch {
        summary.errors += 1;
        message = "Could not read document preview";
      }

      const document = buildKnowledgeDocument({
        chunks: status === "indexed" && preview ? 1 : 0,
        id: createKnowledgeDocumentId(relativePath),
        inferredTags: [getTag(extension)],
        message,
        preview,
        relativePath,
        size: stat.size,
        source: "local",
        status: message ? "error" : status,
        title: entry.name,
        type,
        updatedAt: stat.mtime.toISOString(),
      });

      if (document.status === "indexed") {
        summary.indexed += 1;
      }

      summary.scanned += 1;
      documents.push(document);
    }
  }

  await walk(rootDir);
  return { directories: [...directories], documents, summary };
}

function toGraphLabel(name) {
  return path.basename(name, path.extname(name));
}

function buildGraphNodes(documents, directories) {
  const graphDocuments = [...documents].sort((left, right) => {
    const leftPriority = left.tag === "markdown" || left.tag === "text" ? 0 : 1;
    const rightPriority = right.tag === "markdown" || right.tag === "text" ? 0 : 1;
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return left.relativePath.localeCompare(right.relativePath);
  });
  const documentNodes = graphDocuments.slice(0, 4).map((doc) => toGraphLabel(doc.name));
  const directoryNodes = [];

  for (const doc of documents) {
    const firstSegment = doc.relativePath.split("/")[0];
    if (firstSegment && firstSegment !== doc.name && !directoryNodes.includes(firstSegment)) {
      directoryNodes.push(firstSegment);
    }
  }

  for (const directory of directories) {
    if (!directoryNodes.includes(directory)) {
      directoryNodes.push(directory);
    }
  }

  const nodes = [...documentNodes, ...directoryNodes];

  return nodes.length > 0 ? nodes : ["No docs"];
}

function buildIndexStats(documents) {
  const docs = documents.length;
  const pending = documents.filter((doc) => doc.status === "metadata-only").length;
  const failed = documents.filter((doc) => doc.status === "error").length;
  const indexed = documents.filter((doc) => doc.status === "indexed").length;

  return buildKnowledgeIndexStatus({
    chunks: documents.reduce((total, doc) => total + doc.chunks, 0),
    docs,
    failed,
    indexed,
    pending,
    queue: pending,
    source: "local",
    status: failed > 0 ? "error" : "ready",
    updatedAt: new Date().toISOString(),
  });
}

function buildIndexStatsFromIndex(index = {}, status = "ready", vectorCache = null) {
  const summary = index.summary ?? {};
  const pending = index.documents.filter((doc) => doc.status === "metadata-only").length;
  const vectorSummary = vectorCache?.summary ?? {};
  const vectorMetadata = vectorCache?.metadata ?? {};
  const stats = buildKnowledgeIndexStatus({
    chunks: summary.chunks ?? index.chunks.length,
    docs: summary.docs ?? index.documents.length,
    failed: summary.failed,
    indexed: summary.indexed,
    pending,
    queue: pending,
    source: "knowledge-index",
    status,
    updatedAt: index.updatedAt,
  });

  return {
    ...stats,
    embedding: vectorCache
      ? {
          embedded: vectorSummary.vectors ?? 0,
          failed: vectorSummary.failed ?? 0,
          model: vectorMetadata.model ?? "",
          provider: vectorMetadata.provider ?? "",
          providerStatus: vectorCache.status === "missing" ? "unavailable" : vectorCache.status,
          skipped: vectorSummary.skipped ?? 0,
        }
      : {
          embedded: 0,
          failed: 0,
          model: "",
          provider: "",
          providerStatus: "unavailable",
          skipped: summary.chunks ?? index.chunks.length,
        },
    embeddingProvider: vectorMetadata.provider && vectorMetadata.model
      ? `${vectorMetadata.provider}/${vectorMetadata.model}`
      : "keyword",
    embeddingStatus: vectorCache?.status === "ready" ? "ready" : "unavailable",
    skipped: summary.skipped ?? 0,
  };
}

function withFallbackIndexState(data) {
  return {
    ...data,
    indexStats: {
      ...data.indexStats,
      source: "scan-fallback",
      status: "unindexed",
    },
    knowledgeSources: (data.knowledgeSources ?? []).map((source) => ({
      ...source,
      source: "scan-fallback",
      status: "unindexed",
    })),
    scanSummary: {
      ...data.scanSummary,
      source: "scan-fallback",
      status: "unindexed",
    },
  };
}

function graphDirectoriesFromIndex(index = {}) {
  const directories = new Set();
  for (const doc of index.documents ?? []) {
    const segments = doc.relativePath.split("/");
    if (segments.length > 1) {
      directories.add(segments[0]);
    }
  }
  return [...directories];
}

function buildDataFromIndex(index = {}, vectorCache = null) {
  const documents = index.documents.map((doc) => buildKnowledgeDocument({
    ...doc,
    source: "knowledge-index",
  }));

  return {
    chunkPreviews: index.chunks.slice(0, 6).map((chunk) => buildKnowledgeChunkPreview({
      chunkId: chunk.chunkId,
      documentId: chunk.documentId,
      preview: chunk.preview,
      relativePath: chunk.relativePath,
      source: "knowledge-index",
      title: chunk.title,
    })),
    graphNodes: buildGraphNodes(documents, graphDirectoriesFromIndex(index)),
    indexStats: buildIndexStatsFromIndex(index, index.status === "error" ? "error" : "ready", vectorCache),
    knowledgeDocuments: documents,
    knowledgeSources: [
      buildKnowledgeSource({
        chunkCount: index.summary?.chunks ?? index.chunks.length,
        documentCount: index.summary?.docs ?? index.documents.length,
        path: ".",
        source: "knowledge-index",
        status: index.status === "error" ? "error" : "ready",
        updatedAt: index.updatedAt,
      }),
    ],
    scanSummary: buildKnowledgeScanSummary({
      ...(index.summary ?? {}),
      source: "knowledge-index",
      status: index.status === "error" ? "error" : "ready",
      updatedAt: index.updatedAt,
    }),
  };
}

function baseEmbeddingSummary(index = {}, status = {}) {
  return {
    embedded: 0,
    failed: 0,
    model: status.model ?? "",
    provider: status.provider ?? "",
    providerStatus: status.providerStatus ?? status.status ?? "unavailable",
    skipped: index.summary?.chunks ?? index.chunks?.length ?? 0,
    status: status.providerStatus === "ready" || status.status === "ready" ? "ready" : "unavailable",
  };
}

function isApiOk(result) {
  return Boolean(result?.ok && result.data);
}

function getEmbeddingBatchSize(status = {}, options = {}) {
  const provider = String(status.provider ?? options.embeddingConfig?.provider ?? "").toLowerCase();
  if (provider !== "local-bge-m3" && provider !== "bge-m3") {
    return 1;
  }

  const configured = Number(options.embeddingMaxBatchSize ?? options.maxBatchSize);
  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : DEFAULT_EMBEDDING_BATCH_SIZE;
}

async function buildEmbeddingSummary(index = {}, options = {}) {
  const status = await getEmbeddingProviderStatus({
    config: options.embeddingConfig,
  });
  const summary = baseEmbeddingSummary(index, status);

  if (!options.userDataDir || status.providerStatus !== "ready") {
    return summary;
  }

  const embedTexts = options.embedTexts ?? defaultEmbedTexts;
  const existingCache = await readKnowledgeVectors(options);
  const reusableVectors = index.chunks
    .map((chunk) => getReusableVector(chunk, existingCache))
    .filter(Boolean);
  const chunksNeedingEmbedding = selectChunksNeedingEmbedding(index.chunks, existingCache);
  const newVectors = [];
  let failed = 0;
  let providerStatus = status.providerStatus;
  let metadataModel = status.model;
  let metadataProvider = status.provider;
  let metadataDimension = 0;
  const batchSize = getEmbeddingBatchSize(status, options);

  for (let start = 0; start < chunksNeedingEmbedding.length; start += batchSize) {
    const batch = chunksNeedingEmbedding.slice(start, start + batchSize);
    const inputs = batch.map((chunk) => getVectorEmbeddingInput(chunk, {
      maxInputChars: options.embeddingMaxInputChars,
    }));
    const result = await embedTexts(inputs, {
      config: options.embeddingConfig,
      maxBatchSize: options.embeddingMaxBatchSize ?? options.maxBatchSize,
      maxInputChars: options.embeddingMaxInputChars,
      pythonPath: options.embeddingPythonPath ?? options.pythonPath,
      runtimeClient: options.embeddingRuntimeClient ?? options.runtimeClient,
      spawn: options.embeddingSpawn ?? options.spawn,
      timeoutMs: options.embeddingTimeoutMs ?? options.timeoutMs,
      transport: options.embeddingTransport,
    });

    if (!isApiOk(result)) {
      failed += batch.length;
      providerStatus = result.error?.providerStatus ?? providerStatus;
      continue;
    }

    metadataModel = result.data.metadata?.model ?? metadataModel;
    metadataProvider = result.data.metadata?.provider ?? metadataProvider;
    providerStatus = result.data.providerStatus ?? providerStatus;

    batch.forEach((chunk, offset) => {
      const embedding = result.data.embeddings?.[offset];
      if (!Array.isArray(embedding) || embedding.length === 0) {
        failed += 1;
        return;
      }

      metadataDimension = result.data.metadata?.dimension ?? embedding.length;
      newVectors.push({
        chunkId: chunk.chunkId,
        dimension: metadataDimension,
        embedding,
        model: metadataModel,
        provider: metadataProvider,
        textHash: chunk.textHash,
        updatedAt: chunk.updatedAt ?? index.updatedAt,
      });
    });
  }

  const vectors = [...reusableVectors, ...newVectors];
  const cacheStatus = providerStatus !== "ready"
    ? providerStatus
    : failed > 0
      ? "partial"
      : "ready";
  await writeKnowledgeVectors({
    metadata: {
      dimension: metadataDimension || vectors[0]?.dimension || vectors[0]?.embedding?.length || 0,
      model: metadataModel,
      provider: metadataProvider,
    },
    status: cacheStatus,
    summary: {
      failed,
      skipped: reusableVectors.length,
      vectors: vectors.length,
    },
    updatedAt: new Date().toISOString(),
    vectors,
  }, options);

  return {
    embedded: newVectors.length,
    failed,
    model: metadataModel,
    provider: metadataProvider,
    providerStatus,
    skipped: reusableVectors.length,
    status: cacheStatus,
  };
}

async function buildQueryEmbedding(query, options = {}) {
  const status = await getEmbeddingProviderStatus({
    config: options.embeddingConfig,
  });

  if (status.providerStatus !== "ready") {
    return {
      semanticStatus: "unavailable",
    };
  }

  const vectorCache = await readKnowledgeVectors(options);
  if (vectorCache.status === "missing" || vectorCache.vectors.length === 0) {
    return {
      semanticStatus: "unavailable",
      vectors: vectorCache,
    };
  }

  const embedTexts = options.embedTexts ?? defaultEmbedTexts;
  const result = await embedTexts([query], {
    config: options.embeddingConfig,
    maxBatchSize: options.embeddingMaxBatchSize ?? options.maxBatchSize,
    maxInputChars: options.embeddingMaxInputChars,
    pythonPath: options.embeddingPythonPath ?? options.pythonPath,
    runtimeClient: options.embeddingRuntimeClient ?? options.runtimeClient,
    spawn: options.embeddingSpawn ?? options.spawn,
    timeoutMs: options.embeddingTimeoutMs ?? options.timeoutMs,
    transport: options.embeddingTransport,
  });

  if (!isApiOk(result) || !Array.isArray(result.data.embeddings?.[0])) {
    return {
      semanticStatus: "unavailable",
      vectors: vectorCache,
    };
  }

  return {
    queryEmbedding: result.data.embeddings[0],
    semanticStatus: "ready",
    vectors: vectorCache,
  };
}

function getEmptyKnowledgeData(status = "missing") {
  const scanSummary = buildKnowledgeScanSummary({ source: "local", status });
  const indexStats = buildKnowledgeIndexStatus({ source: "local", status });

  return {
    chunkPreviews: [],
    graphNodes: ["No docs"],
    indexStats,
    knowledgeDocuments: [],
    knowledgeSources: [
      buildKnowledgeSource({
        configured: status !== "missing",
        documentCount: 0,
        path: ".",
        source: "local",
        status,
      }),
    ],
    scanSummary,
  };
}

function toSearchExcerpt(document, query) {
  const preview = document.preview || document.excerpt || "";
  const index = preview.toLowerCase().indexOf(query.toLowerCase());

  if (index === -1) {
    return preview;
  }

  const start = Math.max(0, index - 42);
  return preview.slice(start, start + 180);
}

export async function getKnowledgeBaseData(options = {}) {
  const rootDir = options.rootDir ?? process.env.KNOWLEDGE_BASE_ROOT ?? path.resolve("docs");
  const exists = await pathExists(rootDir);

  if (!exists) {
    return getEmptyKnowledgeData("missing");
  }

  const stat = await fs.stat(rootDir).catch(() => null);
  if (!stat?.isDirectory()) {
    return getEmptyKnowledgeData("missing");
  }

  if (options.userDataDir) {
    const index = await readKnowledgeIndex(options);
    if (index.status !== "missing" && index.documents.length > 0) {
      const vectorCache = await readKnowledgeVectors(options);
      return buildDataFromIndex(index, vectorCache);
    }
  }

  const { directories, documents, summary } = await walkDocuments(rootDir, options);
  const sortedDocuments = documents.sort((left, right) => {
    const leftPriority = left.status === "indexed" ? 0 : 1;
    const rightPriority = right.status === "indexed" ? 0 : 1;
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return left.relativePath.localeCompare(right.relativePath);
  });

  const data = {
    chunkPreviews: sortedDocuments
      .filter((doc) => doc.preview)
      .slice(0, 6)
      .map((doc) => buildKnowledgeChunkPreview({
        documentId: doc.id,
        preview: doc.preview,
        relativePath: doc.relativePath,
        source: "local",
        title: doc.title,
      })),
    graphNodes: buildGraphNodes(sortedDocuments, directories),
    indexStats: buildIndexStats(sortedDocuments),
    knowledgeDocuments: sortedDocuments,
    knowledgeSources: [
      buildKnowledgeSource({
        chunkCount: sortedDocuments.reduce((total, doc) => total + doc.chunks, 0),
        documentCount: sortedDocuments.length,
        path: ".",
        source: "local",
        status: "ready",
        updatedAt: new Date().toISOString(),
      }),
    ],
    scanSummary: buildKnowledgeScanSummary({
      ...summary,
      source: "local",
      status: summary.errors > 0 ? "error" : "ready",
      updatedAt: new Date().toISOString(),
    }),
  };

  return options.userDataDir ? withFallbackIndexState(data) : data;
}

export async function reindexKnowledgeBase(options = {}) {
  const rootDir = options.rootDir ?? process.env.KNOWLEDGE_BASE_ROOT ?? path.resolve("docs");
  const exists = await pathExists(rootDir);
  const stat = exists ? await fs.stat(rootDir).catch(() => null) : null;

  if (!stat?.isDirectory()) {
    return {
      source: "knowledge-index",
      status: "missing",
      summary: {
        chunks: 0,
        docs: 0,
        failed: 0,
        indexed: 0,
        scanned: 0,
        skipped: 0,
      },
    };
  }

  const index = await buildKnowledgeIndexFromRoot({
    maxDocuments: options.maxDocuments,
    maxFileSizeBytes: options.maxFileSizeBytes,
    now: options.now,
    rootDir,
  });
  const writeResult = await writeKnowledgeIndex(index, options);
  const embeddingSummary = await buildEmbeddingSummary(index, options);

  return {
    embeddingSummary,
    indexPath: writeResult.indexPath,
    source: "knowledge-index",
    status: index.status,
    summary: {
      ...index.summary,
      embedding: embeddingSummary,
    },
    updatedAt: index.updatedAt,
  };
}

export async function searchKnowledgeLocal(options = {}) {
  const query = typeof options.query === "string" ? options.query.trim() : "";

  if (options.userDataDir) {
    const index = await readKnowledgeIndex(options);
    if (index.status !== "missing" && index.chunks.length > 0) {
      const semantic = await buildQueryEmbedding(query, options);
      return searchKnowledgeIndex(index, {
        ...options,
        queryEmbedding: semantic.queryEmbedding,
        semanticStatus: semantic.semanticStatus,
        vectors: semantic.vectors,
      });
    }
  }

  const data = await getKnowledgeBaseData(options);

  if (!query) {
    return {
      query,
      results: [],
      source: options.userDataDir ? "scan-fallback" : "local",
      status: options.userDataDir ? "unindexed" : "ready",
      total: 0,
    };
  }

  const needle = query.toLowerCase();
  const source = options.userDataDir ? "scan-fallback" : "local";
  const status = options.userDataDir ? "unindexed" : "ready";
  const results = data.knowledgeDocuments
    .filter((doc) => doc.status === "indexed")
    .filter((doc) => `${doc.title} ${doc.relativePath} ${doc.preview}`.toLowerCase().includes(needle))
    .slice(0, options.limit ?? 20)
    .map((doc) => buildKnowledgeSearchResult({
      excerpt: toSearchExcerpt(doc, query),
      id: doc.id,
      query,
      relativePath: doc.relativePath,
      score: doc.title.toLowerCase().includes(needle) ? 2 : 1,
      source,
      status: doc.status,
      title: doc.title,
      type: doc.type,
      updatedAt: doc.updatedAt,
    }));

  return {
    query,
    results,
    source,
    status,
    total: results.length,
  };
}

export async function getKnowledgeDocumentPreview(options = {}) {
  const id = typeof options.id === "string" ? options.id : "";

  if (options.userDataDir) {
    const index = await readKnowledgeIndex(options);
    const document = index.documents.find((doc) => doc.id === id);
    if (document) {
      return {
        ...buildKnowledgeDocument({
          ...document,
          source: "knowledge-index",
        }),
        chunkPreviews: index.chunks
          .filter((chunk) => chunk.documentId === id)
          .slice(0, 6)
          .map((chunk) => buildKnowledgeChunkPreview({
            chunkId: chunk.chunkId,
            documentId: id,
            preview: chunk.preview,
            relativePath: chunk.relativePath,
            source: "knowledge-index",
            title: chunk.title,
          })),
      };
    }
  }

  const data = await getKnowledgeBaseData(options);
  const document = data.knowledgeDocuments.find((doc) => doc.id === id);

  if (!document) {
    return {
      id,
      message: "Document not found",
      source: "local",
      status: "missing",
    };
  }

  return {
    ...document,
    chunkPreviews: document.preview
      ? [
          buildKnowledgeChunkPreview({
            documentId: document.id,
            preview: document.preview,
            relativePath: document.relativePath,
            source: "local",
            title: document.title,
          }),
        ]
      : [],
  };
}
