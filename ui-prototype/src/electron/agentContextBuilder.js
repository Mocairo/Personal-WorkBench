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
const MAX_SOURCE_REFS = 6;
const MAX_SOURCE_REF_PREVIEW_CHARS = 220;

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
    chunkId: limitText(firstString(raw.chunkId, raw.chunkID), 120),
    documentId: limitText(firstString(raw.documentId, raw.documentID), 120),
    id: cleanString(raw.id ?? raw.contextId) || `${sourceType}-${index + 1}`,
    line: `- [${sourceType}] ${title}${sourceMeta ? ` (${sourceMeta})` : ""}${summary ? `: ${summary}` : ""}`,
    matchType,
    preview: summary,
    relativePath,
    score: Number.isFinite(raw.score) ? raw.score : undefined,
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
    sourceRefs: normalizeSourceRefInputs(summary.sourceRefs, "knowledge"),
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

function normalizeSourceRefInputs(items = [], fallbackSourceType = "knowledge") {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const sourceType = normalizeSourceType(firstString(item.sourceType, item.type, item.source), fallbackSourceType);
      const title = limitText(firstString(item.title, item.label, item.name, item.relativePath, item.path), 140);
      const preview = limitText(firstString(item.preview, item.excerpt, item.summary, item.detail), MAX_SOURCE_REF_PREVIEW_CHARS);
      const relativePath = limitText(firstString(item.relativePath, item.path), 220);

      if (!title && !preview && !relativePath) {
        return null;
      }

      return {
        chunkId: limitText(firstString(item.chunkId, item.chunkID), 120),
        documentId: limitText(firstString(item.documentId, item.documentID, item.id), 120),
        matchType: limitText(firstString(item.matchType), 80),
        preview,
        relativePath,
        score: Number.isFinite(item.score) ? item.score : undefined,
        sourceType,
        title: title || relativePath || `${sourceType} source`,
      };
    })
    .filter(Boolean);
}

function sourceRefFromContextItem(item = {}) {
  if (item.sourceType !== "knowledge") {
    return null;
  }

  return normalizeSourceRefInputs([
    {
      chunkId: item.chunkId,
      documentId: item.documentId || item.id,
      matchType: item.matchType,
      preview: item.preview || item.summary,
      relativePath: item.relativePath,
      score: item.score,
      sourceType: item.sourceType,
      title: item.title,
    },
  ])[0] ?? null;
}

function sourceRefKey(ref = {}) {
  return [ref.documentId, ref.chunkId, ref.relativePath, ref.title].filter(Boolean).join(":");
}

function sourceRefLine(ref = {}) {
  const meta = [
    ref.sourceType,
    ref.relativePath,
    ref.matchType,
    Number.isFinite(ref.score) ? `score ${ref.score}` : "",
  ].filter(Boolean).join("; ");

  return `- [${ref.sourceRefId}] ${ref.title}${meta ? ` (${meta})` : ""}${ref.preview ? `: ${ref.preview}` : ""}`;
}

function selectSourceRefs(selectedTools, selectedContextItems, remainingRef, maxItems) {
  const rawRefs = [
    ...selectedTools.flatMap((item) => normalizeSourceRefInputs(item.sourceRefs, "knowledge")),
    ...selectedContextItems.map(sourceRefFromContextItem).filter(Boolean),
  ];
  const selected = [];
  const seen = new Set();

  for (const rawRef of rawRefs) {
    if (selected.length >= Math.min(MAX_SOURCE_REFS, maxItems) || remainingRef.value <= 0) {
      break;
    }

    const key = sourceRefKey(rawRef);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);

    const ref = {
      ...rawRef,
      sourceRefId: `S${selected.length + 1}`,
    };
    const line = sourceRefLine(ref);
    if (line.length > remainingRef.value) {
      if (remainingRef.value < 80) {
        continue;
      }
      ref.preview = limitText(ref.preview, Math.max(0, remainingRef.value - line.length + ref.preview.length));
    }

    remainingRef.value = Math.max(0, remainingRef.value - sourceRefLine(ref).length);
    selected.push(ref);
  }

  return selected;
}

function systemInstruction(input = {}) {
  const agentName = redactContextText(firstString(input.agentConfig?.name, input.agentConfig?.title));

  return [
    `You are the local desktop Agent Chat assistant${agentName ? ` for ${agentName}` : ""}.`,
    "Use only the bounded, redacted context provided in this request.",
    "Do not request, plan, or execute tools; approved tool results are already summarized.",
    "Keep answers grounded in session memory, source summaries, and tool summaries.",
    "When using Source References, cite them with [S1], [S2] style markers.",
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

function contextMessage(selectedTools, selectedContextItems, selectedSourceRefs = []) {
  const sections = [];
  if (selectedTools.length > 0) {
    sections.push(`Tool Result Summaries:\n${selectedTools.map((item) => item.line).join("\n")}`);
  }
  if (selectedContextItems.length > 0) {
    sections.push(`Context Source Summaries:\n${selectedContextItems.map((item) => item.line).join("\n")}`);
  }
  if (selectedSourceRefs.length > 0) {
    sections.push(`Source References:\n${selectedSourceRefs.map(sourceRefLine).join("\n")}`);
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
  const selectedSourceRefs = selectSourceRefs(selectedTools, selectedContextItems, remainingRef, limits.maxItems);
  const selectedHistory = selectHistory(history, remainingRef, limits.maxMessages);
  const builtContextMessage = contextMessage(selectedTools, selectedContextItems, selectedSourceRefs);
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
      sourceRefs: selectedSourceRefs,
      usedContextItems: selectedContextItems.map((item) => ({
        id: item.id,
        ...(item.sourceType === "knowledge" && selectedSourceRefs.length > 0
          ? {
              sourceRefIds: selectedSourceRefs
                .filter((ref) => (
                  (ref.chunkId && ref.chunkId === item.chunkId) ||
                  (ref.documentId && ref.documentId === item.documentId) ||
                  (ref.relativePath && ref.relativePath === item.relativePath)
                ))
                .map((ref) => ref.sourceRefId),
            }
          : {}),
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
