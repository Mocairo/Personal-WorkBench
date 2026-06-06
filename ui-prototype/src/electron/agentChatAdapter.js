import fs from "node:fs/promises";
import path from "node:path";
import {
  buildAgentChatMessage,
  buildAgentContextItem,
  buildAgentSession,
  buildAgentToolCall,
} from "../shared/agentContracts.js";
import { buildProviderStatus } from "../shared/sourceStatus.js";
import {
  listAgentChatUserDataSessionHistory,
  readAgentChatUserDataSession,
} from "./agentChatSessionStore.js";

function toStringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

const SECRET_ASSIGNMENT_PATTERN = /\b(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi;
const AUTHORIZATION_PATTERN = /\bAuthorization:\s*Bearer\s+[^\s,;]+/gi;
const OPENAI_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]+/g;
const WINDOWS_PATH_PATTERN = /\b[A-Za-z]:\\[^\s"']+/g;
const UNIX_PATH_PATTERN = /(^|\s)\/(?:Users|home|var|tmp|mnt|Volumes)\/[^\s"']+/g;

function redactContextText(value) {
  const text = toStringValue(value);
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

function sanitizeContextSummaryItem(item = {}) {
  return {
    id: redactContextText(toStringValue(item.id)),
    sourceType: redactContextText(toStringValue(item.sourceType ?? item.type ?? item.source)) || "session",
    status: redactContextText(toStringValue(item.status ?? item.state)) || "used",
    title: redactContextText(toStringValue(item.title ?? item.label ?? item.toolId)),
  };
}

function sanitizeSourceRef(ref = {}, index = 0) {
  const title = redactContextText(toStringValue(ref.title ?? ref.label ?? ref.relativePath));
  const preview = redactContextText(toStringValue(ref.preview ?? ref.excerpt ?? ref.summary));
  const relativePath = redactContextText(toStringValue(ref.relativePath ?? ref.path));

  if (!title && !preview && !relativePath) {
    return null;
  }

  return {
    ...(toStringValue(ref.chunkId) ? { chunkId: redactContextText(ref.chunkId) } : {}),
    ...(toStringValue(ref.documentId) ? { documentId: redactContextText(ref.documentId) } : {}),
    ...(toStringValue(ref.matchType) ? { matchType: redactContextText(ref.matchType) } : {}),
    ...(preview ? { preview } : {}),
    ...(relativePath ? { relativePath } : {}),
    ...(Number.isFinite(ref.score) ? { score: ref.score } : {}),
    sourceRefId: redactContextText(toStringValue(ref.sourceRefId)) || `S${index + 1}`,
    sourceType: redactContextText(toStringValue(ref.sourceType ?? ref.type ?? ref.source)) || "knowledge",
    title: title || relativePath || `Source ${index + 1}`,
  };
}

function sanitizeContextSummary(summary = {}) {
  if (!summary || typeof summary !== "object") {
    return undefined;
  }

  const trimmed = summary.trimmed && typeof summary.trimmed === "object"
    ? {
        contextItems: Number.isFinite(summary.trimmed.contextItems) ? summary.trimmed.contextItems : 0,
        history: Number.isFinite(summary.trimmed.history) ? summary.trimmed.history : 0,
        toolResults: Number.isFinite(summary.trimmed.toolResults) ? summary.trimmed.toolResults : 0,
      }
    : undefined;

  const usedContextItems = Array.isArray(summary.usedContextItems)
    ? summary.usedContextItems.slice(0, 12).map(sanitizeContextSummaryItem).filter((item) => item.title || item.sourceType)
    : [];
  const usedToolResults = Array.isArray(summary.usedToolResults)
    ? summary.usedToolResults.slice(0, 12).map((item) => ({
        label: redactContextText(toStringValue(item.label ?? item.title ?? item.toolId)),
        sourceType: "tool",
        status: redactContextText(toStringValue(item.status ?? item.state)) || "completed",
        toolId: redactContextText(toStringValue(item.toolId)),
      })).filter((item) => item.label || item.toolId)
    : [];
  const sourceRefs = Array.isArray(summary.sourceRefs)
    ? summary.sourceRefs.slice(0, 8).map(sanitizeSourceRef).filter(Boolean)
    : [];
  const providerMetadata = summary.providerMetadata && typeof summary.providerMetadata === "object"
    ? {
        ...(toStringValue(summary.providerMetadata.completionId) ? { completionId: redactContextText(summary.providerMetadata.completionId) } : {}),
        ...(toStringValue(summary.providerMetadata.finishReason) ? { finishReason: redactContextText(summary.providerMetadata.finishReason) } : {}),
        ...(toStringValue(summary.providerMetadata.model) ? { model: redactContextText(summary.providerMetadata.model) } : {}),
        ...(toStringValue(summary.providerMetadata.provider) ? { provider: redactContextText(summary.providerMetadata.provider) } : {}),
        ...(Number.isFinite(summary.providerMetadata.toolCalls) ? { toolCalls: summary.providerMetadata.toolCalls } : {}),
        ...(summary.providerMetadata.usage && typeof summary.providerMetadata.usage === "object"
          ? {
              usage: {
                completionTokens: Number.isFinite(summary.providerMetadata.usage.completionTokens) ? summary.providerMetadata.usage.completionTokens : undefined,
                promptTokens: Number.isFinite(summary.providerMetadata.usage.promptTokens) ? summary.providerMetadata.usage.promptTokens : undefined,
                totalTokens: Number.isFinite(summary.providerMetadata.usage.totalTokens) ? summary.providerMetadata.usage.totalTokens : undefined,
              },
            }
          : {}),
      }
    : undefined;

  return {
    ...(trimmed ? { trimmed } : {}),
    ...(providerMetadata && Object.keys(providerMetadata).length > 0 ? { providerMetadata } : {}),
    sourceRefs,
    usedContextItems,
    usedHistoryCount: Number.isFinite(summary.usedHistoryCount) ? summary.usedHistoryCount : 0,
    usedToolResults,
  };
}

async function readSession(sessionPath) {
  try {
    const content = await fs.readFile(sessionPath, "utf8");
    try {
      return { data: JSON.parse(content), ok: true };
    } catch {
      return {
        configured: true,
        message: "Agent session JSON is invalid",
        ok: false,
        status: "error",
      };
    }
  } catch (error) {
    return {
      configured: false,
      message: error?.code === "ENOENT" ? "Choose an agent session file in Settings." : "Agent session is unreadable",
      ok: false,
      status: error?.code === "ENOENT" ? "unconfigured" : "error",
    };
  }
}

function buildStatus(status, message, configured = status !== "unconfigured") {
  return buildProviderStatus({
    configured,
    message,
    sourceId: "agentChatSession",
    status,
  });
}

function buildEmptySessionData(status, message, configured) {
  return {
    chatMessages: [],
    contextItems: [],
    providerStatus: buildStatus(status, message, configured),
    session: buildAgentSession({
      id: "local-session",
      status,
      title: status === "error" ? "Unreadable local session" : "No local session configured",
    }),
    toolCalls: [],
  };
}

function buildSessionData(session = {}, source = "local") {
  const chatMessages = Array.isArray(session.chatMessages)
    ? session.chatMessages.map(buildAgentChatMessage).filter(Boolean).slice(-20)
    : [];
  const contextItems = Array.isArray(session.contextItems)
    ? session.contextItems.map(buildAgentContextItem).filter(Boolean).slice(0, 12)
    : [];
  const toolCalls = Array.isArray(session.toolCalls)
    ? session.toolCalls.map(buildAgentToolCall).filter(Boolean).slice(0, 12)
    : [];
  const sessionRecord = buildAgentSession({
    ...(session.session ?? {}),
    activeAgentId: session.activeAgentId ?? session.session?.activeAgentId,
    lastUpdated: session.lastUpdated ?? session.session?.lastUpdated,
    messageCount: chatMessages.length,
    source,
    status: toStringValue(session.status) || "ready",
    summary: session.summary ?? session.sessionSummary ?? session.session?.summary,
    title: session.title ?? session.session?.title,
  });

  return {
    chatMessages,
    contextItems,
    ...(session.contextSummary ? { contextSummary: sanitizeContextSummary(session.contextSummary) } : {}),
    providerStatus: buildStatus("ready", source === "userData" ? "Agent userData session loaded" : "Agent session loaded", true),
    session: sessionRecord,
    toolCalls,
  };
}

export async function getAgentChatData(options = {}) {
  const rootDir = options.rootDir ?? process.env.AGENT_CHAT_ROOT ?? path.resolve("agent-chat");
  const sessionPath = options.sessionPath ?? process.env.AGENT_CHAT_SESSION ?? path.join(rootDir, "session.json");
  if (options.userDataDir) {
    const userDataSession = await readAgentChatUserDataSession({ userDataDir: options.userDataDir });
    if (userDataSession.ok) {
      const data = buildSessionData(userDataSession.data, "userData");
      const history = await listAgentChatUserDataSessionHistory({ userDataDir: options.userDataDir });

      return {
        ...data,
        recentSessions: history.sessions,
      };
    }
  }

  const sessionResult = await readSession(sessionPath);

  if (!sessionResult.ok) {
    return buildEmptySessionData(sessionResult.status, sessionResult.message, sessionResult.configured);
  }

  return buildSessionData(sessionResult.data, "local");
}
