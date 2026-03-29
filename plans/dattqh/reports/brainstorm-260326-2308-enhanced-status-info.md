# Brainstorm: Enhanced Status Info (Quota, Usage, Model)

## Problem

`ccprofiles status` chỉ hiện: name, email, subscription, savedAt, token expiry. Muốn thêm: quota tier, org, model, scopes.

## Data Sources

| Info | Source | Method |
|------|--------|--------|
| Rate limit tier | `.credentials.json` → `claudeAiOauth.rateLimitTier` | readJson (local, fast) |
| Org name + orgId | `claude auth status` → JSON output | execSync/spawn (slow ~2s) |
| Token scopes | `.credentials.json` → `claudeAiOauth.scopes` | readJson (local, fast) |
| Model | `~/.claude/settings.json` → `model` | readJson (local, fast) |
| Token expiry | `.credentials.json` → `claudeAiOauth.expiresAt` | readJson (already done) |
| **Realtime usage/quota** | **NOT AVAILABLE** | Claude CLI doesn't expose |

### rateLimitTier Examples
- `default_claude_max_5x` → Team plan, 5x rate
- Values encode plan type + rate multiplier

## Recommended Solution

### CLI `ccprofiles status` Output
```
Active Profile: dattqh
  Email:        trihd@inet.vn
  Organization: iNET SOFTWARE COMPANY LIMITED
  Subscription: team
  Rate Limit:   default_claude_max_5x
  Model:        (default)
  Scopes:       inference, file_upload, mcp_servers, profile, sessions
  Token:        ✓ valid (45 days remaining)
  Saved at:     2026-03-26T10:00:00.000Z
```

### Dashboard Card Changes
Add to profile card: org name, rate limit tier badge, model if set.

## Files to Change

| File | Change |
|------|--------|
| `lib/profile-commands.cjs` | `cmdStatus()` — read creds + settings, display new fields |
| `lib/profile-commands.cjs` | `getAuthStatus()` — return orgName, orgId too |
| `lib/dashboard-api-handlers.cjs` | `handleListProfiles()` — include extra fields from creds |
| `lib/dashboard-template.cjs` | `renderCard()` — display new fields |

## Implementation Notes

- **Fast path**: tier, scopes, model all from local files — no subprocess needed
- **Slow path**: org name from `claude auth status` — already called, just capture more fields
- Keep `getAuthStatus()` returning more fields from JSON output
- Read `.credentials.json` directly for tier/scopes (don't call CLI for these)

## Risk
- `.credentials.json` structure may change in future Claude Code updates → graceful fallback with `|| 'unknown'`
- `rateLimitTier` field format undocumented → display as-is, no parsing
