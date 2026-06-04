function toStringValue(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function toNumberValue(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeTags(value, fallback) {
  if (Array.isArray(value)) {
    const tags = value.map((item) => toStringValue(item)).filter(Boolean);
    return tags.length > 0 ? tags : [fallback];
  }

  const tag = toStringValue(value, fallback);
  return tag ? [tag] : [];
}

export function createKnowledgeDocumentId(relativePath = "") {
  const slug = toStringValue(relativePath, "document")
    .toLowerCase()
    .replace(/\\/g, "/")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `kb-${slug || "document"}`;
}

export function buildKnowledgeDocument(input = {}) {
  const relativePath = toStringValue(input.relativePath);
  const title = toStringValue(input.title ?? input.name, relativePath.split("/").pop() || "Untitled");
  const type = toStringValue(input.type ?? input.kind, "document");
  const source = toStringValue(input.source, "local");
  const status = toStringValue(input.status ?? input.state, "indexed");
  const preview = toStringValue(input.preview ?? input.excerpt);
  const inferredTags = normalizeTags(input.inferredTags ?? input.tags ?? input.tag, type);
  const chunks = toNumberValue(input.chunks, preview ? 1 : 0);

  return {
    chunks,
    excerpt: preview,
    id: toStringValue(input.id, createKnowledgeDocumentId(relativePath || title)),
    inferredTags,
    kind: type,
    name: title,
    preview,
    relativePath,
    size: toNumberValue(input.size),
    source,
    state: status,
    status,
    tag: inferredTags[0] ?? type,
    title,
    type,
    updatedAt: input.updatedAt ?? null,
    ...(input.message ? { message: toStringValue(input.message) } : {}),
  };
}

export function buildKnowledgeSource(input = {}) {
  const status = toStringValue(input.status, "ready");
  const documentCount = toNumberValue(input.documentCount);

  return {
    chunkCount: toNumberValue(input.chunkCount),
    configured: input.configured ?? status !== "unconfigured",
    documentCount,
    id: toStringValue(input.id, "knowledge-base"),
    label: toStringValue(input.label ?? input.title, "Knowledge Base"),
    message: toStringValue(input.message),
    path: toStringValue(input.path),
    source: toStringValue(input.source, "local"),
    sourceId: toStringValue(input.sourceId, "knowledge-base"),
    status,
    title: toStringValue(input.title, "Knowledge Base"),
    type: toStringValue(input.type, "directory"),
    updatedAt: input.updatedAt ?? null,
  };
}

export function buildKnowledgeScanSummary(input = {}) {
  return {
    errors: toNumberValue(input.errors),
    indexed: toNumberValue(input.indexed),
    scanned: toNumberValue(input.scanned),
    skipped: toNumberValue(input.skipped),
    source: toStringValue(input.source, "local"),
    status: toStringValue(input.status, "ready"),
    updatedAt: input.updatedAt ?? null,
    ...(input.message ? { message: toStringValue(input.message) } : {}),
  };
}

export function buildKnowledgeIndexStatus(input = {}) {
  const docs = toNumberValue(input.docs);
  const indexed = toNumberValue(input.indexed, docs);
  const pending = toNumberValue(input.pending);
  const failed = toNumberValue(input.failed);
  const progress = docs === 0 ? "0%" : `${Math.round((indexed / docs) * 100)}%`;

  return {
    chunks: toNumberValue(input.chunks, indexed),
    docs,
    failed,
    indexed,
    lastIndexed: input.lastIndexed ?? input.updatedAt ?? null,
    pending,
    progress: toStringValue(input.progress, progress),
    queue: toNumberValue(input.queue, pending),
    source: toStringValue(input.source, "local"),
    status: toStringValue(input.status, "ready"),
    updatedAt: input.updatedAt ?? null,
  };
}

export function buildKnowledgeChunkPreview(input = {}) {
  return {
    chunkId: toStringValue(input.chunkId, `${toStringValue(input.documentId, "doc")}:preview`),
    documentId: toStringValue(input.documentId),
    excerpt: toStringValue(input.excerpt ?? input.preview),
    preview: toStringValue(input.preview ?? input.excerpt),
    relativePath: toStringValue(input.relativePath),
    source: toStringValue(input.source, "local"),
    title: toStringValue(input.title),
  };
}

export function buildKnowledgeSearchResult(input = {}) {
  return {
    excerpt: toStringValue(input.excerpt ?? input.preview),
    id: toStringValue(input.id, createKnowledgeDocumentId(input.relativePath ?? input.title)),
    query: toStringValue(input.query),
    relativePath: toStringValue(input.relativePath),
    score: toNumberValue(input.score, 1),
    source: toStringValue(input.source, "local"),
    status: toStringValue(input.status, "indexed"),
    title: toStringValue(input.title),
    type: toStringValue(input.type, "document"),
    updatedAt: input.updatedAt ?? null,
  };
}
