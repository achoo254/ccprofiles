#!/usr/bin/env node
'use strict';

/**
 * ccprofiles - Profile Manager Core
 *
 * Command functions for managing Claude Code OAuth profiles.
 * Each function is exported for use by CLI binary and tests.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const {
  CLAUDE_DIR, PROFILES_DIR, ACTIVE_FILE, BASE_DIR, SKILL_TARGET_DIR,
  CREDS_FILE, SETTINGS_FILE, CLAUDE_MD,
  ensureDir, readJson, writeJson, safeCopy, safeRead,
  copyDirAdditive, rmDir, deepMerge
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
  safeCopy(path.join(CLAUDE_DIR, CLAUDE_MD), path.join(BASE_DIR, CLAUDE_MD));
}

/** Get auth status from claude CLI — returns { email, subscriptionType } or null */
function getAuthStatus() {
  try {
    const output = execSync('claude auth status', { encoding: 'utf8', timeout: 10000 });
    const data = JSON.parse(output);
    return {
      email: data.email || 'unknown',
      subscriptionType: data.subscriptionType || 'unknown'
    };
  } catch { return null; }
}

// --- Commands ---

/** Save current credentials + config as a named profile */
function cmdSave(name) {
  if (!name) { console.error('Error: Profile name required. Usage: ccprofiles save <name>'); process.exit(1); }

  const profileDir = path.join(PROFILES_DIR, name);
  ensureDir(profileDir);

  const credsSrc = path.join(CLAUDE_DIR, CREDS_FILE);
  if (!fs.existsSync(credsSrc)) {
    console.error('Error: No credentials found. Run "claude auth login" first.');
    process.exit(1);
  }
  fs.copyFileSync(credsSrc, path.join(profileDir, CREDS_FILE));

  safeCopy(path.join(CLAUDE_DIR, SETTINGS_FILE), path.join(profileDir, 'settings-overlay.json'));
  safeCopy(path.join(CLAUDE_DIR, CLAUDE_MD), path.join(profileDir, CLAUDE_MD));

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

/** Trigger OAuth login then auto-save */
function cmdAdd(name, email) {
  if (!name) { console.error('Error: Profile name required. Usage: ccprofiles add <name> [--email <email>]'); process.exit(1); }

  let loginCmd = 'claude auth login';
  if (email) loginCmd += ` --email ${email}`;

  console.log(`Opening OAuth login${email ? ` for ${email}` : ''}...`);

  try {
    execSync(loginCmd, { stdio: 'inherit', timeout: 120000 });
  } catch {
    console.error('Error: OAuth login failed or timed out.');
    process.exit(1);
  }

  cmdSave(name);
  console.log(`✓ Profile "${name}" created and active.`);
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

  // Apply settings overlay (deep merge)
  const overlayPath = path.join(profileDir, 'settings-overlay.json');
  if (fs.existsSync(overlayPath)) {
    const currentSettings = readJson(path.join(CLAUDE_DIR, SETTINGS_FILE)) || {};
    const overlay = readJson(overlayPath);
    if (overlay) {
      writeJson(path.join(CLAUDE_DIR, SETTINGS_FILE), deepMerge(currentSettings, overlay));
    }
  }

  safeCopy(path.join(profileDir, CLAUDE_MD), path.join(CLAUDE_DIR, CLAUDE_MD));
  copyDirAdditive(path.join(profileDir, 'rules'), path.join(CLAUDE_DIR, 'rules'));

  setActiveProfile(name);

  const meta = readJson(path.join(profileDir, 'meta.json'));
  console.log(`✓ Switched to "${name}" (${meta?.email || 'unknown'})`);
  console.log('  Restart Claude Code or run /clear to apply.');
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
    console.log('No profiles found. Use "ccprofiles save <name>" or "ccprofiles add <name>" to create one.');
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

/** Show current profile status */
function cmdStatus() {
  const active = getActiveProfile();
  if (!active) {
    console.log('No active profile. Use "ccprofiles save <name>" to create one.');
    return;
  }

  const meta = readJson(path.join(PROFILES_DIR, active, 'meta.json'));
  console.log(`\nActive Profile: ${active}`);
  if (meta) {
    console.log(`  Email:        ${meta.email || 'unknown'}`);
    console.log(`  Subscription: ${meta.subscriptionType || 'unknown'}`);
    console.log(`  Saved at:     ${meta.savedAt || 'unknown'}`);
  }

  const creds = readJson(path.join(CLAUDE_DIR, CREDS_FILE));
  if (creds?.claudeAiOauth?.expiresAt) {
    const exp = new Date(creds.claudeAiOauth.expiresAt);
    const now = new Date();
    if (now > exp) {
      console.log(`  Token:        ⚠ EXPIRED (${exp.toISOString()})`);
    } else {
      const days = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
      console.log(`  Token:        ✓ valid (${days} days remaining)`);
    }
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
  safeCopy(path.join(BASE_DIR, CLAUDE_MD), path.join(CLAUDE_DIR, CLAUDE_MD));

  fs.writeFileSync(ACTIVE_FILE, '', 'utf8');
  console.log('✓ Restored to base config from backup.');
  console.log('  Restart Claude Code or run /clear to apply.');
}

/** Install SKILL.md into ~/.claude/skills/profile/ */
function cmdSetup() {
  const skillSrc = path.join(__dirname, '..', 'skill', 'SKILL.md');
  if (!fs.existsSync(skillSrc)) {
    console.error('Error: SKILL.md not found in package. Reinstall ccprofiles.');
    process.exit(1);
  }

  ensureDir(SKILL_TARGET_DIR);
  fs.copyFileSync(skillSrc, path.join(SKILL_TARGET_DIR, 'SKILL.md'));
  ensureDir(PROFILES_DIR);

  console.log('✓ Installed /profile skill into Claude Code.');
  console.log('  Use /profile in Claude Code sessions to manage profiles.');
}

/** Remove skill from ~/.claude/skills/profile/ */
function cmdUninstall() {
  if (fs.existsSync(SKILL_TARGET_DIR)) {
    rmDir(SKILL_TARGET_DIR);
    console.log('✓ Removed /profile skill from Claude Code.');
  } else {
    console.log('Skill not installed. Nothing to remove.');
  }
  console.log('  Note: Your profiles in ~/.claude/profiles/ are preserved.');
}

/** Show help text */
function showHelp() {
  console.log(`ccprofiles — Multi-account profile manager for Claude Code

Usage:
  ccprofiles <command> [options]

Setup:
  setup                      Install /profile skill into Claude Code
  uninstall                  Remove /profile skill from Claude Code

Profile Management:
  add <name> [--email <e>]   OAuth login + save as new profile
  save <name>                Snapshot current credentials as profile
  switch <name>              Switch to a saved profile
  list                       Show all profiles
  status                     Show current profile details
  delete <name>              Delete a profile
  restore                    Rollback to pre-switch backup

Options:
  --version, -v              Show version
  --help, -h                 Show this help

Examples:
  ccprofiles save work
  ccprofiles add personal --email me@gmail.com
  ccprofiles switch work
  ccprofiles list`);
}

module.exports = {
  cmdAdd, cmdSave, cmdSwitch, cmdList, cmdStatus, cmdDelete, cmdRestore,
  cmdSetup, cmdUninstall, showHelp,
  // Exposed for testing
  getActiveProfile, setActiveProfile, backupBase, getAuthStatus
};
