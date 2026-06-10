#!/usr/bin/env node
/**
 * AgentX MCP Server
 *
 * Exposes AgentX governance as MCP tools so that any MCP-compatible AI agent
 * (Claude, or anything built on the MCP SDK) operates under AgentX identity,
 * ABAC policies and audit logging.
 *
 * Configuration (environment variables):
 *   AGENTX_API_URL  — base URL of the AgentX Rust API (e.g. https://api.example.com)
 *   AGENTX_API_KEY  — the agent's API key (agx_..., created in the AgentX dashboard)
 *
 * Example Claude Desktop / Claude Code configuration:
 *   {
 *     "mcpServers": {
 *       "agentx": {
 *         "command": "npx",
 *         "args": ["agentx-mcp-server"],
 *         "env": {
 *           "AGENTX_API_URL": "https://rust-api-production-9312.up.railway.app",
 *           "AGENTX_API_KEY": "agx_..."
 *         }
 *       }
 *     }
 *   }
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_URL = process.env.AGENTX_API_URL;
const API_KEY = process.env.AGENTX_API_KEY;

if (!API_URL || !API_KEY) {
  console.error("AGENTX_API_URL and AGENTX_API_KEY must be set");
  process.exit(1);
}

async function agentxFetch(method, path, body) {
  const res = await fetch(`${API_URL.replace(/\/$/, "")}${path}`, {
    method,
    headers: {
      "X-Agent-Key": API_KEY,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`AgentX API ${res.status}: ${json?.error?.message ?? text}`);
  }
  return json;
}

function asText(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

const server = new McpServer({
  name: "agentx",
  version: "0.1.0",
});

server.tool(
  "agentx_whoami",
  "Authenticate against AgentX and return this agent's identity, status and rate limits.",
  {},
  async () => asText(await agentxFetch("POST", "/agent/v1/authenticate")),
);

server.tool(
  "agentx_check_permissions",
  "List the resources and actions this agent is allowed or denied by its ABAC policies. Call this before attempting privileged operations.",
  {},
  async () => asText(await agentxFetch("GET", "/agent/v1/permissions")),
);

server.tool(
  "agentx_declare_action",
  "Declare an action against a resource BEFORE executing it. AgentX evaluates ABAC policies (deny-overrides, default-deny), records the decision in the audit log, and returns allowed=true/false. Use dry_run to test without recording.",
  {
    action: z.string().describe("The action to perform, e.g. 'read', 'write', 'delete'"),
    resource: z.string().describe("The target resource, e.g. 'database:users'"),
    dry_run: z.boolean().optional().describe("If true, evaluate without side effects"),
    context: z.record(z.any()).optional().describe("Additional context for policy conditions"),
  },
  async ({ action, resource, dry_run, context }) =>
    asText(
      await agentxFetch("POST", "/agent/v1/action", {
        action,
        resource,
        dry_run: dry_run ?? false,
        ...(context ? { context } : {}),
      }),
    ),
);

server.tool(
  "agentx_send_message",
  "Send a message to another agent through an AgentX collaboration channel (data exchange, command, status update or task handoff).",
  {
    channel_id: z.string().uuid().describe("The AgentX channel UUID"),
    content: z.string().describe("Message content"),
    message_type: z
      .enum(["data", "command", "status", "handoff", "error"])
      .optional()
      .describe("Message type (default: data)"),
  },
  async ({ channel_id, content, message_type }) =>
    asText(
      await agentxFetch("POST", `/agent/v1/channel/${channel_id}/send`, {
        content,
        message_type: message_type ?? "data",
      }),
    ),
);

server.tool(
  "agentx_receive_messages",
  "Receive pending messages from an AgentX collaboration channel.",
  {
    channel_id: z.string().uuid().describe("The AgentX channel UUID"),
    limit: z.number().int().min(1).max(100).optional().describe("Max messages to fetch"),
  },
  async ({ channel_id, limit }) =>
    asText(
      await agentxFetch(
        "GET",
        `/agent/v1/channel/${channel_id}/receive${limit ? `?limit=${limit}` : ""}`,
      ),
    ),
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("AgentX MCP server running (stdio)");
