import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_SESSION_FILE = "agent-chat-session.json";
const DEFAULT_HISTORY_FILE = "agent-chat-history.json";
const SECRET_ASSIGNMENT_PATTERN = /\b(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi;
const AUTHORIZATION_PATTERN = /\bAuthorization:\s*Bearer\s+[^\s,;]+/gi;
const OPENAI_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]+/g;
const WINDOWS_PATH_PATTERN = /\b[A-Za-z]:\\[^\s"']+/g;
const SAFE_METADATA_KEYS = new Set(["citations", "completionId", "finishReason", "model", "provider", "toolCalls", "usage"]);
const MAX_PERSISTED_TEXT = 360;

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function nowIso(options = {}) {
  return cleanString(options.now) || new Date().toISOString();
}

export function getAgentChatUserDataSessionPath(options = {}) {
  const userDataDir = cleanString(options.userDataDir) || path.resolve(".");
  return path.join(userDataDir, "sessions", DEFAULT_SESSION_FILE);
}

export function getAgentChatUserDataHistoryPath(options = {}) {
  const userDataDir = cleanString(options.userDataDir) || path.resolve(".");
  return path.join(userDataDir, "sessions", DEFAULT_HISTORY_FILE);
}

function redactPersistedText(value) {
  const text = cleanString(value);
  if (!text) {
    return "";
  }

  return text
    .replace(AUTHORIZATION_PATTERN, "[redacted]")
    .replace(SECRET_ASSIGNMENT_PATTERN, "[redacted]")
    .replace(OPENAI_KEY_PATTERN, "[redacted]")
    .replace(WINDOWS_PATH_PATTERN, "[redacted-path]");
}

function limitPersistedText(value, maxLength = MAX_PERSISTED_TEXT) {
  const text = redactPersistedText(value);
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function sanitizeSourceRefs(sourceRefs = []) {
  return (Array.isArray(sourceRefs) ? sourceRefs : []).slice(0, 8).map((ref, index) => {
    if (!ref || typeof ref !== "object") {
      return null;
    }

    const title = limitPersistedText(ref.title ?? ref.label ?? ref.relativePath, 160);
    const preview = limitPersistedText(ref.preview ?? ref.excerpt ?? ref.summary, 240);
    const relativePath = limitPersistedText(ref.relativePath ?? ref.path, 220);

    if (!title && !preview && !relativePath) {
      return null;
    }

    return {
      ...(cleanString(ref.chunkId) ? { chunkId: limitPersistedText(ref.chunkId, 120) } : {}),
      ...(cleanString(ref.documentId) ? { documentId: limitPersistedText(ref.documentId, 120) } : {}),
      ...(cleanString(ref.matchType) ? { matchType: limitPersistedText(ref.matchType, 80) } : {}),
      ...(preview ? { preview } : {}),
      ...(relativePath ? { relativePath } : {}),
      ...(Number.isFinite(ref.score) ? { score: ref.score } : {}),
      sourceRefId: limitPersistedText(ref.sourceRefId, 40) || `S${index + 1}`,
      sourceType: limitPersistedText(ref.sourceType ?? ref.type ?? ref.source, 80) || "knowledge",
      title: title || relativePath || `Source ${index + 1}`,
    };
  }).filter(Boolean);
}

function sanitizeMetadata(metadata = {}, options = {}) {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!SAFE_METADATA_KEYS.has(key)) {
      continue;
    }

    if (key === "citations") {
      if (!options.allowCitations) {
        continue;
      }
      const citations = sanitizeSourceRefs(value);
      if (citations.length > 0) {
        sanitized.citations = citations;
      }
      continue;
    }

    if (key === "usage" && value && typeof value === "object") {
      sanitized.usage = {
        completionTokens: Number.isFinite(value.completionTokens) ? value.completionTokens : undefined,
        promptTokens: Number.isFinite(value.promptTokens) ? value.promptTokens : undefined,
        totalTokens: Number.isFinite(value.totalTokens) ? value.totalTokens : undefined,
      };
      continue;
    }

    if (key === "toolCalls") {
      sanitized.toolCalls = Number.isFinite(value) ? value : 0;
      continue;
    }

    sanitized[key] = redactPersistedText(String(value));
  }

  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

function sanitizeMessage(message = {}, fallbackRole = "assistant", createdAt = "") {
  const text = redactPersistedText(message.text ?? message.content ?? message.message);
  if (!text) {
    return null;
  }

  const role = message.role === "user" ? "user" : fallbackRole;
  const metadata = sanitizeMetadata(message.metadata, { allowCitations: true });

  return {
    createdAt,
    id: cleanString(message.id) || `${role}-${Date.parse(createdAt) || Date.now()}`,
    ...(metadata ? { metadata: { toolCalls: 0, ...metadata } } : {}),
    role,
    source: role === "user" ? "local" : cleanString(message.source) || "llm",
    status: cleanString(message.status) || (role === "user" ? "sent" : "ready"),
    text,
  };
}

function sanitizeToolPlan(toolPlan = {}) {
  const items = Array.isArray(toolPlan.items) ? toolPlan.items : [];

  return {
    id: cleanString(toolPlan.id) || "agent-tool-plan",
    items: items.slice(0, 12).map((item) => ({
      id: cleanString(item.id),
      label: limitPersistedText(item.label ?? item.title ?? item.toolId, 120),
      permissionLevel: Number.isFinite(item.permissionLevel) ? item.permissionLevel : 1,
      state: cleanString(item.state) || cleanString(item.status) || "planned",
      status: cleanString(item.status) || cleanString(item.state) || "planned",
      title: limitPersistedText(item.title ?? item.label ?? item.toolId, 120),
      toolId: limitPersistedText(item.toolId, 120),
    })),
    source: cleanString(toolPlan.source) || "local",
    status: cleanString(toolPlan.status) || "planned",
  };
}

function sanitizeToolDecisions(decisions = []) {
  return (Array.isArray(decisions) ? decisions : []).slice(0, 12).map((decision) => ({
    id: cleanString(decision.id),
    permissionLevel: Number.isFinite(decision.permissionLevel) ? decision.permissionLevel : 1,
    state: cleanString(decision.state) || cleanString(decision.status) || "pending",
    status: cleanString(decision.status) || cleanString(decision.state) || "pending",
    toolId: limitPersistedText(decision.toolId, 120),
  }));
}

function sanitizeToolCalls(toolCalls = []) {
  return (Array.isArray(toolCalls) ? toolCalls : []).slice(0, 12).map((tool) => {
    const state = cleanString(tool.state) || cleanString(tool.status) || "recorded";

    return {
      duration: limitPersistedText(tool.duration ?? tool.elapsed, 80) || "recorded",
      id: cleanString(tool.id ?? tool.toolCallId),
      meta: limitPersistedText(tool.meta ?? tool.summary ?? tool.detail, MAX_PERSISTED_TEXT) || "local tool event",
      permission: limitPersistedText(tool.permission ?? tool.permissionState, 120) || "read-only",
      source: cleanString(tool.source) || "tool",
      state,
      status: state,
      title: limitPersistedText(tool.title ?? tool.label ?? tool.toolId, 120),
      toolId: limitPersistedText(tool.toolId, 120),
    };
  }).filter((tool) => tool.title || tool.toolId);
}

function sanitizeToolResultsSummary(results = []) {
  return (Array.isArray(results) ? results : []).slice(0, 12).map((result) => ({
    itemCount: Number.isFinite(result.itemCount) ? result.itemCount : Number.isFinite(result.resultCount) ? result.resultCount : 0,
    label: limitPersistedText(result.label ?? result.title ?? result.toolId, 120),
    status: cleanString(result.status) || cleanString(result.state) || "completed",
    summary: limitPersistedText(result.summary ?? result.meta ?? result.message, MAX_PERSISTED_TEXT),
    toolId: limitPersistedText(result.toolId, 120),
  })).filter((result) => result.summary || result.toolId);
}

function numberOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}

