# UI Data Contract

## Data Access Layer

当前已经加入第一层数据接入边界：

- `src/services/dataProvider.js`：统一 provider 入口，默认使用 `mock`，后续可通过 `VITE_DATA_PROVIDER=local` 切到本地 provider。
- `src/services/mockProvider.js`：继续读取现有 `src/data/mockData.js` 与 `src/data/pageRegistry.js`，保证静态原型视觉不变。
- `src/services/localProvider.js`：预留 Electron Preload / IPC 的本地数据入口，目前只定义 `desktopApi.dashboard.getHomeDashboard()` 调用形态。
- `src/hooks/useHomeDashboardData.js`：Home Dashboard 页面只通过 hook 读取数据，不再直接依赖 mock 文件。
- `src/hooks/usePageData.js`：其余业务页面统一通过 `useAgentChatData()`、`useKnowledgeBaseData()`、`useAgentManagementData()`、`useCodeRepositoryData()`、`useLocalMusicData()`、`useIntelCenterData()`、`useWidgetsData()` 读取数据。

预留的 Electron Preload API 形态：

```js
window.desktopApi.dashboard.getHomeDashboard();
window.desktopApi.agentChat.getAgentChat();
window.desktopApi.knowledge.getKnowledgeBase();
window.desktopApi.agentManagement.getAgentManagement();
window.desktopApi.repository.getCodeRepository();
window.desktopApi.music.getLocalMusic();
window.desktopApi.intel.getIntelCenter();
window.desktopApi.widgets.getWidgets();
```

Electron 壳入口：

- `src/electron/main.js`：创建桌面窗口，注册 IPC handler，开发模式读取 `ELECTRON_RENDERER_URL`，否则读取 `dist/index.html`。
- `src/electron/preload.js`：通过 `contextBridge` 暴露 `window.desktopApi`，Renderer 仍然无法直接访问 Node。
- `src/electron/ipcChannels.js`：维护 IPC channel 与 provider 方法的稳定映射。
- `src/electron/ipcHandlers.js`：把 IPC handler 注册到 provider，主进程可按页面逐步替换真实数据来源。
- `src/electron/desktopApiFactory.js`：生成 preload 暴露给 Renderer 的 API 形状。
- `src/electron/mainProvider.js`：主进程数据 provider，当前已接入首页汇总、情报中心、代码仓库、知识库、本地音乐和小组件系统状态，其余页面继续使用 mock 数据。
- `src/electron/homeDashboardAdapter.js`：聚合已接入模块的状态，生成 Home Dashboard 的服务状态、今日任务、最近活动和快捷入口。
- `src/electron/localIntelAdapter.js`：只读接入 `local-intel` 工作区，读取 `reports/*.md`、`logs/*.jsonl`、`data/intel.sqlite` 和 pid 文件，组装为情报中心页面现有数据结构。
- `src/electron/codeRepositoryAdapter.js`：只读扫描代码仓库目录，读取顶层文件树、源文件计数和 `git status --short --branch`，组装为 Code Repository 页面数据结构。
- `src/electron/knowledgeBaseAdapter.js`：只读扫描知识库目录，读取 Markdown / PUML 文档，生成文档列表、图谱节点和索引统计。
- `src/electron/localMusicAdapter.js`：只读扫描本地音乐目录，识别常见音频扩展名，生成播放列表和基础元数据统计，不执行播放或写入。
- `src/electron/widgetsAdapter.js`：只读读取系统 CPU / 内存 / 磁盘基础指标，生成小组件页面的 `systemMetrics`。

`local-intel` 默认路径：

```text
D:\python_code\local-intel\.worktrees\reliability-foundation
```

可以通过环境变量覆盖：

```bash
set LOCAL_INTEL_ROOT=D:\path\to\local-intel
npm run electron:dev
```

Code Repository 默认扫描 Electron 当前工作目录，也可以通过环境变量覆盖：

```bash
set CODE_REPOSITORY_ROOT=D:\path\to\repo
npm run electron:dev
```

Knowledge Base 默认扫描当前项目的 `docs` 目录，也可以通过环境变量覆盖：

```bash
set KNOWLEDGE_BASE_ROOT=D:\path\to\knowledge-base
npm run electron:dev
```

Local Music 默认扫描当前用户的 `Music` 目录，也可以通过环境变量覆盖：

```bash
set LOCAL_MUSIC_ROOT=D:\path\to\music
npm run electron:dev
```

Widgets 默认用当前工作目录作为磁盘统计根路径，也可以通过环境变量覆盖：

```bash
set WIDGETS_DISK_ROOT=D:\
npm run electron:dev
```

启动方式：

```bash
npm run dev
npm run electron:dev
```

或者先构建再用 Electron 打开：

```bash
npm run electron:preview
```

本文件描述 `ui-prototype` 当前静态/半交互 React 原型所需的数据结构。当前阶段全部使用 mock data，不接真实后端、不调用 Electron 主进程。后续接入时可以用本地服务、Preload API 或 Electron IPC 替换 `src/data/mockData.js` 和 `src/data/pageRegistry.js` 的数据来源。

## App Shell / Page Switcher

### PageRegistryItem

来源：`src/data/pageRegistry.js`

