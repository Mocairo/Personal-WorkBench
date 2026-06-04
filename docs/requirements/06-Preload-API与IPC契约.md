# 06 Preload API 与 IPC 契约

## 目标

Preload API 是 Renderer 与本地能力之间的唯一入口。它的职责是暴露稳定、窄口径、可验证的接口，让页面可以使用本地能力，同时不直接接触 Node、文件系统、Git、数据库、进程或 Secrets。

## 设计原则

- 只暴露白名单 API。
- 按业务命名空间组织。
- 所有参数必须可序列化。
- 所有返回值使用统一结果结构。
- 所有危险操作必须经过权限策略。
- 所有长任务返回 `taskId`，进度通过事件订阅。
- Renderer 不接触 API Key、Token、真实进程对象和数据库连接。

## 统一返回结构

同步短操作和普通异步操作建议返回：

```ts
type ApiResult<T> = {
  ok: boolean
  data?: T
  error?: {
    code: string
    message: string
    detail?: string
    retryable?: boolean
  }
}
```

长任务建议返回：

```ts
type TaskRef = {
  taskId: string
  type: string
  status: "queued" | "running" | "success" | "failed" | "cancelled"
}
```

进度事件建议包含：

```ts
type TaskEvent = {
  taskId: string
  type: string
  stage: string
  message: string
  percent?: number
  status: "queued" | "running" | "success" | "failed" | "cancelled"
  error?: ApiResult<never>["error"]
}
```

## API 命名空间

### window.api.system

职责：窗口、文件选择、全局状态、后台任务、设置入口。

接口候选：

- `getAppStatus()`
- `getSettingsSummary()`
- `openSettings(section)`
- `selectDirectory(options)`
- `selectFile(options)`
- `listTasks(filter)`
- `getTask(taskId)`
- `cancelTask(taskId)`
- `onTaskEvent(callback)`

### window.api.kb

职责：知识库导入、索引、检索、RAG。

接口候选：

- `listSources()`
- `addSource(source)`
- `removeSource(sourceId)`
- `startIndex(sourceId | scope)`
- `getIndexStatus()`
- `search(query, options)`
- `ask(question, options)`
- `getDocument(documentId)`
- `getChunk(chunkId)`

### window.api.codeRepo

职责：本地仓库管理、Git、搜索、结构解析、报告。

接口候选：

- `listRepositories()`
- `addRepository(path)`
- `removeRepository(repoId)`
- `getRepositoryStatus(repoId)`
- `getGitSummary(repoId)`
- `search(repoId, query, options)`
- `scanRepository(repoId, options)`
- `getSymbolTree(repoId)`
- `getDependencyGraph(repoId)`
- `askCode(repoId, question, options)`
- `generateDiagram(repoId, options)`

### window.api.agent

职责：聊天、Agent 配置、模型选择、工具调用、任务日志。

接口候选：

- `listSessions()`
- `createSession(options)`
- `sendMessage(sessionId, message, options)`
- `stopRun(runId)`
- `listAgents()`
- `getAgent(agentId)`
- `saveAgent(agent)`
- `listTools()`
- `setToolPermission(agentId, toolId, policy)`
- `getRunLog(runId)`

### window.api.intel

职责：local-intel 接入、服务状态、报告和配置入口。

接口候选：

- `getServiceStatus()`
- `startService()`
- `stopService()`
- `restartService()`
- `getDashboardSummary()`
- `listReports()`
- `openReport(reportId)`
- `getWatchRadar()`
- `getSourceHealth()`
- `openIntelConfig()`
- `runUpdateNow()`

### window.api.music

职责：本地音乐库、播放控制、播放列表。

接口候选：

- `listLibraries()`
- `addLibrary(path)`
- `scanLibrary(libraryId)`
- `searchTracks(query, options)`
- `play(trackId)`
- `pause()`
- `resume()`
- `next()`
- `previous()`
- `getPlaybackState()`
- `savePlaylist(playlist)`

### window.api.voice

职责：ASR、TTS 和语音助手扩展。

接口候选：

- `getVoiceStatus()`
- `startDictation(options)`
- `stopDictation()`
- `speak(text, options)`
- `stopSpeaking()`
- `sendVoiceCommand(command, context)`

## IPC Channel 命名规范

建议格式：

```text
<namespace>:<resource>:<action>
```

示例：

- `kb:source:list`
- `kb:index:start`
- `codeRepo:git:summary`
- `codeRepo:diagram:generate`
- `agent:session:sendMessage`
- `agent:tool:setPermission`
- `intel:service:start`
- `music:playback:play`
- `voice:tts:speak`

事件格式：

- `task:event`
- `service:event`
- `agent:run:event`
- `music:playback:event`

## 权限与参数校验

主进程 handler 必须负责：

- 校验参数类型和必填字段。
- 校验路径是否在允许范围内。
- 校验工具调用是否被授权。
- 校验命令执行参数。
- 隐藏敏感错误细节。
- 记录审计日志。

Renderer 侧校验只用于体验，不作为安全依据。

## 错误码建议

通用错误码：

- `VALIDATION_ERROR`
- `NOT_FOUND`
- `PERMISSION_DENIED`
- `SERVICE_UNAVAILABLE`
- `PROVIDER_NOT_CONFIGURED`
- `TASK_FAILED`
- `TIMEOUT`
- `CANCELLED`
- `UNKNOWN_ERROR`

模块错误码：

- `KB_INDEX_EMPTY`
- `KB_PARSE_FAILED`
- `CODE_REPO_NOT_GIT`
- `CODE_SCAN_FAILED`
- `AGENT_TOOL_REJECTED`
- `INTEL_SERVICE_NOT_FOUND`
- `MUSIC_FILE_MISSING`
- `VOICE_DEVICE_UNAVAILABLE`

## 第一阶段验收口径

- 每个页面只能通过 `window.api.*` 使用本地能力。
- 每个 API 命名空间职责清晰。
- 长任务有统一进度模型。
- 错误结构统一。
- IPC channel 有命名规范。
- 权限和参数校验归主进程负责。
