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

# 2. Login to another account
claude auth login --email me@gmail.com

# 3. Save that account
ccprofiles save personal

# 4. Switch between accounts
ccprofiles switch work

# 5. List all profiles
ccprofiles list
```

## Commands

| Command | Description |
|---------|-------------|
| `ccprofiles setup` | Install `/profile` skill into Claude Code |
| `ccprofiles uninstall` | Remove `/profile` skill |
| `ccprofiles save [name]` | Snapshot current credentials (auto-detects name from email) |
| `ccprofiles switch <name>` | Switch to a saved profile |
| `ccprofiles list` | Show all profiles |
| `ccprofiles status` | Current profile details + token expiry |
| `ccprofiles whoami` | One-line active profile (script-friendly) |
| `ccprofiles check` | Verify token is still valid |
| `ccprofiles delete <name>` | Delete a profile |
| `ccprofiles restore` | Rollback to pre-switch backup |
| `ccprofiles clone <name>` | Export profile skeleton for another machine |

## Claude Code Integration

After running `ccprofiles setup`, you can manage profiles directly in Claude Code:

```
> /profile list
> /profile switch personal
> /profile save work
```

After switching, **exit Claude Code and reopen** to load the new credentials. Then run `/profile status` to verify.

## How It Works

Profiles are stored in `~/.claude/profiles/{name}/`:

```
~/.claude/profiles/
├── active              # Current profile name
├── _base/              # Auto-backup before each switch
├── work/
│   ├── .credentials.json
│   ├── settings.json
│   └── meta.json
└── personal/
    ├── .credentials.json
    ├── settings.json
    └── meta.json
```

**Switching** copies the profile's credentials and settings to `~/.claude/` (full replace).

## FAQ

**Q: What happens if a token expires?**
Run `ccprofiles check` to verify. If expired, run `claude auth login` then `ccprofiles save <name>`.

**Q: Is my data safe?**
Every switch creates a backup in `_base/`. Use `ccprofiles restore` to rollback. Credentials are stored with the same security as Claude Code's own storage.

**Q: Does it work on Windows/macOS/Linux?**
Yes. Zero dependencies — uses only Node.js built-ins.

**Q: Can I share profiles between machines?**
Use `ccprofiles clone <name>` to export a profile skeleton (settings + metadata, no credentials). Then auth on the new machine.

## Requirements

- Node.js >= 18
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed

## License

[MIT](LICENSE)
