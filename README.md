# Electron 本地桌面控制台需求蓝图

本目录当前只用于沉淀需求文档和 PlantUML 结构图，不是 Electron 实现仓库。

项目目标是设计一个本地优先的个人桌面控制台，用 Electron 作为客户端框架，统一管理知识库、代码仓库、Agent、情报中心、音乐播放器、语音助手和其他小组件。

## 阅读顺序

建议按三层阅读。

第一层：产品与总体架构。

1. `docs/requirements/01-产品愿景与范围.md`
2. `docs/requirements/02-页面与功能清单.md`
3. `docs/requirements/03-技术架构说明.md`
4. `docs/requirements/04-模块边界与阶段规划.md`
5. `docs/requirements/14-实现准备审查清单.md`
6. `diagrams/overall-architecture.puml`
7. `diagrams/module-map.puml`
8. `diagrams\module-boundary-context.puml`
9. `diagrams/implementation-readiness-map.puml`

第二层：实现前必须稳定的基础设施。

1. `docs/requirements/05-桌面壳导航与全局体验.md`
2. `docs/requirements/06-Preload-API与IPC契约.md`
3. `docs/requirements/07-数据模型与存储边界.md`
4. `docs/requirements/13-安全权限错误处理.md`
5. `diagrams/desktop-shell-navigation.puml`
6. `diagrams/page-switcher-state-machine.puml`
7. `diagrams/app-startup-sequence.puml`
8. `diagrams/preload-api-contract.puml`
9. `diagrams/ipc-and-services.puml`
10. `diagrams/app-data-er.puml`
11. `diagrams/permission-tool-execution.puml`
12. `diagrams/settings-secrets-boundary.puml`

第三层：业务模块细化。

1. `docs/requirements/08-知识库详细需求.md`
2. `docs/requirements/09-代码仓库详细需求.md`
3. `docs/requirements/10-Agent与LLM运行时.md`
4. `docs/requirements/11-情报中心接入详细设计.md`
5. `docs/requirements/12-音乐语音与小组件.md`
6. `diagrams/knowledge-rag-flow.puml`
7. `diagrams/code-repository-flow.puml`
8. `diagrams/agent-runtime-flow.puml`
9. `diagrams/intel-integration.puml`
10. `diagrams/llm-provider-adapter.puml`
11. `diagrams/service-manager-lifecycle.puml`
12. `diagrams/dashboard-aggregation-flow.puml`
13. `diagrams/music-voice-flow.puml`
14. `diagrams/data-storage-map.puml`

## 当前交付物

- 需求文档：产品定位、页面功能、技术架构、模块边界、阶段规划、桌面壳、API/IPC、数据模型、核心模块细化、安全权限和错误处理。
- 结构图：使用 PlantUML 表达总体架构、模块关系、快捷键页面切换、启动时序、API 契约、IPC、本地服务、数据实体、权限、LLM 适配、知识库 RAG、代码仓库分析、Agent Runtime、情报中心接入、音乐语音、数据存储边界和实现准备路线。

## 当前边界

- 不创建 Electron 项目。
- 不安装依赖。
- 不写主进程、Renderer、Preload 或业务实现代码。
- 不重写现有情报中心 `D:\python_code\local-intel\.worktrees\reliability-foundation`，第一版只设计接入方式。

## 后续补充方式

后续想到新页面、新模块或新工具时，先补充到需求文档，再补充对应 `.puml` 图。模块需求稳定后，再单独拆成更细的页面 PRD、接口设计或实现计划。

## 进入实现前的最低确认项

进入 Electron 客户端实现前，至少应确认：

- 一级页面入口、快捷键映射、页面切换器和“当前窗口只显示当前页面”的体验是否符合预期。
- `window.api.*` 命名空间是否覆盖第一阶段能力。
- App SQLite、Vector Store、local-intel SQLite 和文件系统边界是否清楚。
- Agent 工具权限分级是否符合本地安全预期。
- local-intel 是否继续作为独立 Python 服务接入。
- 第一阶段是否优先做 Home、Knowledge Base、Code Repository、Agent Chat、Agent Management 和情报中心。
