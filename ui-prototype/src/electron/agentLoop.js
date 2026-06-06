import { buildAgentLlmContext } from "./agentContextBuilder.js";
import {
  executeRegisteredAgentTool,
  getRegisteredAgentTool,
  getToolsForOpenAI,
  redactAgentToolText,
} from "./agentToolRegistry.js";
import { streamLlmTextMessage } from "./llmProviderAdapter.js";

const MAX_TOOL_ROUNDS = 10;
const MAX_TOOL_CALLS_PER_ROUND = 5;
const TOOL_RESULT_MAX_CHARS = 4000;

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function unwrapLlmResult(result) {
  if (result?.ok === false) {
    return { error: result.error, ok: false };
  }

  return {
    data: result?.ok === true ? result.data : result,
    ok: true,
  };
}

function finishReasonFromData(data = {}) {
  return cleanString(data.finishReason ?? data.metadata?.finishReason);
}

function contentFromData(data = {}) {
  return redactAgentToolText(data.content ?? data.text ?? "");
}

function toolCallsFromData(data = {}) {
  if (Array.isArray(data.toolCalls)) {
    return data.toolCalls;
  }
  if (Array.isArray(data.tool_calls)) {
    return data.tool_calls;
  }

  return [];
}

function parseToolArgs(argumentsText) {
  if (argumentsText && typeof argumentsText === "object") {
    return argumentsText;
  }

  try {
    const parsed = JSON.parse(cleanString(argumentsText));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function toolIdFromFunctionName(name) {
  const rawName = cleanString(name);
  const direct = getRegisteredAgentTool(rawName);
  if (direct) {
    return direct.toolId;
  }

  return rawName.replace(/_/g, ".");
}

function sanitizeToolResultForLlm(toolCall = {}) {
  const result = {
    ...(toolCall.summary ? { summary: toolCall.summary } : {}),
    ...(Array.isArray(toolCall.items) ? { items: toolCall.items } : {}),
    ...(toolCall.result ? { result: toolCall.result } : {}),
    state: toolCall.state,
    status: toolCall.status,
    toolId: toolCall.toolId,
  };

  try {
    return redactAgentToolText(JSON.stringify(result)).slice(0, TOOL_RESULT_MAX_CHARS);
  } catch {
    return redactAgentToolText(String(toolCall.summary ?? toolCall.status ?? "Tool finished.")).slice(0, TOOL_RESULT_MAX_CHARS);
  }
}

function buildToolSummary(toolCall = {}) {
  return {
    id: toolCall.id,
    itemCount: toolCall.resultCount ?? 0,
    label: redactAgentToolText(toolCall.label ?? toolCall.title ?? toolCall.toolId),
    status: toolCall.status,
    summary: redactAgentToolText(toolCall.summary ?? toolCall.meta ?? ""),
    toolId: toolCall.toolId,
  };
}

function unsupportedToolsError(error = {}) {
  const text = JSON.stringify(error).toLowerCase();
  return text.includes("tools") || text.includes("tool_choice") || text.includes("function");
}

function approvedSet(policy = {}, key) {
  return new Set((Array.isArray(policy[key]) ? policy[key] : []).map(cleanString).filter(Boolean));
}

function isToolApproved(toolCall = {}, toolDef = {}, policy = {}) {
  if ((toolDef.permissionLevel ?? 1) <= 1) {
    return true;
  }

  return (
    approvedSet(policy, "approvedToolIds").has(toolDef.toolId) ||
    approvedSet(policy, "approvedToolCallIds").has(toolCall.id)
  );
}

function normalizeAllowedToolId(toolId) {
  return cleanString(toolId).replace(/_/g, ".");
}

function getAllowedToolIdSet(agentConfig = {}) {
  const allowed = agentConfig?.allowedTools;

  if (!Array.isArray(allowed) || allowed.length === 0) {
    return null;
  }

  return new Set(allowed.map(normalizeAllowedToolId).filter(Boolean));
}

function getToolsForAgent(agentConfig = {}) {
  const allTools = getToolsForOpenAI();
  const allowed = agentConfig?.allowedTools;

  if (Array.isArray(allowed) && allowed.length > 0) {
    const allowedSet = new Set(allowed.map((id) => cleanString(id).replace(/\./g, "_")).filter(Boolean));
    return allTools.filter((tool) => allowedSet.has(tool.function.name));
  }

  return allTools;
}

export async function runAgentLoop(input = {}, callbacks = {}) {
  const {
    abortSignal,
    agentConfig,
    attachedKnowledgeContexts,
    contextLimits,
    contextPack,
    llmClient = streamLlmTextMessage,
    provider,
    providerMetadata,
    requestId = `agent-loop-${Date.now()}`,
    session,
    sourceSummaries,
    toolPolicy = {},
    userText,
  } = input;
  const context = buildAgentLlmContext(
    {
      agentConfig,
      attachedKnowledgeContexts,
      contextPack,
      providerMetadata,
      session,
      sourceSummaries,
      userText,
    },
    contextLimits,
  );
  const tools = getToolsForAgent(agentConfig);
  const allowedToolIds = getAllowedToolIdSet(agentConfig);
  const messages = [...context.messages];
  const toolCallHistory = [];
  const toolDecisions = [];
  const toolResultsSummary = [];
  let round = 0;
  let totalToolCalls = 0;

  while (round < MAX_TOOL_ROUNDS) {
    round += 1;
    callbacks.onRoundStart?.(round);

    const llmResult = await llmClient(
      {
        messages,
        requestId: `${requestId}-${round}`,
        tool_choice: "auto",
        tools,
        userText,
      },
      {
        abortSignal,
        onEvent: (event) => {
          if (event?.type === "token") {
            callbacks.onToken?.(event.token ?? "", event);
          }
          if (event && callbacks.onLlmEvent) {
            callbacks.onLlmEvent(event);
          }
        },
      },
    );
    const unwrapped = unwrapLlmResult(llmResult);

    if (!unwrapped.ok) {
      return {
        content: "",
        contextSummary: context.contextSummary,
        error: unwrapped.error,
        finishReason: unsupportedToolsError(unwrapped.error) ? "unsupported_tools" : "error",
        rounds: round,
        status: unsupportedToolsError(unwrapped.error) ? "unsupported_tools" : "error",
        toolCallHistory,
        toolDecisions,
        toolResultsSummary,
        totalToolCalls,
      };
    }

    const llmData = unwrapped.data ?? {};
    const content = contentFromData(llmData);
    const finishReason = finishReasonFromData(llmData);
    const toolCalls = toolCallsFromData(llmData);

    if (finishReason !== "tool_calls" || toolCalls.length === 0) {
      return {
        content,
        contextSummary: context.contextSummary,
        finishReason: finishReason || "stop",
        metadata: llmData.metadata,
        rounds: round,
        status: llmData.status === "cancelled" ? "cancelled" : "ready",
        toolCallHistory,
        toolDecisions,
        toolResultsSummary,
        totalToolCalls,
        usage: llmData.usage,
      };
    }

    messages.push({
      content: content || null,
      role: "assistant",
      tool_calls: toolCalls,
    });

    for (const toolCall of toolCalls.slice(0, MAX_TOOL_CALLS_PER_ROUND)) {
      totalToolCalls += 1;
      const toolId = toolIdFromFunctionName(toolCall.function?.name);
      const toolDef = getRegisteredAgentTool(toolId);
      const baseToolInfo = {
        args: toolCall.function?.arguments,
        id: toolCall.id,
        label: toolDef?.label ?? toolId,
        round,
        toolId,
      };

      callbacks.onToolCall?.({ ...baseToolInfo, state: "running" });

      if (allowedToolIds && !allowedToolIds.has(toolId)) {
        const denied = {
          ...baseToolInfo,
          permission: "agent policy / denied",
          state: "denied",
          status: "denied",
          summary: `Tool is not available for this agent: ${toolId}`,
          title: toolDef?.label ?? toolId,
        };
        toolCallHistory.push(denied);
        toolDecisions.push({ id: toolCall.id, state: "denied", status: "denied", toolId });
        messages.push({
          content: JSON.stringify({ error: denied.summary }),
          role: "tool",
          tool_call_id: toolCall.id,
        });
        callbacks.onToolCall?.({ ...baseToolInfo, error: denied.summary, state: "denied" });
        continue;
      }

      if (!toolDef) {
        const denied = {
          ...baseToolInfo,
          permission: "unknown / denied",
          state: "error",
          status: "error",
          summary: `Unknown tool: ${toolId}`,
          title: toolId,
        };
        toolCallHistory.push(denied);
        toolDecisions.push({ id: toolCall.id, state: "error", status: "error", toolId });
        messages.push({
          content: JSON.stringify({ error: denied.summary }),
          role: "tool",
          tool_call_id: toolCall.id,
        });
        callbacks.onToolCall?.({ ...baseToolInfo, error: denied.summary, state: "error" });
        continue;
      }

      if ((toolDef.permissionLevel ?? 1) > 1 && !isToolApproved(toolCall, toolDef, toolPolicy)) {
        const pending = {
          ...baseToolInfo,
          permission: `Level ${toolDef.permissionLevel} / approval required`,
          permissionLevel: toolDef.permissionLevel,
          state: "pending_approval",
          status: "pending_approval",
          summary: "This tool requires explicit approval before it can run.",
          title: toolDef.label,
        };
        toolCallHistory.push(pending);
        toolDecisions.push({ id: toolCall.id, permissionLevel: toolDef.permissionLevel, state: "pending_approval", status: "pending_approval", toolId });
        callbacks.onToolCall?.({
          ...baseToolInfo,
          permissionLevel: toolDef.permissionLevel,
          state: "pending_approval",
        });

        return {
          content: `Approval required before running ${toolDef.label}.`,
          contextSummary: context.contextSummary,
          finishReason: "tool_approval_required",
          rounds: round,
          status: "approval_required",
          toolCallHistory,
          toolDecisions,
          toolResultsSummary,
          totalToolCalls,
        };
      }

      const executed = await executeRegisteredAgentTool(
        {
          args: parseToolArgs(toolCall.function?.arguments),
          id: toolCall.id,
          permissionLevel: toolDef.permissionLevel,
          toolId,
        },
        { provider },
      );
      const executedWithRound = {
        ...executed,
        round,
      };
      toolCallHistory.push(executedWithRound);
      toolDecisions.push({
        id: toolCall.id,
        permissionLevel: executedWithRound.permissionLevel,
        state: executedWithRound.state,
        status: executedWithRound.status,
        toolId: executedWithRound.toolId,
      });
      if (executedWithRound.state === "completed" || executedWithRound.state === "error") {
        toolResultsSummary.push(buildToolSummary(executedWithRound));
      }
      messages.push({
        content: sanitizeToolResultForLlm(executedWithRound),
        role: "tool",
        tool_call_id: toolCall.id,
      });
      callbacks.onToolCall?.({
        ...baseToolInfo,
        error: executedWithRound.state === "error" ? executedWithRound.summary : undefined,
        state: executedWithRound.state,
      });
    }
  }

  return {
    content: "Agent reached maximum tool rounds. Please refine your question.",
    contextSummary: context.contextSummary,
    finishReason: "max_rounds",
    rounds: round,
    status: "ready",
    toolCallHistory,
    toolDecisions,
    toolResultsSummary,
    totalToolCalls,
  };
}
