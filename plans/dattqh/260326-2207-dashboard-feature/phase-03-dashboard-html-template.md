# Phase 3: Dashboard HTML Template

## Overview
- **Priority:** High (user-facing)
- **Status:** Complete
- **Effort:** 2h

Single-page HTML dashboard generated as JS template string. Inline CSS + JS. No external CDN/assets. Modern, clean UI.

## Requirements

### Functional
- Profile cards grid: name, email, subscription type, active marker, token status
- Action buttons: Switch, Check, Delete per profile
- Save Current button (global action)
- Real-time updates via WebSocket (token check results, profile changes)
- Loading states, success/error toasts
- Responsive layout (works on narrow/wide screens)

### Non-functional
- Single template string function (no external files to serve)
- < 200 LOC for template module
- No external CSS/JS libraries
- Dark/light theme based on prefers-color-scheme

## Related Code Files

| Action | File | Description |
|--------|------|-------------|
| CREATE | `lib/dashboard-template.cjs` | HTML/CSS/JS template generator |

## Architecture

```
dashboard-template.cjs
  └── generateHTML(token) → string
        ├── <style> — inline CSS (grid, cards, toasts, dark mode)
        ├── <body>  — profile grid container, toast area
        └── <script> — fetch API, WebSocket client, DOM manipulation
```

### Client-side JS Flow
1. On load: `fetch('/api/profiles?token=xxx')` → render cards
2. WS connect: `new WebSocket('ws://host/ws?token=xxx')`
3. WS messages: update card states (check results, switch confirmation)
4. Button clicks: `fetch` POST/DELETE → update UI optimistically → confirm via WS

## UI Layout

```
┌──────────────────────────────────────────────┐
│  ccprofiles dashboard          [Save Current]│
├──────────────────────────────────────────────┤
│                                              │
│  ┌─────────────┐  ┌─────────────┐           │
│  │ ● work      │  │   personal  │           │
│  │ user@co.com │  │ me@gmail.com│           │
│  │ team        │  │ max         │           │
│  │ ✓ valid     │  │ ? unknown   │           │
│  │             │  │             │           │
│  │ [Check]     │  │ [Switch]    │           │
│  │ [Delete]    │  │ [Check]     │           │
│  │             │  │ [Delete]    │           │
│  └─────────────┘  └─────────────┘           │
│                                              │
│  ┌─ Toast ──────────────────────┐           │
│  │ ✓ Switched to "personal"     │           │
│  └──────────────────────────────┘           │
└──────────────────────────────────────────────┘
```

## Implementation Steps

1. Create `lib/dashboard-template.cjs`
2. Implement `generateHTML(token)` returning full HTML string:
3. **CSS section:**
   - CSS custom properties for theming (--bg, --card, --text, --accent, --border)
   - `@media (prefers-color-scheme: dark)` overrides
   - Grid layout: `grid-template-columns: repeat(auto-fill, minmax(260px, 1fr))`
   - Card styles: border, shadow, padding, rounded corners
   - Toast: fixed bottom-right, fade in/out animation
   - Button styles: primary (switch), secondary (check), danger (delete)
   - Loading spinner: CSS-only (border animation)
4. **HTML section:**
   - Header with title + "Save Current" button
   - `<div id="grid">` — profile cards container (populated by JS)
   - `<div id="toasts">` — toast notification area
5. **JS section:**
   - `const TOKEN = '${token}'` — injected at template time
   - `const BASE = window.location.origin`
   - `api(method, path, body)` — fetch wrapper with token param
   - `connectWS()` — WebSocket client with auto-reconnect (3 retries)
   - `renderProfiles(profiles)` — generate card HTML from array
   - `renderCard(profile)` — single card with name, email, type, status, buttons
   - `showToast(msg, type)` — success/error toast with auto-dismiss (3s)
   - `handleSwitch(name)` — confirm + POST + optimistic UI
   - `handleDelete(name)` — confirm dialog + DELETE + remove card
   - `handleCheck(name)` — show spinner on card + GET (result via WS)
   - `handleSave()` — prompt for name + POST
   - WS `onmessage` handler: switch on `type` field to update UI
6. Export: `generateHTML`

### WS Message Types (Client receives)

```json
{ "type": "check-result", "name": "work", "valid": true, "email": "user@co.com", "subscription": "team" }
{ "type": "profile-changed", "action": "switch|save|delete", "name": "work" }
{ "type": "error", "message": "Something went wrong" }
```

## Todo List

- [x] Create `lib/dashboard-template.cjs`
- [x] Implement CSS (theme vars, dark mode, grid, cards, toasts, buttons)
- [x] Implement HTML structure (header, grid, toasts)
- [x] Implement JS: API wrapper with token
- [x] Implement JS: WebSocket client with reconnect
- [x] Implement JS: renderProfiles / renderCard
- [x] Implement JS: handleSwitch, handleDelete, handleCheck, handleSave
- [x] Implement JS: showToast with auto-dismiss
- [x] Implement JS: WS message handler for real-time updates

## Success Criteria

- Dashboard renders all profiles as cards
- Switch/Delete/Check/Save buttons work
- Real-time updates via WebSocket reflect immediately
- Dark/light theme follows OS preference
- Responsive on mobile-width screens
- No external network requests (fully self-contained)

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Template string too large | Low | Keep CSS/JS minimal, no unnecessary animations |
| XSS via profile names | Medium | Escape all user data before inserting into HTML |
| WS disconnect | Low | Auto-reconnect with 3 retries + fallback to polling |
