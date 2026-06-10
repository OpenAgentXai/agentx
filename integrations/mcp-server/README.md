# AgentX MCP Server

Put any [MCP](https://modelcontextprotocol.io)-compatible AI agent under **AgentX governance**: identity, ABAC permission checks, audit trail and inter-agent messaging — without changing the agent's code.

## How it works

```
Claude / any MCP agent ──stdio──▶ agentx-mcp ──HTTPS──▶ AgentX Rust API
                                                          │  ABAC policy engine
                                                          │  Audit log
                                                          └  Anomaly detection
```

The server authenticates with an **agent API key** (created in the AgentX dashboard → Agent → Credentials) and exposes five tools:

| Tool | What it does |
|---|---|
| `agentx_whoami` | Authenticate and return the agent's identity, status and rate limits |
| `agentx_check_permissions` | List resources/actions allowed or denied by the agent's policies |
| `agentx_declare_action` | Declare an action **before** doing it — policy decision (allow/deny) + audit record; supports `dry_run` |
| `agentx_send_message` | Send a message/handoff to another agent via a channel |
| `agentx_receive_messages` | Poll a channel for pending messages |

## Setup

```bash
cd integrations/mcp-server && npm install
```

Claude Desktop / Claude Code configuration:

```jsonc
{
  "mcpServers": {
    "agentx": {
      "command": "node",
      "args": ["/path/to/agentx/integrations/mcp-server/index.js"],
      "env": {
        "AGENTX_API_URL": "http://localhost:8080",
        "AGENTX_API_KEY": "agx_..."
      }
    }
  }
}
```

## Recommended agent prompt

> Before any privileged operation (file write, API call, database access), call `agentx_declare_action` with the action and resource. Proceed only if `allowed` is true.

This gives you a complete, queryable audit trail of everything your agents attempted — allowed or denied — in the AgentX dashboard.
