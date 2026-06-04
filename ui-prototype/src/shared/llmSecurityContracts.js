const SECRET_ASSIGNMENT_PATTERN = /\b(api[_-]?key|token|secret|password)\s*=\s*[^\s,;]+/gi;
const AUTHORIZATION_PATTERN = /\b(Authorization:\s*Bearer\s+)[^\s,;]+/gi;
const OPENAI_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]+/g;
const WINDOWS_PATH_PATTERN = /\b[A-Za-z]:\\[^\s"']+/g;

function toStringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function firstString(...values) {
  return values.map(toStringValue).find(Boolean) ?? "";
}

function slug(value, fallback = "item") {
  const normalized = toStringValue(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function normalizeStatus(status, fallback = "unconfigured") {
  const value = toStringValue(status);
  if (!value) {
    return fallback;
  }

  const normalized = value.toLowerCase();
  if (["configured", "enabled", "ok"].includes(normalized)) {
    return "ready";
  }
  if (["missing", "missing_secret", "unconfigured", "ready", "error", "mock", "pending", "denied", "not-implemented"].includes(normalized)) {
    return normalized;
  }

  return fallback;
}

function normalizePermissionLevel(value) {
  if (Number.isFinite(value)) {
    return value;
  }

  const match = toStringValue(value).match(/\d+/);
  return match ? Number(match[0]) : 1;
}

function getSecretCandidate(input = {}) {
  return firstString(input.secretHint, input.masked, input.apiKey, input.token, input.secret, input.password);
}

function inferHasSecret(input = {}) {
  return Boolean(input.hasSecret ?? input.configured ?? getSecretCandidate(input));
}

function secretHint(input = {}) {
  const candidate = getSecretCandidate(input);
  if (candidate) {
    return redactSecretText(candidate);
  }

  return inferHasSecret(input) ? "configured" : "not configured";
}

export function redactSecretText(value) {
  const text = toStringValue(value);
  if (!text) {
    return "";
  }

  return text
    .replace(AUTHORIZATION_PATTERN, "$1[redacted]")
    .replace(SECRET_ASSIGNMENT_PATTERN, (match) => `${match.split("=")[0]}=[redacted]`)
    .replace(OPENAI_KEY_PATTERN, "[redacted]")
    .replace(WINDOWS_PATH_PATTERN, "[redacted-path]");
}

export function buildSecretStatus(input = {}) {
  const id = firstString(input.id, input.secretId, input.provider, "llm-provider");
  const hasSecret = inferHasSecret(input);
  const status = normalizeStatus(input.status, hasSecret ? "ready" : "unconfigured");
  const hint = secretHint(input);

  return {
    configured: hasSecret,
    hasSecret,
    id,
    label: redactSecretText(firstString(input.label, input.name, input.provider, id)),
    masked: hint,
    message: redactSecretText(firstString(input.message)) || (hasSecret ? "Secret configured" : "Secret not configured"),
    provider: redactSecretText(firstString(input.provider)),
    secretHint: hint,
    source: firstString(input.source) || "local",
    status,
    updatedAt: firstString(input.updatedAt) || null,
  };
}

export function buildSecretRef(input = {}) {
  const status = buildSecretStatus(input);

  return {
    hasSecret: status.hasSecret,
    id: status.id,
    label: status.label,
    provider: status.provider,
    secretHint: status.secretHint,
    status: status.status,
    updatedAt: status.updatedAt,
  };
}

export function buildLlmProviderProfile(input = {}) {
  const provider = redactSecretText(firstString(input.provider, input.id, "openai-compatible"));
  const id = firstString(input.id, slug(provider, "llm-provider"));
  const hasSecret = inferHasSecret(input);
  const status = normalizeStatus(input.status, hasSecret ? "ready" : "unconfigured");

  return {
    hasSecret,
    id,
    label: redactSecretText(firstString(input.label, input.name, provider)),
    message: redactSecretText(firstString(input.message)) || (status === "ready" ? "Provider ready" : "Provider not configured"),
    model: redactSecretText(firstString(input.model, input.defaultModel)),
    provider,
    requiresApproval: Boolean(input.requiresApproval ?? false),
    secretHint: secretHint(input),
    source: firstString(input.source) || "local",
    status,
    updatedAt: firstString(input.updatedAt) || null,
  };
}

export function buildLlmModelProfile(input = {}) {
  const provider = redactSecretText(firstString(input.provider, "openai-compatible"));
  const model = redactSecretText(firstString(input.model, input.name, "not configured"));
  const hasSecret = inferHasSecret(input);
  const status = normalizeStatus(input.status, hasSecret ? "ready" : "unconfigured");

  return {
    hasSecret,
    id: firstString(input.id, `${slug(provider, "provider")}:${slug(model, "model")}`),
    label: redactSecretText(firstString(input.label, `${provider} / ${model}`)),
    message: redactSecretText(firstString(input.message)) || (status === "ready" ? "Model ready" : "Model not configured"),
    model,
    provider,
    secretHint: secretHint(input),
    source: firstString(input.source) || "local",
    status,
    updatedAt: firstString(input.updatedAt) || null,
  };
}

export function buildPermissionRequest(input = {}) {
  const permissionLevel = normalizePermissionLevel(input.permissionLevel ?? input.level);
  const requiresApproval = Boolean(input.requiresApproval ?? permissionLevel >= 2);
  const defaultStatus = permissionLevel <= 1 ? "ready" : permissionLevel === 2 ? "pending" : "denied";
  const status = normalizeStatus(input.status, defaultStatus);

  return {
    id: firstString(input.id, input.requestId, slug(input.toolId, "permission-request")),
    label: redactSecretText(firstString(input.label, input.title, input.toolId, "Tool request")),
    message: redactSecretText(firstString(input.message)) || (requiresApproval ? "Approval required" : "Read-only request allowed"),
    permissionLevel,
    requestId: firstString(input.requestId, input.id, slug(input.toolId, "permission-request")),
    requiresApproval,
    source: firstString(input.source) || "local",
    status,
    toolId: redactSecretText(firstString(input.toolId, input.id, "unknown-tool")),
    updatedAt: firstString(input.updatedAt) || null,
  };
}

export function buildToolExecutionPolicy(input = {}) {
  const request = buildPermissionRequest(input);
  const decision = request.permissionLevel <= 1
    ? "allow"
    : request.permissionLevel === 2
      ? "approval-required"
      : "denied";

  return {
    decision,
    id: firstString(input.id, input.policyId, request.id),
    message: decision === "allow"
      ? "Read-only dry-run allowed"
      : decision === "approval-required"
        ? "Approval required before execution"
        : "Tool execution denied in this phase",
    permissionLevel: request.permissionLevel,
    requiresApproval: request.requiresApproval,
    status: decision === "allow" ? "ready" : decision === "approval-required" ? "pending" : "denied",
    toolId: request.toolId,
  };
}

export function buildPermissionDecision(input = {}) {
  const requestId = firstString(input.requestId, input.id, "permission-request");
  const rawDecision = toStringValue(input.decision);
  const decision = rawDecision === "not-implemented"
    ? "not-implemented"
    : input.allowed
      ? "allow"
      : "denied";

  return {
    allowed: decision === "allow",
    decision,
    message: redactSecretText(firstString(input.message)) || (decision === "allow" ? "Approved" : "Permission not granted"),
    permissionLevel: normalizePermissionLevel(input.permissionLevel),
    requestId,
    status: decision === "allow" ? "ready" : decision === "not-implemented" ? "not-implemented" : "denied",
    updatedAt: firstString(input.updatedAt) || null,
  };
}

export function buildDryRunResult(input = {}) {
  const policy = buildToolExecutionPolicy(input);

  return {
    decision: policy.decision,
    dryRun: true,
    message: redactSecretText(firstString(input.message)) || policy.message,
    permissionLevel: policy.permissionLevel,
    requiresApproval: policy.requiresApproval,
    status: policy.status,
    toolId: policy.toolId,
    updatedAt: firstString(input.updatedAt) || null,
    wouldExecute: false,
  };
}
