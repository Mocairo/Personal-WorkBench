const SECRET_ASSIGNMENT_PATTERN = /\b(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi;
const AUTHORIZATION_PATTERN = /\b(Authorization:\s*Bearer\s+)[^\s,;]+/gi;
const OPENAI_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]+/g;
const WINDOWS_PATH_PATTERN = /\b[A-Za-z]:\\[^\s"']+/g;
const UNIX_PATH_PATTERN = /(^|\s)\/(?:Users|home|var|tmp|mnt|Volumes)\/[^\s"']+/g;

function toStringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function firstString(...values) {
  return values.map(toStringValue).find(Boolean) ?? "";
}

function slug(value, fallback = "dry-run") {
  const normalized = toStringValue(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function numberValue(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function limitText(value, maxLength = 360) {
  const text = redactDryRunText(value);
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function normalizeStatus(status, fallback = "ready") {
  const value = toStringValue(status).toLowerCase();
  if (!value) {
    return fallback;
  }
  if (["ready", "blocked", "permission_required", "not_implemented", "error", "mock"].includes(value)) {
    return value;
  }
  if (value === "pending") {
    return "permission_required";
  }
  if (value === "denied") {
    return "blocked";
  }
  return fallback;
}

function normalizePermissionLevel(input = {}) {
  const rawLevel = input.permissionLevel ?? input.level ?? input.permission ?? input.policy;
  if (Number.isFinite(rawLevel)) {
    return rawLevel;
  }

  const text = toStringValue(rawLevel).toLowerCase();
  if (/\d+/.test(text)) {
    return Number(text.match(/\d+/)[0]);
  }
  if (["allow", "allowed", "read", "readonly", "read-only", "ready"].includes(text)) {
    return 1;
  }
  if (["ask", "write", "approval", "requiresapproval"].includes(text)) {
    return 2;
  }
  if (["blocked", "denied", "shell", "network", "command"].includes(text)) {
    return 4;
  }

  const toolText = `${input.toolId ?? ""} ${input.name ?? ""} ${input.title ?? ""}`.toLowerCase();
  if (/(shell|exec|command|terminal|network|browser|start|stop|delete|model|llm)/.test(toolText)) {
    return 4;
  }
  if (/(write|save|create|update|note|report|playlist)/.test(toolText)) {
    return 2;
  }
  return 1;
}

function decisionForLevel(permissionLevel) {
  if (permissionLevel <= 1) {
    return "allowed";
  }
  if (permissionLevel === 2) {
    return "requiresApproval";
  }
  return "denied";
}

function stateForDecision(decision) {
  if (decision === "allowed") {
    return "planned";
  }
  if (decision === "requiresApproval") {
    return "permission_required";
  }
  return "denied";
}

function statusFromCounts(counts) {
  if (counts.requiresApproval > 0) {
    return "permission_required";
  }
  if (counts.denied > 0) {
    return "blocked";
  }
  return "ready";
}

export function redactDryRunText(value) {
  const text = toStringValue(value);
  if (!text) {
    return "";
  }

  return text
    .replace(AUTHORIZATION_PATTERN, "$1[redacted]")
    .replace(SECRET_ASSIGNMENT_PATTERN, "[redacted]")
    .replace(OPENAI_KEY_PATTERN, "[redacted]")
    .replace(WINDOWS_PATH_PATTERN, "[path]")
    .replace(UNIX_PATH_PATTERN, "$1[path]");
}

export function buildAgentDraftMessage(input = {}) {
  const userText = limitText(firstString(input.userText, input.text, input.message), 1200);
  const sessionId = firstString(input.sessionId, input.session?.sessionId, "local-session");
  const agentId = firstString(input.agentId, input.activeAgentId, input.agent?.id, "local-agent");
  const status = normalizeStatus(input.status, userText ? "ready" : "blocked");

  return {
    agentId,
    createdAt: firstString(input.createdAt) || new Date().toISOString(),
    draftId: firstString(input.draftId, input.id, `draft-${slug(sessionId)}-${slug(userText, "message")}`),
    id: firstString(input.id, input.draftId, `draft-${slug(sessionId)}-${slug(userText, "message")}`),
    message: limitText(input.messageText ?? input.message) || (userText ? "Draft ready for dry-run preview." : "Enter a message before dry-run."),
    sessionId,
    source: firstString(input.source) || "local",
    status,
    userText,
  };
}

export function buildContextPackItem(input = {}) {
  const title = limitText(firstString(input.title, input.name, input.label, input.relativePath, "Context item"), 120);
  const sourceType = firstString(input.sourceType, input.type, input.kind, "context");

  return {
    excerpt: limitText(firstString(input.excerpt, input.preview, input.summary, input.message), 240),
    id: firstString(input.id, input.contextId, `context-${slug(sourceType)}-${slug(title)}`),
    relativePath: limitText(firstString(input.relativePath, input.path), 160),
    source: firstString(input.source) || "local",
    sourceType,
    status: normalizeStatus(input.status, "ready"),
    title,
    type: sourceType,
    updatedAt: firstString(input.updatedAt) || null,
  };
}

export function buildAgentContextPack(input = {}) {
  const maxItems = Math.max(1, numberValue(input.maxItems, 8));
  const items = (Array.isArray(input.items) ? input.items : [])
    .map(buildContextPackItem)
    .filter((item) => item.title)
    .slice(0, maxItems);

  return {
    agentId: firstString(input.agentId, "local-agent"),
    contextPackId: firstString(input.contextPackId, input.id, `context-pack-${slug(input.sessionId, "local-session")}`),
    createdAt: firstString(input.createdAt) || new Date().toISOString(),
    id: firstString(input.id, input.contextPackId, `context-pack-${slug(input.sessionId, "local-session")}`),
    items,
    message: items.length > 0 ? "Context pack preview is ready." : "No local context was selected for this dry-run.",
    sessionId: firstString(input.sessionId, "local-session"),
    source: firstString(input.source) || "local",
    status: normalizeStatus(input.status, items.length > 0 ? "ready" : "blocked"),
    totalItems: items.length,
  };
}

export function buildPromptPreview(input = {}) {
  const contextItems = Array.isArray(input.contextItems) ? input.contextItems : [];
  const userText = limitText(firstString(input.userText, input.text), 1200);
  const contextTitles = contextItems
    .map((item) => limitText(firstString(item.title, item.label, item.name), 80))
    .filter(Boolean)
    .slice(0, 8);
  const promptText = limitText([
    "System: local desktop agent dry-run only.",
    contextTitles.length > 0 ? `Context: ${contextTitles.join(", ")}` : "Context: none",
    `User: ${userText}`,
  ].join("\n"), 1400);

  return {
    contextCount: contextTitles.length,
    contextTitles,
    id: firstString(input.id, `prompt-${slug(userText, "preview")}`),
    promptText,
    source: firstString(input.source) || "dry-run",
    status: normalizeStatus(input.status, userText ? "ready" : "blocked"),
    tokenEstimate: Math.max(1, Math.ceil(promptText.length / 4)),
    userText,
  };
}

export function buildToolPlanPreview(input = {}) {
  const tools = Array.isArray(input.tools)
    ? input.tools
    : Array.isArray(input.items)
      ? input.items
      : [];
  const items = tools.map((tool, index) => {
    const permissionLevel = normalizePermissionLevel(tool);
    const decision = firstString(tool.decision) || decisionForLevel(permissionLevel);
    const title = limitText(firstString(tool.title, tool.name, tool.toolId, `Tool ${index + 1}`), 120);
    const toolId = limitText(firstString(tool.toolId, tool.id, slug(title, "tool")), 120);

    return {
      decision,
      id: firstString(tool.id, `tool-plan-${slug(toolId)}`),
      message: limitText(tool.message) || (decision === "allowed"
        ? "Read-only preview allowed."
        : decision === "requiresApproval"
          ? "Approval required before execution."
          : "Denied in this dry-run phase."),
      permissionLevel,
      source: firstString(tool.source) || "local",
      state: firstString(tool.state) || stateForDecision(decision),
      status: firstString(tool.status) || stateForDecision(decision),
      title,
      toolId,
      wouldExecute: false,
    };
  });
  const counts = items.reduce(
    (acc, item) => ({
      allowed: acc.allowed + (item.decision === "allowed" ? 1 : 0),
      denied: acc.denied + (item.decision === "denied" ? 1 : 0),
      requiresApproval: acc.requiresApproval + (item.decision === "requiresApproval" ? 1 : 0),
    }),
    { allowed: 0, denied: 0, requiresApproval: 0 },
  );

  return {
    allowed: counts.allowed,
    denied: counts.denied,
    id: firstString(input.id, "tool-plan-preview"),
    items,
    message: items.length > 0 ? "Tool plan preview generated without execution." : "No tools planned for this dry-run.",
    requiresApproval: counts.requiresApproval,
    source: firstString(input.source) || "local",
    status: normalizeStatus(input.status, statusFromCounts(counts)),
    wouldExecute: false,
  };
}

export function buildPermissionPreview(input = {}) {
  const toolPlan = input.toolPlan?.items ? input.toolPlan : buildToolPlanPreview(input.toolPlan ?? input);
  const items = toolPlan.items ?? [];
  const counts = items.reduce(
    (acc, item) => ({
      allowed: acc.allowed + (item.decision === "allowed" ? 1 : 0),
      denied: acc.denied + (item.decision === "denied" ? 1 : 0),
      requiresApproval: acc.requiresApproval + (item.decision === "requiresApproval" ? 1 : 0),
    }),
    { allowed: 0, denied: 0, requiresApproval: 0 },
  );

  return {
    ...counts,
    id: firstString(input.id, "permission-preview"),
    message: counts.requiresApproval > 0
      ? "Some planned tools need approval."
      : counts.denied > 0
        ? "Some planned tools are denied."
        : "Only read-only dry-run actions are planned.",
    source: firstString(input.source) || "local",
    status: normalizeStatus(input.status, statusFromCounts(counts)),
    wouldExecute: false,
  };
}

export function buildDryRunAssistantResponse(input = {}) {
  const contextItems = Array.isArray(input.contextItems) ? input.contextItems : [];
  const userText = limitText(firstString(input.userText, input.text), 400);
  const contextCount = contextItems.length;
  const text = limitText(firstString(input.text, input.response) || (
    contextCount > 0
      ? `Dry-run preview: I would answer using ${contextCount} local context item(s), without calling a real model.`
      : "Dry-run preview: I would answer from the current local session, without calling a real model."
  ), 480);

  return {
    id: firstString(input.id, `dry-response-${slug(userText, "message")}`),
    message: "Mock assistant response generated locally.",
    role: "assistant",
    source: "dry-run",
    status: normalizeStatus(input.status, "ready"),
    text,
  };
}

export function buildAgentDryRunResult(input = {}) {
  const draft = buildAgentDraftMessage(input.draft ?? input);
  const contextPack = input.contextPack?.items
    ? buildAgentContextPack({
      ...input.contextPack,
      agentId: draft.agentId,
      sessionId: draft.sessionId,
    })
    : buildAgentContextPack({
      agentId: draft.agentId,
      items: input.contextItems ?? [],
      sessionId: draft.sessionId,
    });
  const promptPreview = buildPromptPreview(input.promptPreview ?? {
    contextItems: contextPack.items,
    userText: draft.userText,
  });
  const toolPlan = input.toolPlan?.items
    ? buildToolPlanPreview({ items: input.toolPlan.items })
    : buildToolPlanPreview(input.toolPlan ?? { tools: input.tools ?? [] });
  const permissionPreview = buildPermissionPreview({ toolPlan });
  const mockResponse = buildDryRunAssistantResponse(input.mockResponse ?? {
    contextItems: contextPack.items,
    userText: draft.userText,
  });
  const status = draft.status === "blocked" ? "blocked" : permissionPreview.status;

  return {
    agentId: draft.agentId,
    contextPack,
    createdAt: draft.createdAt,
    draft,
    dryRun: true,
    id: firstString(input.id, `agent-dry-run-${slug(draft.sessionId)}-${slug(draft.userText, "message")}`),
    message: status === "ready" ? "Dry-run message preview is ready." : permissionPreview.message,
    mockResponse,
    permissionPreview,
    promptPreview,
    sessionId: draft.sessionId,
    source: "dry-run",
    status,
    toolPlan,
    userText: draft.userText,
  };
}
