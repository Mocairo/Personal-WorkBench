import fs from "node:fs/promises";
import path from "node:path";
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

  const { directories, documents, summary } = await walkDocuments(rootDir, options);
  const sortedDocuments = documents.sort((left, right) => {
    const leftPriority = left.status === "indexed" ? 0 : 1;
    const rightPriority = right.status === "indexed" ? 0 : 1;
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return left.relativePath.localeCompare(right.relativePath);
  });

  return {
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
}

export async function searchKnowledgeLocal(options = {}) {
  const query = typeof options.query === "string" ? options.query.trim() : "";
  const data = await getKnowledgeBaseData(options);

  if (!query) {
    return { query, results: [], source: "local", total: 0 };
  }

  const needle = query.toLowerCase();
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
      source: "local",
      status: doc.status,
      title: doc.title,
      type: doc.type,
      updatedAt: doc.updatedAt,
    }));

  return {
    query,
    results,
    source: "local",
    total: results.length,
  };
}

export async function getKnowledgeDocumentPreview(options = {}) {
  const id = typeof options.id === "string" ? options.id : "";
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
