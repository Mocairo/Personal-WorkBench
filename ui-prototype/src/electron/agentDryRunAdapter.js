import {
  buildAgentContextPack,
  buildAgentDraftMessage,
  buildAgentDryRunResult,
  buildToolPlanPreview,
  redactDryRunText,
} from "../shared/agentDryRunContracts.js";

function toStringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function firstString(...values) {
  return values.map(toStringValue).find(Boolean) ?? "";
}

async function readProvider(provider, method, fallback) {
  if (!provider || typeof provider[method] !== "function") {
    return fallback;
  }

  try {
    return await provider[method]();
  } catch {
    return fallback;
  }
}

function itemTitle(item, fallback = "Context") {
  if (typeof item === "string") {
    return item;
  }

  return firstString(item?.title, item?.name, item?.label, item?.relativePath, fallback);
}

function itemExcerpt(item, fallback = "") {
  if (typeof item === "string") {
    return fallback;
  }

  return firstString(item?.excerpt, item?.preview, item?.summary, item?.message, fallback);
}

function selectAgent(agentManagement = {}, input = {}, agentChat = {}) {
  const agents = Array.isArray(agentManagement.agents) ? agentManagement.agents : [];
  const targetId = firstString(input.agentId, agentChat.session?.activeAgentId);

  return agents.find((agent) => agent.id === targetId || agent.agentId === targetId || agent.name === targetId) ?? agents[0] ?? null;
}

function parseToolText(tools) {
  if (Array.isArray(tools)) {
    return tools;
  }

  return toStringValue(tools)
    .split(",")
    .map((tool) => tool.trim())
    .filter(Boolean)
    .map((name) => ({ name, toolId: name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "") }));
}

function getAgentTools(agent, userText = "") {
  const tools = parseToolText(agent?.toolBindings?.length ? agent.toolBindings : agent?.toolList?.length ? agent.toolList : agent?.tools);
  const text = userText.toLowerCase();
  const inferred = [];

  if (/(search|read|summarize|context|knowledge|docs?)/.test(text)) {
    inferred.push({ name: "Knowledge Search", permissionLevel: 1, toolId: "kb.search" });
  }
  if (/(write|save|note|report|create|update)/.test(text)) {
    inferred.push({ name: "Draft Local Note", permissionLevel: 2, toolId: "notes.write" });
  }
  if (/(shell|command|terminal|exec|run|start|stop|network)/.test(text)) {
    inferred.push({ name: "Shell Command", permissionLevel: 4, toolId: "shell.exec" });
  }

  const merged = [...tools, ...inferred];
  if (merged.length === 0) {
    return [{ name: "Knowledge Search", permissionLevel: 1, toolId: "kb.search" }];
  }

  return merged.slice(0, 6).map((tool) => (typeof tool === "string" ? { name: tool } : tool));
}

function buildContextItems({ agentChat, agentManagement, codeRepository, intelCenter, knowledgeBase, input }) {
  const items = [];
  const pinnedContext = Array.isArray(agentChat?.contextItems) ? agentChat.contextItems : [];

  pinnedContext.slice(0, 2).forEach((item) => {
    items.push({
      excerpt: itemExcerpt(item, "Pinned local session context."),
      relativePath: typeof item === "string" ? item : item?.relativePath,
      sourceType: "session",
      title: itemTitle(item, "Session context"),
    });
  });

  const docs = Array.isArray(knowledgeBase?.knowledgeDocuments) ? knowledgeBase.knowledgeDocuments : [];
  docs.slice(0, 2).forEach((doc) => {
    items.push({
      excerpt: itemExcerpt(doc, "Knowledge Base document preview."),
      relativePath: doc.relativePath,
      sourceType: "kb",
      title: itemTitle(doc, "Knowledge document"),
      updatedAt: doc.updatedAt,
    });
  });

  if (codeRepository?.gitState || codeRepository?.repoFiles || codeRepository?.repoMetrics) {
    const git = codeRepository.gitState ?? {};
    const metrics = codeRepository.repoMetrics ?? {};
    const repoFiles = Array.isArray(codeRepository.repoFiles) ? codeRepository.repoFiles : [];
    items.push({
      excerpt: `branch ${git.branch ?? "unknown"}, ${git.changed ?? 0} changed, ${metrics.fileCount ?? repoFiles.length} files`,
      sourceType: "code",
      title: "Repository",
    });
  }

  const reports = Array.isArray(intelCenter?.intelCards) ? intelCenter.intelCards : [];
  reports.slice(0, 2).forEach((report) => {
    items.push({
      excerpt: itemExcerpt(report, report.priority ? `priority ${report.priority}` : "Intel report summary."),
      relativePath: report.relativePath,
      sourceType: "intel",
      title: itemTitle(report, "Intel report"),
      updatedAt: report.updatedAt,
    });
  });

  const agent = selectAgent(agentManagement, input, agentChat);
  if (agent) {
    items.push({
      excerpt: `tools ${(agent.toolList ?? parseToolText(agent.tools)).slice(0, 4).map((tool) => tool.name ?? tool).join(", ") || "none"}; permission ${agent.permission ?? agent.permissionLevel ?? "ask"}`,
      sourceType: "agent",
      title: agent.name ?? "Selected agent",
    });
  }

  return items;
}

export async function prepareMessageDraft(input = {}) {
  return buildAgentDraftMessage(input);
}

export async function previewContextPack(input = {}, options = {}) {
  const provider = options.provider;
  const [agentChat, agentManagement, codeRepository, intelCenter, knowledgeBase] = await Promise.all([
    readProvider(provider, "getAgentChat", {}),
    readProvider(provider, "getAgentManagement", {}),
    readProvider(provider, "getCodeRepository", {}),
    readProvider(provider, "getIntelCenter", {}),
    readProvider(provider, "getKnowledgeBase", {}),
  ]);
  const draft = await prepareMessageDraft({
    agentId: input.agentId ?? agentChat.session?.activeAgentId,
    sessionId: input.sessionId ?? agentChat.session?.sessionId,
    userText: input.userText,
  });

  return buildAgentContextPack({
    agentId: draft.agentId,
    items: buildContextItems({ agentChat, agentManagement, codeRepository, intelCenter, input, knowledgeBase }),
    maxItems: options.maxItems ?? input.maxItems ?? 8,
    sessionId: draft.sessionId,
  });
}

export async function previewToolPlan(input = {}, options = {}) {
  const provider = options.provider;
  const [agentChat, agentManagement] = await Promise.all([
    readProvider(provider, "getAgentChat", {}),
    readProvider(provider, "getAgentManagement", {}),
  ]);
  const agent = selectAgent(agentManagement, input, agentChat);
  const tools = getAgentTools(agent, redactDryRunText(input.userText));

  return buildToolPlanPreview({ tools });
}

export async function runDryMessage(input = {}, options = {}) {
  const draft = await prepareMessageDraft(input);
  const [contextPack, toolPlan] = await Promise.all([
    previewContextPack(draft, options),
    previewToolPlan(draft, options),
  ]);

  return buildAgentDryRunResult({
    contextPack,
    draft,
    toolPlan,
  });
}
