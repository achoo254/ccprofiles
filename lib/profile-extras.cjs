#!/usr/bin/env node
'use strict';

/**
 * ccprofiles - Extra commands (whoami, check, clone, setup, uninstall, help)
 *
 * Utility and lifecycle commands separated from core profile operations.
 */

const fs = require('fs');
const path = require('path');
const {
  CLAUDE_DIR, PROFILES_DIR, SKILL_TARGET_DIR, CREDS_FILE, SETTINGS_FILE,
  ensureDir, readJson, writeJson, rmDir
} = require('./utils.cjs');
const { getActiveProfile, getAuthStatus, profileHasCreds } = require('./profile-commands.cjs');

/** One-line active profile output — script-friendly */
function cmdWhoami() {
  const active = getActiveProfile();
  if (!active) { console.log('none'); return; }

  const meta = readJson(path.join(PROFILES_DIR, active, 'meta.json'));
  const email = meta?.email || 'unknown';
  const sub = meta?.subscriptionType || '?';
  const warn = profileHasCreds(active) ? '' : ' ⚠ no credentials — run: ccprofiles save ' + active;
  console.log(`${active} (${email}) [${sub}]${warn}`);
}

/** Proactive token validation — calls claude auth status */
function cmdCheck() {
  const active = getActiveProfile();
  if (!active) {
    console.log('No active profile.');
    return;
  }

  const auth = getAuthStatus();
  if (auth) {
    console.log(`✓ Token valid — ${auth.email} [${auth.subscriptionType}]`);
  } else {
    console.log(`✗ Token expired or invalid for profile "${active}".`);
    console.log(`  Fix: claude auth login && ccprofiles save ${active}`);
  }
}

/** Clone profile skeleton without credentials (for cross-machine setup) */
function cmdClone(name) {
  if (!name) { console.error('Error: Profile name required. Usage: ccprofiles clone <name>'); process.exit(1); }

  const profileDir = path.join(PROFILES_DIR, name);
  if (!fs.existsSync(profileDir)) {
    console.error(`Error: Profile "${name}" not found.`);
    process.exit(1);
  }

  const meta = readJson(path.join(profileDir, 'meta.json'));
  const settings = readJson(path.join(profileDir, SETTINGS_FILE))
    || readJson(path.join(profileDir, 'settings-overlay.json'));

  const skeleton = { meta: meta || {}, settings: settings || {} };
  const outFile = `${name}-profile.json`;
  writeJson(path.join(process.cwd(), outFile), skeleton);
  console.log(`✓ Exported "${name}" skeleton to ./${outFile}`);
  console.log('  Note: No credentials included. Run "claude auth login" on new machine then "ccprofiles save".');
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

/** Start browser-based dashboard */
function cmdDashboard() {
  const { startServer } = require('./dashboard-server.cjs');
  startServer();
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
  save [name]                Snapshot current credentials (auto-detects name from email)
  switch <name>              Switch to a saved profile
  list                       Show all profiles
  status                     Show current profile details
  whoami                     One-line active profile (script-friendly)
  check                      Verify token is still valid
  delete <name>              Delete a profile
  restore                    Rollback to pre-switch backup
  clone <name>               Export profile skeleton (no credentials)
  dashboard                  Open browser dashboard to manage profiles

Options:
  --version, -v              Show version
  --help, -h                 Show this help

Examples:
  ccprofiles save work
  ccprofiles save                # auto-detect name from email
  ccprofiles switch work
  ccprofiles whoami              # output: work (user@email.com) [team]
  ccprofiles check               # verify token validity
  ccprofiles clone work          # export for another machine
  ccprofiles dashboard           # open browser dashboard`);
}

module.exports = {
  cmdWhoami, cmdCheck, cmdClone, cmdSetup, cmdUninstall, cmdDashboard, showHelp
};
