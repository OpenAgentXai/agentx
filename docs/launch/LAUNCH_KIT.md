# AgentX Launch Kit

Ready-to-paste posts for the public launch. Post them yourself from your accounts — timing tip: Tuesday–Thursday, 14:00–16:00 UTC (morning US, afternoon EU) gets the best Hacker News traction.

---

## 1. Hacker News — "Show HN"

> Submit at https://news.ycombinator.com/submit — URL = the GitHub repo, NOT the demo.

**Title** (≤ 80 chars):

```
Show HN: AgentX – open-source identity and access management for AI agents
```

**URL:** `https://github.com/OpenAgentXai/agentx`

**First comment (post it yourself immediately after submitting):**

```
Hi HN! I built AgentX because companies are deploying autonomous AI agents far
faster than they can govern them. Okta's own research says 88% of organizations
have had AI-agent security incidents, but only 22% treat agents as governed
identities.

AgentX answers four questions about every agent: Who is it? What can it do?
What did it do? How do I stop it?

- Each agent gets an identity, lifecycle (active → suspended → revoked) and
  Argon2-hashed API keys with zero-downtime rotation
- ABAC policy engine: allow/deny by resource + action, wildcards, priorities,
  deny-overrides, default-deny — with a simulator to test before deploying
- Full audit trail + ML anomaly detection (Isolation Forest + z-scores:
  volume spikes, off-hours activity, permission-denial storms)
- MCP server included: any MCP-compatible agent (Claude etc.) can run under
  AgentX governance — it declares actions before executing them and gets an
  allow/deny + audit record
- Self-hosted (docker compose up), Rust API + Python analytics + Next.js,
  8 UI languages, MIT

Live demo: https://agentx-platform.netlify.app (admin@agentx.dev / AgentX2024!)

Unlike Okta's and Microsoft's new agent-identity products, this is open
source and runs on your infrastructure. Happy to answer anything about the
architecture (Axum + sqlx, FastAPI + scikit-learn) or the threat model.
```

---

## 2. Reddit — r/selfhosted

**Title:**

```
AgentX — self-hosted IAM for AI agents (ABAC policies, audit, anomaly detection) [MIT]
```

**Body:**

```
I open-sourced AgentX, an identity & access management platform for AI agents.

If you're running autonomous agents (LLM bots, pipelines, scrapers) and want to
control what they can touch, AgentX gives each agent an identity + API key,
evaluates every action against ABAC policies (default-deny), records a full
audit trail, and flags behavioral anomalies with ML.

Highlights for this sub:
- One `docker compose up` brings up everything (Rust API, Python analytics, Next.js UI, Postgres, Redis)
- No phone-home, no license keys, MIT
- 8 UI languages, dark mode by default 😄
- MCP server included so Claude-style agents can be governed too
- ~10 MB desktop shells for macOS/Windows via Tauri

Repo: https://github.com/OpenAgentXai/agentx
Live demo: https://agentx-platform.netlify.app (admin@agentx.dev / AgentX2024!)

Feedback very welcome — especially on the hardening checklist in SECURITY.md.
```

> Also worth posting (adapted): r/rust ("built with Axum + sqlx"), r/opensource, r/AI_Agents.

---

## 3. X / Twitter — thread

```
1/ AI agents are getting deployed faster than anyone can govern them.

88% of orgs report agent security incidents. Only 22% treat agents as identities.

So I open-sourced AgentX: IAM for AI agents. 🧵

2/ Every agent gets:
🪪 an identity + lifecycle (suspend/revoke in one click)
🔑 hashed API keys with zero-downtime rotation
🛡️ ABAC policies — default-deny, deny-overrides, wildcards
📜 a complete audit trail

3/ The fun part: ML anomaly detection.

Isolation Forest + z-scores flag volume spikes, off-hours activity and
permission-denial storms — per agent, in real time, with a risk score.

4/ It's MCP-native. Drop the bundled MCP server into Claude (or any MCP agent)
and it has to declare actions BEFORE executing them.

Policy says no → the agent is blocked, and you have the audit record.

5/ Self-hosted, MIT, docker compose up.
Rust (Axum) + Python (FastAPI/sklearn) + Next.js. 8 languages.

⭐ https://github.com/OpenAgentXai/agentx
🖥️ live demo: https://agentx-platform.netlify.app
```

---

## 4. Elevator pitch (réutilisable partout)

**EN:** Open-source identity & access management for AI agents — every agent gets an identity, ABAC policies decide what it can do (default-deny), everything is audited, and ML flags anomalous behavior. Self-hosted, MCP-native, MIT.

**FR :** La gestion d'identité et d'accès open-source pour agents IA — chaque agent a une identité, des politiques ABAC décident de ce qu'il peut faire (refus par défaut), tout est audité, et le ML détecte les comportements anormaux. Auto-hébergé, compatible MCP, MIT.
