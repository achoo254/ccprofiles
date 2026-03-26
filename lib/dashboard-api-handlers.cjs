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
const { spawn } = require('child_process');

const { broadcast } = require('./dashboard-websocket.cjs');
const {
  PROFILES_DIR, CLAUDE_DIR, CREDS_FILE, SETTINGS_FILE,
  ensureDir, readJson, writeJson, safeCopy
} = require('./utils.cjs');
const { getActiveProfile, setActiveProfile, backupBase, getAuthStatus, getCredentialExtras, getConfiguredModel } = require('./profile-commands.cjs');

/** In-memory cache of check results: name → { valid, email, subscriptionType, checkedAt } */
const checkResults = new Map();

/** GET /api/profiles — list all profiles with meta + active marker + extras */
function handleListProfiles(res, json) {
  ensureDir(PROFILES_DIR);
  const active = getActiveProfile();
  const extras = getCredentialExtras();
  const model = getConfiguredModel();

  try {
    const entries = fs.readdirSync(PROFILES_DIR, { withFileTypes: true })
      .filter(e => e.isDirectory() && e.name !== '_base')
      .map(e => {
        const isActive = e.name === active;
        const meta = readJson(path.join(PROFILES_DIR, e.name, 'meta.json'));
        const entry = {
          name: e.name,
          email: meta?.email || 'unknown',
          subscriptionType: meta?.subscriptionType || 'unknown',
          savedAt: meta?.savedAt || null,
          active: isActive
        };
        // Attach live credential extras for active profile
        if (isActive && extras) {
          entry.rateLimitTier = extras.rateLimitTier;
          entry.model = model;
        }
        return entry;
      });
    json(res, 200, { ok: true, data: entries });
  } catch (err) {
    json(res, 500, { ok: false, error: err.message });
  }
}

/** Run `claude auth status` via spawn (non-blocking). Caches result + broadcasts via WS. */
function runAuthCheck(name) {
  const child = spawn('claude', ['auth', 'status'], {
    encoding: 'utf8', timeout: 15000, shell: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });

  child.on('close', (code) => {
    let result;
    if (code === 0) {
      try {
        const data = JSON.parse(stdout);
        result = {
          type: 'check-result', name, valid: true,
          email: data.email || 'unknown',
          subscriptionType: data.subscriptionType || 'unknown'
        };
      } catch {
        result = { type: 'check-result', name, valid: false, email: null, subscriptionType: null };
      }
    } else {
      result = { type: 'check-result', name, valid: false, email: null, subscriptionType: null };
    }
    checkResults.set(name, { ...result, checkedAt: Date.now() });
    broadcast(result);
  });

  child.on('error', () => {
    const result = { type: 'check-result', name, valid: false, email: null, subscriptionType: null };
    checkResults.set(name, { ...result, checkedAt: Date.now() });
    broadcast(result);
  });
}

/** GET /api/check/:name — async token validation, result via WS + cached for HTTP fallback */
function handleCheckToken(res, name, json) {
  const profileDir = path.join(PROFILES_DIR, name);
  if (!fs.existsSync(profileDir)) {
    return json(res, 404, { ok: false, error: `Profile "${name}" not found` });
  }

  json(res, 200, { ok: true, status: 'checking' });
  runAuthCheck(name);
}

/** GET /api/check-result/:name — return cached check result (HTTP fallback when WS is dead) */
function handleCheckResult(res, name, json) {
  const cached = checkResults.get(name);
  if (!cached) {
    return json(res, 200, { ok: true, data: null });
  }
  const { type, ...data } = cached;
  json(res, 200, { ok: true, data });
}

/** GET /api/check-all — trigger check for all profiles, active profile via CLI, others from meta */
function handleCheckAll(res, json) {
  ensureDir(PROFILES_DIR);
  const active = getActiveProfile();

  try {
    const profiles = fs.readdirSync(PROFILES_DIR, { withFileTypes: true })
      .filter(e => e.isDirectory() && e.name !== '_base')
      .map(e => e.name);

    // Active profile: run real auth check via spawn
    if (active && profiles.includes(active)) {
      runAuthCheck(active);
    }

    // Non-active profiles: read meta.json for cached info (can't check without switching)
    for (const name of profiles) {
      if (name === active) continue;
      const meta = readJson(path.join(PROFILES_DIR, name, 'meta.json'));
      const result = {
        type: 'check-result', name,
        valid: null, // null = unknown (can't check non-active token)
        email: meta?.email || 'unknown',
        subscriptionType: meta?.subscriptionType || 'unknown'
      };
      checkResults.set(name, { ...result, checkedAt: Date.now() });
      broadcast(result);
    }

    json(res, 200, { ok: true, status: 'checking', count: profiles.length });
  } catch (err) {
    json(res, 500, { ok: false, error: err.message });
  }
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
  handleListProfiles, handleCheckToken, handleCheckResult, handleCheckAll,
  handleSwitchProfile, handleSaveProfile, handleDeleteProfile
};
