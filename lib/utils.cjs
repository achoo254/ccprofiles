#!/usr/bin/env node
'use strict';

/**
 * ccprofiles - Shared utilities and constants
 *
 * File system helpers, deep merge, and path constants for profile management.
 * Zero external dependencies — Node.js built-ins only.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// --- Constants ---
const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const PROFILES_DIR = path.join(CLAUDE_DIR, 'profiles');
const ACTIVE_FILE = path.join(PROFILES_DIR, 'active');
const BASE_DIR = path.join(PROFILES_DIR, '_base');
const SKILL_TARGET_DIR = path.join(CLAUDE_DIR, 'skills', 'profile');

const CREDS_FILE = '.credentials.json';
const SETTINGS_FILE = 'settings.json';
const CLAUDE_MD = 'CLAUDE.md';

// --- File System Helpers ---

/** Ensure directory exists, create recursively if not */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Safe JSON read — returns null on parse failure or missing file */
function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch { return null; }
}

/** Write JSON with pre-write validation — throws on invalid structure */
function writeJson(filePath, data) {
  const json = JSON.stringify(data, null, 2);
  JSON.parse(json); // validate roundtrip before writing
  fs.writeFileSync(filePath, json, 'utf8');
}

/** Safe file copy — returns false if source doesn't exist */
function safeCopy(src, dest) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    return true;
  }
  return false;
}

/** Safe file read — returns empty string if missing */
function safeRead(filePath) {
  try { return fs.readFileSync(filePath, 'utf8').trim(); } catch { return ''; }
}

/** Copy directory contents recursively (additive — won't delete existing files) */
function copyDirAdditive(src, dest) {
  if (!fs.existsSync(src)) return;
  ensureDir(dest);
  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    if (fs.statSync(srcPath).isDirectory()) {
      copyDirAdditive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/** Remove directory recursively (safe — no error if missing) */
function rmDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Deep merge two objects — additive only (base keys never removed).
 * Arrays: concatenated + deduped. Objects: merged recursively. Primitives: overlay wins.
 */
function deepMerge(base, overlay) {
  if (!overlay) return base;
  if (!base) return overlay;

  const result = { ...base };
  for (const key of Object.keys(overlay)) {
    const bVal = base[key];
    const oVal = overlay[key];

    if (Array.isArray(bVal) && Array.isArray(oVal)) {
      const merged = [...bVal, ...oVal];
      result[key] = [...new Set(merged.map(v => typeof v === 'string' ? v : JSON.stringify(v)))]
        .map(v => { try { return JSON.parse(v); } catch { return v; } });
    } else if (bVal && typeof bVal === 'object' && !Array.isArray(bVal)
            && oVal && typeof oVal === 'object' && !Array.isArray(oVal)) {
      result[key] = deepMerge(bVal, oVal);
    } else {
      result[key] = oVal;
    }
  }
  return result;
}

module.exports = {
  // Constants
  CLAUDE_DIR, PROFILES_DIR, ACTIVE_FILE, BASE_DIR, SKILL_TARGET_DIR,
  CREDS_FILE, SETTINGS_FILE, CLAUDE_MD,
  // Functions
  ensureDir, readJson, writeJson, safeCopy, safeRead,
  copyDirAdditive, rmDir, deepMerge
};
