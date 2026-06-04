import {
  buildDryRunResult,
  buildPermissionDecision,
  buildPermissionRequest,
} from "../shared/llmSecurityContracts.js";

const DEFAULT_PERMISSION_REQUESTS = [
  {
    label: "Create local note",
    permissionLevel: 2,
    requestId: "permission-local-write",
    toolId: "notes.write",
  },
];

export async function listPermissionRequests(options = {}) {
  const requests = Array.isArray(options.requests) && options.requests.length > 0
    ? options.requests
    : DEFAULT_PERMISSION_REQUESTS;

  return requests.map(buildPermissionRequest);
}

export async function evaluateToolRequest(request = {}) {
  return buildDryRunResult(request);
}

export async function dryRunTool(request = {}) {
  return buildDryRunResult(request);
}

export async function executeTool(request = {}) {
  return {
    ...buildDryRunResult(request),
    decision: "denied",
    message: "Tool execution is disabled in this phase.",
    requiresApproval: true,
    status: "denied",
    wouldExecute: false,
  };
}

export async function decidePermissionRequest(request = {}) {
  return buildPermissionDecision({
    ...request,
    allowed: false,
    decision: "not-implemented",
    message: "Permission decisions are not implemented in this phase.",
  });
}
