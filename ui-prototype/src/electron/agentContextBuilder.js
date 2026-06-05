const SECRET_ASSIGNMENT_PATTERN = /\b(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi;
const AUTHORIZATION_PATTERN = /\bAuthorization:\s*Bearer\s+[^\s,;]+/gi;
const OPENAI_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]+/g;
const WINDOWS_PATH_PATTERN = /\b[A-Za-z]:\\[^\s"']+/g;
const UNIX_PRIVATE_PATH_PATTERN = /(^|\s)\/(?:Users|home|var|tmp|mnt|Volumes)\/[^\s"']+/g;

const DEFAULT_LIMITS = {
  maxChars: 6000,
  maxItems: 8,
  maxMessages: 6,
  maxSectionChars: 900,
};

const SAFE_PROVIDER_METADATA_KEYS = new Set(["completionId", "finishReason", "model", "provider", "toolCalls", "usage"]);

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function firstString(...values) {
  return values.map(cleanString).find(Boolean) ?? "";
}

function normalizeLimits(limits = {}) {
  return {
    maxChars: Math.max(120, Number.isFinite(limits.maxChars) ? limits.maxChars : DEFAULT_LIMITS.maxChars),
    maxItems: Math.max(1, Number.isFinite(limits.maxItems) ? limits.maxItems : DEFAULT_LIMITS.maxItems),
    maxMessages: Math.max(0, Number.isFinite(limits.maxMessages) ? limits.maxMessages : DEFAULT_LIMITS.maxMessages),
    maxSectionChars: Math.max(40, Number.isFinite(limits.maxSectionChars) ? limits.maxSectionChars : DEFAULT_LIMITS.maxSectionChars),
  };
}

export function redactContextText(value) {
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
  const text = redactContextText(value);
  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}

function normalizeSourceType(value, fallback = "session") {
  const sourceType = cleanString(value).toLowerCase();
  if (["tool", "session", "knowledge", "code", "intel", "agent"].includes(sourceType)) {
    return sourceType;
  }
  if (["kb", "doc", "docs", "document", "spec"].includes(sourceType)) {
    return "knowledge";
  }
  if (["repo", "repository", "coderepo", "code-repository"].includes(sourceType)) {
    return "code";
  }
  if (["local-intel", "report", "reports", "log"].includes(sourceType)) {
    return "intel";
  }
  return fallback;
}

function normalizeHistoryMessages(session = {}, limits) {
  const messages = Array.isArray(session.chatMessages) ? session.chatMessages : [];

  return messages
    .map((message) => {
      const role = message?.role === "user" ? "user" : message?.role === "assistant" ? "assistant" : "";
      const content = limitText(firstString(message?.text, message?.content, message?.message), limits.maxSectionChars);
      if (!role || !content) {
        return null;
      }

      return {
        content,
        role,
        sourceType: "session",
      };
    })
    .filter(Boolean);
}

function normalizeContextItem(item = {}, index = 0, fallbackSourceType = "session", limits) {
  const raw = typeof item === "string" ? { title: item } : item;
  const sourceType = normalizeSourceType(firstString(raw.sourceType, raw.type, raw.kind, raw.source), fallbackSourceType);
  const title = limitText(firstString(raw.title, raw.label, raw.name, raw.relativePath, raw.path, `${sourceType} ${index + 1}`), 140);
  const summary = limitText(firstString(raw.summary, raw.excerpt, raw.preview, raw.message, raw.detail), limits.maxSectionChars);
  const relativePath = limitText(firstString(raw.relativePath, raw.path), 220);
  const matchType = limitText(firstString(raw.matchType), 80);
  const score = Number.isFinite(raw.score) ? `score ${raw.score}` : "";
  const sourceMeta = [relativePath, matchType, score].filter(Boolean).join("; ");

  if (!title && !summary) {
    return null;
  }

  return {
    id: cleanString(raw.id ?? raw.contextId) || `${sourceType}-${index + 1}`,
    line: `- [${sourceType}] ${title}${sourceMeta ? ` (${sourceMeta})` : ""}${summary ? `: ${summary}` : ""}`,
    sourceType,
    status: limitText(firstString(raw.status, raw.state), 80) || "used",
    summary,
    title,
  };
}

function normalizeToolSummary(summary = {}, index = 0, limits) {
  const toolId = limitText(firstString(summary.toolId, summary.id, `tool-${index + 1}`), 140);
  const label = limitText(firstString(summary.label, summary.title, summary.toolId, `Tool ${index + 1}`), 140);
  const status = limitText(firstString(summary.status, summary.state), 80) || "completed";
  const text = limitText(firstString(summary.summary, summary.meta, summary.message), limits.maxSectionChars);

  if (!toolId && !text) {
    return null;
  }

  return {
    itemCount: Number.isFinite(summary.itemCount) ? summary.itemCount : Number.isFinite(summary.resultCount) ? summary.resultCount : 0,
    line: `- [tool:${toolId}] ${label} (${status})${text ? `: ${text}` : ""}`,
    label,
    sourceType: "tool",
    status,
    summary: text,
    toolId,
  };
}

function agentContextItem(agentConfig = {}, limits) {
  if (!agentConfig || typeof agentConfig !== "object") {
    return null;
  }

  const title = limitText(firstString(agentConfig.name, agentConfig.title, agentConfig.id, "Selected agent"), 140);
  const summary = limitText([
    firstString(agentConfig.description, agentConfig.summary),
    firstString(agentConfig.model, agentConfig.modelName) ? `model ${firstString(agentConfig.model, agentConfig.modelName)}` : "",
    firstString(agentConfig.permission, agentConfig.permissionLevel) ? `permission ${firstString(agentConfig.permission, agentConfig.permissionLevel)}` : "",
  ].filter(Boolean).join("; "), limits.maxSectionChars);

  if (!title && !summary) {
    return null;
  }

  return {
    id: "agent-config",
    line: `- [agent] ${title}${summary ? `: ${summary}` : ""}`,
    sourceType: "agent",
    status: "used",
    summary,
    title,
  };
}

function normalizeContextItems(input = {}, limits) {
  const attachedKnowledgeContexts = Array.isArray(input.attachedKnowledgeContexts) ? input.attachedKnowledgeContexts : [];
  const contextPackItems = Array.isArray(input.contextPack?.items) ? input.contextPack.items : [];
  const sourceSummaries = Array.isArray(input.sourceSummaries) ? input.sourceSummaries : [];
  const items = [
    ...attachedKnowledgeContexts.map((item, index) => normalizeContextItem({
      ...item,
      sourceType: "knowledge",
      status: firstString(item.status, item.state) || "attached",
    }, index, "knowledge", limits)),
    ...contextPackItems.map((item, index) => normalizeContextItem(item, index, "session", limits)),
    ...sourceSummaries.map((item, index) => normalizeContextItem(item, index, "session", limits)),
    agentContextItem(input.agentConfig, limits),
  ];

  return items.filter(Boolean);
}

function metadataValue(value) {
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return redactContextText(value);
  }
  return undefined;
}

function sanitizeProviderMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!SAFE_PROVIDER_METADATA_KEYS.has(key)) {
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

    const sanitizedValue = metadataValue(value);
    if (sanitizedValue !== undefined) {
      sanitized[key] = sanitizedValue;
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

function systemInstruction(input = {}) {
  const agentName = redactContextText(firstString(input.agentConfig?.name, input.agentConfig?.title));

  return [
    `You are the local desktop Agent Chat assistant${agentName ? ` for ${agentName}` : ""}.`,
    "Use only the bounded, redacted context provided in this request.",
    "Do not request, plan, or execute tools; approved tool results are already summarized.",
    "Keep answers grounded in session memory, source summaries, and tool summaries.",
  ].join(" ");
}

function messageChars(messages) {
  return messages.reduce((total, message) => total + cleanString(message.content).length, 0);
}

function selectLines(items, remainingRef, maxItems) {
  const selected = [];

  for (const item of items.slice(0, maxItems)) {
    if (remainingRef.value <= 0) {
      break;
    }

    const line = item.line;
    if (line.length <= remainingRef.value) {
      selected.push(item);
      remainingRef.value -= line.length;
      continue;
    }

    if (remainingRef.value >= 40) {
      selected.push({
        ...item,
        line: limitText(line, remainingRef.value),
      });
      remainingRef.value = 0;
    }
    break;
  }

  return selected;
}

function selectHistory(history, remainingRef, maxMessages) {
  if (maxMessages <= 0) {
    return [];
  }

  const recent = history.slice(-maxMessages);
  const selectedNewestFirst = [];

  for (let index = recent.length - 1; index >= 0; index -= 1) {
    const message = recent[index];
    if (remainingRef.value <= 0 || message.content.length > remainingRef.value) {
      continue;
    }

    selectedNewestFirst.push(message);
    remainingRef.value -= message.content.length;
  }

  return selectedNewestFirst.reverse();
}

function contextMessage(selectedTools, selectedContextItems) {
  const sections = [];
  if (selectedTools.length > 0) {
    sections.push(`Tool Result Summaries:\n${selectedTools.map((item) => item.line).join("\n")}`);
  }
  if (selectedContextItems.length > 0) {
    sections.push(`Context Source Summaries:\n${selectedContextItems.map((item) => item.line).join("\n")}`);
  }

  return sections.join("\n\n");
}

export function buildAgentLlmContext(input = {}, rawLimits = {}) {
  const limits = normalizeLimits(rawLimits);
  const currentUserText = redactContextText(firstString(input.userText, input.text, input.message));
  const systemContent = systemInstruction(input);
  const history = normalizeHistoryMessages(input.session, limits);
  const toolSummaries = (Array.isArray(input.toolResultsSummary) ? input.toolResultsSummary : [])
    .map((summary, index) => normalizeToolSummary(summary, index, limits))
    .filter(Boolean);
  const contextItems = normalizeContextItems(input, limits);
  const fixedMessages = [
    { content: systemContent, role: "system" },
    { content: currentUserText, role: "user" },
  ];
  const remainingRef = {
    value: limits.maxChars - messageChars(fixedMessages),
  };
  const selectedTools = selectLines(toolSummaries, remainingRef, limits.maxItems);
  const selectedContextItems = selectLines(contextItems, remainingRef, limits.maxItems - selectedTools.length);
  const selectedHistory = selectHistory(history, remainingRef, limits.maxMessages);
  const builtContextMessage = contextMessage(selectedTools, selectedContextItems);
  const messages = [
    { content: systemContent, role: "system" },
    ...(builtContextMessage ? [{ content: builtContextMessage, role: "system" }] : []),
    ...selectedHistory.map((message) => ({
      content: message.content,
      role: message.role,
    })),
    { content: currentUserText, role: "user" },
  ];

  return {
    contextSummary: {
      limits,
      providerMetadata: sanitizeProviderMetadata(input.providerMetadata),
      trimmed: {
        contextItems: Math.max(0, contextItems.length - selectedContextItems.length),
        history: Math.max(0, history.length - selectedHistory.length),
        toolResults: Math.max(0, toolSummaries.length - selectedTools.length),
      },
      usedContextItems: selectedContextItems.map((item) => ({
        id: item.id,
        sourceType: item.sourceType,
        status: item.status,
        title: item.title,
      })),
      usedHistoryCount: selectedHistory.length,
      usedToolResults: selectedTools.map((item) => ({
        itemCount: item.itemCount,
        label: item.label,
        sourceType: "tool",
        status: item.status,
        toolId: item.toolId,
      })),
    },
    messages,
  };
}
