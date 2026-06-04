# Agent Chat Local Session

Agent Chat currently reads a local JSON session only. It does not call an LLM, stream tokens, execute tools, or write chat history.

Default path:

```text
agent-chat\session.json
```

Override options:

```bash
set AGENT_CHAT_ROOT=D:\path\to\agent-chat-folder
set AGENT_CHAT_SESSION=D:\path\to\session.json
npm run electron:dev
```

Expected shape:

```json
{
  "chatMessages": [
    {
      "role": "user",
      "text": "Summarize this workspace"
    },
    {
      "role": "assistant",
      "text": "I found docs and Electron adapters."
    }
  ],
  "contextItems": [
    "docs/ui-data-contract.md",
    {
      "label": "src/electron/mainProvider.js"
    }
  ],
  "toolCalls": [
    {
      "title": "Read docs",
      "meta": "ui-data-contract",
      "state": "done"
    }
  ]
}
```

Normalization rules:

- Unknown message roles are displayed as `assistant`.
- Empty messages, context items, and tool calls are ignored.
- Missing `meta` defaults to `local session`.
- Missing `state` defaults to `done`.
