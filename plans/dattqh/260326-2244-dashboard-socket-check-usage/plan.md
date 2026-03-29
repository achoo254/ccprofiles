---
title: "Fix dashboard socket, check loading, and usage display"
description: "Fix 3 dashboard bugs: WS reliability, check infinite loading, auto-check on load"
status: complete
priority: P1
effort: 3h
branch: main
tags: [bugfix, dashboard, websocket]
created: 2026-03-26
---

# Fix Dashboard Socket + Check + Usage

## Context

- Brainstorm: [report](../reports/brainstorm-260326-2244-dashboard-socket-check-usage-fixes.md)
- Original dashboard plan: [260326-2207](../260326-2207-dashboard-feature/plan.md) (complete)

## Problem

1. WS connection fails silently, only 3 retries
2. Check button shows spinner forever (result only via WS — if WS dead, lost)
3. No token status shown on initial load

## Phases

| # | Phase | Status | Files |
|---|-------|--------|-------|
| 1 | Replace execSync with spawn (async) | Complete | `dashboard-api-handlers.cjs` |
| 2 | Add check result cache + new endpoints | Complete | `dashboard-api-handlers.cjs`, `dashboard-server.cjs` |
| 3 | WS reliability + connection indicator | Complete | `dashboard-template.cjs` |
| 4 | Auto-check on load + client timeout fallback | Complete | `dashboard-template.cjs`, `dashboard-api-handlers.cjs` |
| 5 | Test all scenarios | Complete | 21/21 tests pass |

## Key Decisions

- `claude auth status` only checks active profile → non-active profiles read `expiresAt` from `.credentials.json`
- Dual delivery: WS for real-time + HTTP fallback for reliability
- Spawn parallel checks on load for all profiles
- Infinite WS retry with capped exponential backoff (max 8s)
