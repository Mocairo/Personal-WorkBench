const SENSITIVE_PATH_PATTERN = /[A-Za-z]:\\[^\s"']+/g;

function sanitizeText(value, fallback = "Local operation failed") {
  const text = typeof value === "string" && value.trim() ? value.trim() : fallback;
  const sanitized = text.replace(SENSITIVE_PATH_PATTERN, "[redacted-path]");

  return sanitized === "[redacted-path]" || sanitized.includes("[redacted-path]") ? fallback : sanitized;
}

export function ok(data) {
  return { ok: true, data };
}

export function fail({ code = "UNKNOWN_ERROR", detail, message, retryable = false } = {}) {
  return {
    ok: false,
    error: {
      code,
      message: sanitizeText(message),
      ...(detail ? { detail: sanitizeText(detail, "Details redacted") } : {}),
      retryable,
    },
  };
}

export function permissionDenied(message = "Permission denied") {
  return fail({ code: "PERMISSION_DENIED", message, retryable: false });
}

export function notImplemented(message = "Not implemented in this phase") {
  return fail({ code: "NOT_IMPLEMENTED", message, retryable: false });
}

export function errorToApiResult(error) {
  return fail({
    code: error?.code ?? "UNKNOWN_ERROR",
    detail: error?.message,
    message: error?.message,
    retryable: false,
  });
}

export function isApiResult(value) {
  return Boolean(value && typeof value === "object" && typeof value.ok === "boolean");
}

export function unwrapApiResult(result) {
  if (!isApiResult(result)) {
    return result;
  }

  if (result.ok) {
    return result.data;
  }

  throw new Error(result.error?.message ?? "Local operation failed");
}
