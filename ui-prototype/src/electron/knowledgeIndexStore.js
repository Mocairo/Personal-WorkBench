import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_INDEX_FILE = "knowledge-index.json";
const MAX_PREVIEW_CHARS = 480;
const MAX_TITLE_CHARS = 160;
const SECRET_ASSIGNMENT_PATTERN = /\b(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi;
const AUTHORIZATION_PATTERN = /\bAuthorization:\s*Bearer\s+[^\s,;]+/gi;
const OPENAI_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]+/g;
const WINDOWS_PATH_PATTERN = /\b[A-Za-z]:\\[^\s"']+/g;
const UNIX_PRIVATE_PATH_PATTERN = /(^|\s)\/(?:Users|home|var|tmp|mnt|Volumes)\/[^\s"']+/g;

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function numberOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}

export function redactKnowledgeIndexText(value) {
  const text = cleanString(value);
  if (!text) {
    return "";
  }

  return text
    .replace(AUTHORIZATION_PATTERN, "[redacted]")
    .replace(SECRET_ASSIGNMENT_PATTERN, "[redacted]")
    .replace(OPENAI_KEY_PATTERN, "[redacted]")
    .replace(WINDOWS_PATH_PATTERN, "[redacted-path]")
    .replace(UNIX_PRIVATE_PATH_PATTERN, "$1[redacted-path]");
}

export function limitKnowledgeIndexText(value, maxChars = MAX_PREVIEW_CHARS) {
  const text = redactKnowledgeIndexText(value);
  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}

export function getKnowledgeIndexPath(options = {}) {
  const userDataDir = cleanString(options.userDataDir) || path.resolve(".");
  return path.join(userDataDir, "knowledge", DEFAULT_INDEX_FILE);
}

function normalizeSummary(summary = {}) {
  return {
    chunks: numberOrZero(summary.chunks),
    docs: numberOrZero(summary.docs),
    failed: numberOrZero(summary.failed),
    indexed: numberOrZero(summary.indexed),
    scanned: numberOrZero(summary.scanned),
    skipped: numberOrZero(summary.skipped),
  };
}

function normalizeTitlePath(value = []) {
  return (Array.isArray(value) ? value : [])
    .slice(0, 8)
    .map((item) => limitKnowledgeIndexText(item, MAX_TITLE_CHARS))
    .filter(Boolean);
}

function normalizeDocument(document = {}) {
  const relativePath = limitKnowledgeIndexText(document.relativePath ?? document.path, 220);
  const title = limitKnowledgeIndexText(document.title ?? document.name ?? relativePath, MAX_TITLE_CHARS);

  return {
    chunks: numberOrZero(document.chunks),
    id: limitKnowledgeIndexText(document.id ?? document.documentId, 160),
    inferredTags: (Array.isArray(document.inferredTags ?? document.tags)
      ? (document.inferredTags ?? document.tags)
      : [document.tag ?? document.type]
    ).map((tag) => limitKnowledgeIndexText(tag, 80)).filter(Boolean).slice(0, 8),
    message: limitKnowledgeIndexText(document.message, 220),
    preview: limitKnowledgeIndexText(document.preview ?? document.excerpt),
    relativePath,
    size: numberOrZero(document.size),
    source: limitKnowledgeIndexText(document.source, 80) || "local",
    sourceHash: limitKnowledgeIndexText(document.sourceHash ?? document.hash, 160),
    status: limitKnowledgeIndexText(document.status ?? document.state, 80) || "indexed",
    title,
    type: limitKnowledgeIndexText(document.type ?? document.kind, 80) || "document",
    updatedAt: limitKnowledgeIndexText(document.updatedAt, 80),
  };
}

function normalizeChunk(chunk = {}) {
  return {
    chunkId: limitKnowledgeIndexText(chunk.chunkId ?? chunk.id, 180),
    documentId: limitKnowledgeIndexText(chunk.documentId, 160),
    ordinal: numberOrZero(chunk.ordinal),
    preview: limitKnowledgeIndexText(chunk.preview ?? chunk.excerpt),
    relativePath: limitKnowledgeIndexText(chunk.relativePath, 220),
    source: limitKnowledgeIndexText(chunk.source, 80) || "local",
    textHash: limitKnowledgeIndexText(chunk.textHash, 160),
    title: limitKnowledgeIndexText(chunk.title, MAX_TITLE_CHARS),
    titlePath: normalizeTitlePath(chunk.titlePath),
    updatedAt: limitKnowledgeIndexText(chunk.updatedAt, 80),
  };
}

function documentPriority(document = {}) {
  if (document.status === "indexed") {
    return 0;
  }
  if (document.status === "metadata-only") {
    return 1;
  }
  return 2;
}

function normalizeReportItems(items = []) {
  return (Array.isArray(items) ? items : []).slice(0, 200).map((item) => ({
    reason: limitKnowledgeIndexText(item.reason, 120),
    relativePath: limitKnowledgeIndexText(item.relativePath, 220),
  })).filter((item) => item.relativePath || item.reason);
}

export function normalizeKnowledgeIndex(index = {}) {
  const documents = (Array.isArray(index.documents) ? index.documents : [])
    .map(normalizeDocument)
    .filter((doc) => doc.id || doc.relativePath || doc.title)
    .sort((left, right) => {
      const priority = documentPriority(left) - documentPriority(right);
      return priority === 0 ? left.relativePath.localeCompare(right.relativePath) : priority;
    });
  const chunks = (Array.isArray(index.chunks) ? index.chunks : [])
    .map(normalizeChunk)
    .filter((chunk) => chunk.chunkId && chunk.documentId)
    .sort((left, right) => {
      const pathCompare = left.relativePath.localeCompare(right.relativePath);
      return pathCompare === 0 ? left.ordinal - right.ordinal : pathCompare;
    });

  return {
    chunks,
    documents,
    failed: normalizeReportItems(index.failed),
    schemaVersion: 1,
    skipped: normalizeReportItems(index.skipped),
    source: limitKnowledgeIndexText(index.source, 80) || "local",
    status: limitKnowledgeIndexText(index.status, 80) || "ready",
    summary: normalizeSummary({
      chunks: chunks.length,
      docs: documents.length,
      ...index.summary,
    }),
    updatedAt: limitKnowledgeIndexText(index.updatedAt, 80) || new Date().toISOString(),
  };
}

export async function readKnowledgeIndex(options = {}) {
  const indexPath = getKnowledgeIndexPath(options);

  try {
    const content = await fs.readFile(indexPath, "utf8");
    return normalizeKnowledgeIndex(JSON.parse(content));
  } catch {
    return {
      chunks: [],
      documents: [],
      failed: [],
      schemaVersion: 1,
      skipped: [],
      source: "local",
      status: "missing",
      summary: normalizeSummary(),
      updatedAt: null,
    };
  }
}

export async function writeKnowledgeIndex(index = {}, options = {}) {
  const indexPath = getKnowledgeIndexPath(options);
  const payload = normalizeKnowledgeIndex(index);

  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  await fs.writeFile(indexPath, `${JSON.stringify(payload, null, 2)}\n`);

  return {
    indexPath,
    index: payload,
    status: "saved",
  };
}

export async function clearKnowledgeIndex(options = {}) {
  const indexPath = getKnowledgeIndexPath(options);

  try {
    await fs.rm(indexPath, { force: true });
  } catch {
    return { indexPath, status: "missing" };
  }

  return { indexPath, status: "cleared" };
}
