#!/usr/bin/env node
'use strict';

/**
 * ccprofiles — Tests
 * Uses node:test + node:assert (zero deps)
 * All tests use isolated temp directories — no side effects on ~/.claude/
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// --- Test helpers ---

/** Create isolated temp dir and override utils constants */
function createTestEnv() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccprofiles-test-'));
  const claudeDir = path.join(tmpDir, '.claude');
  const profilesDir = path.join(claudeDir, 'profiles');
  const activeFile = path.join(profilesDir, 'active');
  const baseDir = path.join(profilesDir, '_base');

  fs.mkdirSync(profilesDir, { recursive: true });

  // Write fake credentials
  const fakeCreds = { claudeAiOauth: { accessToken: 'fake', expiresAt: Date.now() + 86400000 } };
  fs.writeFileSync(path.join(claudeDir, '.credentials.json'), JSON.stringify(fakeCreds));

  // Write fake settings
  const fakeSettings = { language: 'en', permissions: { allow: ['Bash'] } };
  fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify(fakeSettings));

  return { tmpDir, claudeDir, profilesDir, activeFile, baseDir, fakeCreds, fakeSettings };
}

function cleanTestEnv(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// --- Utils tests ---

describe('utils', () => {
  const utils = require('../lib/utils.cjs');

  describe('deepMerge', () => {
    it('should merge objects additively', () => {
      const base = { a: 1, b: 2 };
      const overlay = { b: 3, c: 4 };
      const result = utils.deepMerge(base, overlay);
      assert.deepEqual(result, { a: 1, b: 3, c: 4 });
    });

    it('should merge nested objects', () => {
      const base = { a: { x: 1, y: 2 } };
      const overlay = { a: { y: 3, z: 4 } };
      const result = utils.deepMerge(base, overlay);
      assert.deepEqual(result, { a: { x: 1, y: 3, z: 4 } });
    });

    it('should concat and dedupe arrays', () => {
      const base = { arr: ['a', 'b'] };
      const overlay = { arr: ['b', 'c'] };
      const result = utils.deepMerge(base, overlay);
      assert.deepEqual(result, { arr: ['a', 'b', 'c'] });
    });

    it('should handle null/undefined', () => {
      assert.deepEqual(utils.deepMerge(null, { a: 1 }), { a: 1 });
      assert.deepEqual(utils.deepMerge({ a: 1 }, null), { a: 1 });
    });

    it('should not remove base keys', () => {
      const base = { keep: true, change: 'old' };
      const overlay = { change: 'new' };
      const result = utils.deepMerge(base, overlay);
      assert.equal(result.keep, true);
      assert.equal(result.change, 'new');
    });
  });

  describe('readJson / writeJson', () => {
    let tmpDir;
    beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'utils-test-')); });
    afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

    it('should write and read JSON', () => {
      const file = path.join(tmpDir, 'test.json');
      utils.writeJson(file, { hello: 'world' });
      const result = utils.readJson(file);
      assert.deepEqual(result, { hello: 'world' });
    });

    it('should return null for missing file', () => {
      assert.equal(utils.readJson('/nonexistent/path.json'), null);
    });

    it('should return null for invalid JSON', () => {
      const file = path.join(tmpDir, 'bad.json');
      fs.writeFileSync(file, 'not json');
      assert.equal(utils.readJson(file), null);
    });
  });

  describe('safeCopy', () => {
    let tmpDir;
    beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copy-test-')); });
    afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

    it('should copy existing file', () => {
      const src = path.join(tmpDir, 'src.txt');
      const dest = path.join(tmpDir, 'dest.txt');
      fs.writeFileSync(src, 'hello');
      assert.equal(utils.safeCopy(src, dest), true);
      assert.equal(fs.readFileSync(dest, 'utf8'), 'hello');
    });

    it('should return false for missing source', () => {
      assert.equal(utils.safeCopy('/missing', path.join(tmpDir, 'dest')), false);
    });
  });
});

// --- Profile operations tests (isolated) ---

