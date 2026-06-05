import React, { useEffect, useState } from "react";
import {
  Check,
  Database,
  FileText,
  Mic2,
  Paperclip,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  TerminalSquare,
  Trash2,
  WandSparkles,
  Wrench,
  X,
} from "lucide-react";
import { EmptyState } from "../components/ui/EmptyState";
import { GlassPanel } from "../components/ui/GlassPanel";
import { PageFrame } from "../components/ui/PageFrame";
import { PanelHeader } from "../components/ui/PanelHeader";
import { useAgentChatData } from "../hooks/usePageData";
import { dataProvider } from "../services/dataProvider";

const contextMeta = [
  { active: true, chunks: 18, tokens: "6.2k", type: "doc", updated: "2m" },
  { active: false, chunks: 7, tokens: "2.1k", type: "spec", updated: "9m" },
  { active: false, chunks: 12, tokens: "4.8k", type: "code", updated: "14m" },
  { active: false, chunks: 5, tokens: "1.6k", type: "note", updated: "21m" },
];

const toolMeta = [
  { duration: "320ms", permission: "read allowed" },
  { duration: "1.2s", permission: "read allowed" },
  { duration: "running", permission: "write ask" },
  { duration: "queued", permission: "network blocked" },
];

const DISPLAY_SECRET_ASSIGNMENT_PATTERN = /\b(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi;
const DISPLAY_AUTHORIZATION_PATTERN = /\bAuthorization:\s*Bearer\s+[^\s,;]+/gi;
const DISPLAY_OPENAI_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]+/g;
const DISPLAY_WINDOWS_PATH_PATTERN = /\b[A-Za-z]:\\[^\s"']+/g;

function redactDisplayText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(DISPLAY_AUTHORIZATION_PATTERN, "[redacted]")
    .replace(DISPLAY_SECRET_ASSIGNMENT_PATTERN, "[redacted]")
    .replace(DISPLAY_OPENAI_KEY_PATTERN, "[redacted]")
    .replace(DISPLAY_WINDOWS_PATH_PATTERN, "[redacted-path]");
}

function getContextTitle(item) {
  if (typeof item === "string") {
    return redactDisplayText(item);
  }

  return redactDisplayText(item?.title ?? item?.label ?? item?.relativePath ?? item?.path ?? "Local context");
}

function getContextSummaryRows(contextSummary = null) {
  if (!contextSummary || typeof contextSummary !== "object") {
    return [];
  }

  const rows = [];
  if (contextSummary.usedHistoryCount > 0) {
    rows.push({
      active: true,
      chunks: contextSummary.usedHistoryCount,
      title: "Session memory",
      tokens: "history",
      type: "session",
      updated: "current run",
    });
  }

  if (Array.isArray(contextSummary.usedContextItems)) {
    contextSummary.usedContextItems.forEach((item) => {
      rows.push({
        active: true,
        chunks: 1,
        title: redactDisplayText(item.title ?? item.label ?? item.sourceType ?? "Context source"),
        tokens: redactDisplayText(item.status ?? "used"),
        type: redactDisplayText(item.sourceType ?? item.type ?? "context"),
        updated: "context",
      });
    });
  }

  if (Array.isArray(contextSummary.usedToolResults)) {
    contextSummary.usedToolResults.forEach((item) => {
      rows.push({
        active: true,
        chunks: item.itemCount ?? 1,
        title: redactDisplayText(item.label ?? item.toolId ?? "Tool result"),
        tokens: redactDisplayText(item.status ?? "completed"),
        type: "tool",
        updated: "tool",
      });
    });
  }

  const trimmed = contextSummary.trimmed && typeof contextSummary.trimmed === "object"
    ? contextSummary.trimmed
    : {};
  const trimmedCount = (trimmed.history ?? 0) + (trimmed.contextItems ?? 0) + (trimmed.toolResults ?? 0);
  if (trimmedCount > 0) {
    rows.push({
      active: false,
      chunks: trimmedCount,
      title: "Budget trimmed",
      tokens: `${trimmed.history ?? 0}/${trimmed.contextItems ?? 0}/${trimmed.toolResults ?? 0}`,
      type: "audit",
      updated: "budget",
    });
  }

  return rows;
}

