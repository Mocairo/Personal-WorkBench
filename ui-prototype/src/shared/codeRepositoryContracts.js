function toStringValue(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function toNumberValue(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeRelativePath(value) {
  return toStringValue(value).replace(/\\/g, "/");
}

export function createRepositoryFileId(relativePath = "") {
  const slug = normalizeRelativePath(relativePath)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `repo-${slug || "root"}`;
}

export function buildRepositoryFileNode(input = {}) {
  const relativePath = normalizeRelativePath(input.relativePath ?? input.name);
  const type = toStringValue(input.type, "file");
  const language = toStringValue(input.language);
  const status = toStringValue(input.status ?? input.state ?? input.gitState, "clean");

  return {
    depth: toNumberValue(input.depth),
    gitState: toStringValue(input.gitState, status),
    icon: input.icon ?? (type === "directory" ? "folder" : /\.(js|jsx|ts|tsx|py|json)$/i.test(relativePath) ? "code" : "file"),
    id: toStringValue(input.id, createRepositoryFileId(relativePath)),
    language,
    meta: toStringValue(input.meta, type === "directory" ? "directory" : language || "file"),
    name: toStringValue(input.name, relativePath.split("/").pop() || "file"),
    relativePath,
    size: toNumberValue(input.size),
    source: toStringValue(input.source, "local"),
    state: status,
    status,
    type,
    updatedAt: input.updatedAt ?? null,
  };
}

export function buildRepositorySource(input = {}) {
  const status = toStringValue(input.status, "ready");

  return {
    branch: toStringValue(input.branch),
    configured: input.configured ?? status !== "unconfigured",
    fileCount: toNumberValue(input.fileCount),
    id: toStringValue(input.id, "local-root"),
    message: toStringValue(input.message),
    name: toStringValue(input.name, "Repository"),
    path: toStringValue(input.path),
    source: toStringValue(input.source, "local"),
    status,
    updatedAt: input.updatedAt ?? null,
  };
}

export function buildGitSummary(input = {}) {
  const changed = toNumberValue(input.changed);
  const status = toStringValue(input.status, input.branch ? "ready" : "not-repository");

  return {
    branch: toStringValue(input.branch, status === "ready" ? "main" : "not a repository"),
    changed,
    modified: toNumberValue(input.modified),
    staged: toNumberValue(input.staged),
    status,
    statusLabel: toStringValue(input.statusLabel, status === "ready" ? (changed === 0 ? "clean" : `${changed} changes`) : "unavailable"),
    untracked: toNumberValue(input.untracked),
    updatedAt: input.updatedAt ?? null,
  };
}

export function buildRepositoryMetrics(input = {}) {
  const fileCount = toNumberValue(input.fileCount, toNumberValue(input.symbols));

  return {
    changed: toNumberValue(input.changed),
    fileCount,
    languageRatio: input.languageRatio ?? {},
    modules: toNumberValue(input.modules),
    symbols: toNumberValue(input.symbols, fileCount),
  };
}

export function buildCodeStructureNode(input = {}) {
  return {
    id: toStringValue(input.id),
    label: toStringValue(input.label, input.id),
    source: toStringValue(input.source, "local"),
    type: toStringValue(input.type, "module"),
    value: toNumberValue(input.value),
  };
}

export function buildRepositoryScanSummary(input = {}) {
  return {
    errors: toNumberValue(input.errors),
    scanned: toNumberValue(input.scanned),
    skipped: toNumberValue(input.skipped),
    source: toStringValue(input.source, "local"),
    status: toStringValue(input.status, "ready"),
    updatedAt: input.updatedAt ?? null,
    ...(input.message ? { message: toStringValue(input.message) } : {}),
  };
}
