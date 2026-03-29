# Brainstorm: ccprofiles dashboard command

## Problem Statement
Need browser-based dashboard to view/manage all Claude Code profiles. Current CLI-only interface limits visibility — users want visual overview of all accounts with real-time actions.

## Requirements
- View all profiles (name, email, subscription, token status)
- Switch profiles from browser
- Token health check (real-time per profile)
- Save current / Delete profiles from browser
- Real-time updates via WebSocket

## Evaluated Approaches

### A. Minimal HTTP Server (Node.js built-in `http`)
- REST API + static HTML, zero deps
- **Pros:** Simple, zero deps, ~200-300 LOC
- **Cons:** No real-time updates, polling needed for progress feedback

### B. HTTP + Homegrown WebSocket ✅ CHOSEN
- HTTP server + manual WS handshake via `http` upgrade event
- **Pros:** Real-time updates, zero deps, stream token check results
- **Cons:** +150 LOC for WS, slightly more complex

### C. Static HTML (no server)
- Generate HTML file, open browser
- **Pros:** Simplest
- **Cons:** Cannot switch/delete from browser (no backend)

## Final Solution: Approach B

### Architecture
```
ccprofiles dashboard
    → Start HTTP server on random port (127.0.0.1)
    → Auto-open browser with URL + security token
    → Serve single-page dashboard
    → REST API for CRUD operations
    → WebSocket for real-time updates
    → Auto-shutdown after 10min idle
```

### API Design
| Method | Endpoint | Action |
|--------|----------|--------|
| GET | /api/profiles | List all profiles with meta |
| GET | /api/check/:name | Token health check for profile |
| POST | /api/switch/:name | Switch to profile |
| POST | /api/save | Save current credentials |
| DELETE | /api/delete/:name | Delete profile |
| WS | /ws | Real-time updates (switch, delete, check progress) |

### New Files
| File | LOC | Purpose |
|------|-----|---------|
| `lib/dashboard-server.cjs` | ~150 | HTTP + WS server, API routes, lifecycle |
| `lib/dashboard-websocket.cjs` | ~60 | Minimal WS implementation (no deps) |
| `lib/dashboard-template.cjs` | ~200 | HTML/CSS/JS template generator |

### Modified Files
| File | Change |
|------|--------|
| `bin/ccprofiles.cjs` | Add `dashboard` case to switch |
| `lib/profile-extras.cjs` | Add `cmdDashboard()` function |
| `skill/SKILL.md` | Add `/profile dashboard` to docs |
| `README.md` | Add dashboard command to docs |

### Key Decisions
- **Zero dependencies** — WS handshake implemented manually (~60 LOC)
- **Security** — bind 127.0.0.1 only + random token in URL
- **Port** — OS auto-assign (port 0) to avoid conflicts
- **Lifecycle** — auto-shutdown after 10min idle, graceful Ctrl+C
- **Data source** — `claude auth status` CLI for real-time info
- **Cross-platform open** — `start` (Win), `open` (macOS), `xdg-open` (Linux)

### Risks
| Risk | Mitigation |
|------|------------|
| `claude auth status` slow (~2-3s) | Lazy-load per profile, WS streams results |
| Port conflict | Port 0 auto-assign |
| Browser not opening | Print URL to console as fallback |
| WS implementation bugs | Keep minimal (text frames only, no binary) |

## Success Criteria
- `ccprofiles dashboard` opens browser with working dashboard
- All CRUD operations work from browser
- Token check streams real-time results
- Zero new dependencies
- Works on Windows/macOS/Linux