function getAttachedContextRows(attachedKnowledgeContexts = []) {
  return (Array.isArray(attachedKnowledgeContexts) ? attachedKnowledgeContexts : []).map((item) => ({
    active: true,
    attached: true,
    chunks: 1,
    contextId: redactDisplayText(item.contextId ?? item.id),
    title: redactDisplayText(item.title ?? item.relativePath ?? "Attached knowledge"),
    tokens: `${redactDisplayText(item.matchType ?? "attached")} / ${Number.isFinite(item.score) ? item.score : 1}`,
    type: redactDisplayText(item.sourceType ?? "knowledge"),
    updated: redactDisplayText(item.relativePath ?? item.updatedAt ?? "attached"),
  }));
}

export function getContextRows(contextItems = [], contextSummary = null, attachedKnowledgeContexts = []) {
  const rows = contextItems.map((item, index) => {
    const fallback = contextMeta[index % contextMeta.length];
    const title = getContextTitle(item);

    if (typeof item === "string") {
      return {
        title,
        ...fallback,
      };
    }

    return {
      ...fallback,
      active: item.active ?? fallback.active,
      chunks: item.chunks ?? item.chunkCount ?? fallback.chunks,
      title,
      tokens: item.tokens ?? item.tokenCount ?? fallback.tokens,
      type: item.type ?? item.kind ?? fallback.type,
      updated: item.updated ?? item.updatedAt ?? item.time ?? fallback.updated,
    };
  });

  return [
    ...getAttachedContextRows(attachedKnowledgeContexts),
    ...rows,
    ...getContextSummaryRows(contextSummary),
  ];
}

export function mergeAttachedKnowledgeContextResultIntoChatData(data = {}, result = {}) {
  const attachedKnowledgeContexts = Array.isArray(result.attachedKnowledgeContexts)
    ? result.attachedKnowledgeContexts
    : [];

  return {
    ...data,
    attachedKnowledgeContextCount: Number.isFinite(result.total) ? result.total : attachedKnowledgeContexts.length,
    attachedKnowledgeContexts,
  };
}

export function getTimelineRows(toolCalls = []) {
  return toolCalls.map((tool, index) => {
    const fallback = toolMeta[index % toolMeta.length];

    return {
      ...fallback,
      ...tool,
      duration: tool.duration ?? tool.elapsed ?? fallback.duration,
      permission: tool.permission ?? tool.permissionState ?? fallback.permission,
      title: tool.title ?? tool.name ?? "Recorded tool call",
    };
  });
}

export function getToolApprovalState(toolCalls = []) {
  const pendingLevel1ToolIds = toolCalls
    .filter((tool) => (
      (tool.state === "pending" || tool.status === "pending") &&
      (tool.permissionLevel ?? 1) <= 1 &&
      tool.toolId
    ))
    .map((tool) => tool.toolId);

  return {
    canApproveAllLevel1: pendingLevel1ToolIds.length > 0,
    hasPendingLevel1: pendingLevel1ToolIds.length > 0,
    pendingLevel1ToolIds,
  };
}

export function getChatStatusSummary(data = {}) {
  const provider = data.llmProviderStatus ?? {};
  const permission = data.permissionSummary ?? {};
  const providerStatus = provider.status || "unconfigured";
  const hasSecret = Boolean(provider.hasSecret ?? provider.configured);

  return {
    modelLabel: provider.model || "not configured",
    permissionLabel: permission.requiresApproval ? "permission pending" : permission.status || "local only",
    providerLabel: provider.label || provider.provider || "LLM provider",
    providerStatus,
    sendEnabled: providerStatus === "ready" && hasSecret,
  };
}

export function getComposerSendState(value = "", canSendReal = false) {
  const hasText = typeof value === "string" && value.trim().length > 0;

  return {
    dryRunEnabled: hasText,
    realSendEnabled: hasText && canSendReal,
  };
}