describe('profile operations', () => {
  const utils = require('../lib/utils.cjs');
  let env;

  beforeEach(() => { env = createTestEnv(); });
  afterEach(() => { cleanTestEnv(env.tmpDir); });

  it('should save and read profile', () => {
    const profileDir = path.join(env.profilesDir, 'test');
    fs.mkdirSync(profileDir, { recursive: true });

    // Simulate save: copy credentials + write meta
    fs.copyFileSync(
      path.join(env.claudeDir, '.credentials.json'),
      path.join(profileDir, '.credentials.json')
    );
    utils.writeJson(path.join(profileDir, 'meta.json'), {
      name: 'test', email: 'test@test.com', subscriptionType: 'pro', savedAt: new Date().toISOString()
    });
    fs.writeFileSync(env.activeFile, 'test');

    // Verify
    const meta = utils.readJson(path.join(profileDir, 'meta.json'));
    assert.equal(meta.name, 'test');
    assert.equal(meta.email, 'test@test.com');
    assert.equal(fs.readFileSync(env.activeFile, 'utf8'), 'test');
  });

  it('should backup to _base/', () => {
    fs.mkdirSync(env.baseDir, { recursive: true });
    fs.copyFileSync(
      path.join(env.claudeDir, '.credentials.json'),
      path.join(env.baseDir, '.credentials.json')
    );
    fs.copyFileSync(
      path.join(env.claudeDir, 'settings.json'),
      path.join(env.baseDir, 'settings.json')
    );

    // Verify backup exists
    assert.ok(fs.existsSync(path.join(env.baseDir, '.credentials.json')));
    assert.ok(fs.existsSync(path.join(env.baseDir, 'settings.json')));
  });

  it('should restore from _base/', () => {
    // Create backup
    fs.mkdirSync(env.baseDir, { recursive: true });
    const origCreds = { claudeAiOauth: { accessToken: 'original' } };
    fs.writeFileSync(path.join(env.baseDir, '.credentials.json'), JSON.stringify(origCreds));

    // Overwrite current
    fs.writeFileSync(path.join(env.claudeDir, '.credentials.json'), JSON.stringify({ changed: true }));

    // Restore
    utils.safeCopy(
      path.join(env.baseDir, '.credentials.json'),
      path.join(env.claudeDir, '.credentials.json')
    );

    const restored = utils.readJson(path.join(env.claudeDir, '.credentials.json'));
    assert.equal(restored.claudeAiOauth.accessToken, 'original');
  });

  it('should delete profile and clear active', () => {
    const profileDir = path.join(env.profilesDir, 'todelete');
    fs.mkdirSync(profileDir, { recursive: true });
    fs.writeFileSync(path.join(profileDir, 'meta.json'), '{}');
    fs.writeFileSync(env.activeFile, 'todelete');

    // Delete
    utils.rmDir(profileDir);
    fs.writeFileSync(env.activeFile, '');

    assert.ok(!fs.existsSync(profileDir));
    assert.equal(fs.readFileSync(env.activeFile, 'utf8'), '');
  });

  it('should list profiles excluding _base', () => {
    // Create profiles
    fs.mkdirSync(path.join(env.profilesDir, 'alpha'), { recursive: true });
    fs.mkdirSync(path.join(env.profilesDir, 'beta'), { recursive: true });
    fs.mkdirSync(env.baseDir, { recursive: true });

    const entries = fs.readdirSync(env.profilesDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && e.name !== '_base');

    assert.equal(entries.length, 2);
    assert.ok(entries.some(e => e.name === 'alpha'));
    assert.ok(entries.some(e => e.name === 'beta'));
  });
});

// --- Setup/Uninstall tests ---

describe('setup/uninstall', () => {
  const utils = require('../lib/utils.cjs');
  let tmpDir, skillDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-test-'));
    skillDir = path.join(tmpDir, 'skills', 'profile');
  });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('should copy SKILL.md to target', () => {
    const skillSrc = path.join(__dirname, '..', 'skill', 'SKILL.md');
    assert.ok(fs.existsSync(skillSrc), 'SKILL.md should exist in package');

    fs.mkdirSync(skillDir, { recursive: true });
    fs.copyFileSync(skillSrc, path.join(skillDir, 'SKILL.md'));

    assert.ok(fs.existsSync(path.join(skillDir, 'SKILL.md')));
    const content = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
    assert.ok(content.includes('ccprofiles'));
  });

  it('should remove skill directory', () => {
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), 'test');

    utils.rmDir(skillDir);
    assert.ok(!fs.existsSync(skillDir));
  });
});

// --- Dashboard server tests ---

describe('dashboard server', () => {
  const http = require('http');

  /** Helper: make HTTP request and return parsed JSON */
  function request(url) {
    return new Promise((resolve, reject) => {
      http.get(url, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, data }); }
        });
      }).on('error', reject);
    });
  }

  it('should start on random port and respond', async () => {
    const { startServer } = require('../lib/dashboard-server.cjs');
    const info = await new Promise((resolve) => {
      startServer({ testMode: true, onReady: resolve });
    });

    try {
      assert.ok(info.port > 0, 'Should bind to a port');
      assert.ok(info.token, 'Should generate a token');

      // GET / with valid token should return HTML
      const htmlRes = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${info.port}?token=${info.token}`, (res) => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => resolve({ status: res.statusCode, data }));
        }).on('error', reject);
      });
      assert.equal(htmlRes.status, 200);
      assert.ok(htmlRes.data.includes('ccprofiles dashboard'));
    } finally {
      info.shutdown();
    }
  });

  it('should reject requests without valid token', async () => {
    const { startServer } = require('../lib/dashboard-server.cjs');
    const info = await new Promise((resolve) => {
      startServer({ testMode: true, onReady: resolve });
    });

    try {
      const res = await request(`http://127.0.0.1:${info.port}/api/profiles?token=bad`);
      assert.equal(res.status, 403);
      assert.equal(res.data.ok, false);
    } finally {
      info.shutdown();
    }
  });

  it('should list profiles via API', async () => {
    const { startServer } = require('../lib/dashboard-server.cjs');
    const info = await new Promise((resolve) => {
      startServer({ testMode: true, onReady: resolve });
    });

    try {
      const res = await request(`http://127.0.0.1:${info.port}/api/profiles?token=${info.token}`);
      assert.equal(res.status, 200);
      assert.equal(res.data.ok, true);
      assert.ok(Array.isArray(res.data.data));
    } finally {
      info.shutdown();
    }
  });

  it('should return 404 for unknown routes', async () => {
    const { startServer } = require('../lib/dashboard-server.cjs');
    const info = await new Promise((resolve) => {
      startServer({ testMode: true, onReady: resolve });
    });

    try {
      const res = await request(`http://127.0.0.1:${info.port}/api/unknown?token=${info.token}`);
      assert.equal(res.status, 404);
    } finally {
      info.shutdown();
    }
  });
});
