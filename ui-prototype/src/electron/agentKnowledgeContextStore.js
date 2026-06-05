import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_CONTEXT_FILE = "agent-chat-knowledge-contexts.json";
const DEFAULT_SESSION_ID = "local-session";
const DEFAULT_MAX_CONTEXTS = 24;
const DEFAULT_MAX_PREVIEW_CHARS = 480;
const MAX_TITLE_CHARS = 160;
const MAX_PATH_CHARS = 220;
const SECRET_ASSIGNMENT_PATTERN = /\b(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi;
const AUTHORIZATION_PATTERN = /\bAuthorization:\s*Bearer\s+[^\s,;]+/gi;
const OPENAI_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]+/g;
const WINDOWS_PATH_PATTERN = /\b[A-Za-z]:\\[^\s"']+/g;
const UNIX_PRIVATE_PATH_PATTERN = /(^|\s)\/(?:Users|home|var|tmp|mnt|Volumes)\/[^\s"']+/g;

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function numberOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}

function nowIso(options = {}) {
  return cleanString(options.now) || new Date().toISOString();
}

export function redactAgentKnowledgeContextText(value) {
  const text = cleanString(value);
  if (!text) {
    return "";
  }

  return text
    .replace(AUTHORIZATION_PATTERN, "[redacted]")
    .replace(SECRET_ASSIGNMENT_PATTERN, "[redacted]")
    .replace(OPENAI_KEY_PATTERN, "[redacted]")
    .replace(WINDOWS_PATH_PATTERN, "[redacted-path]")
    .replace(UNIX_PRIVATE_PATH_PATTERN, "$1[redacted-path]");
}

function limitText(value, maxChars) {
  const text = redactAgentKnowledgeContextText(value);
  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}

function normalizeSessionId(input = {}) {
  return cleanString(input.sessionId ?? input.session?.sessionId ?? input.session?.id) || DEFAULT_SESSION_ID;
}

function normalizeContextId(input = {}) {
  const explicit = cleanString(input.contextId ?? input.id);
  if (explicit) {
    return limitText(explicit, 180);
  }

  const documentId = cleanString(input.documentId);
  const chunkId = cleanString(input.chunkId);
  if (documentId || chunkId) {
    return limitText(`${documentId || "document"}:${chunkId || "document"}`, 180);
  }

  return "";
}

function normalizeSourceType(value) {
  const sourceType = cleanString(value).toLowerCase();
  return ["knowledge", "document", "chunk", "search-result"].includes(sourceType) ? sourceType : "knowledge";
}

function normalizeMatchType(value) {
  const matchType = cleanString(value).toLowerCase();
  return ["keyword", "semantic", "hybrid", "attached", "document", "chunk"].includes(matchType)
    ? matchType
    : "attached";
}

function normalizeContext(input = {}, options = {}) {
  const contextId = normalizeContextId(input);
  const title = limitText(input.title ?? input.label ?? input.relativePath ?? input.documentId ?? "Knowledge context", MAX_TITLE_CHARS);
  const preview = limitText(input.preview ?? input.excerpt ?? input.summary, options.maxPreviewChars ?? DEFAULT_MAX_PREVIEW_CHARS);

  if (!contextId && !title && !preview) {
    return null;
  }

  return {
    contextId: contextId || `${normalizeSourceType(input.sourceType)}:${Date.now()}`,
    documentId: limitText(input.documentId, 160),
    chunkId: limitText(input.chunkId, 180),
    title,
    relativePath: limitText(input.relativePath ?? input.path, MAX_PATH_CHARS),
    preview,
    sourceType: normalizeSourceType(input.sourceType ?? input.type ?? input.source),
    score: numberOrZero(input.score),
    matchType: normalizeMatchType(input.matchType),
    updatedAt: limitText(input.updatedAt, 80) || nowIso(options),
  };
}

function normalizeStore(payload = {}) {
  if (Array.isArray(payload.attachedKnowledgeContexts)) {
    return {
      schemaVersion: 1,
      sessions: {
        [DEFAULT_SESSION_ID]: {
          attachedKnowledgeContexts: payload.attachedKnowledgeContexts,
        },
      },
      updatedAt: payload.updatedAt ?? null,
    };
  }

  return {
    schemaVersion: 1,
    sessions: payload.sessions && typeof payload.sessions === "object" ? payload.sessions : {},
    updatedAt: payload.updatedAt ?? null,
  };
}

export function getAgentKnowledgeContextStorePath(options = {}) {
  const userDataDir = cleanString(options.userDataDir) || path.resolve(".");
  return path.join(userDataDir, "sessions", DEFAULT_CONTEXT_FILE);
}

async function readStore(options = {}) {
  const storePath = getAgentKnowledgeContextStorePath(options);
  try {
    const content = await fs.readFile(storePath, "utf8");
    return normalizeStore(JSON.parse(content));
  } catch {
    return normalizeStore();
  }
}

async function writeStore(store = {}, options = {}) {
  const storePath = getAgentKnowledgeContextStorePath(options);
  const payload = normalizeStore(store);

  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

function getSessionContexts(store = {}, sessionId = DEFAULT_SESSION_ID) {
  const session = store.sessions?.[sessionId];
  return Array.isArray(session?.attachedKnowledgeContexts) ? session.attachedKnowledgeContexts : [];
}

function buildResult(sessionId, attachedKnowledgeContexts, status = "ready") {
  return {
    attachedKnowledgeContexts,
    sessionId,
    status,
    total: attachedKnowledgeContexts.length,
  };
}

export async function listAgentKnowledgeContexts(input = {}, options = {}) {
  const sessionId = normalizeSessionId(input);
  const store = await readStore(options);
  const attachedKnowledgeContexts = getSessionContexts(store, sessionId)
    .map((item) => normalizeContext(item, options))
    .filter(Boolean);

  return buildResult(sessionId, attachedKnowledgeContexts);
}

export async function addAgentKnowledgeContext(input = {}, options = {}) {
  const sessionId = normalizeSessionId(input);
  const store = await readStore(options);
  const context = normalizeContext(input.context ?? input, options);
  const maxContexts = Math.max(1, Number.isFinite(options.maxContexts) ? options.maxContexts : DEFAULT_MAX_CONTEXTS);
  const current = getSessionContexts(store, sessionId)
    .map((item) => normalizeContext(item, options))
    .filter(Boolean)
    .filter((item) => item.contextId !== context?.contextId);
  const attachedKnowledgeContexts = context ? [context, ...current].slice(0, maxContexts) : current.slice(0, maxContexts);
  const nextStore = {
    ...store,
    sessions: {
      ...store.sessions,
      [sessionId]: {
        attachedKnowledgeContexts,
      },
    },
    updatedAt: nowIso(options),
  };

  await writeStore(nextStore, options);
  return buildResult(sessionId, attachedKnowledgeContexts, "saved");
}

export async function removeAgentKnowledgeContext(input = {}, options = {}) {
  const sessionId = normalizeSessionId(input);
  const store = await readStore(options);
  const contextId = normalizeContextId(input);
  const attachedKnowledgeContexts = getSessionContexts(store, sessionId)
    .map((item) => normalizeContext(item, options))
    .filter(Boolean)
    .filter((item) => item.contextId !== contextId);
  const nextStore = {
    ...store,
    sessions: {
      ...store.sessions,
      [sessionId]: {
        attachedKnowledgeContexts,
      },
    },
    updatedAt: nowIso(options),
  };

  await writeStore(nextStore, options);
  return buildResult(sessionId, attachedKnowledgeContexts, "removed");
}

export async function clearAgentKnowledgeContexts(input = {}, options = {}) {
  const sessionId = normalizeSessionId(input);
  const store = await readStore(options);
  const nextStore = {
    ...store,
    sessions: {
      ...store.sessions,
      [sessionId]: {
        attachedKnowledgeContexts: [],
      },
    },
    updatedAt: nowIso(options),
  };

  await writeStore(nextStore, options);
  return buildResult(sessionId, [], "cleared");
}