export function mergeDryRunResultIntoChatData(data = {}, result = {}) {
  const draft = result.draft ?? {};
  const mockResponse = result.mockResponse ?? {};
  const contextPackItems = Array.isArray(result.contextPack?.items) ? result.contextPack.items : [];
  const toolPlanItems = Array.isArray(result.toolPlan?.items) ? result.toolPlan.items : [];
  const userText = draft.userText || result.userText;
  const assistantText = mockResponse.text || mockResponse.content;
  const stateForTool = (tool) => {
    if (tool.state || tool.status) {
      return tool.state || tool.status;
    }
    if (tool.decision === "requiresApproval") {
      return "permission_required";
    }
    if (tool.decision === "denied") {
      return "denied";
    }
    return "planned";
  };

  return {
    ...data,
    chatMessages: [
      ...(Array.isArray(data.chatMessages) ? data.chatMessages : []),
      ...(userText
        ? [{
          id: draft.id || draft.draftId || `dry-run-user-${Date.now()}`,
          role: "user",
          source: "dry-run",
          status: "draft",
          text: userText,
        }]
        : []),
      ...(assistantText
        ? [{
          id: mockResponse.id || `dry-run-agent-${Date.now()}`,
          role: "assistant",
          source: "dry-run",
          status: mockResponse.status || "ready",
          text: assistantText,
        }]
        : []),
    ],
    contextItems: contextPackItems.length > 0
      ? contextPackItems.map((item) => ({
        active: true,
        chunks: item.chunks ?? item.chunkCount ?? 1,
        source: item.source,
        title: item.title,
        tokens: item.tokens ?? "preview",
        type: item.type ?? item.sourceType ?? "context",
        updatedAt: item.updatedAt ?? "dry-run",
      }))
      : data.contextItems,
    dryRunResult: result,
    toolCalls: toolPlanItems.length > 0
      ? toolPlanItems.map((tool) => ({
        duration: "dry-run",
        meta: tool.message || "planned only",
        permission: `Level ${tool.permissionLevel} / ${tool.decision}`,
        source: "dry-run",
        state: stateForTool(tool),
        title: tool.title || tool.toolId,
      }))
      : data.toolCalls,
  };
}

function noToolsExecutedStep(source = "llm") {
  return {
    duration: "0ms",
    meta: "text-only reply",
    permission: "none",
    source,
    state: "done",
    title: "No tools executed",
  };
}

export function mergeTextSendResultIntoChatData(data = {}, result = {}) {
  const userMessage = result.userMessage;
  const assistantMessage = result.assistantMessage;
  const contextPackItems = Array.isArray(result.contextPack?.items) ? result.contextPack.items : [];
  const toolCalls = Array.isArray(result.toolCalls) && result.toolCalls.length > 0
    ? result.toolCalls
    : [noToolsExecutedStep(assistantMessage?.source ?? "llm")];

  return {
    ...data,
    chatMessages: [
      ...(Array.isArray(data.chatMessages) ? data.chatMessages : []),
      ...(userMessage
        ? [{
          id: userMessage.id || `llm-user-${Date.now()}`,
          role: "user",
          source: userMessage.source || "local",
          status: userMessage.status || "sent",
          text: userMessage.text,
        }]
        : []),
      ...(assistantMessage
        ? [{
          id: assistantMessage.id || `llm-agent-${Date.now()}`,
          metadata: assistantMessage.metadata,
          role: "assistant",
          source: assistantMessage.source || "llm",
          status: assistantMessage.status || "ready",
          text: assistantMessage.text,
        }]
        : []),
    ],
    contextItems: contextPackItems.length > 0
      ? contextPackItems.map((item) => ({
        active: true,
        chunks: item.chunks ?? item.chunkCount ?? 1,
        source: item.source,
        title: item.title,
        tokens: item.tokens ?? "preview",
        type: item.type ?? item.sourceType ?? "context",
        updatedAt: item.updatedAt ?? "llm",
      }))
      : data.contextItems,
    sendError: null,
    sendResult: result,
    toolCalls,
  };
}