function sanitizeContextSummaryItems(items = []) {
  return (Array.isArray(items) ? items : []).slice(0, 12).map((item) => ({
    id: limitPersistedText(item.id, 120),
    sourceType: limitPersistedText(item.sourceType ?? item.type ?? item.source, 80) || "session",
    status: limitPersistedText(item.status ?? item.state, 80) || "used",
    title: limitPersistedText(item.title ?? item.label ?? item.toolId, 160),
  })).filter((item) => item.title || item.sourceType);
}

function sanitizeContextSummaryToolResults(items = []) {
  return (Array.isArray(items) ? items : []).slice(0, 12).map((item) => ({
    itemCount: numberOrZero(item.itemCount ?? item.resultCount),
    label: limitPersistedText(item.label ?? item.title ?? item.toolId, 160),
    sourceType: "tool",
    status: limitPersistedText(item.status ?? item.state, 80) || "completed",
    toolId: limitPersistedText(item.toolId, 120),
  })).filter((item) => item.toolId || item.label);
}

function sanitizeContextSummary(summary = {}) {
  if (!summary || typeof summary !== "object") {
    return null;
  }

  const providerMetadata = sanitizeMetadata(summary.providerMetadata);
  const limits = summary.limits && typeof summary.limits === "object"
    ? {
        maxChars: numberOrZero(summary.limits.maxChars),
        maxItems: numberOrZero(summary.limits.maxItems),
        maxMessages: numberOrZero(summary.limits.maxMessages),
      }
    : null;
  const trimmed = summary.trimmed && typeof summary.trimmed === "object"
    ? {
        contextItems: numberOrZero(summary.trimmed.contextItems),
        history: numberOrZero(summary.trimmed.history),
        toolResults: numberOrZero(summary.trimmed.toolResults),
      }
    : null;
  const contextSummary = {
    ...(limits ? { limits } : {}),
    ...(providerMetadata ? { providerMetadata } : {}),
    sourceRefs: sanitizeSourceRefs(summary.sourceRefs),
    ...(trimmed ? { trimmed } : {}),
    usedContextItems: sanitizeContextSummaryItems(summary.usedContextItems),
    usedHistoryCount: numberOrZero(summary.usedHistoryCount),
    usedToolResults: sanitizeContextSummaryToolResults(summary.usedToolResults),
  };

  return Object.keys(contextSummary).length > 0 ? contextSummary : null;
}

