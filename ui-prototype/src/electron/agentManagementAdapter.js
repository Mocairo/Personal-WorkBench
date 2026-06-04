import fs from "node:fs/promises";
import path from "node:path";
import {
  buildAgentPermissionPolicy,
  buildAgentProfile,
  redactAgentText,
} from "../shared/agentContracts.js";
import { buildProviderStatus } from "../shared/sourceStatus.js";

const DEFAULT_PERMISSION_METRICS = ["File read", "Command execution", "Network access", "Model calls"];
const DEFAULT_PERMISSION_POLICIES = [
  ["File read", "allow", "local read-only"],
  ["Command execution", "blocked", "disabled in this phase"],
  ["Network access", "blocked", "disabled in this phase"],
  ["Model calls", "ask", "provider gated"],
];

function toStringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePermissionMetric(metric) {
  if (typeof metric === "string") {
    return redactAgentText(metric);
  }

  if (metric && typeof metric === "object") {
    return redactAgentText(toStringValue(metric.label));
  }

  return "";
}

function buildStatus(status, message, configured = status !== "unconfigured") {
  return buildProviderStatus({
    configured,
    message,
    sourceId: "agentManagementConfig",
    status,
  });
}

function buildDefaults(status, message, configured) {
  return {
    agents: [],
    permissionMetrics: DEFAULT_PERMISSION_METRICS,
    permissionPolicies: DEFAULT_PERMISSION_POLICIES.map(buildAgentPermissionPolicy),
    providerStatus: buildStatus(status, message, configured),
  };
}

async function readAgentConfig(configPath) {
  try {
    const content = await fs.readFile(configPath, "utf8");
    try {
      return { data: JSON.parse(content), ok: true };
    } catch {
      return {
        configured: true,
        message: "Agent config JSON is invalid",
        ok: false,
        status: "error",
      };
    }
  } catch (error) {
    return {
      configured: false,
      message: error?.code === "ENOENT" ? "Choose an agent config file in Settings." : "Agent config is unreadable",
      ok: false,
      status: error?.code === "ENOENT" ? "unconfigured" : "error",
    };
  }
}

function normalizePermissionPolicies(config, permissionMetrics) {
  const policySource = Array.isArray(config.permissionPolicies) ? config.permissionPolicies : [];
  const policies = policySource.map(buildAgentPermissionPolicy).filter((policy) => policy.label);

  if (policies.length > 0) {
    return policies;
  }

  return (permissionMetrics.length > 0 ? permissionMetrics : DEFAULT_PERMISSION_METRICS)
    .map((label, index) => buildAgentPermissionPolicy({
      label,
      scope: index === 0 ? "local read-only" : "disabled in this phase",
      state: index === 0 ? "allow" : index === 3 ? "ask" : "blocked",
    }));
}

export async function getAgentManagementData(options = {}) {
  const rootDir = options.rootDir ?? process.env.AGENT_MANAGEMENT_ROOT ?? path.resolve("agents");
  const configPath = options.configPath ?? process.env.AGENT_MANAGEMENT_CONFIG ?? path.join(rootDir, "agents.json");
  const configResult = await readAgentConfig(configPath);

  if (!configResult.ok) {
    return buildDefaults(configResult.status, configResult.message, configResult.configured);
  }

  const config = configResult.data;
  const agentSource = Array.isArray(config) ? config : config.agents;
  const agents = Array.isArray(agentSource) ? agentSource.map(buildAgentProfile).filter(Boolean) : [];
  const permissionMetrics = Array.isArray(config.permissionMetrics)
    ? config.permissionMetrics.map(normalizePermissionMetric).filter(Boolean)
    : [];
  const normalizedPermissionMetrics = permissionMetrics.length > 0 ? permissionMetrics : DEFAULT_PERMISSION_METRICS;

  return {
    agents: agents.slice(0, 12),
    permissionMetrics: normalizedPermissionMetrics,
    permissionPolicies: normalizePermissionPolicies(config, normalizedPermissionMetrics),
    providerStatus: buildStatus("ready", "Agent config loaded", true),
  };
}
