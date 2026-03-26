# ccprofiles

> Multi-account profile manager for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Switch OAuth accounts without logout/login.

[![npm version](https://img.shields.io/npm/v/ccprofiles.svg)](https://www.npmjs.com/package/ccprofiles)
[![license](https://img.shields.io/npm/l/ccprofiles.svg)](LICENSE)
[![node](https://img.shields.io/node/v/ccprofiles.svg)](package.json)

## Install

```bash
npm install -g ccprofiles
ccprofiles setup  # Install /profile skill into Claude Code
```

## Quick Start

```bash
# 1. Save your current account
ccprofiles save work

# 2. Add another account (opens browser for OAuth)
ccprofiles add personal --email me@gmail.com

# 3. Switch between accounts
ccprofiles switch work

# 4. List all profiles
ccprofiles list
```

## Commands

| Command | Description |
|---------|-------------|
| `ccprofiles setup` | Install `/profile` skill into Claude Code |
| `ccprofiles uninstall` | Remove `/profile` skill |
| `ccprofiles add <name> [--email <e>]` | OAuth login + save as new profile |
| `ccprofiles save <name>` | Snapshot current credentials as profile |
| `ccprofiles switch <name>` | Switch to a saved profile |
| `ccprofiles list` | Show all profiles |
| `ccprofiles status` | Current profile details + token expiry |
| `ccprofiles delete <name>` | Delete a profile |
| `ccprofiles restore` | Rollback to pre-switch backup |

## Claude Code Integration

After running `ccprofiles setup`, you can manage profiles directly in Claude Code:

```
> /profile list
> /profile switch personal
> /profile save work
```

After switching, run `/clear` in Claude Code to reload with new credentials.

## How It Works

Profiles are stored in `~/.claude/profiles/{name}/`:

```
~/.claude/profiles/
├── active              # Current profile name
├── _base/              # Auto-backup before each switch
├── work/
│   ├── .credentials.json
│   ├── settings-overlay.json
│   └── meta.json
└── personal/
    ├── .credentials.json
    ├── settings-overlay.json
    └── meta.json
```

**Switching** copies the profile's credentials to `~/.claude/.credentials.json` and deep-merges settings (additive only — your existing settings are preserved).

## FAQ

**Q: What happens if a token expires?**
Run `ccprofiles add <name>` again to re-authenticate and update the profile.

**Q: Is my data safe?**
Every switch creates a backup in `_base/`. Use `ccprofiles restore` to rollback. Credentials are stored with the same security as Claude Code's own storage.

**Q: Does it work on Windows/macOS/Linux?**
Yes. Zero dependencies — uses only Node.js built-ins.

**Q: Can I share profiles between machines?**
Not yet. Planned for v1.1 (`ccprofiles export/import`).

## Requirements

- Node.js >= 18
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed

## License

[MIT](LICENSE)
