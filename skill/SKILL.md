---
name: profile
description: "Multi-account profile manager. Switch OAuth accounts + config without logout/login. Requires: npm install -g @achoo254/ccprofiles"
argument-hint: "save|switch|list|status|whoami|check|delete|restore|clone|dashboard [name]"
allowed-tools:
  - Bash
  - Read
---

# Profile Manager

Switch between multiple Claude Code OAuth accounts and configurations without logout/login.

**Requires:** `npm install -g @achoo254/ccprofiles` then `ccprofiles setup`

## Quick Reference

| Command | Description |
|---------|-------------|
| `/profile save [name]` | Snapshot current credentials (auto-detects name from email) |
| `/profile switch <name>` | Switch to saved profile (needs restart) |
| `/profile list` | Show all profiles |
| `/profile status` | Current profile details + token expiry |
| `/profile whoami` | One-line active profile (script-friendly) |
| `/profile check` | Verify token is still valid |
| `/profile delete <name>` | Remove a profile |
| `/profile restore` | Rollback to pre-switch backup |
| `/profile clone <name>` | Export profile skeleton (no credentials) |
| `/profile dashboard` | Open browser dashboard to manage profiles |

## Usage

Run the ccprofiles CLI with the appropriate command:

```bash
ccprofiles <command> [name]
```

### First-time setup
1. Run `save` to capture current account: `/profile save work`
2. Login to another account: `claude auth login --email me@gmail.com`
3. Save that account: `/profile save personal`

### Switching accounts
1. Run `switch`: `/profile switch personal`
2. Exit Claude Code and reopen
3. Verify: `/profile status` to confirm correct account

### After switch
Always remind the user to **exit and reopen Claude Code** to apply the new profile. Then suggest `/profile status` to verify.

## Profile Structure

Each profile stored at `~/.claude/profiles/{name}/`:
- `.credentials.json` — OAuth tokens
- `settings.json` — Full settings snapshot (replaced on switch)
- `meta.json` — Name, email, subscription, timestamp

## Important Notes

- **Token expiry**: Saved tokens may expire. Use `check` to verify, then `claude auth login` + `save` to refresh.
- **Backup**: Every switch creates `_base/` backup. Use `restore` to rollback.
- **Settings**: Full replace on switch — each profile has its own complete settings snapshot.
- **Cross-machine**: Use `clone` to export profile skeleton, then auth on new machine.
