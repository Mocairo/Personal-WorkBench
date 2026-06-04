export const serviceState = [
  { name: "local-intel", value: "running", tone: "good" },
  { name: "index", value: "2 jobs", tone: "warm" },
  { name: "LLM", value: "ready", tone: "good" },
  { name: "tasks", value: "5 active", tone: "cool" },
];

export const homeTasks = [
  { title: "整理 RAG 导入清单", module: "Knowledge Base", time: "09:30" },
  { title: "检查 local-intel 采集结果", module: "情报中心", time: "11:10" },
  { title: "Review repo scan diff", module: "Code Repository", time: "14:00" },
  { title: "同步 Agent tool permissions", module: "Agent Management", time: "16:20" },
];

export const recentActivities = [
  "Knowledge index finished 1,248 chunks",
  "Agent Chat saved a research context",
  "Music library scanned 42 new tracks",
  "Code Repository detected 2 uncommitted files",
];

export const chatMessages = [
  { role: "user", text: "把桌面壳导航的需求整理成第一阶段验收点。" },
  { role: "assistant", text: "已从 Page Registry、快捷键、状态保留和任务中心四个方向归纳。" },
  { role: "user", text: "再补一版面向实现的风险清单。" },
];

export const toolCalls = [
  { title: "Read docs", meta: "05-桌面壳导航", state: "done" },
  { title: "Scan diagrams", meta: "state machine", state: "done" },
  { title: "Draft checklist", meta: "8 acceptance points", state: "running" },
];

export const contextItems = [
  "desktop-shell-navigation.puml",
  "page-switcher-state-machine.puml",
  "05-桌面壳导航",
  "README blueprint",
];

export const knowledgeDocuments = [
  { title: "桌面壳导航与全局体验", tag: "requirements", state: "82%" },
  { title: "知识库详细需求", tag: "rag", state: "ready" },
  { title: "数据模型与存储边界", tag: "storage", state: "queued" },
  { title: "安全权限错误处理", tag: "security", state: "ready" },
];

export const graphNodes = [
  "Shell",
  "Page Registry",
  "State Store",
  "RAG",
  "Task Center",
  "Permissions",
];

export const agents = [
  { name: "Research Curator", state: "online", tools: "browser, rag, report" },
  { name: "Repo Analyst", state: "idle", tools: "git, parser, terminal" },
  { name: "Music Librarian", state: "paused", tools: "metadata, playlist" },
  { name: "Intel Watcher", state: "online", tools: "source, digest, alert" },
];

export const permissionMetrics = ["文件读取", "命令执行", "网络访问", "模型调用"];

export const repoFiles = [
  { name: "docs", meta: "requirements / diagrams" },
  { name: "src", meta: "renderer prototype" },
  { name: "services", meta: "local adapters" },
  { name: "README.md", meta: "blueprint" },
];

export const tracks = [
  { title: "Night Workspace", artist: "Local Library", length: "03:48" },
  { title: "Soft Compile", artist: "Instrumental", length: "04:12" },
  { title: "Pastel Terminal", artist: "Desk Mix", length: "02:56" },
  { title: "Indexing Rain", artist: "Focus Set", length: "05:20" },
];

export const audioMetadata = [
  { label: "Format", value: "FLAC" },
  { label: "Sample Rate", value: "48 kHz" },
  { label: "Tags", value: "focus, local" },
  { label: "Folder", value: "Music / Workspace" },
];

export const intelSources = [
  "local-intel service",
  "RSS digest",
  "repo monitor",
  "manual inbox",
];

export const intelCards = [
  { title: "本地服务可靠性观察", source: "local source", priority: "high" },
  { title: "Agent 工具权限策略更新", source: "watch list", priority: "medium" },
  { title: "代码索引性能样本", source: "repo signal", priority: "low" },
];

export const collectionSteps = ["Fetch", "Normalize", "Deduplicate", "Summarize"];

export const clipboardItems = [
  "Alt+Space interaction",
  "Page Registry map",
  "Glass depth tokens",
];

export const systemMetrics = [
  { label: "CPU", value: "38%" },
  { label: "Memory", value: "54%" },
  { label: "Disk", value: "71%" },
];
