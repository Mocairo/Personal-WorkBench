import { AgentChat } from "./AgentChat";
import { AgentManagement } from "./AgentManagement";
import { CodeRepository } from "./CodeRepository";
import { HomeDashboard } from "./HomeDashboard";
import { IntelCenter } from "./IntelCenter";
import { KnowledgeBase } from "./KnowledgeBase";
import { LocalMusic } from "./LocalMusic";
import { Widgets } from "./Widgets";

export const pageComponents = {
  home: HomeDashboard,
  chat: AgentChat,
  knowledge: KnowledgeBase,
  agents: AgentManagement,
  code: CodeRepository,
  music: LocalMusic,
  intel: IntelCenter,
  widgets: Widgets,
};
