# Claude Code CLI `claude auth login` Technical Research Report

**Date:** 2026-03-26 | **Research Focus:** OAuth/token flow, browser integration, environment variables, non-interactive modes

---

## Executive Summary

Claude Code CLI uses **OAuth-based authentication with a localhost callback server**. The flow opens a browser automatically (or allows manual URL copy), then receives the token via HTTP callback on a random ephemeral port (configurable via `--callback-port`). Non-interactive auth is supported via environment variables (`ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`) for terminal sessions, while remote/web sessions require OAuth.

---

## 1. Browser Opening & OAuth Flow

### Initial Login Behavior
- **Default:** Automatically opens default system browser to OAuth URL
- **Manual fallback:** Press `c` to copy login URL to clipboard, paste into any browser manually
- **URL format:** Displayed as `http://localhost:[PORT]/` or similar
- **Support:** Works on macOS, Linux, Windows with standard browser integration

### Supported Authentication Methods
1. **Claude Pro/Max** - Claude.ai account login
2. **Claude for Teams/Enterprise** - Team-managed Claude.ai account
3. **Claude Console** - API-based billing account
4. **Cloud providers** - AWS Bedrock, Google Vertex AI, Microsoft Foundry (via env vars, no browser needed)

### Browser Selection
- **Windows:** Uses system default browser (via Windows shell execution)
- **BROWSER environment variable:** Search results don't explicitly document a `BROWSER` env var override, but standard Node.js/Python conventions suggest it may be respected
- **No documented profile/instance control:** Cannot force specific browser profile or instance

**Status:** PARTIALLY DOCUMENTED - browser selection appears to respect system defaults but official docs don't explicitly cover `BROWSER` env var on Windows

---

## 2. OAuth Callback Mechanism

### Localhost Server Implementation
- **Server type:** Local HTTP server listening on `localhost`
- **Port allocation:** **RANDOM ephemeral port by default** (OS picks available port)
- **Callback endpoint:** `http://localhost:[PORT]/callback`
- **Token return:** OAuth token received via HTTP POST to callback endpoint

### Port Configuration
- **Random port (default):** Simplifies setup, no port conflicts, but causes issues in remote/devcontainer scenarios
- **Fixed port:** Use `--callback-port 8080` (or other port) to specify fixed port
  - Must match pre-registered redirect URI in OAuth provider
  - Enables port forwarding in remote scenarios

**Example:**
```bash
claude auth login --callback-port 8080
```

### Known Technical Issues
- **IPv6 vs IPv4:** Some Firefox versions attempt IPv4 (127.0.0.1) first, but CLI binds to IPv6 (::1), causing connection failures
- **Devcontainer forwarding:** Random port not forwarded to host, callback never reaches CLI
- **Remote SSH:** Port forwarding needed; CLI displays message "Please open this URL in your browser..."

**Usage for Remote/SSH:**
1. CLI displays `http://localhost:[PORT]/` message
2. Copy full URL
3. Forward port back to local machine (e.g., `ssh -L 8080:localhost:8080`)
4. Paste URL into local browser
5. Token securely transmitted back to remote CLI instance

---

## 3. BROWSER Environment Variable (Windows)

### Current Documentation Status
**NOT EXPLICITLY DOCUMENTED** in official Claude Code docs or settings reference.

### Expected Behavior (Based on Industry Standards)
- If implemented: Windows would respect `BROWSER` env var for launching OAuth URL
- Standard Node.js behavior: Looks for `BROWSER` env var before falling back to system default
- PowerShell/CMD syntax: `$env:BROWSER="C:\Program Files\Firefox\firefox.exe"` (PowerShell)

### What IS Documented
- Environment variables can be set in:
  - System Properties → Advanced → Environment Variables
  - PowerShell: `$env:VARIABLE_NAME="value"`
  - CMD: `set VARIABLE_NAME=value`
- Many auth-related env vars are supported: `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, etc.

**Status:** NEEDS VERIFICATION - Test with actual `BROWSER=path` to confirm Windows support

---

## 4. Token Return Path (Callback Details)

### Flow Sequence
1. CLI starts local HTTP server on random port
2. Browser OAuth completes on Anthropic servers
3. Anthropic redirects to `http://localhost:[PORT]/callback` with authorization code
4. CLI receives POST request with token/code
5. CLI exchanges code for OAuth token (if needed) or uses token directly
6. Token stored in credentials file
7. HTTP callback completes with success page

### Token Storage
- **macOS:** Encrypted macOS Keychain
- **Linux/Windows:** `~/.claude/.credentials.json` (mode 0600 on Linux, inherits user profile ACLs on Windows)
- **Override location:** `$CLAUDE_CONFIG_DIR` if set

### Token Lifecycle
- **TTL:** 30-second in-memory cache
- **Refresh:** Automatic via HTTP 401 response handling
- **Expiration:** Depends on OAuth provider (typically hours to days)

---

## 5. Non-Interactive & Parameterized Usage

### CLI Flags for `claude auth login`

| Flag | Purpose | Example |
|------|---------|---------|
| `--email` | Pre-fill email address | `claude auth login --email user@example.com` |
| `--sso` | Force SSO authentication | `claude auth login --sso` |
| `--console` | Use Claude Console (API billing) instead of subscription | `claude auth login --console` |
| `--callback-port` | Fixed port for OAuth callback | `claude auth login --callback-port 8080` |

**Status:** DOCUMENTED in CLI reference but limited details on behavior

### Related Commands
```bash
claude auth status              # Check current auth status as JSON
claude auth status --text       # Human-readable output
claude auth logout              # Log out
claude setup-token              # Generate OAuth token for CI/CD (Pro/Max only)
```