async function readJsonFile(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return { data: JSON.parse(content), ok: true, sessionPath: filePath };
  } catch (error) {
    return {
      code: error?.code,
      ok: false,
      sessionPath: filePath,
    };
  }
}

async function readHistoryFile(options = {}) {
  const historyPath = getAgentChatUserDataHistoryPath(options);
  const result = await readJsonFile(historyPath);
  if (!result.ok) {
    return { historyPath, sessions: [] };
  }

  return {
    historyPath,
    sessions: Array.isArray(result.data.sessions) ? result.data.sessions : [],
  };
}

function historySummary(entry = {}) {
  return {
    lastUpdated: limitPersistedText(entry.lastUpdated, 80),
    messageCount: numberOrZero(entry.messageCount),
    preview: limitPersistedText(entry.preview, 180),
    sessionId: limitPersistedText(entry.sessionId, 120),
    title: limitPersistedText(entry.title, 120) || "Previous chat",
  };
}

function getHistorySessionId(session = {}, lastUpdated = "", archivedAt = "") {
  const activeSessionId = cleanString(session.session?.id ?? session.session?.sessionId);
  if (activeSessionId && !["agent-chat-session", "local-session"].includes(activeSessionId)) {
    return activeSessionId;
  }

  const timestamp = Date.parse(cleanString(archivedAt) || lastUpdated);
  return `history-${Number.isFinite(timestamp) ? timestamp : Date.now()}`;
}