export function mergeSendErrorIntoChatData(data = {}, error = {}) {
  return {
    ...data,
    sendError: {
      code: error.code || "LLM_REQUEST_FAILED",
      message: error.message || "LLM request failed.",
    },
    toolCalls: [noToolsExecutedStep("llm")],
  };
}

export function mergeStreamStartIntoChatData(data = {}, input = {}) {
  const requestId = input.requestId || `stream-${Date.now()}`;
  const userMessage = input.userMessage ?? {};

  return {
    ...data,
    activeRequestId: requestId,
    chatMessages: [
      ...(Array.isArray(data.chatMessages) ? data.chatMessages : []),
      {
        id: userMessage.id || `user-${requestId}`,
        role: "user",
        source: userMessage.source || "local",
        status: userMessage.status || "sent",
        text: userMessage.text || userMessage.userText || "",
      },
      {
        id: `assistant-${requestId}`,
        metadata: null,
        role: "assistant",
        source: "llm",
        status: "generating",
        text: "",
      },
    ],
    generating: true,
    sendError: null,
    toolCalls: [noToolsExecutedStep("llm")],
  };
}

function updateStreamAssistantMessage(message, event = {}) {
  const type = event.type;
  const status = type === "done"
    ? "ready"
    : type === "cancelled"
      ? "cancelled"
      : type === "error"
        ? "error"
        : "generating";

  return {
    ...message,
    ...(event.metadata ? { metadata: event.metadata } : {}),
    status,
    text: event.text ?? message.text,
  };
}

export function mergeStreamEventIntoChatData(data = {}, event = {}) {
  const requestId = event.requestId || data.activeRequestId;
  const assistantId = `assistant-${requestId}`;
  const isTerminal = ["done", "cancelled", "error"].includes(event.type);
  const chatMessages = (Array.isArray(data.chatMessages) ? data.chatMessages : []).map((message) => (
    message.id === assistantId ? updateStreamAssistantMessage(message, event) : message
  ));

  return {
    ...data,
    activeRequestId: isTerminal ? null : requestId,
    chatMessages,
    generating: isTerminal ? false : true,
    sendError: event.type === "error"
      ? {
          code: event.error?.code || "LLM_REQUEST_FAILED",
          message: event.error?.message || "LLM request failed.",
        }
      : data.sendError ?? null,
    toolCalls: [noToolsExecutedStep("llm")],
  };
}

export function mergeStreamResultIntoChatData(data = {}, result = {}) {
  const requestId = result.requestId || data.activeRequestId;
  const assistantId = `assistant-${requestId}`;
  const assistantMessage = result.assistantMessage;
  const contextPackItems = Array.isArray(result.contextPack?.items) ? result.contextPack.items : [];
  const toolCalls = Array.isArray(result.toolCalls) && result.toolCalls.length > 0
    ? result.toolCalls
    : [noToolsExecutedStep(assistantMessage?.source ?? "llm")];
  let updatedExistingAssistant = false;

  const chatMessages = (Array.isArray(data.chatMessages) ? data.chatMessages : []).map((message) => {
    if (message.id !== assistantId || !assistantMessage) {
      return message;
    }

    updatedExistingAssistant = true;
    return {
      ...message,
      metadata: assistantMessage.metadata ?? message.metadata,
      source: assistantMessage.source || message.source || "llm",
      status: assistantMessage.status || result.status || "ready",
      text: assistantMessage.text ?? message.text,
    };
  });

  return {
    ...data,
    activeRequestId: null,
    chatMessages: updatedExistingAssistant || !assistantMessage
      ? chatMessages
      : [
          ...chatMessages,
          {
            id: assistantMessage.id || assistantId,
            metadata: assistantMessage.metadata,
            role: "assistant",
            source: assistantMessage.source || "llm",
            status: assistantMessage.status || result.status || "ready",
            text: assistantMessage.text,
          },
        ],
    contextItems: contextPackItems.length > 0
      ? contextPackItems.map((item) => ({
        active: true,
        chunks: item.chunks ?? item.chunkCount ?? 1,
        source: item.source,
        title: item.title,
        tokens: item.tokens ?? "preview",
        type: item.type ?? item.sourceType ?? "context",
        updatedAt: item.updatedAt ?? "llm",
      }))
      : data.contextItems,
    generating: false,
    sendError: null,
    sendResult: result,
    toolCalls,
  };
}

