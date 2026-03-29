# Code Review: Dashboard Feature

## Scope
- **Files reviewed**: 5 (3 new, 2 modified)
  - `lib/dashboard-websocket.cjs` (197 LOC)
  - `lib/dashboard-server.cjs` (314 LOC)
  - `lib/dashboard-template.cjs` (217 LOC)
  - `bin/ccprofiles.cjs` (1 line added)
  - `lib/profile-extras.cjs` (4 lines added)
- **Total new LOC**: ~728
- **Focus**: Security, memory leaks, error handling, cross-platform, code quality

## Overall Assessment

Solid implementation. Clean architecture with good separation (websocket / server / template). Adheres to project's zero-dependency constraint. Token-based auth, localhost-only binding, idle shutdown are all good security defaults. Several issues found — two critical (security), a few high/medium.

---

## Critical Issues

### C1. Path Traversal via Profile Name (dashboard-server.cjs)

All API handlers use `decodeURIComponent(match[1])` directly in `path.join(PROFILES_DIR, name)`. A crafted name like `../../etc/passwd` or `..\..\..\` (Windows) could escape `PROFILES_DIR`.

**Impact**: Read/delete arbitrary directories on the filesystem.

**Affected handlers**: `handleCheckToken`, `handleSwitchProfile`, `handleDeleteProfile`, `handleSaveProfile`

**Fix**: Add name validation before any path construction:

```js
function isValidProfileName(name) {
  return /^[a-zA-Z0-9_-]+$/.test(name) && name !== '_base';
}
```

Apply at the top of each handler:
```js
if (!isValidProfileName(name)) {
  return jsonResponse(res, 400, { ok: false, error: 'Invalid profile name' });
}
```

Note: The CLI commands (`cmdSwitch`, `cmdDelete`) have the same underlying issue but are lower risk since they take args from argv, not HTTP. Still worth fixing globally in a shared validation function.

### C2. Request Body Size Not Limited (dashboard-server.cjs:297-301)

`readBody()` accumulates all chunks with no size cap. A malicious or buggy client can send a multi-GB body, causing OOM.

**Fix**:
```js
function readBody(req, cb, maxBytes = 1024) {
  let data = '';
  let size = 0;
  req.on('data', chunk => {
    size += chunk.length;
    if (size > maxBytes) { req.destroy(); return; }
    data += chunk;
  });
  req.on('end', () => cb(data));
}
```

---

## High Priority

### H1. XSS in WebSocket Message Handler (dashboard-template.cjs:112)

```js
const card = document.querySelector('[data-name="' + msg.name + '"]');
```

If `msg.name` contains `"]`, attacker can break out of the attribute selector. The `data-name` attribute itself is set from `esc(p.name)` in `renderCard`, but the querySelector string is not escaped for CSS selector context.

**Fix**: Use `CSS.escape()` in the client JS:
```js
const card = document.querySelector('[data-name="' + CSS.escape(msg.name) + '"]');
```

Also apply in `handleCheck` (line 185).

### H2. Broken WebSocket Message Logic (dashboard-template.cjs:123-126)

The `profile-changed` handler has a string-literal bug — quotes are misplaced:

```js
const action=msg.action==='delete'?'Deleted':'(msg.action==='switch'?'Switched to':'Saved')';
showToast((msg.action==='delete'?'Deleted "':'(msg.action==='switch'?'Switched to "':'Saved "'))+msg.name+'"');
```

The ternary after `'Deleted'` evaluates to a string literal `'(msg.action==='switch'...'` — it doesn't actually evaluate the inner ternary. The toast message will show literal code text for non-delete actions.

**Fix**:
```js
const label = msg.action === 'delete' ? 'Deleted' : (msg.action === 'switch' ? 'Switched to' : 'Saved');
showToast(label + ' "' + msg.name + '"');
```

### H3. Double Cleanup on Close Frame (dashboard-websocket.cjs:94-108)

When a close frame is received, `cleanup()` is called which calls `socket.end()`. This triggers the socket's `close` event, which calls `cleanup()` again. The second call is harmless (delete from set + iterate empty listeners), but:
- `for (const cb of listeners.close) cb()` fires twice
- Could cause bugs if close listeners have side effects

**Fix**: Guard cleanup with a flag:
```js
let cleaned = false;
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  clients.delete(ws);
  for (const cb of listeners.close) cb();
  socket.end();
}
```

### H4. `execSync` Blocks Event Loop (dashboard-server.cjs:170)

`handleCheckToken` uses `setImmediate` + `execSync`, which still blocks the event loop during execution. If `claude auth status` takes the full 10s timeout, all HTTP requests and WebSocket messages stall.

**Fix**: Use `execFile` (async) instead:
```js
const { execFile } = require('child_process');
setImmediate(() => {
  execFile('claude', ['auth', 'status'], { encoding: 'utf8', timeout: 10000 }, (err, stdout) => {
    if (err) {
      broadcast({ type: 'check-result', name, valid: false, email: null, subscriptionType: null });
      return;
    }
    try {
      const data = JSON.parse(stdout);
      broadcast({ type: 'check-result', name, valid: true, email: data.email || 'unknown', subscriptionType: data.subscriptionType || 'unknown' });
    } catch {
      broadcast({ type: 'check-result', name, valid: false, email: null, subscriptionType: null });
    }
  });
});
```

---

