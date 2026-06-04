import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_SESSION_FILE = "agent-chat-session.json";
const SECRET_ASSIGNMENT_PATTERN = /\b(api[_-]?key|token|secret|password)\s*=\s*[^\s,;]+/gi;
const AUTHORIZATION_PATTERN = /\bAuthorization:\s*Bearer\s+[^\s,;]+/gi;
const OPENAI_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]+/g;
const WINDOWS_PATH_PATTERN = /\b[A-Za-z]:\\[^\s"']+/g;
const SAFE_METADATA_KEYS = new Set(["completionId", "finishReason", "model", "provider", "toolCalls", "usage"]);
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

function sanitizeMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!SAFE_METADATA_KEYS.has(key)) {
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

function limitPersistedText(value, maxLength = MAX_PERSISTED_TEXT) {
  const text = redactPersistedText(value);
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function sanitizeMessage(message = {}, fallbackRole = "assistant", createdAt = "") {
  const text = redactPersistedText(message.text ?? message.content ?? message.message);
  if (!text) {
    return null;
  }

  const role = message.role === "user" ? "user" : fallbackRole;
  const metadata = sanitizeMetadata(message.metadata);

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

function normalizeSession(session = {}, messages = [], createdAt = "", turn = {}) {
  const toolCalls = sanitizeToolCalls(turn.toolCalls);
  const toolPlan = sanitizeToolPlan(turn.toolPlan);
  const toolDecisions = sanitizeToolDecisions(turn.toolDecisions);
  const toolResultsSummary = sanitizeToolResultsSummary(turn.toolResultsSummary);
  const providerMetadata = sanitizeMetadata(turn.providerMetadata ?? turn.assistantMessage?.metadata);
  const finalAnswer = limitPersistedText(turn.assistantMessage?.text, MAX_PERSISTED_TEXT);

  return {
    chatMessages: messages,
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
