# Copilot instructions for `aplikacja_epir`

This repository uses **repo-shared AI context**. After cloning on a new machine, GitHub Copilot should treat the files below as the canonical onboarding path.

## Read first

1. `AGENTS.md`
2. `EPIR_AI_ECOSYSTEM_MASTER.md`
3. `EPIR_AI_BIBLE.md`
4. `docs/README.md`

## Core truths

- There is **one Shopify app**: `epir_ai`
- There is **one canonical branch**: `main`
- There is **one canonical codebase**: this repository
- The production architecture is documented in repo and must not be reinvented from memory or from legacy notes

## Architecture rules

- Frontends (`Theme App Extension`, `Hydrogen`) are UI/client layers
- AI logic, integrations, secrets and state belong in backend/workers
- The canonical ingress for assistant/backend communication is the existing Shopify App Proxy and Chat Worker / MCP model
- Use `storefrontId` and `channel` as first-class routing context
- Do not mix buyer-facing `Gemma` behavior with internal/developer-facing assistant behavior

## Documentation hierarchy

Top-level source of truth:

- `EPIR_AI_ECOSYSTEM_MASTER.md`
- `EPIR_AI_BIBLE.md`

Secondary / helper docs:

- `KROKI_URUCHOMIENIA.md`
- `docs/DEPLOYMENT_EPIR.md`
- `docs/SEKRETY_I_MIGRACJE.md`
- `docs/ANALYTICS_KB.md`
- other `docs/*.md`

If a helper document conflicts with a top-level document, the top-level document wins.

## Working rules

- Do not assume hidden local state on another machine
- Do not rely on local stash, local prompts or local memory as the only source of context
- When making architecture-sensitive changes, always ground decisions in the repo documents above
- Prefer small, reviewable changes and avoid emergency runtime hacks when migrations/configuration are the correct layer

## Goal

A newly cloned repo should provide enough shared context for Copilot to reason about the same architecture, rules and onboarding flow as on any other machine.