### Exit Codes
- `0` = logged in
- `1` = not logged in

---

## 6. Non-Interactive Authentication (Environment Variables)

### API Key Methods (Terminal CLI Only)

**Priority order when multiple present:**

1. **Cloud provider env vars** (if set: `CLAUDE_CODE_USE_BEDROCK`, etc.)
2. **`ANTHROPIC_AUTH_TOKEN`** - Bearer token for gateway/proxy auth
3. **`ANTHROPIC_API_KEY`** - Anthropic Console API key (sent as `X-Api-Key` header)
4. **`apiKeyHelper`** script output - Dynamic credential rotation
5. **Subscription OAuth** - Default from `/login` (Pro/Max/Teams/Enterprise)

### Interactive Mode Approval
- In interactive mode: prompted once to approve API key, choice remembered
- In non-interactive mode (`-p` flag): API key always used when present
- Conflict: If API key set + subscription active, API key takes precedence (can cause failures if key is invalid)

### Environment Variables for CI/CD

**For GitHub Actions (from claude-code-action):**
```bash
ANTHROPIC_API_KEY=<your-api-key>
# OR
CLAUDE_CODE_OAUTH_TOKEN=<oauth-token-from-setup-token>
```

**For headless/remote servers:**
```bash
ANTHROPIC_API_KEY=sk-ant-...
# Then run: claude -p "your query"
```

### Helper Script Method
```bash
# In .claude/settings.json:
{
  "apiKeyHelper": "/path/to/script-that-returns-api-key.sh"
}

# Script refresh intervals:
# Default: 5 minutes or on HTTP 401
# Custom: CLAUDE_CODE_API_KEY_HELPER_TTL_MS environment variable
```

### Important Limitation
**OAuth environment variables DO NOT work for:**
- Claude Desktop app
- Remote web sessions (use subscription credentials)
- Only applicable to terminal CLI sessions

---

## 7. Command Help Output

### `claude auth login --help` Output (from CLI Reference)

```
Sign in to your Anthropic account. Use `--email` to pre-fill your email address,
`--sso` to force SSO authentication, and `--console` to sign in with Anthropic
Console for API usage billing instead of a Claude subscription.

Examples:
  claude auth login --console
```

### Available Subcommands
- `claude auth login` - Sign in
- `claude auth logout` - Sign out
- `claude auth status` - Check status

### No documented flags in official help for:
- Browser selection/control
- Port range specification
- OAuth scope customization
- Timeout configuration

---

## Key Findings

### ✅ Confirmed
1. **OAuth with browser:** Yes, opens default browser with automatic fallback to manual URL copying
2. **Localhost callback:** Yes, HTTP server on random port (configurable via `--callback-port`)
3. **Token storage:** Yes, Keychain (macOS) or credentials.json (Linux/Windows)
4. **Non-interactive:** Yes, via `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` env vars
5. **CLI flags:** Yes, `--email`, `--sso`, `--console`, `--callback-port` supported

### ❓ Unresolved Questions
1. **BROWSER env var on Windows:** Not explicitly documented. Does Claude Code respect it? (Needs testing)
2. **Browser profile/instance control:** Any way to force specific profile? (No evidence found)
3. **OAuth scope:** What scopes are requested? (Not documented)
4. **Timeout behavior:** How long does CLI wait for callback? (Not specified)
5. **IPv4 vs IPv6:** Default binding behavior, especially on Windows? (Partially documented)
6. **Port range:** Any default range for random port allocation, or truly ephemeral? (Not specified)
7. **API key helper slow warning:** The 10-second threshold mentioned—is it configurable? (Not documented)

---

## Windows-Specific Notes

### Port Binding Issues
- Issue #3402 reports "claude-code for Windows is NOT available due to its port"
- Likely related to firewall or port permission restrictions
- Workaround: Use `--callback-port` to explicitly bind to known port

### Credentials Storage
- Inherits Windows user profile ACLs (unlike Linux's 0600 mode)
- Stored in `%USERPROFILE%\.claude\.credentials.json` (APPDATA-like location)

### Browser Integration
- Uses Windows shell execution to open default browser
- Likely respects Windows registry default browser settings
- PowerShell/CMD syntax differs for setting env vars

---

## Summary

Claude Code's auth mechanism is **standard OAuth 2.0 with localhost callback**, not headless-friendly by default but viable via `--callback-port` and environment variable overrides. The CLI is **flexible for automation** (API keys, bearer tokens, helper scripts) but **OAuth is required for remote/web sessions**. Windows support is functional but less documented than macOS/Linux.

---

## Sources

- [Authentication - Claude Code Docs](https://code.claude.com/docs/en/authentication)
- [CLI reference - Claude Code Docs](https://code.claude.com/docs/en/cli-reference)
- [Claude Code Settings - Claude Code Docs](https://code.claude.com/docs/en/settings)
- [GitHub - anthropics/claude-code](https://github.com/anthropics/claude-code)
- [OAuth Callback Failure Issues - GitHub Issues](https://github.com/anthropics/claude-code/issues/1529)
- [DevContainer OAuth Port Forwarding - GitHub Issue #20793](https://github.com/anthropics/claude-code/issues/20793)
- [Firefox IPv6/IPv4 Issue - GitHub Issue #16521](https://github.com/anthropics/claude-code/issues/16521)
- [Managing API key environment variables - Claude Help Center](https://support.claude.com/en/articles/12304248-managing-api-key-environment-variables-in-claude-code)
