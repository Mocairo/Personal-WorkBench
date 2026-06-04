# Local Sources Config

The Electron main process can persist local source paths in a JSON file. Renderer pages still read data only through `window.desktopApi`; they do not access this file directly.

Default Electron location:

```text
<Electron userData>\config\local-sources.json
```

Development override:

```bash
set LOCAL_SOURCES_CONFIG=D:\path\to\local-sources.json
npm run electron:dev
```

Expected shape:

```json
{
  "paths": {
    "agentChatSession": "D:\\path\\to\\agent-chat\\session.json",
    "agentManagementConfig": "D:\\path\\to\\agents\\agents.json",
    "codeRepositoryRoot": "D:\\path\\to\\repo",
    "knowledgeBaseRoot": "D:\\path\\to\\docs",
    "localIntelRoot": "D:\\path\\to\\local-intel",
    "localMusicRoot": "D:\\path\\to\\music",
    "widgetsDiskRoot": "D:\\"
  }
}
```

Path priority:

1. Explicit provider options used by tests.
2. Persisted `local-sources.json`.
3. Existing environment variables such as `LOCAL_MUSIC_ROOT`.
4. Built-in defaults and sample files.

Settings behavior:

- Each source row has a `Choose` action.
- File sources open an `openFile` dialog.
- Directory sources open an `openDirectory` dialog.
- A confirmed selection is saved immediately by the Electron main process.
- `Refresh` reloads the current source health after saving or when paths change outside the UI.