## Medium Priority

### M1. Token Leaked in URL and Browser History

The token is passed as `?token=` query param in the URL that's opened in the browser. This means:
- Visible in browser address bar and history
- Logged by some proxies/extensions
- Copied if user shares the URL

This is acceptable for a localhost-only tool, but worth noting. A cookie-based approach after initial auth would be more robust. Low effort improvement: after page load, use `history.replaceState` to strip the token from the URL bar:
```js
history.replaceState(null, '', '/');
```
(Already has token in JS variable, so API calls still work.)

### M2. Stale WebSocket Connections Not Pruned

No heartbeat/ping mechanism from server side. If a client disconnects without sending a close frame (e.g., browser crash, network drop), the socket stays in `clients` Set indefinitely until the TCP stack detects the dead connection (can take minutes).

**Fix**: Add periodic ping sweep:
```js
setInterval(() => {
  for (const ws of clients) {
    if (!ws.alive) { clients.delete(ws); }
  }
}, 30000);
```

### M3. `broadcast()` Silently Swallows Errors (dashboard-websocket.cjs:181)

`try { ws.send(msg); } catch {}` — if a send fails, the dead client remains in the set. Should remove it:
```js
for (const ws of clients) {
  if (ws.alive) {
    try { ws.send(msg); } catch { clients.delete(ws); }
  }
}
```

### M4. No Content-Security-Policy Header (dashboard-server.cjs:95)

The HTML page uses inline scripts and styles. Adding a CSP with nonces would prevent any injected script from running if an XSS vector is found.

At minimum:
```js
res.writeHead(200, {
  'Content-Type': 'text/html; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'"
});
```

### M5. `handleSaveProfile` Calls `getAuthStatus()` Twice (dashboard-server.cjs:231,246)

Both at line 231 (for auto-detect) and line 246 (for meta). Each call spawns `execSync('claude auth status')`. Cache the result:
```js
const auth = getAuthStatus();
// Use `auth` for both name detection and meta
```

---

## Low Priority

### L1. Module-Level `clients` Set Is a Singleton

`dashboard-websocket.cjs` uses a module-level `clients` Set. If `startServer` were called twice (unlikely but possible in tests), both servers would share the same client pool. Not a practical issue for production but complicates testing.

### L2. Missing `Origin` Header Validation on WebSocket Upgrade

A page on any origin could initiate a WebSocket connection if it knows the token. Since the token is random and localhost-only, risk is minimal. But validating `Origin: http://127.0.0.1:PORT` would add defense in depth.

### L3. Error Event on Server Not Handled

`server.on('error', ...)` is not registered. If the port bind fails (race condition), the error is unhandled.

---

## Edge Cases Found

1. **Profile name with special chars**: Names like `my profile` (space), `../admin`, or empty string can cause path issues. Only alphanumeric + hyphen + underscore should be allowed.
2. **Concurrent switch operations**: Two rapid switch requests could interleave `backupBase()` and `copyFileSync` calls, corrupting the backup or active state. A mutex/lock file would prevent this.
3. **Browser not available**: `openBrowser()` fails silently (good), but on headless servers or SSH sessions, user gets no feedback that the browser didn't open. Consider detecting `DISPLAY` on Linux.
4. **WebSocket buffer accumulation**: If a client sends many partial frames without completing them, `buffer` grows unbounded. Add a buffer size limit (~256KB).

---

## Positive Observations

- Clean module separation (websocket / server / template) follows existing codebase patterns
- Zero-dependency constraint respected throughout
- Token-based auth with `crypto.randomBytes` is solid
- Localhost-only binding prevents remote access
- Idle auto-shutdown is a nice UX touch
- Dark/light theme via `prefers-color-scheme` — no extra config needed
- HTML escaping in `renderCard` via `esc()` function
- 64KB frame size cap in WebSocket decoder prevents large frame abuse
- Graceful SIGINT handling

---

## Recommended Actions (Priority Order)

1. **[CRITICAL]** Add profile name validation (regex whitelist) — affects all API handlers
2. **[CRITICAL]** Add body size limit to `readBody()`
3. **[HIGH]** Fix broken ternary in WS message handler (H2) — this is a functional bug
4. **[HIGH]** Fix XSS in `querySelector` with `CSS.escape()` (H1)
5. **[HIGH]** Replace `execSync` with async `execFile` in check handler (H4)
6. **[HIGH]** Guard double cleanup in websocket (H3)
7. **[MEDIUM]** Strip token from URL bar after page load (M1)
8. **[MEDIUM]** Add CSP + security headers (M4)
9. **[MEDIUM]** Cache `getAuthStatus()` result in save handler (M5)
10. **[MEDIUM]** Remove dead clients from broadcast (M3)

## Metrics

- Type Coverage: N/A (plain CJS, no TypeScript)
- Test Coverage: Unknown (no test files found for dashboard)
- Linting Issues: Not checked (no linter config found)

## Unresolved Questions

1. Should the dashboard be opt-in or always available? It adds ~730 LOC to a previously ~550 LOC codebase (more than doubles it).
2. Is `claude auth status` guaranteed to output JSON? If it outputs human-readable text on some versions, the JSON.parse will fail silently.
3. Should the check endpoint check the *profile's* token or the *currently active* token? Currently it runs `claude auth status` which checks whatever is active in `~/.claude/`, not the specific profile's credentials.
