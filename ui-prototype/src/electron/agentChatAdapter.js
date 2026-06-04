import fs from "node:fs/promises";
import path from "node:path";
import {
  buildAgentChatMessage,
  buildAgentContextItem,
  buildAgentSession,
  buildAgentToolCall,
} from "../shared/agentContracts.js";
import { buildProviderStatus } from "../shared/sourceStatus.js";
import { readAgentChatUserDataSession } from "./agentChatSessionStore.js";

function toStringValue(value) {
  return typeof value === "string" ? value.trim() : "";
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
      return buildSessionData(userDataSession.data, "userData");
    }
  }

  const sessionResult = await readSession(sessionPath);

  if (!sessionResult.ok) {
    return buildEmptySessionData(sessionResult.status, sessionResult.message, sessionResult.configured);
  }

  return buildSessionData(sessionResult.data, "local");
}
