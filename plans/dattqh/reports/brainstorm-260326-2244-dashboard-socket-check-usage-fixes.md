# Brainstorm: Dashboard Socket + Check + Usage Fixes

## Problem Statement

3 issues on dashboard (`ccprofiles dashboard`):

1. **WebSocket fails silently** — no error feedback, only 3 retries, user unaware WS is dead
2. **Check spinner forever** — result delivered via WS only; if WS dead → result lost, spinner infinite
3. **No usage info on load** — all cards show "? unknown" until user manually clicks Check

## Root Cause Analysis

### Issue 1: WS Connection
- No `ws.onerror` handler → errors swallowed
- Max 3 retries then gives up permanently
- No visual indicator of WS state
- No heartbeat → stale connections undetected

### Issue 2: Check Loading Forever
- **Architecture flaw**: HTTP returns `{ status: 'checking' }`, actual result ONLY via WS broadcast
- If WS dead at broadcast time → result vanishes permanently
- No client-side timeout → spinner spins forever
- `execSync` blocks event loop 2-10s → WS can't process frames during check

### Issue 3: No Usage on Load
- `renderCard()` hardcodes `"? unknown"` for status
- No auto-check triggered after `loadProfiles()`
- `meta.json` only stores email + subscriptionType from save time, not live token validity

## Evaluated Approaches

### Approach A: Patch Current Architecture (WS-only results)
**Pros:** Minimal changes, quick fix
**Cons:** Fragile — still depends on WS for check results; if WS hiccups during broadcast, result lost

Changes:
- Add WS error handler + infinite retry with capped backoff
- Add client-side 15s timeout on check → show error + re-enable buttons
- Add auto-check-all on load

**Verdict:** Band-aid. Doesn't fix the fundamental single-point-of-failure.

### Approach B: Dual Delivery — WS + HTTP Polling Fallback (Recommended)
**Pros:** Robust — check works even without WS; WS adds real-time bonus
**Cons:** Slightly more code, need server-side result cache

Changes:
- Server stores last check result per profile in memory
- New endpoint: `GET /api/check-result/:name` → returns cached result or `null`
- Client: after 5s without WS result, polls HTTP endpoint
- WS still broadcasts for instant updates
- Replace `execSync` with `spawn` (non-blocking)
- Auto-check all on load via new `GET /api/check-all` endpoint

**Verdict:** Best balance of reliability and simplicity.

### Approach C: Replace WS with SSE for Check Results
**Pros:** SSE auto-reconnects, simpler than WS for server→client push
**Cons:** Major refactor, SSE doesn't support client→server messages, need WS for other features anyway

**Verdict:** Over-engineering for this use case.

## Recommended Solution: Approach B

### 1. WebSocket Reliability (`dashboard-template.cjs`)

```
Client-side changes:
- Add ws.onerror handler (log + trigger reconnect)
- Infinite retry with capped exponential backoff (1s→2s→4s→8s max)
- Connection status indicator in header ("● connected" / "○ reconnecting...")
- Remove MAX_RETRIES=3 limit
```

### 2. Non-blocking Check (`dashboard-api-handlers.cjs`)

```
Server-side changes:
- Replace execSync with child_process.spawn
- Store results in Map: checkResults = new Map()  // name → { valid, email, sub, timestamp }
- Broadcast via WS as before (for connected clients)
- New endpoint: GET /api/check-result/:name → returns cached result
- New endpoint: GET /api/check-all → spawns parallel checks for all profiles
```

Flow:
```
Client clicks Check
  → GET /api/check/:name → { ok: true, status: 'checking' }
  → Server spawns 'claude auth status' (non-blocking)
  → On complete: cache result + broadcast via WS
  → Client gets result via WS → update card ✓

If WS dead (fallback):
  → Client timeout 5s → GET /api/check-result/:name → cached result
  → Update card from HTTP response ✓
```

### 3. Auto-check on Load (`dashboard-template.cjs` + `dashboard-api-handlers.cjs`)

```
Server: GET /api/check-all
  → For each profile, spawn 'claude auth status' in parallel
  → Broadcast results as they complete
  → Cache all results

Client: after loadProfiles() completes
  → Call api('GET', '/api/check-all')
  → Show spinner on all cards
  → Results stream in via WS (or poll fallback)
```

### 4. Check Result for Non-active Profiles

Important consideration: `claude auth status` only checks the CURRENTLY ACTIVE profile's token. To check other profiles, need to temporarily switch credentials or read token expiry from `.credentials.json` directly.

**Practical approach:**
- For active profile: use `claude auth status` (authoritative)
- For non-active profiles: read `.credentials.json`, check `expiresAt` field if exists, or show subscription info from `meta.json`
- This avoids needing to switch profiles just to check tokens

## Implementation Considerations

### File Changes Required
| File | Changes |
|------|---------|
| `lib/dashboard-api-handlers.cjs` | Replace execSync→spawn, add result cache, add check-all + check-result endpoints |
| `lib/dashboard-server.cjs` | Add routes for new endpoints |
| `lib/dashboard-template.cjs` | WS reliability, auto-check on load, connection indicator, check timeout fallback |
| `lib/dashboard-websocket.cjs` | Add server-side ping interval for stale detection (optional) |

### Risk Assessment
- **Low risk:** WS reliability improvements — additive, no breaking changes
- **Low risk:** Client-side timeout — purely additive
- **Medium risk:** execSync→spawn — need careful stdout buffering and error handling
- **Low risk:** Auto-check on load — additive feature
- **Note:** `claude auth status` only works for active profile; non-active profiles need different approach (read credentials file directly)

### Success Criteria
- [ ] WS reconnects automatically with visual feedback
- [ ] Check never shows infinite spinner — timeout + fallback after 5s
- [ ] All profile cards show token status on initial load
- [ ] Server event loop never blocked during check
- [ ] Multiple simultaneous checks work correctly

## Next Steps
1. Create implementation plan with phases
2. Phase 1: Replace execSync with spawn (foundation)
3. Phase 2: Add check result caching + new endpoints
4. Phase 3: WS reliability improvements
5. Phase 4: Auto-check on load + client timeout fallback
6. Phase 5: Test all scenarios
