#!/usr/bin/env node
'use strict';

/**
 * ccprofiles - Core profile commands
 *
 * Save, switch, list, status, delete, restore operations.
 */

const fs = require('fs');
const path = require('path');
const {
  CLAUDE_DIR, PROFILES_DIR, ACTIVE_FILE, BASE_DIR,
  CREDS_FILE, SETTINGS_FILE,
  ensureDir, readJson, writeJson, safeCopy, safeRead, rmDir
} = require('./utils.cjs');

// --- Internal Helpers ---

/** Get active profile name or null */
function getActiveProfile() {
  const name = safeRead(ACTIVE_FILE);
  return name || null;
}

/** Set active profile name */
function setActiveProfile(name) {
  ensureDir(PROFILES_DIR);
  fs.writeFileSync(ACTIVE_FILE, name, 'utf8');
}

/** Backup current state to _base/ before switch */
function backupBase() {
  ensureDir(BASE_DIR);
  safeCopy(path.join(CLAUDE_DIR, CREDS_FILE), path.join(BASE_DIR, CREDS_FILE));
  safeCopy(path.join(CLAUDE_DIR, SETTINGS_FILE), path.join(BASE_DIR, SETTINGS_FILE));
}

/** Get auth status from claude CLI — returns { email, subscriptionType, orgName } or null */
function getAuthStatus() {
  const { execSync } = require('child_process');
  try {
    const output = execSync('claude auth status', { encoding: 'utf8', timeout: 10000 });
    const data = JSON.parse(output);
    return {
      email: data.email || 'unknown',
      subscriptionType: data.subscriptionType || 'unknown',
      orgName: data.orgName || null
    };
  } catch { return null; }
}

/** Read credential extras (tier, scopes) from .credentials.json — fast, no subprocess */
function getCredentialExtras() {
  const creds = readJson(path.join(CLAUDE_DIR, CREDS_FILE));
  const oauth = creds?.claudeAiOauth;
  if (!oauth) return null;
  return {
    rateLimitTier: oauth.rateLimitTier || null,
    scopes: Array.isArray(oauth.scopes) ? oauth.scopes : [],
    expiresAt: oauth.expiresAt || null
  };
}

/** Read configured model from settings.json */
function getConfiguredModel() {
  const settings = readJson(path.join(CLAUDE_DIR, SETTINGS_FILE));
  return settings?.model || null;
}

/** Save current credentials + settings as a named profile */
function cmdSave(name) {
  const credsSrc = path.join(CLAUDE_DIR, CREDS_FILE);
  if (!fs.existsSync(credsSrc)) {
    console.error('Error: No credentials found. Run "claude auth login" first.');
    process.exit(1);
  }

  // Auto-detect name from email if not provided
  if (!name) {
    const auth = getAuthStatus();
    if (auth?.email && auth.email !== 'unknown') {
      name = auth.email.split('@')[0].replace(/[^a-zA-Z0-9_-]/g, '-');
    }
    if (!name) {
      console.error('Error: Profile name required. Usage: ccprofiles save <name>');
      process.exit(1);
    }
    console.log(`  Auto-detected name: "${name}"`);
  }

  const profileDir = path.join(PROFILES_DIR, name);
  ensureDir(profileDir);

  fs.copyFileSync(credsSrc, path.join(profileDir, CREDS_FILE));
  safeCopy(path.join(CLAUDE_DIR, SETTINGS_FILE), path.join(profileDir, SETTINGS_FILE));

  const auth = getAuthStatus();
  const meta = {
    name,
    email: auth ? auth.email : 'unknown',
    subscriptionType: auth ? auth.subscriptionType : 'unknown',
    savedAt: new Date().toISOString()
  };
  writeJson(path.join(profileDir, 'meta.json'), meta);

  setActiveProfile(name);
  console.log(`✓ Profile "${name}" saved (${meta.email})`);
}

/** Switch to a named profile */
function cmdSwitch(name) {
  if (!name) { console.error('Error: Profile name required. Usage: ccprofiles switch <name>'); process.exit(1); }

  const profileDir = path.join(PROFILES_DIR, name);
  if (!fs.existsSync(profileDir)) {
    console.error(`Error: Profile "${name}" not found. Run "ccprofiles list" to see available profiles.`);
    process.exit(1);
  }

  const profileCreds = path.join(profileDir, CREDS_FILE);
  if (!fs.existsSync(profileCreds)) {
    console.error(`Error: Profile "${name}" has no credentials. Re-save with "ccprofiles save ${name}".`);
    process.exit(1);
  }

  // Warn on expired token
  const creds = readJson(profileCreds);
  if (creds?.claudeAiOauth?.expiresAt && Date.now() > creds.claudeAiOauth.expiresAt) {
    console.warn(`⚠ Warning: Token for "${name}" may be expired. You may need to re-auth after switch.`);
  }

  backupBase();
  fs.copyFileSync(profileCreds, path.join(CLAUDE_DIR, CREDS_FILE));

  // Full replace settings (check both new and legacy filenames)
  const settingsPath = path.join(profileDir, SETTINGS_FILE);
  const legacyOverlay = path.join(profileDir, 'settings-overlay.json');
  if (fs.existsSync(settingsPath)) {
    fs.copyFileSync(settingsPath, path.join(CLAUDE_DIR, SETTINGS_FILE));
  } else if (fs.existsSync(legacyOverlay)) {
    fs.copyFileSync(legacyOverlay, path.join(CLAUDE_DIR, SETTINGS_FILE));
  }

  setActiveProfile(name);

  const meta = readJson(path.join(profileDir, 'meta.json'));
  console.log(`✓ Switched to "${name}" (${meta?.email || 'unknown'})`);
  console.log('  Exit Claude Code and reopen to apply the new profile.');
  console.log('  Then run: /profile status — to verify correct account.');
}

