export const REQUIRED_SOURCE_IDS = new Set([
  "knowledge-base",
  "code-repository",
  "local-intel",
  "local-music",
]);

const STATUS_ALIASES = {
  enabled: "ready",
  missing: "missing",
  mock: "mock",
  paused: "error",
  ready: "ready",
  typeMismatch: "error",
  "type mismatch": "error",
  unconfigured: "unconfigured",
  unreadable: "error",
};

function toStringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeSourceStatus(value) {
  const status = toStringValue(value);
  return STATUS_ALIASES[status] ?? "error";
}

function getMessageForStatus(status, reason) {
  if (reason) {
    return reason;
  }

  if (status === "ready") {
    return "Ready";
  }
  if (status === "mock") {
    return "Using mock data";
  }
  if (status === "unconfigured") {
    return "Choose a local path";
  }
  if (status === "missing") {
    return "Path not found";
  }

  return "Read access unavailable";
}

export function buildSourceHealth({
  configured,
  id,
  label,
  message,
  mock = false,
  path = "",
  readable,
  reason,
  status,
  updatedAt = null,
} = {}) {
  const normalizedPath = toStringValue(path);
  const isConfigured = configured ?? Boolean(normalizedPath);
  const normalizedStatus = mock
    ? "mock"
    : !isConfigured
      ? "unconfigured"
      : status
        ? normalizeSourceStatus(status)
        : readable
          ? "ready"
          : "missing";

  return {
    configured: normalizedStatus === "mock" ? false : isConfigured,
    id,
    label,
    message: message ?? getMessageForStatus(normalizedStatus, reason),
    path: normalizedPath,
    status: normalizedStatus,
    updatedAt,
  };
}

export function buildProviderStatus({
  configured,
  message,
  sourceId,
  status = "mock",
  updatedAt = null,
} = {}) {
  const normalizedStatus = normalizeSourceStatus(status);

  return {
    configured: configured ?? (normalizedStatus !== "mock" && normalizedStatus !== "unconfigured"),
    message: message ?? getMessageForStatus(normalizedStatus),
    sourceId,
    status: normalizedStatus,
    updatedAt,
  };
}

export function summarizeSourceHealth(sources = []) {
  return sources.reduce(
    (summary, source) => {
      const status = normalizeSourceStatus(source.status ?? source.state);
      return {
        ...summary,
        [status]: summary[status] + 1,
        total: summary.total + 1,
      };
    },
    { error: 0, missing: 0, mock: 0, ready: 0, total: 0, unconfigured: 0 },
  );
}

export function isRequiredSource(source) {
  return REQUIRED_SOURCE_IDS.has(source?.id);
}
