# 10 Agent 与 LLM 运行时

## 目标

Agent Runtime 是桌面控制台的智能调度层。它负责把用户意图、上下文、工具和 LLM Provider 组织起来，让 Agent 能安全使用本地能力。

## 基本概念

### Agent

Agent 是一组配置：

- 名称。
- 描述。
- System Prompt。
- 默认模型。
- 可用工具。
- 权限策略。
- 记忆策略。
- 输出风格。

### Session

Session 是一次连续对话，保存消息、上下文选择、运行记录和结果。

### Run

Run 是一次用户消息触发的执行。一次 Run 可能包含多次 LLM 调用和多次工具调用。

### Tool

Tool 是 Agent 可调用的本地能力，例如知识库检索、代码仓库搜索、情报查询、文件读取、图生成。

## LLM Provider Adapter

Provider Adapter 统一处理：

- Provider 类型。
- Base URL。
- API Key。
- 模型名称。
- 请求参数。
- 流式输出。
- 超时。
- 重试。
- 错误归一化。
- 使用量记录。

Provider 类型：

- OpenAI-compatible。
- MiMo。
- Local Model。
- Embedding。
- ASR/TTS。

业务模块不直接访问 Provider API。

## 上下文构建

Context Builder 负责把多来源上下文组装给 LLM。

上下文来源：

- 当前会话历史。
- 用户选中的文档。
- 知识库检索结果。
- 代码仓库检索结果。
- 情报中心条目。
- 当前页面状态。
- 工具调用结果。

上下文规则：

- 控制 token 预算。
- 优先保留用户明确选择的上下文。
- 保留来源引用。
- 对长内容做摘要或切片。
- 不把 Secrets 放入上下文。

## 工具调用

工具调用流程：

1. Runtime 根据 Agent 配置加载工具列表。
2. LLM 请求工具调用。
3. Permission Gate 校验工具、参数和上下文。
4. Tool Executor 调用本地能力。
5. 结果返回 Runtime。
6. Runtime 继续调用 LLM 或结束 Run。
7. ToolCall 写入日志。

工具权限分级：

- 只读：搜索、读取状态、读取文档片段。
- 本地写入：保存笔记、生成报告、更新播放列表。
- 服务控制：启动、停止、重启本地服务。
- 命令执行：运行脚本、Git 写操作、文件修改。

第一阶段默认开放只读工具；高权限工具需要显式配置。

## Agent Management

Agent Management 页面管理：

- Agent 列表。
- Prompt。
- 默认模型。
- 工具权限。
- 记忆策略。
- 任务模板。
- 运行历史。
- 错误记录。

它不承载聊天主体验，聊天在 Agent Chat 页面完成。

## 日志与审计

每次 Run 记录：

- 用户消息。
- 使用 Agent。
- 使用模型。
- 上下文来源摘要。
- 工具调用列表。
- 权限决策。
- 错误信息。
- 最终结果摘要。

审计日志用于解释 Agent 为什么能访问某个资源，以及失败时发生了什么。

## 失败处理

失败场景：

- Provider 未配置。
- Provider 超时。
- 工具权限不足。
- 工具执行失败。
- 上下文过长。
- 用户取消。

处理规则：

- Provider 失败不删除会话。
- 工具失败返回可读错误，并保留 Run 日志。
- 用户取消应停止后续工具调用。
- 上下文过长时由 Context Builder 降级摘要。

## 第一阶段验收口径

- Agent、Session、Run、Tool 概念清晰。
- LLM Provider Adapter 不散落在业务模块中。
- 工具调用有权限分级。
- Agent Chat 和 Agent Management 职责分离。
- 日志足以追踪一次 Agent 执行。
