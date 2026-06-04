import { unwrapApiResult } from "../shared/apiResult.js";

export const providerName = "local";

function getRuntimeApi() {
  return globalThis.window?.api ?? globalThis.window?.desktopApi;
}

function requireRuntimeMethod(namespace, method) {
  const api = getRuntimeApi();
  const handler = api?.[namespace]?.[method];

  if (!handler) {
    throw new Error(`window.api.${namespace}.${method} is not available`);
  }

  return handler;
}

async function callRuntimeMethod(namespace, method, ...args) {
  const result = await requireRuntimeMethod(namespace, method)(...args);
  return unwrapApiResult(result);
}

export async function getHomeDashboard() {
  return callRuntimeMethod("dashboard", "getHomeDashboard");
}

export async function getAgentChat() {
  return callRuntimeMethod("agentChat", "getAgentChat");
}

export async function prepareAgentChatMessageDraft(input) {
  return callRuntimeMethod("agentChat", "prepareMessageDraft", input);
}

export async function previewAgentChatContextPack(input) {
  return callRuntimeMethod("agentChat", "previewContextPack", input);
}

export async function previewAgentChatToolPlan(input) {
  return callRuntimeMethod("agentChat", "previewToolPlan", input);
}

export async function runAgentChatDryMessage(input) {
  return callRuntimeMethod("agentChat", "runDryMessage", input);
}

export async function sendAgentChatMessage(input) {
  return callRuntimeMethod("agentChat", "sendMessage", input);
}

export async function streamAgentChatMessage(input, options = {}) {
  const api = getRuntimeApi();
  const requestId = input?.requestId;
  const unsubscribe = requestId && typeof api?.agentChat?.onStreamEvent === "function"
    ? api.agentChat.onStreamEvent(requestId, options.onEvent ?? (() => {}))
    : null;

  try {
    return await callRuntimeMethod("agentChat", "streamMessage", input);
  } finally {
    unsubscribe?.();
  }
}

export async function cancelAgentChatStream(input) {
  return callRuntimeMethod("agentChat", "cancelStream", input);
}

export async function getKnowledgeBase() {
  return callRuntimeMethod("knowledge", "getKnowledgeBase");
}

export async function getAgentManagement() {
  return callRuntimeMethod("agentManagement", "getAgentManagement");
}

export async function getCodeRepository() {
  return callRuntimeMethod("repository", "getCodeRepository");
}

export async function getLocalMusic() {
  return callRuntimeMethod("music", "getLocalMusic");
}

export async function getIntelCenter() {
  return callRuntimeMethod("intel", "getIntelCenter");
}

export async function getSettings() {
  return callRuntimeMethod("settings", "getSettings");
}

export async function selectLocalSourcePath(sourceId) {
  return callRuntimeMethod("settings", "selectLocalSourcePath", sourceId);
}

export async function saveLocalSourcePath(sourceId, selectedPath) {
  return callRuntimeMethod("settings", "saveLocalSourcePath", sourceId, selectedPath);
}

export async function getWidgets() {
  return callRuntimeMethod("widgets", "getWidgets");
}

export async function getAppStatus() {
  return callRuntimeMethod("system", "getAppStatus");
}

export async function getSettingsSummary() {
  return callRuntimeMethod("system", "getSettingsSummary");
}

export async function listTasks() {
  return callRuntimeMethod("system", "listTasks");
}

export async function listKnowledgeSources() {
  return callRuntimeMethod("kb", "listSources");
}

export async function listKnowledgeDocuments() {
  return callRuntimeMethod("kb", "listDocuments");
}

export async function getKnowledgeIndexStatus() {
  return callRuntimeMethod("kb", "getIndexStatus");
}

export async function searchKnowledgeLocal(query) {
  return callRuntimeMethod("kb", "searchLocal", query);
}

export async function getKnowledgeDocumentPreview(documentId) {
  return callRuntimeMethod("kb", "getDocumentPreview", documentId);
}

export async function listCodeRepositories() {
  return callRuntimeMethod("codeRepo", "listRepositories");
}

export async function getCodeGitSummary() {
  return callRuntimeMethod("codeRepo", "getGitSummary");
}

export async function listCodeRepositoryFiles() {
  return callRuntimeMethod("codeRepo", "listFiles");
}

export async function getCodeRepositoryMetrics() {
  return callRuntimeMethod("codeRepo", "getMetrics");
}

export async function getCodeRepositoryStructure() {
  return callRuntimeMethod("codeRepo", "getStructure");
}

export async function listAgents() {
  return callRuntimeMethod("agent", "listAgents");
}

export async function listAgentSessions() {
  return callRuntimeMethod("agent", "listSessions");
}

export async function listLlmProviders() {
  return callRuntimeMethod("llm", "listProviders");
}

export async function listLlmModels() {
  return callRuntimeMethod("llm", "listModels");
}

export async function getLlmProviderStatus() {
  return callRuntimeMethod("llm", "getProviderStatus");
}

export async function validateLlmProviderConfig(config) {
  return callRuntimeMethod("llm", "validateProviderConfig", config);
}

export async function sendLlmTextMessage(input) {
  return callRuntimeMethod("llm", "sendTextMessage", input);
}

export async function listPermissionRequests() {
  return callRuntimeMethod("permission", "listRequests");
}

export async function evaluateToolRequest(request) {
  return callRuntimeMethod("permission", "evaluateToolRequest", request);
}

export async function dryRunTool(request) {
  return callRuntimeMethod("tool", "dryRun", request);
}

export async function getIntelServiceStatus() {
  return callRuntimeMethod("intel", "getServiceStatus");
}

export async function getIntelDashboardSummary() {
  return callRuntimeMethod("intel", "getDashboardSummary");
}

export async function getIntelSourceHealth() {
  return callRuntimeMethod("intel", "getSourceHealth");
}

export async function listIntelReports() {
  return callRuntimeMethod("intel", "listReports");
}

export async function listIntelLogs() {
  return callRuntimeMethod("intel", "listLogs");
}

export async function getMusicPlaybackState() {
  return callRuntimeMethod("music", "getPlaybackState");
}
