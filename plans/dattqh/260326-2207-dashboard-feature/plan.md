---
title: "ccprofiles dashboard command"
description: "Browser-based dashboard for viewing/managing Claude Code profiles with real-time WebSocket updates"
status: complete
priority: P2
effort: 6h
branch: main
tags: [feature, frontend, backend, cli]
created: 2026-03-26
completed: 2026-03-26
---

# ccprofiles dashboard command

## Overview

Add `ccprofiles dashboard` command that spins up a local HTTP server with WebSocket support, opens browser with a single-page dashboard to view/manage all profiles. Zero new dependencies.

## Context

- Brainstorm: [brainstorm report](../reports/brainstorm-260326-2207-dashboard-feature.md)
- Codebase: 4 lib files (~350 LOC total), zero dependencies, Node.js 18+ only

## Phases

| # | Phase | Status | Effort | Link |
|---|-------|--------|--------|------|
| 1 | WebSocket implementation | Complete | 1h | [phase-01](./phase-01-websocket-implementation.md) |
| 2 | HTTP server + API routes | Complete | 2h | [phase-02](./phase-02-http-server-api-routes.md) |
| 3 | Dashboard HTML template | Complete | 2h | [phase-03](./phase-03-dashboard-html-template.md) |
| 4 | CLI integration + docs + tests | Complete | 1h | [phase-04](./phase-04-cli-integration-docs-tests.md) |

## Dependencies

- Phase 2 depends on Phase 1 (WS module)
- Phase 3 depends on Phase 2 (API contract)
- Phase 4 depends on all previous phases

## Key Constraints

- Zero new npm dependencies
- Bind 127.0.0.1 only + random token for CSRF protection
- Port 0 (OS auto-assign)
- Auto-shutdown after 10min idle
- Cross-platform: Windows/macOS/Linux
