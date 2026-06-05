import fs from "node:fs/promises";
import path from "node:path";
import { limitKnowledgeIndexText, redactKnowledgeIndexText } from "./knowledgeIndexStore.js";

const DEFAULT_VECTOR_FILE = "knowledge-vectors.json";
const MAX_VECTOR_DIMENSIONS = 4096;
const MAX_INPUT_CHARS = 1600;

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function numberOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}

function finiteVector(value = []) {
  return (Array.isArray(value) ? value : [])
    .slice(0, MAX_VECTOR_DIMENSIONS)
    .map((item) => Number(item))
    .filter(Number.isFinite);
}

function normalizeVector(vector = {}) {
  const embedding = finiteVector(vector.embedding);

  return {
    chunkId: limitKnowledgeIndexText(vector.chunkId ?? vector.id, 180),
    dimension: numberOrZero(Number(vector.dimension)) || embedding.length,
    embedding,
    model: limitKnowledgeIndexText(vector.model, 120),
    provider: limitKnowledgeIndexText(vector.provider, 80),
    textHash: limitKnowledgeIndexText(vector.textHash, 160),
    updatedAt: limitKnowledgeIndexText(vector.updatedAt, 80) || new Date().toISOString(),
  };
}

function normalizeMetadata(metadata = {}) {
  return {
    dimension: numberOrZero(Number(metadata.dimension)),
    model: limitKnowledgeIndexText(metadata.model, 120),
    provider: limitKnowledgeIndexText(metadata.provider, 80),
  };
}

function normalizeSummary(summary = {}, vectorCount = 0) {
  return {
    failed: numberOrZero(summary.failed),
    skipped: numberOrZero(summary.skipped),
    vectors: numberOrZero(summary.vectors) || vectorCount,
  };
}

export function getKnowledgeVectorPath(options = {}) {
  const userDataDir = cleanString(options.userDataDir) || path.resolve(".");
  return path.join(userDataDir, "knowledge", DEFAULT_VECTOR_FILE);
}

export function normalizeKnowledgeVectors(cache = {}) {
  const vectors = (Array.isArray(cache.vectors) ? cache.vectors : [])
    .map(normalizeVector)
    .filter((vector) => vector.chunkId && vector.textHash && vector.embedding.length > 0)
    .sort((left, right) => left.chunkId.localeCompare(right.chunkId));

  return {
    metadata: normalizeMetadata(cache.metadata),
    schemaVersion: 1,
    source: "knowledge-vectors",
    status: limitKnowledgeIndexText(cache.status, 80) || "ready",
    summary: normalizeSummary(cache.summary, vectors.length),
    updatedAt: limitKnowledgeIndexText(cache.updatedAt, 80) || new Date().toISOString(),
    vectors,
  };
}

export async function readKnowledgeVectors(options = {}) {
  const vectorPath = getKnowledgeVectorPath(options);

  try {
    const content = await fs.readFile(vectorPath, "utf8");
    return normalizeKnowledgeVectors(JSON.parse(content));
  } catch {
    return {
      metadata: {},
      schemaVersion: 1,
      source: "knowledge-vectors",
      status: "missing",
      summary: normalizeSummary(),
      updatedAt: null,
      vectors: [],
    };
  }
}

export async function writeKnowledgeVectors(cache = {}, options = {}) {
  const vectorPath = getKnowledgeVectorPath(options);
  const payload = normalizeKnowledgeVectors(cache);

  await fs.mkdir(path.dirname(vectorPath), { recursive: true });
  await fs.writeFile(vectorPath, `${JSON.stringify(payload, null, 2)}\n`);

  return {
    status: "saved",
    vectorPath,
    vectors: payload,
  };
}

export async function clearKnowledgeVectors(options = {}) {
  const vectorPath = getKnowledgeVectorPath(options);

  try {
    await fs.rm(vectorPath, { force: true });
  } catch {
    return { status: "missing", vectorPath };
  }

  return { status: "cleared", vectorPath };
}

export function getReusableVector(chunk = {}, cache = {}) {
  const chunkId = cleanString(chunk.chunkId ?? chunk.id);
  const textHash = cleanString(chunk.textHash);
  const vectors = Array.isArray(cache.vectors) ? cache.vectors : [];

  const vector = vectors.find((item) => item.chunkId === chunkId && item.textHash === textHash);
  return vector && finiteVector(vector.embedding).length > 0 ? normalizeVector(vector) : null;
}

export function selectChunksNeedingEmbedding(chunks = [], cache = {}) {
  return (Array.isArray(chunks) ? chunks : []).filter((chunk) => !getReusableVector(chunk, cache));
}

export function getVectorEmbeddingInput(chunk = {}, options = {}) {
  const maxInputChars = Math.max(120, Number.isFinite(options.maxInputChars) ? options.maxInputChars : MAX_INPUT_CHARS);
  const titlePath = Array.isArray(chunk.titlePath) ? chunk.titlePath.join(" > ") : "";
  const text = [
    cleanString(chunk.title),
    titlePath,
    cleanString(chunk.relativePath),
    cleanString(chunk.preview ?? chunk.excerpt),
  ].filter(Boolean).join("\n");
  const redacted = redactKnowledgeIndexText(text);

  if (redacted.length <= maxInputChars) {
    return redacted;
  }

  return `${redacted.slice(0, Math.max(0, maxInputChars - 3))}...`;
}
