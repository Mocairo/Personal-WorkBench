function toStringValue(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function toNumberValue(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeTags(value, fallback = []) {
  if (Array.isArray(value)) {
    const tags = value.map((item) => toStringValue(item)).filter(Boolean);
    return tags.length > 0 ? tags : fallback;
  }

  const tag = toStringValue(value);
  return tag ? [tag] : fallback;
}

export function redactIntelText(value = "") {
  return toStringValue(value)
    .replace(/\b(token|api[_-]?key|secret|password|authorization)\s*([:=])\s*["']?[^"'\s]+/gi, (_match, key, separator) => `${key}${separator}[redacted]`)
    .replace(/\bsk-[a-z0-9_-]{6,}\b/gi, "[redacted]");
}

export function buildIntelReport(input = {}) {
  const relativePath = toStringValue(input.relativePath);
  const reportId = toStringValue(input.reportId ?? input.id, relativePath.replace(/^reports\//, "").replace(/\.[^.]+$/, "") || "report");
  const title = toStringValue(input.title ?? input.name, reportId);
  const summary = redactIntelText(input.summary ?? input.excerpt ?? input.message);

  return {
    excerpt: summary,
    id: reportId,
    priority: toStringValue(input.priority ?? input.severity, "medium"),
    relativePath,
    reportId,
    source: toStringValue(input.source, "local"),
    status: toStringValue(input.status, "ready"),
    summary,
    tags: normalizeTags(input.tags, ["report"]),
    title,
    updatedAt: input.updatedAt ?? null,
  };
}

export function buildIntelLogEntry(input = {}) {
  const level = toStringValue(input.level, "info").toLowerCase();
  const severity = toStringValue(
    input.severity,
    level === "error" ? "high" : level === "warn" || level === "warning" ? "medium" : "low",
  );

  return {
    id: toStringValue(input.id),
    level,
    message: redactIntelText(input.message),
    relativePath: toStringValue(input.relativePath),
    severity,
    source: toStringValue(input.source, "local"),
    status: toStringValue(input.status, "ready"),
    time: toStringValue(input.time ?? input.updatedAt),
    updatedAt: input.updatedAt ?? input.time ?? null,
  };
}

export function buildIntelSourceHealth(input = {}) {
  const status = toStringValue(input.status ?? input.state, "ready");
  const state = toStringValue(
    input.state,
    status === "ready" ? "enabled" : status === "missing" || status === "error" ? "error" : "paused",
  );

  return {
    checks: toNumberValue(input.checks),
    label: toStringValue(input.label ?? input.name, "source"),
    message: toStringValue(input.message),
    source: toStringValue(input.source, "local"),
    state,
    status,
    updatedAt: input.updatedAt ?? null,
    value: toStringValue(input.value),
  };
}

export function buildIntelCollectionStatus(input = {}) {
  const status = toStringValue(input.status ?? input.state, "ready");
  const count = toNumberValue(input.count);

  return {
    count,
    label: toStringValue(input.label ?? input.name, "Collection"),
    progress: toStringValue(input.progress, status === "ready" ? "100%" : count > 0 ? "50%" : "0%"),
    source: toStringValue(input.source, "local"),
    state: status,
    status,
    updatedAt: input.updatedAt ?? null,
  };
}

export function buildIntelWorkspaceStatus(input = {}) {
  const status = toStringValue(input.status, input.configured === false ? "unconfigured" : "ready");

  return {
    configured: input.configured ?? status !== "unconfigured",
    databaseReady: Boolean(input.databaseReady),
    dataStoreReady: Boolean(input.dataStoreReady),
    logCount: toNumberValue(input.logCount),
    logsReady: Boolean(input.logsReady),
    message: toStringValue(input.message),
    reportCount: toNumberValue(input.reportCount),
    reportsReady: Boolean(input.reportsReady),
    rootReady: Boolean(input.rootReady ?? input.workspaceConfigured),
    runtimeTracked: Boolean(input.runtimeTracked),
    source: toStringValue(input.source, "local"),
    status,
    updatedAt: input.updatedAt ?? null,
  };
}

export function buildIntelDashboardSummary(input = {}) {
  const reportCount = toNumberValue(input.reportCount);
  const state = toStringValue(input.state ?? input.status, reportCount > 0 ? "ready" : "missing");

  return {
    databaseReady: Boolean(input.databaseReady),
    latestReportAt: input.latestReportAt ?? null,
    logCount: toNumberValue(input.logCount),
    reportCount,
    runtimeTracked: Boolean(input.runtimeTracked),
    serviceId: toStringValue(input.serviceId, "local-intel"),
    source: toStringValue(input.source, "local"),
    state,
    status: toStringValue(input.status, state),
    updatedAt: input.updatedAt ?? input.latestReportAt ?? null,
  };
}
