# Contributing to AgentX

Thanks for your interest in AgentX! Contributions of all kinds are welcome: bug reports, features, docs, translations.

## Development setup

Prerequisites: Rust ≥ 1.93, Node ≥ 20, Python 3.12, PostgreSQL 16, Redis 7 (or Docker).

```bash
git clone https://github.com/OpenAgentXai/agentx.git && cd agentx
cp .env.example .env

# API (runs migrations on startup)
cd backend/rust-api && cargo run

# Analytics
cd backend/python-services && pip install -r requirements.txt pytest
uvicorn app.main:app --port 8000

# Frontend
cd frontend && npm install && npm run dev
```

## Running tests

```bash
cd backend/rust-api && cargo test
cd backend/python-services && pytest tests/ -q
cd frontend && npx tsc --noEmit && npm run build
```

CI (GitHub Actions) runs the same three jobs on every PR — they must be green.

## Pull requests

1. Fork, create a branch from `main` (`feat/...`, `fix/...`).
2. Keep PRs focused; include tests for new logic.
3. Describe **what** and **why** in the PR body.

## Translations

UI strings live in [`frontend/src/lib/i18n.ts`](frontend/src/lib/i18n.ts) — 8 locales (en, fr, es, de, ar, zh, ja, pt). To improve a translation or add a language, edit the dictionaries and the `LOCALES` map. Every key must exist in `en` (used as fallback).

## Reporting bugs

Open a GitHub issue with steps to reproduce, expected vs actual behavior, and environment details. For security vulnerabilities, see [SECURITY.md](SECURITY.md) — do **not** open a public issue.
