import { buildAgentToolPlan } from "./agentToolPlanner.js";
import {
  executeRegisteredAgentTool,
  getRegisteredAgentTool,
  redactAgentToolText,
} from "./agentToolRegistry.js";

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function approvedSet(policy = {}, key) {
  return new Set(asArray(policy[key]).map(cleanString).filter(Boolean));
}

function isApproved(tool, policy = {}) {
  if (policy.approveAllLevel1 || policy.autoAllowLevel1ReadOnly) {
    return true;
  }

  const approvedToolIds = approvedSet(policy, "approvedToolIds");
  const approvedCallIds = approvedSet(policy, "approvedToolCallIds");

  return approvedToolIds.has(tool.toolId) || approvedCallIds.has(tool.id);
}

function pendingToolCall(tool) {
  return {
    duration: "queued",
    id: tool.id,
    label: tool.label,
    meta: "Approval required before running this read-only tool.",
    permission: "Level 1 / pending",
    permissionLevel: 1,
    source: "tool-orchestrator",
    state: "pending",
    status: "pending",
    summary: "Pending approval.",
    title: tool.label || tool.toolId,
    toolId: tool.toolId,
  };
}

function deniedToolCall(tool, message = "Tool execution is denied in this phase.") {
  return {
    duration: "0ms",
    id: tool.id,
    label: tool.label || tool.toolId,
    meta: message,
    permission: `Level ${tool.permissionLevel ?? 4} / denied`,
    permissionLevel: tool.permissionLevel ?? 4,
    source: "tool-orchestrator",
    state: "denied",
    status: "denied",
    summary: message,
    title: tool.label || tool.toolId,
    toolId: tool.toolId,
  };
}

function buildToolSummary(toolCall) {
  return {
    id: toolCall.id,
    itemCount: toolCall.resultCount ?? 0,
    label: redactAgentToolText(toolCall.label ?? toolCall.title),
    status: toolCall.status,
    summary: redactAgentToolText(toolCall.summary ?? toolCall.meta),
    toolId: toolCall.toolId,
  };
}

function buildToolContextItem(summary) {
  return {
    excerpt: summary.summary,
    id: `context-tool-${summary.toolId}`,
    source: "tool",
    sourceType: "tool",
    status: summary.status,
    title: `Tool: ${summary.label}`,
    tokens: "summary",
    type: "tool",
    updatedAt: "tool-result",
  };
}

function buildPolicyDecision(tool, state) {
  return {
    id: tool.id,
    permissionLevel: tool.permissionLevel,
    state,
    status: state,
    toolId: tool.toolId,
  };
}

function planFromInput(input = {}) {
  if (Array.isArray(input.toolPlan?.items)) {
    return buildAgentToolPlan({
      dryRunToolPlan: input.toolPlan,
      userText: input.draft?.userText,
    });
  }

  return buildAgentToolPlan({
    dryRunToolPlan: input.dryRunToolPlan,
    llmText: input.llmText,
    userText: input.draft?.userText,
  });
}

export async function runAgentToolLoop(input = {}) {
  const provider = input.provider;
  const contextPack = {
    ...(input.contextPack ?? {}),
    items: asArray(input.contextPack?.items),
  };
  const toolPolicy = input.toolPolicy ?? {};
  const toolPlan = planFromInput(input);
  const toolCalls = [];
  const toolDecisions = [];
  const toolResultsSummary = [];

  if (toolPlan.items.length === 0) {
    return {
      contextPack,
      shouldCallLlm: true,
      status: "ready",
      toolCalls,
      toolDecisions,
      toolPlan,
      toolResultsSummary,
    };
  }

  for (const tool of toolPlan.items) {
    const definition = getRegisteredAgentTool(tool.toolId);
    const isLevel1 = definition?.permissionLevel === 1 && tool.permissionLevel <= 1;

    if (!isLevel1 || tool.state === "denied") {
      const denied = deniedToolCall(tool, "Only Level 1 read-only tools are allowed.");
      toolCalls.push(denied);
      toolDecisions.push(buildPolicyDecision(tool, "denied"));
      continue;
    }

    if (!isApproved(tool, toolPolicy)) {
      toolCalls.push(pendingToolCall(tool));
      toolDecisions.push(buildPolicyDecision(tool, "pending"));
      continue;
    }

    const result = await executeRegisteredAgentTool(tool, { provider });
    toolCalls.push(result);
    toolDecisions.push(buildPolicyDecision(tool, result.state));
    if (result.state === "completed" || result.state === "error") {
      toolResultsSummary.push(buildToolSummary(result));
    }
  }

  const completedSummaries = toolResultsSummary.filter((summary) => summary.status === "completed");
  const hasPending = toolCalls.some((tool) => tool.state === "pending");
  const hasError = toolCalls.some((tool) => tool.state === "error");
  const augmentedContextPack = {
    ...contextPack,
    items: [
      ...contextPack.items,
      ...completedSummaries.map(buildToolContextItem),
    ],
  };

  return {
    contextPack: augmentedContextPack,
    shouldCallLlm: completedSummaries.length > 0 && !hasError,
    status: hasError
      ? "tool_error"
      : completedSummaries.length > 0
        ? "ready"
        : hasPending
          ? "approval_required"
          : "denied",
    toolCalls,
    toolDecisions,
    toolPlan,
    toolResultsSummary,
  };
}
