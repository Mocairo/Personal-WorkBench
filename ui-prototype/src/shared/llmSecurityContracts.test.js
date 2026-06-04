import { describe, expect, it } from "vitest";
import {
  buildDryRunResult,
  buildLlmModelProfile,
  buildLlmProviderProfile,
  buildPermissionDecision,
  buildPermissionRequest,
  buildSecretRef,
  buildSecretStatus,
  buildToolExecutionPolicy,
  redactSecretText,
} from "./llmSecurityContracts";

describe("LLM, secret, and permission contracts", () => {
  it("normalizes provider and model profiles without leaking secret values", () => {
    const provider = buildLlmProviderProfile({
      apiKey: "sk-provider-secret",
      id: "openai",
      label: "OpenAI-compatible",
      model: "gpt-4.1-mini",
      provider: "openai",
      secretHint: "sk-provider-secret",
      status: "ready",
    });
    const model = buildLlmModelProfile({
      apiKey: "sk-model-secret",
      model: "gpt-4.1-mini",
      provider: "openai",
      status: "ready",
    });

    expect(provider).toMatchObject({
      hasSecret: true,
      id: "openai",
      label: "OpenAI-compatible",
      provider: "openai",
      secretHint: "[redacted]",
      status: "ready",
    });
    expect(model).toMatchObject({
      hasSecret: true,
      label: "openai / gpt-4.1-mini",
      model: "gpt-4.1-mini",
      provider: "openai",
      status: "ready",
    });
    expect(JSON.stringify({ provider, model })).not.toMatch(/sk-provider-secret|sk-model-secret|apiKey/);
  });

  it("normalizes secret status as masked renderer-only data", () => {
    const secret = buildSecretStatus({
      id: "openai-key",
      label: "OpenAI Key",
      provider: "openai",
      secret: "sk-live-secret",
      secretHint: "sk-live-secret",
      status: "ready",
    });
    const ref = buildSecretRef({ id: "openai-key", provider: "openai", secret: "sk-ref-secret" });

    expect(secret).toMatchObject({
      hasSecret: true,
      id: "openai-key",
      label: "OpenAI Key",
      masked: "[redacted]",
      provider: "openai",
      secretHint: "[redacted]",
      status: "ready",
    });
    expect(ref).toMatchObject({
      hasSecret: true,
      provider: "openai",
      secretHint: "[redacted]",
    });
    expect(JSON.stringify({ secret, ref })).not.toMatch(/sk-live-secret|sk-ref-secret|apiKey|token=|password=/);
  });

  it("models permission decisions and tool dry-run results", () => {
    expect(buildPermissionRequest({ permissionLevel: 1, toolId: "kb.search" })).toMatchObject({
      permissionLevel: 1,
      requiresApproval: false,
      status: "ready",
      toolId: "kb.search",
    });
    expect(buildPermissionRequest({ permissionLevel: 2, toolId: "notes.write" })).toMatchObject({
      permissionLevel: 2,
      requiresApproval: true,
      status: "pending",
    });
    expect(buildToolExecutionPolicy({ permissionLevel: 4, toolId: "shell.exec" })).toMatchObject({
      decision: "denied",
      permissionLevel: 4,
      requiresApproval: true,
    });
    expect(buildPermissionDecision({ allowed: false, permissionLevel: 3, requestId: "req-1" })).toMatchObject({
      allowed: false,
      decision: "denied",
      requestId: "req-1",
      status: "denied",
    });
    expect(buildDryRunResult({ permissionLevel: 2, toolId: "report.write" })).toMatchObject({
      permissionLevel: 2,
      requiresApproval: true,
      status: "pending",
      toolId: "report.write",
      wouldExecute: false,
    });
  });

  it("redacts common credential shapes from arbitrary text", () => {
    expect(redactSecretText("apiKey=sk-one token=abc Authorization: Bearer sk-two password=pw")).toBe(
      "apiKey=[redacted] token=[redacted] Authorization: Bearer [redacted] password=[redacted]",
    );
  });
});