```ts
type PageRegistryItem = {
  id: "home" | "chat" | "knowledge" | "agents" | "code" | "music" | "intel" | "widgets";
  name: string;
  label: string;
  shortcut: string;
  hint: string;
  status: string;
  accent: string;
};
```

用途：
- `AppShell` 根据 `id` 渲染业务页面。
- `FloatingControlBar` 显示当前页名称和入口图标。
- `PageSwitcher` / `RadialWheel` 渲染页面卡片、快捷键、状态和主题色。

后续可接入：
- Electron shortcut 配置：替换 `shortcut`。
- Page Registry 服务：动态注册一级页面。
- Service Manager：替换 `status` 为实时状态摘要。

### ServiceStatus

来源：`serviceState`

```ts
type ServiceStatus = {
  name: string;
  value: string;
  tone: "good" | "warm" | "cool" | string;
};
```

后续可接入 Electron 主进程或 Service Manager，例如 local-intel、索引任务、LLM Provider 和后台任务流。

## Home Dashboard

```ts
type HomeTask = {
  title: string;
  module: string;
  time: string;
};

type RecentActivity = string;
```

当前 mock：
- 今日任务：`homeTasks`
- 最近活动：`recentActivities`
- 服务状态：`serviceState`
- 快捷入口：`pages`

后续可接入：
- App State Store：今日任务、最近页面。
- Task Event Stream：后台任务与活动流。
- Service Manager：服务状态。

## Agent Chat

```ts
type ChatMessage = {
  role: "user" | "assistant";
  text: string;
};

type ToolCall = {
  title: string;
  meta: string;
  state: "done" | "running" | "failed" | string;
};

type ContextItem = string;
```

当前 mock：
- 对话消息：`chatMessages`
- 工具调用时间线：`toolCalls`
- 上下文资源：`contextItems`

后续可接入：
- Agent Runtime：流式消息、工具调用状态。
- Page State Store：当前会话、输入草稿、选中上下文。
- 权限服务：工具授权和风险提示。

## Knowledge Base

```ts
type KnowledgeDocument = {
  title: string;
  tag: string;
  state: string;
};

type GraphNode = string;
```

当前 mock：
- 文档列表：`knowledgeDocuments`
- 知识图谱节点：`graphNodes`
- 索引数字与进度：页面组件内静态展示

后续可接入：
- 本地知识库索引服务：文档、chunk、embedding 状态。
- Vector Store：检索结果和图谱关系。
- 文件系统选择器：导入目录。

## Agent Management

```ts
type AgentSummary = {
  name: string;
  state: "online" | "idle" | "paused" | string;
  tools: string;
};

type PermissionMetric = string;
```

当前 mock：
- Agent 卡片：`agents`
- 权限指标：`permissionMetrics`

后续可接入：
- Agent 配置存储：名称、运行状态、工具列表。
- 权限策略服务：读写、命令、网络、模型调用权限。
- 执行历史：最近任务、失败原因。

## Code Repository

```ts
type RepoFile = {
  name: string;
  meta: string;
};
```

当前 mock：
- 项目树：`repoFiles`
- 仓库概览、Git 状态和结构图：页面组件内静态展示

后续可接入：
- 本地仓库扫描服务：文件树、符号、依赖关系。
- Git 状态读取：branch、modified、staged。
- Code Repository Analyzer：结构图数据。

## Local Music

```ts
type Track = {
  title: string;
  artist: string;
  length: string;
};

type AudioMetadata = {
  label: string;
  value: string;
};
```

当前 mock：
- 播放列表：`tracks`
- 音频元数据：`audioMetadata`
- 当前播放曲目、进度：页面组件内静态展示

后续可接入：
- 本地音乐库扫描：曲目、艺术家、专辑、封面。
- 播放器状态：播放/暂停、进度、输出设备。
- 文件元数据解析服务。

## 情报中心

```ts
type IntelCard = {
  title: string;
  source: string;
  priority: "high" | "medium" | "low" | string;
};

type IntelSource = string;
type CollectionStep = string;
```

当前 mock：
- 来源列表：`intelSources`
- 情报卡片：`intelCards`
- 采集步骤：`collectionSteps`

后续可接入：
- local-intel 服务：来源状态、采集结果、摘要。
- 报告生成入口：选中条目、报告草稿。
- 任务中心：采集进度、失败日志。

## 小组件

```ts
type ClipboardItem = string;

type SystemMetric = {
  label: string;
  value: string;
};
```

当前 mock：
- 剪贴板：`clipboardItems`
- 系统指标：`systemMetrics`
- 计时器与便签：页面组件内静态展示

后续可接入：
- 本地计时器状态。
- 用户便签存储。
- 剪贴板历史。
- 系统监控数据。

## Replacement Strategy

当前所有 mock 数据集中在：
- `src/data/pageRegistry.js`
- `src/data/mockData.js`

后续建议替换顺序：
1. 保持组件 props 结构不变，先把 mock data 替换为 repository/service adapter。
2. 快捷键仍走 `usePageNavigation`，将 Electron global shortcut 映射为同一套导航 action。
3. Page Registry 保持稳定，真实模块只补充状态、计数和可用性。
4. 高风险操作通过 Preload API 暴露受限方法，Renderer 不直接访问敏感路径、API Key 或 shell 权限。
