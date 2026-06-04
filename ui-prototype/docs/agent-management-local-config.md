# Agent Management Local Config

Agent Management currently reads a local JSON config only. It does not start or control an agent runtime yet.

Default path:

```text
agents\agents.json
```

Override options:

```bash
set AGENT_MANAGEMENT_ROOT=D:\path\to\agents-folder
set AGENT_MANAGEMENT_CONFIG=D:\path\to\agents.json
npm run electron:dev
```

Expected shape:

```json
{
  "agents": [
    {
      "name": "Repo Analyst",
      "state": "online",
      "tools": ["git", "parser"]
    }
  ],
  "permissionMetrics": ["File read", "Command execution", "Network access", "Model calls"]
}
```
