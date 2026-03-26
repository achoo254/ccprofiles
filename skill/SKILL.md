---
name: profile
description: "Multi-account profile manager. Switch OAuth accounts + config without logout/login. Requires: npm install -g ccprofiles"
argument-hint: "add|save|switch|list|status|delete|restore [name] [--email <e>]"
allowed-tools:
  - Bash
  - Read
---

# Profile Manager

Switch between multiple Claude Code OAuth accounts and configurations without logout/login.

**Requires:** `npm install -g ccprofiles` then `ccprofiles setup`

## Quick Reference

| Command | Description |
|---------|-------------|
| `/profile add <name> [--email <e>]` | OAuth login + auto-save as new profile |
| `/profile save <name>` | Snapshot current credentials + config |
| `/profile switch <name>` | Switch to saved profile (needs /clear) |
| `/profile list` | Show all profiles |
| `/profile status` | Current profile details + token expiry |
| `/profile delete <name>` | Remove a profile |
| `/profile restore` | Rollback to pre-switch backup |

## Usage

Run the ccprofiles CLI with the appropriate command:

```bash
ccprofiles <command> [name] [--email <email>]
```

### First-time setup
1. Run `save` to capture current account: `/profile save work`
2. Run `add` for additional accounts: `/profile add personal --email me@gmail.com`

### Switching accounts
1. Run `switch`: `/profile switch personal`
2. Run `/clear` to reload session with new credentials

### After switch
Always remind the user to run `/clear` to apply the new profile.

## Profile Structure

Each profile stored at `~/.claude/profiles/{name}/`:
- `.credentials.json` — OAuth tokens
- `settings-overlay.json` — Settings diff (deep merged on switch)
- `CLAUDE.md` — Profile-specific instructions (optional)
- `rules/` — Profile-specific rules (optional, additive)
- `meta.json` — Name, email, subscription, timestamp

## Important Notes

- **Token expiry**: Saved tokens may expire. If switch fails auth, user needs `claude auth login` again then `save`.
- **Backup**: Every switch creates `_base/` backup. Use `restore` to rollback.
- **Settings merge**: Additive only — profile settings are merged into base, never removing existing keys.
