# Phase 2: HTTP Server + API Routes

## Overview
- **Priority:** High (core backend)
- **Status:** Complete
- **Effort:** 2h

HTTP server using Node.js `http` module. REST API for profile CRUD + WS upgrade. Security via token in URL. Auto-shutdown on idle.

## Requirements

### Functional
- Start server on port 0 (OS auto-assign), bind 127.0.0.1
- Generate random security token, include in URL
- Serve dashboard HTML at `GET /`
- REST API endpoints for profile operations
- WebSocket upgrade at `/ws`
- Auto-open browser with full URL
- Auto-shutdown after 10min idle
- Graceful Ctrl+C handling

### Non-functional
- < 150 LOC
- Zero dependencies
- Cross-platform browser open

## API Routes

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/` | Serve HTML | Dashboard page (from template module) |
| GET | `/api/profiles` | listProfiles | All profiles with meta + active marker |
| GET | `/api/check/:name` | checkToken | Run `claude auth status` for profile (slow, stream via WS) |
| POST | `/api/switch/:name` | switchProfile | Switch active profile |
| POST | `/api/save` | saveCurrent | Save current credentials as profile |
| DELETE | `/api/delete/:name` | deleteProfile | Remove profile |

### Response Format

```json
{ "ok": true, "data": {...} }
{ "ok": false, "error": "message" }
```

## Related Code Files

| Action | File | Description |
|--------|------|-------------|
| CREATE | `lib/dashboard-server.cjs` | HTTP server, routing, lifecycle |
| CREATE | `lib/dashboard-api-handlers.cjs` | API request handlers (modularized for clarity) |
| READ | `lib/dashboard-websocket.cjs` | WS upgrade handler (Phase 1) |
| READ | `lib/dashboard-template.cjs` | HTML template (Phase 3) |
| READ | `lib/profile-commands.cjs` | Reuse existing profile operations |
| READ | `lib/profile-extras.cjs` | Reuse getAuthStatus |

## Architecture

```
Browser ──GET /──→ Server ──→ Serve HTML template
Browser ──REST──→ Server ──→ Call profile-commands functions ──→ JSON response
Browser ──WS────→ Server ──→ Real-time updates (check results, status changes)
```

### Request Flow
1. Parse URL + validate token query param
2. Match route (method + pathname)
3. Extract `:name` param from path
4. Call profile-commands function
5. JSON response (or WS broadcast for async ops)

## Implementation Steps

1. Create `lib/dashboard-server.cjs`
2. Implement `startServer()`:
   - Generate token: `crypto.randomBytes(16).toString('hex')`
   - Create `http.createServer()` with request handler
   - Listen on `{ host: '127.0.0.1', port: 0 }`
   - On `listening`: get assigned port, build URL, open browser, print URL
   - On `upgrade`: delegate to `handleUpgrade` from WS module
3. Implement request router:
   - Parse `req.url` with `new URL()`
   - Validate `?token=xxx` on all routes
   - Match route: simple switch on `method + pathname pattern`
   - Extract `:name` from path segments
4. Implement API handlers (reuse profile-commands):
   - `listProfiles()`: read profiles dir, return meta array
   - `checkToken(name)`: spawn `claude auth status`, WS broadcast result
   - `switchProfile(name)`: call `cmdSwitch` logic (not process.exit)
   - `saveCurrent()`: call `cmdSave` logic
   - `deleteProfile(name)`: call `cmdDelete` logic
5. Implement idle timer:
   - Reset on every request/WS message
   - After 10min: `server.close()`, log shutdown
6. Implement cross-platform `openBrowser(url)`:
   - Windows: `start "" "url"` (via `child_process.exec`)
   - macOS: `open "url"`
   - Linux: `xdg-open "url"`
7. Export: `startServer`

## Key Design Decisions

### Reuse vs. call CLI
Profile operations (switch, save, delete) should call internal functions directly — NOT shell out to `ccprofiles` CLI. Avoids process.exit() side effects.

Need to extract core logic from profile-commands that doesn't call `process.exit()`. Two options:
- **Option A:** Refactor profile-commands to return results instead of exit → breaking change
- **Option B:** Create thin wrapper functions in dashboard-server that replicate logic → some duplication

**Recommendation:** Option B for now. Keep existing CLI functions untouched. Dashboard handlers reuse internal helpers (getActiveProfile, backupBase, etc.) directly.

### Token check async pattern
`claude auth status` takes 2-3s. Dashboard should:
1. REST endpoint starts check → returns immediately `{ ok: true, status: 'checking' }`
2. WS broadcasts result when done: `{ type: 'check-result', name, valid, email }`

## Todo List

- [x] Create `lib/dashboard-server.cjs`
- [x] Create `lib/dashboard-api-handlers.cjs` (modularized API logic)
- [x] Implement `startServer()` with port 0 + token
- [x] Implement request router with token validation
- [x] Implement GET `/api/profiles` handler
- [x] Implement POST `/api/switch/:name` handler
- [x] Implement POST `/api/save` handler
- [x] Implement DELETE `/api/delete/:name` handler
- [x] Implement GET `/api/check/:name` (async via WS)
- [x] Implement idle auto-shutdown (10min)
- [x] Implement cross-platform `openBrowser()`
- [x] Wire up WS upgrade to Phase 1 module

## Success Criteria

- Server starts on random port, prints URL
- Browser opens automatically
- All API endpoints return correct JSON
- Token validation rejects unauthorized requests
- WS broadcasts check results in real-time
- Server auto-shuts down after idle timeout

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| `process.exit()` in profile-commands | High | Dashboard handlers use internal helpers, not CLI functions |
| Browser not opening | Low | Print URL to console as fallback |
| Token check hangs | Medium | 10s timeout on `execSync`, catch error |

## Security Considerations

- Bind 127.0.0.1 only — no network exposure
- Random 32-char hex token in URL — prevents CSRF from other local apps
- No sensitive data in HTML template (loaded via API)
- Token validated on every request including WS upgrade