export function AgentChat() {
  const { data } = useAgentChatData();
  const [composerText, setComposerText] = useState("");
  const [dryRunData, setDryRunData] = useState(null);
  const [dryRunStatus, setDryRunStatus] = useState("dry-run ready");
  const [dryRunBusy, setDryRunBusy] = useState(false);
  const [activeRequestId, setActiveRequestId] = useState(null);
  const [autoAllowLevel1ReadOnly, setAutoAllowLevel1ReadOnly] = useState(false);
  const displayData = dryRunData ?? data;
  const { attachedKnowledgeContexts = [], chatMessages, contextItems, toolCalls } = displayData;
  const chatStatus = getChatStatusSummary(displayData);
  const composerState = getComposerSendState(composerText, chatStatus.sendEnabled);
  const contextSummary = displayData.sendResult?.contextSummary ?? displayData.contextSummary;
  const contextRows = getContextRows(contextItems, contextSummary, attachedKnowledgeContexts);
  const timelineRows = getTimelineRows(toolCalls);
  const toolApprovalState = getToolApprovalState(timelineRows);

  useEffect(() => {
    setDryRunData(null);
  }, [data]);

  const sendMessage = async (event) => {
    event.preventDefault();

    if (dryRunBusy && activeRequestId) {
      try {
        await dataProvider.cancelAgentChatStream({ requestId: activeRequestId });
        setDryRunData((current) => mergeStreamEventIntoChatData(current ?? displayData, {
          requestId: activeRequestId,
          status: "cancelled",
          type: "cancelled",
        }));
        setDryRunStatus("generation cancelled");
      } catch (error) {
        setDryRunData((current) => mergeSendErrorIntoChatData(current ?? displayData, error));
        setDryRunStatus(error?.message ?? "cancel unavailable");
      } finally {
        setDryRunBusy(false);
        setActiveRequestId(null);
      }
      return;
    }

    if (!composerState.dryRunEnabled || dryRunBusy) {
      return;
    }

    setDryRunBusy(true);
    setDryRunStatus(composerState.realSendEnabled ? "generating" : "preparing dry-run");

    try {
      const requestId = `chat-stream-${Date.now()}`;
      const input = {
        agentId: displayData.session?.activeAgentId,
        requestId,
        sessionId: displayData.session?.sessionId,
        toolPolicy: {
          autoAllowLevel1ReadOnly,
        },
        userText: composerText,
      };

      if (composerState.realSendEnabled) {
        setActiveRequestId(requestId);
        setDryRunData((current) => mergeStreamStartIntoChatData(current ?? displayData, {
          requestId,
          userMessage: {
            id: `user-${requestId}`,
            role: "user",
            text: composerText,
          },
        }));
        const result = await dataProvider.streamAgentChatMessage(input, {
          onEvent: (streamEvent) => {
            setDryRunData((current) => mergeStreamEventIntoChatData(current ?? displayData, streamEvent));
          },
        });
        setDryRunData((current) => mergeStreamResultIntoChatData(current ?? displayData, result));
        setDryRunStatus(
          result.status === "cancelled"
            ? "generation cancelled"
            : result.status === "approval_required"
              ? "permission preview"
              : "stream reply ready",
        );
      } else {
        const result = await dataProvider.runAgentChatDryMessage(input);
        setDryRunData((current) => mergeDryRunResultIntoChatData(current ?? displayData, result));
        setDryRunStatus(result.status === "permission_required" ? "permission preview" : "dry-run preview");
      }

      setComposerText("");
    } catch (error) {
      setDryRunData((current) => mergeSendErrorIntoChatData(current ?? displayData, error));
      setDryRunStatus(error?.message ?? "message unavailable");
    } finally {
      setDryRunBusy(false);
      setActiveRequestId(null);
    }
  };

  const approvePendingTools = async (approval = {}) => {
    const pendingResult = displayData.sendResult ?? displayData;
    const pendingUserText = pendingResult.userMessage?.text
      ?? [...(displayData.chatMessages ?? [])].reverse().find((message) => message.role === "user")?.text;

    if (!pendingUserText || dryRunBusy) {
      return;
    }

    const requestId = `chat-stream-${Date.now()}`;
    const input = {
      agentId: displayData.session?.activeAgentId,
      requestId,
      sessionId: displayData.session?.sessionId,
      toolPlan: pendingResult.toolPlan,
      toolPolicy: {
        autoAllowLevel1ReadOnly,
        ...approval,
      },
      userText: pendingUserText,
    };

    setDryRunBusy(true);
    setActiveRequestId(requestId);
    setDryRunStatus("running read-only tools");

    try {
      const result = await dataProvider.streamAgentChatMessage(input, {
        onEvent: (streamEvent) => {
          setDryRunData((current) => mergeStreamEventIntoChatData(current ?? displayData, streamEvent));
        },
      });
      setDryRunData((current) => mergeStreamResultIntoChatData(current ?? displayData, result));
      setDryRunStatus(
        result.status === "approval_required"
          ? "permission preview"
          : result.status === "error"
            ? "tool error"
            : "tool reply ready",
      );
    } catch (error) {
      setDryRunData((current) => mergeSendErrorIntoChatData(current ?? displayData, error));
      setDryRunStatus(error?.message ?? "tool approval unavailable");
    } finally {
      setDryRunBusy(false);
      setActiveRequestId(null);
    }
  };

  const removeAttachedContext = async (context) => {
    try {
      const result = await dataProvider.removeKnowledgeContextFromAgentChat({
        contextId: context.contextId,
        sessionId: displayData.session?.sessionId,
      });
      setDryRunData((current) => mergeAttachedKnowledgeContextResultIntoChatData(current ?? displayData, result));
      setDryRunStatus("context removed");
    } catch (error) {
      setDryRunData((current) => mergeSendErrorIntoChatData(current ?? displayData, error));
      setDryRunStatus(error?.message ?? "remove unavailable");
    }
  };

  const clearAttachedContexts = async () => {
    try {
      const result = await dataProvider.clearAgentChatKnowledgeContexts({
        sessionId: displayData.session?.sessionId,
      });
      setDryRunData((current) => mergeAttachedKnowledgeContextResultIntoChatData(current ?? displayData, result));
      setDryRunStatus("contexts cleared");
    } catch (error) {
      setDryRunData((current) => mergeSendErrorIntoChatData(current ?? displayData, error));
      setDryRunStatus(error?.message ?? "clear unavailable");
    }
  };

  return (
    <PageFrame
      eyebrow="Agent Runtime"
      title="Agent Chat"
      subtitle="Local agent workspace"
      actions={
        <>
          <span className="settings-save-state">
            {chatStatus.providerLabel}: {chatStatus.providerStatus}
          </span>
          <span className="settings-save-state">
            {contextSummary ? "memory/context used" : "memory local"}
          </span>
          <span className="settings-save-state">{dryRunStatus}</span>
          <button className="soft-button" type="button">
            <Plus size={15} />
            New Chat
          </button>
          <button className="soft-button muted" type="button">
            <SlidersHorizontal size={15} />
            Tools
          </button>
        </>
      }
    >
      <div className="chat-layout">
        <GlassPanel className="context-panel">
          <PanelHeader icon={Database} title="Context" aside={`${contextRows.length} linked`} />
          <div className="context-stack">
            {contextRows.length === 0 ? (
              <EmptyState title="No context loaded" detail="Attach local docs or open a saved session." />
            ) : (
              contextRows.map((item) => (
                <div className={`context-item rich ${item.active ? "selected" : ""}`} key={item.title}>
                  <FileText size={15} />
                  <div>
                    <strong>{item.title}</strong>
                    <small>
                      {item.type} / {item.chunks} chunks / {item.tokens} tokens
                    </small>
                  </div>
                  <time>{item.updated}</time>
                  {item.attached ? (
                    <button
                      aria-label={`Remove attached context ${item.title}`}
                      className="icon-button ghost"
                      onClick={() => removeAttachedContext(item)}
                      type="button"
                    >
                      <X size={13} />
                    </button>
                  ) : null}
                </div>
              ))
            )}
          </div>
          {attachedKnowledgeContexts.length > 0 ? (
            <button className="soft-button muted" onClick={clearAttachedContexts} type="button">
              <Trash2 size={14} />
              Clear attached
            </button>
          ) : null}
          <div className="memory-card">
            <span>Memory Scope</span>
            <strong>Local workspace only</strong>
            <p>Session memory is scoped to local files, local settings and the selected workspace.</p>
          </div>
        </GlassPanel>

        <GlassPanel className="chat-panel">
          <div className="chat-stream">
            {chatMessages.length === 0 ? (
              <EmptyState title="No chat session" detail="Saved local messages will appear here." />
            ) : (
              chatMessages.map((message, index) => (
                <div className={`message ${message.role}`} key={message.id || message.text}>
                  <span>{message.role === "user" ? "You" : "Agent"}</span>
                  <p>{message.text}</p>
                  <div className="message-refs">
                    <small>{message.role === "user" ? "local session" : `tool ref ${index + 1}`}</small>
                    <small>{index % 2 === 0 ? "context locked" : "draft"}</small>
                  </div>
                </div>
              ))
            )}
          </div>
          <form className="composer" onSubmit={sendMessage}>
            <Search size={17} />
            <input
              aria-label="Agent dry-run prompt"
              onChange={(event) => setComposerText(event.target.value)}
              placeholder="Ask about current workspace..."
              type="text"
              value={composerText}
            />
            <div className="composer-actions">
              <label className="composer-tool-policy">
                <input
                  aria-label="Auto-allow Level 1 read-only tools"
                  checked={autoAllowLevel1ReadOnly}
                  onChange={(event) => setAutoAllowLevel1ReadOnly(event.target.checked)}
                  type="checkbox"
                />
                <span>Auto L1</span>
              </label>
              <button aria-label="Attach context" type="button">
                <Paperclip size={15} />
              </button>
              <button aria-label="Tool mode" type="button">
                <Wrench size={15} />
              </button>
              <button aria-label="Voice input" type="button">
                <Mic2 size={15} />
              </button>
            </div>
            <button
              aria-label={dryRunBusy && activeRequestId ? "Stop generation" : "Send prompt"}
              disabled={!composerState.dryRunEnabled && !(dryRunBusy && activeRequestId)}
              type="submit"
            >
              <WandSparkles size={16} />
            </button>
          </form>
        </GlassPanel>

        <GlassPanel className="tool-panel">
          <PanelHeader icon={TerminalSquare} title="Tool timeline" aside="guarded" />
          <div className="tool-timeline">
            {timelineRows.length === 0 ? (
              <EmptyState title="No tool calls" detail="Tool activity will appear when a session records it." />
            ) : (
              timelineRows.map((tool) => (
                <div className={`tool-step ${tool.state}`} key={tool.title}>
                  <i />
                  <div>
                    <strong>{tool.title}</strong>
                    <small>{tool.meta}</small>
                    <span className="tool-step-meta">
                      <small>{tool.duration}</small>
                      <small>{tool.permission}</small>
                    </span>
                    {(tool.state === "pending" || tool.status === "pending") && (tool.permissionLevel ?? 1) <= 1 ? (
                      <span className="tool-step-actions">
                        <button
                          aria-label={`Approve ${tool.title}`}
                          onClick={() => approvePendingTools({ approvedToolIds: [tool.toolId] })}
                          type="button"
                        >
                          <Check size={13} />
                        </button>
                        {toolApprovalState.canApproveAllLevel1 ? (
                          <button
                            aria-label="Approve all Level 1 read-only tools"
                            onClick={() => approvePendingTools({ approveAllLevel1: true })}
                            type="button"
                          >
                            <ShieldCheck size={13} />
                          </button>
                        ) : null}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </GlassPanel>
      </div>
    </PageFrame>
  );
}
