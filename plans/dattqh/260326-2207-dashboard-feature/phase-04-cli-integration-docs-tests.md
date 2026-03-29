# Phase 4: CLI Integration + Docs + Tests

## Overview
- **Priority:** Medium (glue + polish)
- **Status:** Complete
- **Effort:** 1h

Wire `dashboard` command into CLI entry point, update docs (README, SKILL.md), add tests.

## Requirements

### Functional
- `ccprofiles dashboard` starts the server
- `/profile dashboard` works in Claude Code skill
- Help text updated
- Tests cover server startup/shutdown + API responses

### Non-functional
- No breaking changes to existing commands

## Related Code Files

| Action | File | Description |
|--------|------|-------------|
| MODIFY | `bin/ccprofiles.cjs` | Add `dashboard` case to switch |
| MODIFY | `lib/profile-extras.cjs` | Add `cmdDashboard()` export |
| MODIFY | `lib/profile-manager.cjs` | Re-export (already auto via spread) |
| MODIFY | `skill/SKILL.md` | Add dashboard command to table |
| MODIFY | `README.md` | Add dashboard to commands table + section |
| MODIFY | `test/profile-manager.test.cjs` | Add dashboard tests |

## Implementation Steps

### CLI Integration

1. **`bin/ccprofiles.cjs`** — add case:
   ```javascript
   case 'dashboard': pm.cmdDashboard(); break;
   ```

2. **`lib/profile-extras.cjs`** — add function:
   ```javascript
   function cmdDashboard() {
     const { startServer } = require('./dashboard-server.cjs');
     startServer();
   }
   ```
   Add to module.exports.

3. **`lib/profile-extras.cjs`** — update `showHelp()`:
   Add `dashboard` to help text under Profile Management section.

### Docs

4. **`skill/SKILL.md`**:
   - Add to argument-hint: `save|switch|list|status|whoami|check|delete|restore|clone|dashboard [name]`
   - Add row to Quick Reference table: `/profile dashboard` — Open browser dashboard
   - Add brief "Dashboard" section explaining usage

5. **`README.md`**:
   - Add `ccprofiles dashboard` to Commands table
   - Add "Dashboard" section under Claude Code Integration:
     ```
     ## Dashboard
     View and manage all profiles in your browser:
     ccprofiles dashboard
     ```

### Tests

6. **`test/profile-manager.test.cjs`** — add describe block:
   - Test server starts and listens (check port assignment)
   - Test `/api/profiles` returns profile list
   - Test token validation rejects bad token
   - Test server cleanup (close after test)

   ```javascript
   describe('dashboard server', () => {
     it('should start on random port', async () => {
       // Start server, verify listening, close
     });

     it('should reject requests without valid token', async () => {
       // Fetch without token → 403
     });

     it('should list profiles via API', async () => {
       // Fetch /api/profiles?token=xxx → JSON array
     });
   });
   ```

   Note: Use `http.request` for tests (no fetch in Node 18 test runner by default on all platforms). Or use global `fetch` if Node 18+.

### Version Bump

7. Bump version in `package.json`: `2.0.1` → `2.1.0` (minor: new feature)

## Todo List

- [x] Add `dashboard` case to `bin/ccprofiles.cjs`
- [x] Add `cmdDashboard()` to `lib/profile-extras.cjs`
- [x] Update `showHelp()` in `lib/profile-extras.cjs`
- [x] Update `skill/SKILL.md` with dashboard command
- [x] Update `README.md` with dashboard section
- [x] Add dashboard server tests (4 tests added)
- [x] Bump version to 2.1.0

## Success Criteria

- `ccprofiles dashboard` launches server + opens browser
- `ccprofiles --help` shows dashboard command
- `/profile dashboard` documented in SKILL.md
- All existing tests still pass
- New dashboard tests pass
- `npm test` green

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Test flakiness (server port) | Low | Use port 0, close server in afterEach |
| Breaking existing tests | Low | Only adding, not modifying existing code paths |
