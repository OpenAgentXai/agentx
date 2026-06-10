# ==============================================================================
# AgentX Makefile
# ==============================================================================

COMPOSE := docker compose -f infra/docker-compose.yml --project-name agentx
RUST_DIR := backend/rust-api
PYTHON_DIR := backend/python-services
FRONTEND_DIR := frontend

.DEFAULT_GOAL := help

# ------------------------------------------------------------------------------
# Development
# ------------------------------------------------------------------------------

.PHONY: dev
dev: ## Start all services in development mode
	$(COMPOSE) up --build

.PHONY: dev-detach
dev-detach: ## Start all services in detached mode
	$(COMPOSE) up --build -d

.PHONY: down
down: ## Stop all services
	$(COMPOSE) down

.PHONY: restart
restart: ## Restart all services
	$(COMPOSE) restart

# ------------------------------------------------------------------------------
# Build
# ------------------------------------------------------------------------------

.PHONY: build
build: ## Build all Docker images
	$(COMPOSE) build

.PHONY: build-rust
build-rust: ## Build only the Rust API image
	$(COMPOSE) build rust-api

.PHONY: build-python
build-python: ## Build only the Python analytics image
	$(COMPOSE) build python-analytics

.PHONY: build-frontend
build-frontend: ## Build only the frontend image
	$(COMPOSE) build frontend

# ------------------------------------------------------------------------------
# Testing
# ------------------------------------------------------------------------------

.PHONY: test
test: test-rust test-python ## Run all tests

.PHONY: test-rust
test-rust: ## Run Rust API tests
	cd $(RUST_DIR) && cargo test --all-targets -- --nocapture

.PHONY: test-python
test-python: ## Run Python analytics tests
	cd $(PYTHON_DIR) && python -m pytest tests/ -v --tb=short

.PHONY: test-frontend
test-frontend: ## Run frontend tests
	cd $(FRONTEND_DIR) && npm test

# ------------------------------------------------------------------------------
# Linting
# ------------------------------------------------------------------------------

.PHONY: lint
lint: lint-rust lint-python lint-frontend ## Run all linters

.PHONY: lint-rust
lint-rust: ## Lint the Rust API
	cd $(RUST_DIR) && cargo fmt --all -- --check
	cd $(RUST_DIR) && cargo clippy --all-targets --all-features -- -D warnings

.PHONY: lint-python
lint-python: ## Lint the Python analytics service
	cd $(PYTHON_DIR) && ruff check app/
	cd $(PYTHON_DIR) && ruff format --check app/

.PHONY: lint-frontend
lint-frontend: ## Lint the frontend
	cd $(FRONTEND_DIR) && npm run lint
	cd $(FRONTEND_DIR) && npm run type-check

.PHONY: fmt
fmt: ## Auto-format all code
	cd $(RUST_DIR) && cargo fmt --all
	cd $(PYTHON_DIR) && ruff format app/
	cd $(FRONTEND_DIR) && npx next lint --fix || true

# ------------------------------------------------------------------------------
# Database
# ------------------------------------------------------------------------------

.PHONY: migrate
migrate: ## Run database migrations
	cd $(RUST_DIR) && cargo sqlx migrate run --source ../../database/migrations

.PHONY: migrate-create
migrate-create: ## Create a new migration (usage: make migrate-create NAME=create_users)
	cd $(RUST_DIR) && cargo sqlx migrate add -r $(NAME) --source ../../database/migrations

.PHONY: seed
seed: ## Seed the database with sample data
	$(COMPOSE) exec postgres psql -U agentx -d agentx -f /dev/stdin < database/seed.sql 2>/dev/null || \
		echo "No seed file found at database/seed.sql -- skipping"

.PHONY: db-reset
db-reset: ## Reset the database (drop and recreate)
	$(COMPOSE) exec postgres psql -U agentx -c "DROP DATABASE IF EXISTS agentx;"
	$(COMPOSE) exec postgres psql -U agentx -c "CREATE DATABASE agentx;"
	@echo "Database reset. Run 'make migrate' to re-apply migrations."

.PHONY: db-shell
db-shell: ## Open a psql shell to the database
	$(COMPOSE) exec postgres psql -U agentx -d agentx

# ------------------------------------------------------------------------------
# Logs & Monitoring
# ------------------------------------------------------------------------------

.PHONY: logs
logs: ## Tail logs from all services
	$(COMPOSE) logs -f

.PHONY: logs-api
logs-api: ## Tail Rust API logs
	$(COMPOSE) logs -f rust-api

.PHONY: logs-analytics
logs-analytics: ## Tail Python analytics logs
	$(COMPOSE) logs -f python-analytics

.PHONY: logs-frontend
logs-frontend: ## Tail frontend logs
	$(COMPOSE) logs -f frontend

.PHONY: ps
ps: ## Show running containers
	$(COMPOSE) ps

# ------------------------------------------------------------------------------
# Cleanup
# ------------------------------------------------------------------------------

.PHONY: clean
clean: ## Stop services and remove volumes, images, and orphaned containers
	$(COMPOSE) down -v --remove-orphans --rmi local
	@echo "Cleaned up all AgentX containers, volumes, and local images."

.PHONY: clean-all
clean-all: clean ## Full cleanup including build caches
	docker system prune -f --filter "label=com.docker.compose.project=agentx"
	cd $(RUST_DIR) && cargo clean 2>/dev/null || true
	cd $(FRONTEND_DIR) && rm -rf .next node_modules 2>/dev/null || true
	@echo "Full cleanup complete."

# ------------------------------------------------------------------------------
# Utilities
# ------------------------------------------------------------------------------

.PHONY: env
env: ## Create .env from .env.example if it does not exist
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo ".env created from .env.example -- review and update values."; \
	else \
		echo ".env already exists -- skipping."; \
	fi

.PHONY: shell-api
shell-api: ## Open a shell in the Rust API container
	$(COMPOSE) exec rust-api /bin/bash

.PHONY: shell-analytics
shell-analytics: ## Open a shell in the Python analytics container
	$(COMPOSE) exec python-analytics /bin/bash

.PHONY: health
health: ## Check health of all services
	@echo "--- Rust API ---"
	@curl -sf http://localhost:8080/health && echo "" || echo "UNREACHABLE"
	@echo "--- Python Analytics ---"
	@curl -sf http://localhost:8000/health && echo "" || echo "UNREACHABLE"
	@echo "--- Frontend ---"
	@curl -sf -o /dev/null -w "HTTP %{http_code}" http://localhost:3000 && echo "" || echo "UNREACHABLE"

# ------------------------------------------------------------------------------
# Help
# ------------------------------------------------------------------------------

.PHONY: help
help: ## Show this help message
	@echo "AgentX Development Commands"
	@echo "==========================="
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
