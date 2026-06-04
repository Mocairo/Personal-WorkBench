import {
  getRegisteredAgentTool,
  normalizeAgentToolId,
  redactAgentToolText,
} from "./agentToolRegistry.js";

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePermissionLevel(value, fallback = 1) {
  if (Number.isFinite(value)) {
    return value;
  }

  const match = cleanString(value).match(/\d+/);
  return match ? Number(match[0]) : fallback;
}

function slug(value, fallback = "tool") {
  const normalized = cleanString(value).toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function extractJsonText(text) {
  const raw = cleanString(text);
  if (!raw) {
    return "";
  }

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return raw.slice(start, end + 1);
  }

  return raw;
}

function parseStructuredPlan(text) {
  const jsonText = extractJsonText(text);
  if (!jsonText) {
    return [];
  }

  try {
    const parsed = JSON.parse(jsonText);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (Array.isArray(parsed.toolPlan?.items)) {
      return parsed.toolPlan.items;
    }
    if (Array.isArray(parsed.items)) {
      return parsed.items;
    }
    if (Array.isArray(parsed.tools)) {
      return parsed.tools;
    }
  } catch {
    return [];
  }

  return [];
}

function getDryRunItems(dryRunToolPlan) {
  if (Array.isArray(dryRunToolPlan?.items)) {
    return dryRunToolPlan.items;
  }
  if (Array.isArray(dryRunToolPlan)) {
    return dryRunToolPlan;
  }

  return [];
}

function inferUnsafeItems(text) {
  const items = [];

  if (/(shell|terminal|command|exec|\brun\b|npm|powershell|cmd\.exe)/i.test(text)) {
    items.push({
      args: {},
      label: "Shell Command",
      permissionLevel: 4,
      toolId: "shell.exec",
    });
  }
  if (/(start|stop|launch|runtime|daemon).*(local-intel|intel service)|local-intel.*(start|stop|run|update)/i.test(text)) {
    items.push({
      args: {},
      label: "Local Intel Runtime",
      permissionLevel: 3,
      toolId: "intel.startService",
    });
  }
  if (/(write|save|create|update|delete|commit|push|pull|checkout|reset)/i.test(text)) {
    items.push({
      args: {},
      label: "Write Operation",
      permissionLevel: 2,
      toolId: "notes.write",
    });
  }
  if (/(http|https|browser|crawl|scrape|fetch|network)/i.test(text)) {
    items.push({
      args: {},
      label: "Network Collection",
      permissionLevel: 3,
      toolId: "network.fetch",
    });
  }

  return items;
}

function inferReadOnlyItems(userText) {
  const text = cleanString(userText);
  const lower = text.toLowerCase();
  const items = [];

  if (/(kb|knowledge|docs?|document|search|context)/.test(lower)) {
    items.push({
      args: { query: redactAgentToolText(text) },
      label: "Knowledge Search",
      toolId: "kb.searchLocal",
    });
  }
  if (/(repo|repository|code).*(files?|list)|show repo files|code files/.test(lower)) {
    items.push({
      args: {},
      label: "Repository Files",
      toolId: "codeRepo.listFiles",
    });
  }
  if (/(git|branch|changes?|status|summary)/.test(lower)) {
    items.push({
      args: {},
      label: "Git Summary",
      toolId: "codeRepo.getGitSummary",
    });
  }
  if (/(metrics?|count|module|symbol)/.test(lower)) {
    items.push({
      args: {},
      label: "Repository Metrics",
      toolId: "codeRepo.getMetrics",
    });
  }
  if (/intel.*reports?|reports?.*intel/.test(lower)) {
    items.push({
      args: {},
      label: "Intel Reports",
      toolId: "intel.listReports",
    });
  }
  if (/intel.*logs?|logs?.*intel/.test(lower)) {
    items.push({
      args: {},
      label: "Intel Logs",
      toolId: "intel.listLogs",
    });
  }
  if (/\bagents?\b|agent list/.test(lower)) {
    items.push({
      args: {},
      label: "Agent List",
      toolId: "agent.listAgents",
    });
  }
  if (/\bsessions?\b|chat history/.test(lower)) {
    items.push({
      args: {},
      label: "Agent Sessions",
      toolId: "agent.listSessions",
    });
  }

  return items;
}

function normalizePlanItem(item = {}, index = 0) {
  const normalizedToolId = normalizeAgentToolId(item.toolId ?? item.id);
  const definition = getRegisteredAgentTool(normalizedToolId);
  const fallbackLevel = definition ? definition.permissionLevel : normalizePermissionLevel(item.permissionLevel, 4);
  const permissionLevel = normalizePermissionLevel(item.permissionLevel, fallbackLevel);
  const executable = Boolean(definition) && permissionLevel <= 1;
  const toolId = definition?.toolId ?? normalizedToolId;

  return {
    args: item.args && typeof item.args === "object" ? item.args : {},
    id: cleanString(item.id) || `tool-plan-${slug(toolId)}-${index + 1}`,
    label: redactAgentToolText(item.label ?? item.title ?? item.name ?? definition?.label ?? toolId),
    permissionLevel,
    source: cleanString(item.source) || "planner",
    state: executable ? "planned" : "denied",
    status: executable ? "planned" : "denied",
    title: redactAgentToolText(item.title ?? item.label ?? item.name ?? definition?.label ?? toolId),
    toolId,
  };
}

function dedupePlanItems(items) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const key = `${item.toolId}:${JSON.stringify(item.args ?? {})}:${item.permissionLevel}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }

  return result;
}

export function buildAgentToolPlan(input = {}) {
  const structuredItems = parseStructuredPlan(input.llmText);
  const dryRunItems = getDryRunItems(input.dryRunToolPlan);
  const inferredItems = structuredItems.length > 0 || dryRunItems.length > 0
    ? []
    : [
        ...inferReadOnlyItems(input.userText),
        ...inferUnsafeItems(input.userText),
      ];
  const rawItems = structuredItems.length > 0
    ? structuredItems
    : dryRunItems.length > 0
      ? dryRunItems
      : inferredItems;
  const items = dedupePlanItems(rawItems.map(normalizePlanItem));
  const denied = items.filter((item) => item.state === "denied").length;
  const planned = items.length - denied;

  return {
    denied,
    id: cleanString(input.id) || "agent-tool-plan",
    items,
    planned,
    source: structuredItems.length > 0 ? "llm-structured" : dryRunItems.length > 0 ? "dry-run" : "local-planner",
    status: denied > 0 && planned === 0 ? "denied" : planned > 0 ? "planned" : "empty",
    wouldExecute: false,
  };
}
