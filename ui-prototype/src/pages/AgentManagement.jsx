import React from "react";
import { Bot, KeyRound, MoreHorizontal, Plus, ShieldCheck } from "lucide-react";
import { EmptyState } from "../components/ui/EmptyState";
import { GlassPanel } from "../components/ui/GlassPanel";
import { PageFrame } from "../components/ui/PageFrame";
import { PanelHeader } from "../components/ui/PanelHeader";
import { useAgentManagementData } from "../hooks/usePageData";

const AGENT_FALLBACKS = [
  { lastRun: "4m ago", model: "gpt-4.1-mini", permission: "ask" },
  { lastRun: "18m ago", model: "local-qwen", permission: "allow" },
  { lastRun: "paused", model: "music-small", permission: "blocked" },
  { lastRun: "2m ago", model: "gpt-4.1", permission: "ask" },
];

const policyRows = [
  ["File read", "allow", "all agents"],
  ["Command execution", "ask", "repo analyst only"],
  ["Network access", "blocked", "manual approve"],
  ["Model calls", "ask", "budget guarded"],
];

function toToolList(tools) {
  if (Array.isArray(tools)) {
    return tools
      .map((tool) => (typeof tool === "string" ? tool : tool?.name ?? tool?.label))
      .filter(Boolean);
  }

  if (typeof tools === "string") {
    return tools
      .split(",")
      .map((tool) => tool.trim())
      .filter(Boolean);
  }

  return [];
}

export function getAgentRows(agents = []) {
  return agents.map((agent, index) => {
    const fallback = AGENT_FALLBACKS[index % AGENT_FALLBACKS.length];
    const tools = agent.toolList?.length
      ? agent.toolList
      : toToolList(agent.toolBindings?.length ? agent.toolBindings : agent.tools);
    const toolCount = agent.toolsCount ?? agent.toolCount ?? tools.length;

    return {
      ...fallback,
      ...agent,
      lastRun: agent.lastRun ?? fallback.lastRun,
      model: agent.model ?? fallback.model,
      modelStatus: agent.modelStatus ?? agent.modelProfile?.status ?? "ready",
      permission: agent.permission ?? fallback.permission,
      providerStatus: agent.providerStatus ?? (
        agent.modelProfile?.provider
          ? `${agent.modelProfile.provider} / ${agent.modelProfile.status ?? "unknown"}`
          : "provider / unconfigured"
      ),
      toolList: tools,
      toolCount,
    };
  });
}

export function getPolicyRows(permissionMetrics = [], permissionPolicies = []) {
  if (Array.isArray(permissionPolicies) && permissionPolicies.length > 0) {
    return permissionPolicies
      .map((policy) => {
        if (Array.isArray(policy)) {
          return [policy[0], policy[1], policy[2]];
        }

        return [policy.label ?? policy.name, policy.state ?? policy.status, policy.scope ?? policy.detail];
      })
      .filter(([label, state]) => label && state);
  }

  if (permissionMetrics.length > 0) {
    return permissionMetrics.map((metric, index) => [
      metric,
      index === 0 ? "allow" : index === 3 ? "ask" : "blocked",
      index === 0 ? "local read-only" : "disabled in this phase",
    ]);
  }

  return policyRows;
}

export function AgentManagement() {
  const { data } = useAgentManagementData();
  const { agents, permissionMetrics, permissionPolicies } = data;
  const agentRows = getAgentRows(agents);
  const policyMatrixRows = getPolicyRows(permissionMetrics, permissionPolicies);

  return (
    <PageFrame
      eyebrow="Agent Control"
      title="Agent Management"
      subtitle="Local agent control surface"
      actions={
        <>
          <button className="soft-button" type="button">
            <Plus size={15} />
            New Agent
          </button>
          <button className="soft-button muted" type="button">
            <KeyRound size={15} />
            Policy
          </button>
        </>
      }
    >
      <div className="agent-grid">
        {agentRows.length === 0 ? (
          <GlassPanel className="permission-panel">
            <EmptyState title="No agents configured" detail="Choose an agent config file in Settings." />
          </GlassPanel>
        ) : (
          agentRows.map((agent) => (
            <GlassPanel className="agent-card compact" key={agent.name}>
              <div className="agent-card-top">
                <div className="agent-avatar">
                  <Bot size={20} />
                </div>
                <span className={`agent-toggle ${agent.state !== "paused" ? "on" : ""}`} aria-label="Agent toggle" />
                <button className="icon-button ghost" type="button" aria-label={`More actions for ${agent.name}`}>
                  <MoreHorizontal size={15} />
                </button>
              </div>
              <div className="agent-card-main">
                <span className={`agent-state ${agent.state}`}>{agent.state}</span>
                <h2>{agent.name}</h2>
                <p>{agent.model} / {agent.modelStatus}</p>
                <div className="agent-tool-list">
                  {agent.toolList.slice(0, 3).map((tool) => (
                    <span key={tool}>{tool}</span>
                  ))}
                </div>
                <div className="agent-facts">
                  <span>{agent.toolCount} tools</span>
                  <span>{agent.permission}</span>
                  <span>{agent.lastRun}</span>
                </div>
              </div>
            </GlassPanel>
          ))
        )}
        <GlassPanel className="permission-panel">
          <PanelHeader icon={ShieldCheck} title="Policy matrix" aside={`${policyMatrixRows.length || 4} checks`} />
          <div className="policy-matrix">
            {policyMatrixRows.map(([name, state, scope]) => (
              <div className={`policy-row ${state}`} key={name}>
                <span>{name}</span>
                <strong>{state}</strong>
                <small>{scope}</small>
              </div>
            ))}
          </div>
        </GlassPanel>
      </div>
    </PageFrame>
  );
}