/** List all profiles */
function cmdList() {
  ensureDir(PROFILES_DIR);
  const active = getActiveProfile();

  const entries = fs.readdirSync(PROFILES_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name !== '_base')
    .map(e => {
      const meta = readJson(path.join(PROFILES_DIR, e.name, 'meta.json'));
      return {
        name: e.name,
        email: meta?.email || 'unknown',
        subscription: meta?.subscriptionType || '?',
        active: e.name === active
      };
    });

  if (entries.length === 0) {
    console.log('No profiles found. Use "ccprofiles save <name>" to create one.');
    return;
  }

  console.log('\nProfiles:\n');
  const nameW = Math.max(8, ...entries.map(e => e.name.length));
  const emailW = Math.max(8, ...entries.map(e => e.email.length));

  console.log(`  ${'NAME'.padEnd(nameW)}  ${'EMAIL'.padEnd(emailW)}  TYPE      STATUS`);
  console.log(`  ${'-'.repeat(nameW)}  ${'-'.repeat(emailW)}  --------  ------`);

  for (const e of entries) {
    const marker = e.active ? '● active' : '';
    console.log(`  ${e.name.padEnd(nameW)}  ${e.email.padEnd(emailW)}  ${e.subscription.padEnd(8)}  ${marker}`);
  }
  console.log('');
}

/** Show current profile status with extended info */
function cmdStatus() {
  const active = getActiveProfile();
  if (!active) {
    console.log('No active profile. Use "ccprofiles save <name>" to create one.');
    return;
  }

  const meta = readJson(path.join(PROFILES_DIR, active, 'meta.json'));
  const extras = getCredentialExtras();
  const model = getConfiguredModel();

  console.log(`\nActive Profile: ${active}`);
  if (meta) {
    console.log(`  Email:        ${meta.email || 'unknown'}`);
    console.log(`  Subscription: ${meta.subscriptionType || 'unknown'}`);
  }

  // Live data from credentials file (fast, no subprocess)
  if (extras?.rateLimitTier) {
    console.log(`  Rate Limit:   ${extras.rateLimitTier}`);
  }
  if (extras?.scopes?.length) {
    const short = extras.scopes.map(s => s.replace('user:', '')).join(', ');
    console.log(`  Scopes:       ${short}`);
  }
  console.log(`  Model:        ${model || '(default)'}`);

  if (extras?.expiresAt) {
    const exp = new Date(extras.expiresAt);
    const now = new Date();
    if (now > exp) {
      console.log(`  Token:        ⚠ EXPIRED (${exp.toISOString()})`);
    } else {
      const days = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
      console.log(`  Token:        ✓ valid (${days} days remaining)`);
    }
  }

  if (meta?.savedAt) {
    console.log(`  Saved at:     ${meta.savedAt}`);
  }
  console.log('');
}

/** Delete a named profile */
function cmdDelete(name) {
  if (!name) { console.error('Error: Profile name required. Usage: ccprofiles delete <name>'); process.exit(1); }

  const profileDir = path.join(PROFILES_DIR, name);
  if (!fs.existsSync(profileDir)) {
    console.error(`Error: Profile "${name}" not found.`);
    process.exit(1);
  }

  if (name === getActiveProfile()) {
    console.warn(`⚠ Warning: Deleting active profile "${name}". Active profile will be cleared.`);
    fs.writeFileSync(ACTIVE_FILE, '', 'utf8');
  }

  rmDir(profileDir);
  console.log(`✓ Profile "${name}" deleted.`);
}

/** Restore from _base/ backup */
function cmdRestore() {
  if (!fs.existsSync(BASE_DIR)) {
    console.error('Error: No backup found. Nothing to restore.');
    process.exit(1);
  }

  safeCopy(path.join(BASE_DIR, CREDS_FILE), path.join(CLAUDE_DIR, CREDS_FILE));
  safeCopy(path.join(BASE_DIR, SETTINGS_FILE), path.join(CLAUDE_DIR, SETTINGS_FILE));

  fs.writeFileSync(ACTIVE_FILE, '', 'utf8');
  console.log('✓ Restored to base config from backup.');
  console.log('  Exit Claude Code and reopen to apply the restored config.');
}

module.exports = {
  cmdSave, cmdSwitch, cmdList, cmdStatus, cmdDelete, cmdRestore,
  // Exposed for dashboard + testing
  getActiveProfile, setActiveProfile, backupBase, getAuthStatus,
  getCredentialExtras, getConfiguredModel
};
