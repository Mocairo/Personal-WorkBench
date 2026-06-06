const SECRET_ASSIGNMENT_PATTERN = /\b(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi;
const AUTHORIZATION_PATTERN = /\bAuthorization:\s*Bearer\s+[^\s,;]+/gi;
const OPENAI_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]+/g;
const WINDOWS_PATH_PATTERN = /\b[A-Za-z]:\\[^\s"']+/g;
const UNIX_PATH_PATTERN = /(^|\s)\/(?:Users|home|var|tmp|mnt|Volumes)\/[^\s"']+/g;

const DEFAULT_MAX_ITEMS = 5;
const DEFAULT_MAX_CHARS = 900;

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function firstString(...values) {
  return values.map(cleanString).find(Boolean) ?? "";
}

function numberValue(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clampText(value, maxChars = DEFAULT_MAX_CHARS) {
  const text = redactAgentToolText(value);
  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}

function redactAgentToolArgText(value) {
  const text = cleanString(value);
  if (!text) {
    return "";
  }

  return text
    .replace(AUTHORIZATION_PATTERN, "[redacted]")
    .replace(SECRET_ASSIGNMENT_PATTERN, (match) => `${match.split(/[:=]/)[0]}=[redacted]`)
    .replace(OPENAI_KEY_PATTERN, "[redacted]")
    .replace(WINDOWS_PATH_PATTERN, "[redacted-path]")
    .replace(UNIX_PATH_PATTERN, "$1[redacted-path]");
}

function clampArgText(value, maxChars = DEFAULT_MAX_CHARS) {
  const text = redactAgentToolArgText(value);
  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}

function normalizePermissionLevel(value, fallback = 1) {
  if (Number.isFinite(value)) {
    return value;
  }

  const match = cleanString(value).match(/\d+/);
  return match ? Number(match[0]) : fallback;
}

function limitArray(items, limits, depth) {
  return items
    .slice(0, limits.maxResultItems)
    .map((item) => sanitizeValue(item, limits, depth + 1));
}

function sanitizeValue(value, limits, depth = 0) {
  if (typeof value === "string") {
    const max = depth > 1 ? Math.min(160, limits.maxResultChars) : limits.maxResultChars;
    return clampText(value, max);
  }

  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    return limitArray(value, limits, depth);
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const sanitized = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    sanitized[redactAgentToolText(key)] = sanitizeValue(nestedValue, limits, depth + 1);
  }

  return sanitized;
}

function normalizeLimits(limits = {}) {
  return {
    maxResultChars: Math.max(80, numberValue(limits.maxResultChars, DEFAULT_MAX_CHARS)),
    maxResultItems: Math.max(1, numberValue(limits.maxResultItems, DEFAULT_MAX_ITEMS)),
  };
}

function extractItems(sanitized) {
  if (Array.isArray(sanitized)) {
    return sanitized;
  }
  if (Array.isArray(sanitized?.results)) {
    return sanitized.results;
  }
  if (Array.isArray(sanitized?.items)) {
    return sanitized.items;
  }
  if (Array.isArray(sanitized?.files)) {
    return sanitized.files;
  }
  if (Array.isArray(sanitized?.agents)) {
    return sanitized.agents;
  }
  if (Array.isArray(sanitized?.sessions)) {
    return sanitized.sessions;
  }

  return sanitized ? [sanitized] : [];
}

function itemSummary(item, index) {
  if (typeof item === "string") {
    return item;
  }

  return firstString(
    item?.title,
    item?.name,
    item?.label,
    item?.relativePath,
    item?.branch,
    item?.status,
    `item ${index + 1}`,
  );
}

function summarizeSanitizedResult(label, sanitized, limits) {
  const items = extractItems(sanitized);
  const itemText = items
    .slice(0, limits.maxResultItems)
    .map(itemSummary)
    .filter(Boolean)
    .join("; ");
  const fallback = JSON.stringify(sanitized);
  const text = itemText || fallback || "No result items.";

  return clampText(`${label}: ${text}`, limits.maxResultChars);
}

function buildDeniedToolCall(call = {}, message = "Tool is not available in this read-only phase.") {
  const toolId = cleanString(call.toolId) || "unknown";

  return {
    duration: "0ms",
    id: cleanString(call.id) || `tool-${toolId}`,
    label: cleanString(call.label) || toolId,
    meta: message,
    permission: `Level ${normalizePermissionLevel(call.permissionLevel, 4)} / denied`,
    permissionLevel: normalizePermissionLevel(call.permissionLevel, 4),
    resultCount: 0,
    source: "tool-registry",
    state: "denied",
    status: "denied",
    summary: message,
    title: cleanString(call.label) || toolId,
    toolId,
  };
}

function buildErrorToolCall(call = {}, definition, error) {
  const message = clampText(error?.message || "Read-only tool failed.", 220);

  return {
    duration: "0ms",
    id: cleanString(call.id) || `tool-${definition.toolId}`,
    label: definition.label,
    meta: message,
    permission: "Level 1 / read-only",
    permissionLevel: 1,
    resultCount: 0,
    source: "tool-registry",
    state: "error",
    status: "error",
    summary: message,
    title: definition.label,
    toolId: definition.toolId,
  };
}

function queryArgs(args = {}, call = {}) {
  return {
    query: clampArgText(firstString(args.query, call.query, call.userText, "local workspace"), 240),
  };
}

function documentPreviewArgs(args = {}, call = {}) {
  return {
    documentId: clampText(firstString(args.documentId, args.id, call.documentId, call.id), 160),
  };
}

function noArgs() {
  return {};
}

export const AGENT_TOOL_REGISTRY = [
  {
    description: "Search local knowledge base for relevant documents and passages",
    label: "Knowledge Search",
    maxResultChars: 900,
    maxResultItems: 5,
    parameters: { type: "object", properties: { query: { type: "string", description: "The search query text" } }, required: ["query"] },
    permissionLevel: 1,
    providerMethod: "searchKnowledgeLocal",
    toolId: "kb.searchLocal",
    validateArgs: queryArgs,
    invoke(provider, args) {
      return provider.searchKnowledgeLocal(args.query);
    },
  },
  {
    description: "Preview a knowledge base document by its ID",
    label: "Knowledge Document Preview",
    maxResultChars: 900,
    maxResultItems: 1,
    parameters: { type: "object", properties: { documentId: { type: "string", description: "The document ID to preview" } }, required: ["documentId"] },
    permissionLevel: 1,
    providerMethod: "getKnowledgeDocumentPreview",
    toolId: "kb.getDocumentPreview",
    validateArgs: documentPreviewArgs,
    invoke(provider, args) {
      return provider.getKnowledgeDocumentPreview(args.documentId);
    },
  },
  {
    description: "List all files in the code repository",
    label: "Repository Files",
    maxResultChars: 900,
    maxResultItems: 8,
    parameters: { type: "object", properties: {}, required: [] },
    permissionLevel: 1,
    providerMethod: "listCodeRepositoryFiles",
    toolId: "codeRepo.listFiles",
    validateArgs: noArgs,
    invoke(provider) {
      return provider.listCodeRepositoryFiles();
    },
  },
  {
    description: "Get a summary of recent git changes, branches, and status",
    label: "Git Summary",
    maxResultChars: 600,
    maxResultItems: 3,
    parameters: { type: "object", properties: {}, required: [] },
    permissionLevel: 1,
    providerMethod: "getCodeGitSummary",
    toolId: "codeRepo.getGitSummary",
    validateArgs: noArgs,
    invoke(provider) {
      return provider.getCodeGitSummary();
    },
  },
  {
    description: "Get code repository metrics like file counts, module counts, and symbol counts",
    label: "Repository Metrics",
    maxResultChars: 600,
    maxResultItems: 5,
    parameters: { type: "object", properties: {}, required: [] },
    permissionLevel: 1,
    providerMethod: "getCodeRepositoryMetrics",
    toolId: "codeRepo.getMetrics",
    validateArgs: noArgs,
    invoke(provider) {
      return provider.getCodeRepositoryMetrics();
    },
  },
  {
    description: "List available intelligence reports",
    label: "Intel Reports",
    maxResultChars: 900,
    maxResultItems: 5,
    parameters: { type: "object", properties: {}, required: [] },
    permissionLevel: 1,
    providerMethod: "listIntelReports",
    toolId: "intel.listReports",
    validateArgs: noArgs,
    invoke(provider) {
      return provider.listIntelReports();
    },
  },
  {
    description: "List intelligence system logs",
    label: "Intel Logs",
    maxResultChars: 900,
    maxResultItems: 5,
    parameters: { type: "object", properties: {}, required: [] },
    permissionLevel: 1,
    providerMethod: "listIntelLogs",
    toolId: "intel.listLogs",
    validateArgs: noArgs,
    invoke(provider) {
      return provider.listIntelLogs();
    },
  },
  {
    description: "List all configured agents in the workspace",
    label: "Agent List",
    maxResultChars: 900,
    maxResultItems: 6,
    parameters: { type: "object", properties: {}, required: [] },
    permissionLevel: 1,
    providerMethod: "listAgents",
    toolId: "agent.listAgents",
    validateArgs: noArgs,
    invoke(provider) {
      return provider.listAgents();
    },
  },
  {
    description: "List agent chat sessions and their summaries",
    label: "Agent Sessions",
    maxResultChars: 700,
    maxResultItems: 5,
    parameters: { type: "object", properties: {}, required: [] },
    permissionLevel: 1,
    providerMethod: "listAgentSessions",
    toolId: "agent.listSessions",
    validateArgs: noArgs,
    invoke(provider) {
      return provider.listAgentSessions();
    },
  },
];

const TOOL_ALIASES = new Map([
  ["kb.search", "kb.searchLocal"],
  ["knowledge.search", "kb.searchLocal"],
  ["knowledge.preview", "kb.getDocumentPreview"],
  ["repo.files", "codeRepo.listFiles"],
  ["code.files", "codeRepo.listFiles"],
  ["repo.git", "codeRepo.getGitSummary"],
  ["repo.metrics", "codeRepo.getMetrics"],
  ["agent.sessions", "agent.listSessions"],
]);

const TOOL_MAP = new Map(AGENT_TOOL_REGISTRY.map((tool) => [tool.toolId, tool]));

export function getToolsForOpenAI() {
  return AGENT_TOOL_REGISTRY.map((tool) => ({
    type: "function",
    function: {
      name: tool.toolId.replace(/\./g, "_"),
      description: tool.description || tool.label,
      parameters: tool.parameters || { type: "object", properties: {}, required: [] },
    },
  }));
}

export function redactAgentToolText(value) {
  const text = cleanString(value);
  if (!text) {
    return "";
  }

  return text
    .replace(AUTHORIZATION_PATTERN, "[redacted]")
    .replace(SECRET_ASSIGNMENT_PATTERN, "[redacted]")
    .replace(OPENAI_KEY_PATTERN, "[redacted]")
    .replace(WINDOWS_PATH_PATTERN, "[redacted-path]")
    .replace(UNIX_PATH_PATTERN, "$1[redacted-path]");
}

export function normalizeAgentToolId(toolId) {
  const id = cleanString(toolId);
  return TOOL_ALIASES.get(id) ?? id;
}

export function getRegisteredAgentTool(toolId) {
  return TOOL_MAP.get(normalizeAgentToolId(toolId)) ?? null;
}

export function sanitizeToolResult(result, limits = {}) {
  const normalizedLimits = normalizeLimits(limits);
  return sanitizeValue(result, normalizedLimits);
}

export async function executeRegisteredAgentTool(call = {}, options = {}) {
  const normalizedToolId = normalizeAgentToolId(call.toolId);
  const definition = getRegisteredAgentTool(normalizedToolId);
  const requestedLevel = normalizePermissionLevel(call.permissionLevel, definition?.permissionLevel ?? 4);

  if (!definition || definition.permissionLevel !== 1 || requestedLevel > 1) {
    return buildDeniedToolCall(
      { ...call, permissionLevel: requestedLevel, toolId: normalizedToolId },
      "Only registered Level 1 read-only tools can execute.",
    );
  }

  const provider = options.provider;
  if (!provider || typeof provider[definition.providerMethod] !== "function") {
    return buildErrorToolCall(call, definition, new Error("Read-only provider method is unavailable."));
  }

  try {
    const args = definition.validateArgs(call.args ?? {}, { ...call, toolId: normalizedToolId });
    const rawResult = await definition.invoke(provider, args);
    const limits = normalizeLimits(definition);
    const sanitized = sanitizeToolResult(rawResult, limits);
    const items = extractItems(sanitized).slice(0, limits.maxResultItems);
    const summary = summarizeSanitizedResult(definition.label, sanitized, limits);

    return {
      args,
      duration: "read-only",
      id: cleanString(call.id) || `tool-${definition.toolId}`,
      items,
      label: definition.label,
      meta: summary,
      permission: "Level 1 / read-only",
      permissionLevel: 1,
      result: sanitized,
      resultCount: items.length,
      source: "tool-registry",
      state: "completed",
      status: "completed",
      summary,
      title: definition.label,
      toolId: definition.toolId,
    };
  } catch (error) {
    return buildErrorToolCall(call, definition, error);
  }
}
