# Chrome Profiles on Windows: Research Report

## 1. Chrome User Data Directory Location

**Windows:** `%LOCALAPPDATA%\Google\Chrome\User Data`
- Expands to: `C:\Users\{USERNAME}\AppData\Local\Google\Chrome\User Data`
- AppData is hidden by default in Windows Explorer
- Default profile folder: `Default`
- Additional profiles: `Profile 1`, `Profile 2`, etc. (numeric naming)

**Cross-platform:**
- macOS: `~/Library/Application Support/Google/Chrome`
- Linux: `~/.config/google-chrome`

---

## 2. Listing All Chrome Profiles

**File:** `Local State` (JSON, located in User Data root)
- No file extension, plain text JSON
- Contains key `profile.info_cache` — a dictionary mapping profile folders to metadata

**Example profile entry from Local State:**
```json
{
  "profile": {
    "info_cache": {
      "Default": {
        "active_time": 1532106841.514689,
        "avatar_icon": "chrome://theme/IDR_PROFILE_AVATAR_26",
        "background_apps": false,
        "gaia_id": "",
        "is_ephemeral": false,
        "is_omitted_from_profile_list": false,
        "is_using_default_avatar": true,
        "is_using_default_name": true,
        "managed_user_id": "",
        "name": "Person 1",
        "user_name": ""
      },
      "Profile 1": {
        "name": "Work Profile",
        "user_name": "user@example.com",
        "gaia_id": "12345678901234567890",
        "active_time": 1532106841.514689,
        "is_using_default_avatar": false,
        "is_using_default_name": false,
        ...
      }
    },
    "last_active_profiles": ["Default"]
  }
}
```

**Key fields in profile.info_cache:**
- `name`: Display name (what user sees in Chrome UI)
- `user_name`: Signed-in email/account identifier
- `gaia_id`: Google account ID (empty if not signed in)
- `active_time`: Last activity timestamp (Unix epoch in seconds with decimal)
- `is_using_default_avatar`, `is_using_default_name`: Custom profile vs default
- `is_ephemeral`: Whether profile is temporary
- `is_omitted_from_profile_list`: Hidden from switcher UI

---

## 3. Local State JSON Structure (profile.info_cache)

The `Local State` file is Chrome's system configuration JSON with multiple top-level keys. The `profile.info_cache` section specifically:
- Maps profile directory names (keys) to metadata objects (values)
- Directory names are folder identifiers: `Default`, `Profile 1`, `Profile 2`, etc.
- Display names in `name` field ≠ folder names (user can customize display name)

**Locating profile display name:**
Parse Local State → search through `profile.info_cache` → match the profile folder name to get the `name` and `user_name` fields.

---

## 4. Detecting Cookies for a Domain (claude.ai)

**Cookie database location per profile:**
`%LOCALAPPDATA%\Google\Chrome\User Data\{PROFILE_FOLDER}\Network\Cookies`

Examples:
- Default profile: `...Chrome\User Data\Default\Network\Cookies`
- Profile 1: `...Chrome\User Data\Profile 1\Network\Cookies`

**Database details:**
- Format: SQLite database
- Table: `cookies`
- Fields: `host_key`, `name`, `value`, `path`, `expires_utc`, `secure`, `httponly`, `last_access_utc`
- Encryption: Cookie values are encrypted with AES256-GCM (symmetric); encryption key stored in `Local State`

**To detect cookies for claude.ai:**
1. Open `Cookies` SQLite database (must not be locked by Chrome)
2. Query: `SELECT * FROM cookies WHERE host_key LIKE '%claude.ai%'`
3. If results exist, cookies present for that domain

**Note:** Chrome must be closed or the profile not actively running to access Cookies file without file-locking issues.

---

## 5. Launching Chrome with Specific Profile

**Command syntax (Windows):**
```cmd
"C:\Program Files\Google\Chrome\Application\chrome.exe" --profile-directory="Profile 1"
```

**Key details:**
- Flag: `--profile-directory` (not `--profile`)
- Value: Profile folder name from User Data directory
- Folder names: `Default`, `Profile 1`, `Profile 2`, etc.
- Display name ≠ folder name (folder names are the ones used here)
- Chrome will create the profile folder if it doesn't exist

**Alternative launch methods:**
- Create Windows shortcut with target: `"C:\Program Files\Google\Chrome\Application\chrome.exe" --profile-directory="Profile 1"`
- Launch with URL: `chrome.exe --profile-directory="Default" https://example.com`

---

## 6. CLI Authentication & Browser Opening

### Standard Approach

