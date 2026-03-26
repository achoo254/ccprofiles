#!/usr/bin/env node
'use strict';

/**
 * dashboard-api-handlers.cjs — REST API handlers for dashboard
 *
 * Profile CRUD operations exposed as HTTP handlers.
 * Reuses internal helpers from profile-commands.cjs (no process.exit).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { broadcast } = require('./dashboard-websocket.cjs');
const {
  PROFILES_DIR, CLAUDE_DIR, CREDS_FILE, SETTINGS_FILE,
  ensureDir, readJson, writeJson, safeCopy
} = require('./utils.cjs');
const { getActiveProfile, setActiveProfile, backupBase, getAuthStatus } = require('./profile-commands.cjs');

/** GET /api/profiles — list all profiles with meta + active marker */
function handleListProfiles(res, json) {
  ensureDir(PROFILES_DIR);
  const active = getActiveProfile();

  try {
    const entries = fs.readdirSync(PROFILES_DIR, { withFileTypes: true })
      .filter(e => e.isDirectory() && e.name !== '_base')
      .map(e => {
        const meta = readJson(path.join(PROFILES_DIR, e.name, 'meta.json'));
        return {
          name: e.name,
          email: meta?.email || 'unknown',
          subscriptionType: meta?.subscriptionType || 'unknown',
          savedAt: meta?.savedAt || null,
          active: e.name === active
        };
      });
    json(res, 200, { ok: true, data: entries });
  } catch (err) {
    json(res, 500, { ok: false, error: err.message });
  }
}

/** GET /api/check/:name — async token validation, result via WS */
function handleCheckToken(res, name, json) {
  const profileDir = path.join(PROFILES_DIR, name);
  if (!fs.existsSync(profileDir)) {
    return json(res, 404, { ok: false, error: `Profile "${name}" not found` });
  }

  // Respond immediately — result comes via WebSocket
  json(res, 200, { ok: true, status: 'checking' });

  // Run check async
  setImmediate(() => {
    try {
      const output = execSync('claude auth status', { encoding: 'utf8', timeout: 10000 });
      const data = JSON.parse(output);
      broadcast({
        type: 'check-result', name,
        valid: true,
        email: data.email || 'unknown',
        subscriptionType: data.subscriptionType || 'unknown'
      });
    } catch {
      broadcast({ type: 'check-result', name, valid: false, email: null, subscriptionType: null });
    }
  });
}

/** POST /api/switch/:name — switch active profile */
function handleSwitchProfile(res, name, json) {
  const profileDir = path.join(PROFILES_DIR, name);
  if (!fs.existsSync(profileDir)) {
    return json(res, 404, { ok: false, error: `Profile "${name}" not found` });
  }

  const profileCreds = path.join(profileDir, CREDS_FILE);
  if (!fs.existsSync(profileCreds)) {
    return json(res, 400, { ok: false, error: `Profile "${name}" has no credentials` });
  }

  try {
    backupBase();
    fs.copyFileSync(profileCreds, path.join(CLAUDE_DIR, CREDS_FILE));

    const settingsPath = path.join(profileDir, SETTINGS_FILE);
    const legacyOverlay = path.join(profileDir, 'settings-overlay.json');
    if (fs.existsSync(settingsPath)) {
      fs.copyFileSync(settingsPath, path.join(CLAUDE_DIR, SETTINGS_FILE));
    } else if (fs.existsSync(legacyOverlay)) {
      fs.copyFileSync(legacyOverlay, path.join(CLAUDE_DIR, SETTINGS_FILE));
    }

    setActiveProfile(name);
    const meta = readJson(path.join(profileDir, 'meta.json'));

    broadcast({ type: 'profile-changed', action: 'switch', name });
    json(res, 200, { ok: true, data: { name, email: meta?.email || 'unknown' } });
  } catch (err) {
    json(res, 500, { ok: false, error: err.message });
  }
}

/** POST /api/save — save current credentials as profile */
function handleSaveProfile(res, body, json) {
  let name;
  try { name = JSON.parse(body).name; } catch {}

  const credsSrc = path.join(CLAUDE_DIR, CREDS_FILE);
  if (!fs.existsSync(credsSrc)) {
    return json(res, 400, { ok: false, error: 'No credentials found. Run "claude auth login" first.' });
  }

  // Auto-detect name from email if not provided
  if (!name) {
    const auth = getAuthStatus();
    if (auth?.email && auth.email !== 'unknown') {
      name = auth.email.split('@')[0].replace(/[^a-zA-Z0-9_-]/g, '-');
    }
    if (!name) {
      return json(res, 400, { ok: false, error: 'Profile name required' });
    }
  }

  try {
    const profileDir = path.join(PROFILES_DIR, name);
    ensureDir(profileDir);
    fs.copyFileSync(credsSrc, path.join(profileDir, CREDS_FILE));
    safeCopy(path.join(CLAUDE_DIR, SETTINGS_FILE), path.join(profileDir, SETTINGS_FILE));

    const auth = getAuthStatus();
    const meta = {
      name,
      email: auth?.email || 'unknown',
      subscriptionType: auth?.subscriptionType || 'unknown',
      savedAt: new Date().toISOString()
    };
    writeJson(path.join(profileDir, 'meta.json'), meta);
    setActiveProfile(name);

    broadcast({ type: 'profile-changed', action: 'save', name });
    json(res, 200, { ok: true, data: meta });
  } catch (err) {
    json(res, 500, { ok: false, error: err.message });
  }
}

/** DELETE /api/delete/:name — remove profile */
function handleDeleteProfile(res, name, json) {
  const profileDir = path.join(PROFILES_DIR, name);
  if (!fs.existsSync(profileDir)) {
    return json(res, 404, { ok: false, error: `Profile "${name}" not found` });
  }

  try {
    if (name === getActiveProfile()) {
      const activeFile = path.join(PROFILES_DIR, 'active');
      fs.writeFileSync(activeFile, '', 'utf8');
    }
    fs.rmSync(profileDir, { recursive: true, force: true });

    broadcast({ type: 'profile-changed', action: 'delete', name });
    json(res, 200, { ok: true, data: { deleted: name } });
  } catch (err) {
    json(res, 500, { ok: false, error: err.message });
  }
}

module.exports = {
  handleListProfiles, handleCheckToken, handleSwitchProfile,
  handleSaveProfile, handleDeleteProfile
};