function buildHistoryEntry(session = {}, now = "") {
  const chatMessages = Array.isArray(session.chatMessages)
    ? session.chatMessages.map((message) => sanitizeMessage(message, message.role, cleanString(message.createdAt) || now)).filter(Boolean)
    : [];
  if (chatMessages.length === 0) {
    return null;
  }

  const lastUpdated = cleanString(session.lastUpdated ?? session.session?.lastUpdated) || nowIso({ now });
  const firstUser = chatMessages.find((message) => message.role === "user");
  const lastAssistant = [...chatMessages].reverse().find((message) => message.role === "assistant");
  const sessionId = getHistorySessionId(session, lastUpdated, now);
  const payload = normalizeSession(
    {
      ...session,
      session: {
        ...(session.session ?? {}),
        id: sessionId,
        title: limitPersistedText(firstUser?.text ?? session.session?.title, 120) || "Previous chat",
      },
    },
    chatMessages,
    lastUpdated,
    {
      contextSummary: session.contextSummary,
      providerMetadata: session.providerMetadata,
      toolCalls: session.toolCalls,
      toolDecisions: session.toolDecisions,
      toolPlan: session.toolPlan,
      toolResultsSummary: session.toolResultsSummary,
    },
  );

  return {
    lastUpdated,
    messageCount: chatMessages.length,
    payload,
    preview: limitPersistedText(lastAssistant?.text ?? firstUser?.text, 180),
    sessionId,
    title: payload.session.title,
  };
}

async function archiveCurrentSession(options = {}) {
  const sessionPath = getAgentChatUserDataSessionPath(options);
  const current = await readJsonFile(sessionPath);
  if (!current.ok) {
    return [];
  }

  const entry = buildHistoryEntry(current.data, nowIso(options));
  if (!entry) {
    return [];
  }

  const history = await readHistoryFile(options);
  const sessions = [
    entry,
    ...history.sessions.filter((item) => item.sessionId !== entry.sessionId),
  ].slice(0, 20);

  await fs.mkdir(path.dirname(history.historyPath), { recursive: true });
  await fs.writeFile(history.historyPath, `${JSON.stringify({ sessions }, null, 2)}\n`);

  return sessions.map(historySummary);
}

function normalizeSession(session = {}, messages = [], createdAt = "", turn = {}) {
  const contextSummary = sanitizeContextSummary(turn.contextSummary);
  const toolCalls = sanitizeToolCalls(turn.toolCalls);
  const toolPlan = sanitizeToolPlan(turn.toolPlan);
  const toolDecisions = sanitizeToolDecisions(turn.toolDecisions);
  const toolResultsSummary = sanitizeToolResultsSummary(turn.toolResultsSummary);
  const providerMetadata = sanitizeMetadata(turn.providerMetadata ?? turn.assistantMessage?.metadata);
  const finalAnswer = limitPersistedText(turn.assistantMessage?.text, MAX_PERSISTED_TEXT);

  return {
    chatMessages: messages,
    ...(contextSummary ? { contextSummary } : {}),
    contextItems: Array.isArray(session.contextItems) ? session.contextItems : [],
    ...(finalAnswer ? { finalAnswer } : {}),
    lastUpdated: createdAt,
    ...(providerMetadata ? { providerMetadata: { toolCalls: toolCalls.length, ...providerMetadata } } : {}),
    session: {
      id: cleanString(session.session?.id ?? session.session?.sessionId) || "agent-chat-session",
      lastUpdated: createdAt,
      messageCount: messages.length,
      source: "userData",
      status: "ready",
      title: redactPersistedText(session.session?.title) || "Agent Chat Session",
    },
    toolCalls: toolCalls.length > 0
      ? toolCalls
      : [
          {
            duration: "0ms",
            meta: "text-only reply",
            permission: "none",
            source: "llm",
            state: "done",
            title: "No tools executed",
          },
        ],
    ...(toolDecisions.length > 0 ? { toolDecisions } : {}),
    ...(toolPlan.items.length > 0 ? { toolPlan } : {}),
    ...(toolResultsSummary.length > 0 ? { toolResultsSummary } : {}),
  };
}