CLI tools opening browsers typically:
1. Start a local HTTP server (e.g., localhost:8080)
2. Generate OAuth/auth callback URL
3. Open default browser to that URL
4. Listen for callback redirect

### Browser Opening Mechanism

**Environment variable:** `BROWSER`
- **Linux:** Respected for custom browser openers (e.g., `firefox`, `/usr/bin/chromium`)
- **Windows:** Not widely used; defaults to `start` command
- **macOS:** Not widely used; defaults to `open` command

**Platform-specific openers:**
- **Windows:** `start` command (built-in shell command)
- **macOS:** `open` command (native utility)
- **Linux:** Fallback chain — `xdg-open` → `gnome-open` → `kde-open`

**Node.js npm package:** `open` (by sindresorhus)
- Popular cross-platform abstraction
- Handles edge cases and command injection prevention
- Respects `BROWSER` variable on supported platforms
- Recommended for CLI tools

### Claude Auth Login Implementation

For `claude auth login`, the most likely approach is:
1. **No explicit BROWSER env var check** — most CLI tools don't (rarely needed on Windows/macOS)
2. **Uses native opener:**
   - Windows: `start` command → system default browser
   - macOS: `open` command → system default browser
   - Linux: Tries `xdg-open` or checks `BROWSER` env var
3. **Or uses npm `open` package** for portability

**Example (Node.js):**
```javascript
const open = require('open');
await open('http://localhost:8080/auth');
```

**Example (Go):**
```go
import "github.com/pkg/browser"
browser.OpenURL("http://localhost:8080/auth")
```

No special logic needed — the CLI doesn't target specific profiles. The user's browser opens with whatever default profile is set.

---

## Key Implementation Notes

### For ccprofiles `auth` command:
1. **Profile detection:** Parse Local State to list available profiles + signed-in accounts
2. **Cookie detection:** Query `Network\Cookies` SQLite database for claude.ai
3. **Browser launch:** Use `open` npm package (cross-platform, respects BROWSER env)
4. **Profile switching:** Use `--profile-directory` flag when launching Chrome
5. **Local State encryption:** Don't decrypt cookies; just query SQLite for domain presence

### Critical Gotchas
- `Local State` and `Network\Cookies` are JSON and SQLite, respectively — different formats
- Profile folder names ≠ display names (use Local State to map)
- Chrome lock files: Must ensure Chrome isn't running that profile when accessing Cookies DB
- Windows paths: Use `%LOCALAPPDATA%` or construct with `process.env.APPDATA`

---

## Sources

- [Chromium Docs - User Data Directory](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/user_data_dir.md)
- [How to Find Your Chrome Profile Folder on Windows, Mac, and Linux](https://www.howtogeek.com/255653/how-to-find-your-chrome-profile-folder-on-windows-mac-and-linux/)
- [Chrome Local State File Overview](https://renenyffenegger.ch/notes/development/web/browser/Chrome/user-data-directory/Local-State/index)
- [Where are cookies stored in Windows? (Chrome, Firefox, Edge, Opera)](https://www.digitalcitizen.life/cookies-location-windows-10/)
- [Chrome Cookies Location Windows 11](https://www.oreateai.com/blog/chrome-cookies-location-windows-11/a73afc52aea67d20532683143430f65a)
- [How to Launch Chrome Using a Profile from CLI](https://www.ianwootten.co.uk/2023/05/18/how-to-launch-chrome-using-a-profile-from-cli/)
- [Run Google Chrome with Different Profiles](https://winaero.com/run-google-chrome-with-different-profiles/)
- [Browser Auto-Open: Seamless OAuth UX for CLI Tools](https://dev.to/kriasoft/browser-auto-open-seamless-oauth-ux-for-cli-tools-3nh4)
- [GitHub - sindresorhus/open: Open stuff like URLs, files, executables. Cross-platform](https://github.com/sindresorhus/open)
- [How to build browser-based OAuth into your CLI with WorkOS](https://workos.com/blog/how-to-build-browser-based-oauth-into-your-cli-with-workos)
- [Heroku CLI login now opens the browser by default](https://devcenter.heroku.com/changelog-items/1530)

---

## Unresolved Questions

1. **Cookie encryption key location in Local State**: Exact JSON path where Chrome stores the encryption key for Cookies database — needs verification to decrypt values if required
2. **Network vs Legacy Cookies location**: Some sources mention `Network\Cookies` folder structure vs old flat `Cookies` file; need to verify which applies to current Chrome versions
3. **Profile locking during browser runtime**: Detailed file-locking behavior when Chrome is running a profile — retry strategy?
4. **BROWSER env var on Windows**: Confirmation whether Windows respects BROWSER env var in practice (sources suggest no, but worth testing)
