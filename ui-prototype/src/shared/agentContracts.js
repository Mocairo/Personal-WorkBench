const SECRET_KEY_PATTERN = /\b(api[_-]?key|token|secret|password)\s*=\s*[^\s,;]+/gi;
const AUTHORIZATION_PATTERN = /\b(Authorization:\s*Bearer\s+)[^\s,;]+/gi;
const OPENAI_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]+/g;
const WINDOWS_PATH_PATTERN = /\b[A-Za-z]:\\[^\s"']+/g;

function toStringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function slug(value, fallback = "agent-item") {
  const text = toStringValue(value).toLowerCase();
  const normalized = text.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  return normalized || fallback;
}

function firstString(...values) {
  return values.map(toStringValue).find(Boolean) ?? "";
}

export function redactAgentText(value) {
  const text = toStringValue(value);
  if (!text) {
    return "";
  }

  return text
    .replace(AUTHORIZATION_PATTERN, "$1[redacted]")
    .replace(SECRET_KEY_PATTERN, (match) => `${match.split("=")[0]}=[redacted]`)
    .replace(OPENAI_KEY_PATTERN, "[redacted]")
    .replace(WINDOWS_PATH_PATTERN, "[redacted-path]");
}

export function buildAgentToolBinding(input = {}) {
  const raw = typeof input === "string" ? { name: input } : input;
  const name = redactAgentText(firstString(raw.name, raw.label, raw.toolId, raw.id));
  const id = firstString(raw.id, raw.toolId, slug(name, "agent-tool"));
  const state = firstString(raw.state, raw.status) || "ready";

  return {
    id,
    name,
    permissionLevel: firstString(raw.permissionLevel, raw.permission, raw.policy) || "ask",
    policy: firstString(raw.policy, raw.defaultPolicy, raw.permissionLevel) || "ask",
    source: firstString(raw.source) || "local",
    state,
    status: state,
    toolId: firstString(raw.toolId, raw.id, id),
  };
}

export function buildAgentPermissionPolicy(input = {}) {
  const raw = Array.isArray(input)
    ? { label: input[0], state: input[1], scope: input[2] }
    : input;
  const state = firstString(raw.state, raw.status, raw.permissionLevel, raw.level) || "ask";

  return {
    id: firstString(raw.id, raw.policyId, slug(raw.label, "agent-policy")),
    label: redactAgentText(firstString(raw.label, raw.name, raw.id)),
    scope: redactAgentText(firstString(raw.scope, raw.detail, raw.description)) || "local agents",
    source: firstString(raw.source) || "local",
    state,
    status: state,
  };
}

export function buildAgentModelProfile(input = {}) {
  const raw = typeof input === "string" ? { model: input } : input;
  const provider = redactAgentText(firstString(raw.provider, raw.vendor));
  const model = redactAgentText(firstString(raw.model, raw.name, raw.id));
  const status = firstString(raw.status, raw.state) || (provider || model ? "configured" : "unconfigured");
  const displayName = provider && model ? `${provider} / ${model}` : provider || model || "not configured";

  return {
    configured: status !== "unconfigured",
    id: firstString(raw.id, raw.modelProfileId, slug(displayName, "agent-model")),
    model,
    provider,
    source: firstString(raw.source) || "local",
    status,
    title: displayName,
  };
}

export function buildAgentRuntimeStatus(input = {}) {
  const state = firstString(input.state, input.status) || "idle";

  return {
    lastRun: redactAgentText(firstString(input.lastRun, input.lastRunAt, input.updatedAt)) || "never",
    message: redactAgentText(firstString(input.message, input.detail)),
    runtime: firstString(input.runtime, input.kind) || "not started",
    source: firstString(input.source) || "local",
    state,
    status: state,
  };
}

function normalizeToolList(tools) {
  if (Array.isArray(tools)) {
    return tools.map(buildAgentToolBinding).filter((tool) => tool.name);
  }

  const toolText = toStringValue(tools);
  if (!toolText) {
    return [];
  }

  return toolText
    .split(",")
    .map((tool) => tool.trim())
    .filter(Boolean)
    .map((name) => buildAgentToolBinding({ name }));
}

function getPermissionLevel(agent, policy) {
  return firstString(
    agent.permission,
    agent.permissionLevel,
    agent.policy,
    policy.commandExecution,
    policy.modelCalls,
    policy.fileRead,
    policy.networkAccess,
  ) || "ask";
}

export function buildAgentProfile(agent = {}) {
  const name = redactAgentText(firstString(agent.name, agent.title, agent.id));
  if (!name) {
    return null;
  }

  const id = firstString(agent.id, agent.agentId, slug(name, "agent"));
  const policy = agent.permissionPolicy && typeof agent.permissionPolicy === "object"
    ? agent.permissionPolicy
    : {};
  const modelProfile = buildAgentModelProfile(agent.modelProfile ?? agent.model ?? agent.modelName);
  const runtimeStatus = buildAgentRuntimeStatus(agent.runtimeStatus ?? agent.runtime ?? {
    lastRun: agent.lastRun,
    state: agent.runtimeState,
  });
  const toolBindings = normalizeToolList(agent.toolBindings ?? agent.tools);
  const toolList = toolBindings.map((tool) => tool.name);
  const state = firstString(agent.state, agent.status, runtimeStatus.state) || "idle";
  const permissionLevel = getPermissionLevel(agent, policy);

  return {
    agentId: id,
    description: redactAgentText(firstString(agent.description, agent.summary)),
    id,
    lastRun: redactAgentText(firstString(agent.lastRun, runtimeStatus.lastRun)),
    model: modelProfile.title,
    modelProfile,
    name,
    permission: permissionLevel,
    permissionLevel,
    permissionPolicy: {
      commandExecution: firstString(policy.commandExecution) || permissionLevel,
      fileRead: firstString(policy.fileRead) || "ask",
      modelCalls: firstString(policy.modelCalls) || permissionLevel,
      networkAccess: firstString(policy.networkAccess) || "ask",
    },
    runtimeState: runtimeStatus.state,
    runtimeStatus,
    source: firstString(agent.source) || "local",
    state,
    status: state,
    toolBindings,
    toolList,
    tools: toolList.length > 0 ? toolList.join(", ") : "none",
    toolsCount: Number.isFinite(agent.toolsCount) ? agent.toolsCount : toolBindings.length,
  };
}

export function buildAgentSession(input = {}) {
  const id = firstString(input.id, input.sessionId) || "local-session";
  const status = firstString(input.status, input.state) || "ready";

  return {
    activeAgentId: firstString(input.activeAgentId, input.agentId),
    id,
    lastUpdated: redactAgentText(firstString(input.lastUpdated, input.updatedAt)),
    messageCount: Number.isFinite(input.messageCount) ? input.messageCount : 0,
    source: firstString(input.source) || "local",
    status,
    summary: redactAgentText(firstString(input.summary, input.description)),
    title: redactAgentText(firstString(input.title, input.name)) || "Local session",
    sessionId: id,
    state: status,
  };
}

export function buildAgentChatMessage(input = {}) {
  const role = input.role === "user" ? "user" : "assistant";
  const text = redactAgentText(firstString(input.text, input.content, input.message));
  if (!text) {
    return null;
  }

  const citations = sanitizeAgentCitations(input.metadata?.citations);

  return {
    content: text,
    id: firstString(input.id, input.messageId),
    ...(citations.length > 0 ? { metadata: { citations } } : {}),
    role,
    source: firstString(input.source) || "local",
    status: firstString(input.status, input.state) || "recorded",
    text,
    time: redactAgentText(firstString(input.time, input.at, input.updatedAt)),
  };
}

function sanitizeAgentCitations(citations = []) {
  return (Array.isArray(citations) ? citations : []).slice(0, 8).map((citation, index) => {
    if (!citation || typeof citation !== "object") {
      return null;
    }

    const title = redactAgentText(firstString(citation.title, citation.label, citation.relativePath));
    const preview = redactAgentText(firstString(citation.preview, citation.excerpt, citation.summary));
    const relativePath = redactAgentText(firstString(citation.relativePath, citation.path));

    if (!title && !preview && !relativePath) {
      return null;
    }

    return {
      ...(firstString(citation.chunkId) ? { chunkId: redactAgentText(citation.chunkId) } : {}),
      ...(firstString(citation.documentId) ? { documentId: redactAgentText(citation.documentId) } : {}),
      ...(firstString(citation.matchType) ? { matchType: redactAgentText(citation.matchType) } : {}),
      ...(preview ? { preview } : {}),
      ...(relativePath ? { relativePath } : {}),
      ...(Number.isFinite(citation.score) ? { score: citation.score } : {}),
      sourceRefId: redactAgentText(firstString(citation.sourceRefId)) || `S${index + 1}`,
      sourceType: redactAgentText(firstString(citation.sourceType, citation.type, citation.source)) || "knowledge",
      title: title || relativePath || `Source ${index + 1}`,
    };
  }).filter(Boolean);
}

export function buildAgentContextItem(input = {}) {
  const raw = typeof input === "string" ? { title: input, relativePath: input } : input;
  const title = redactAgentText(firstString(raw.title, raw.label, raw.name, raw.relativePath, raw.path));
  if (!title) {
    return null;
  }

  return {
    chunks: Number.isFinite(raw.chunks) ? raw.chunks : Number.isFinite(raw.chunkCount) ? raw.chunkCount : undefined,
    id: firstString(raw.id, raw.contextId, slug(title, "agent-context")),
    relativePath: redactAgentText(firstString(raw.relativePath, raw.path)),
    source: firstString(raw.source) || "local",
    status: firstString(raw.status, raw.state) || "linked",
    title,
    tokens: redactAgentText(firstString(raw.tokens, raw.tokenCount)),
    type: firstString(raw.type, raw.kind) || "doc",
    updatedAt: redactAgentText(firstString(raw.updatedAt, raw.time, raw.updated)),
  };
}

export function buildAgentToolCall(input = {}) {
  const title = redactAgentText(firstString(input.title, input.name, input.toolId));
  if (!title) {
    return null;
  }

  const state = firstString(input.state, input.status) || "done";

  return {
    duration: redactAgentText(firstString(input.duration, input.elapsed)) || "recorded",
    id: firstString(input.id, input.toolCallId, slug(title, "agent-tool-call")),
    meta: redactAgentText(firstString(input.meta, input.detail, input.description)) || "local session",
    permission: redactAgentText(firstString(input.permission, input.permissionState, input.policy)) || "read allowed",
    source: firstString(input.source) || "local",
    state,
    status: state,
    title,
    toolCallId: firstString(input.toolCallId, input.id),
    updatedAt: redactAgentText(firstString(input.updatedAt, input.time)),
  };
}
