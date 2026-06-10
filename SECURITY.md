# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security vulnerabilities.

Report privately via [GitHub Security Advisories](https://github.com/OpenAgentXai/agentx/security/advisories/new) ("Report a vulnerability"). You should receive a response within 72 hours.

Please include: affected component (Rust API / Python analytics / frontend / MCP server), reproduction steps, and impact assessment.

## Supported versions

| Version | Supported |
|---|---|
| `main` | ✅ |

## Hardening checklist for self-hosting

- Set strong `JWT_SECRET` and `ENCRYPTION_KEY` (release builds refuse the dev defaults)
- Set `CORS_ORIGIN` to your frontend domain
- Change the demo admin password (or remove the seed data) before exposing publicly
- Run PostgreSQL and Redis on a private network
- Terminate TLS in front of the API (reverse proxy / platform TLS)