export async function readAgentChatUserDataSession(options = {}) {
  const sessionPath = getAgentChatUserDataSessionPath(options);
  return readJsonFile(sessionPath);
}

export async function listAgentChatUserDataSessionHistory(options = {}) {
  const history = await readHistoryFile(options);

  return {
    historyPath: history.historyPath,
    sessions: history.sessions.map(historySummary).filter((session) => session.sessionId),
    status: "ready",
  };
}

export async function restoreAgentChatUserDataSession(input = {}, options = {}) {
  const sessionId = cleanString(input.sessionId);
  const history = await readHistoryFile(options);
  const entry = history.sessions.find((item) => item.sessionId === sessionId);
  if (!entry?.payload) {
    return {
      messageCount: 0,
      status: "not_found",
    };
  }

  // Save current session to history before overwriting
  const currentSession = await readJsonFile(getAgentChatUserDataSessionPath(options));
  if (Array.isArray(currentSession?.chatMessages) && currentSession.chatMessages.length > 0) {
    await archiveCurrentSession(options);
  }

  const sessionPath = getAgentChatUserDataSessionPath(options);
  const payload = normalizeSession(
    entry.payload,
    Array.isArray(entry.payload.chatMessages) ? entry.payload.chatMessages : [],
    cleanString(entry.payload.lastUpdated) || nowIso(options),
    {
      contextSummary: entry.payload.contextSummary,
      providerMetadata: entry.payload.providerMetadata,
      toolCalls: entry.payload.toolCalls,
      toolDecisions: entry.payload.toolDecisions,
      toolPlan: entry.payload.toolPlan,
      toolResultsSummary: entry.payload.toolResultsSummary,
    },
  );

  await fs.mkdir(path.dirname(sessionPath), { recursive: true });
  await fs.writeFile(sessionPath, `${JSON.stringify(payload, null, 2)}\n`);

  return {
    messageCount: payload.chatMessages.length,
    sessionPath,
    status: "restored",
  };
}

export async function appendAgentChatSessionTurn(turn = {}, options = {}) {
  const sessionPath = getAgentChatUserDataSessionPath(options);
  const createdAt = cleanString(turn.createdAt) || nowIso(options);
  const existing = await readJsonFile(sessionPath);
  const priorMessages = existing.ok && Array.isArray(existing.data.chatMessages)
    ? existing.data.chatMessages
    : [];
  const userMessage = sanitizeMessage(turn.userMessage, "user", createdAt);
  const assistantMessage = sanitizeMessage(turn.assistantMessage, "assistant", createdAt);
  const messages = [
    ...priorMessages.map((message) => sanitizeMessage(message, message.role, cleanString(message.createdAt) || createdAt)).filter(Boolean),
    ...(userMessage ? [userMessage] : []),
    ...(assistantMessage ? [assistantMessage] : []),
  ].slice(-100);
  const payload = normalizeSession(existing.ok ? existing.data : {}, messages, createdAt, turn);

  await fs.mkdir(path.dirname(sessionPath), { recursive: true });
  await fs.writeFile(sessionPath, `${JSON.stringify(payload, null, 2)}\n`);

  return {
    messageCount: messages.length,
    sessionPath,
    status: "saved",
  };
}

export async function resetAgentChatUserDataSession(options = {}) {
  const sessionPath = getAgentChatUserDataSessionPath(options);
  const createdAt = nowIso(options);
  const history = await archiveCurrentSession(options);
  const payload = {
    chatMessages: [],
    contextItems: [],
    lastUpdated: createdAt,
    session: {
      id: "agent-chat-session",
      lastUpdated: createdAt,
      messageCount: 0,
      source: "userData",
      status: "ready",
      title: "Agent Chat Session",
    },
    toolCalls: [],
  };

  await fs.mkdir(path.dirname(sessionPath), { recursive: true });
  await fs.writeFile(sessionPath, `${JSON.stringify(payload, null, 2)}\n`);

  return {
    history,
    messageCount: 0,
    sessionPath,
    status: "reset",
  };
}
