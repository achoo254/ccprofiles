#!/usr/bin/env node
'use strict';

/**
 * dashboard-server.cjs — HTTP server + routing for dashboard
 *
 * Binds 127.0.0.1, port 0 (OS auto-assign), random token for CSRF.
 * Auto-shutdown after 10min idle. Zero dependencies.
 */

const http = require('http');
const crypto = require('crypto');

const { generateHTML } = require('./dashboard-template.cjs');
const {
  handleListProfiles, handleCheckToken, handleCheckResult, handleCheckAll,
  handleSwitchProfile, handleSaveProfile, handleDeleteProfile,
  handleUsage, handleProfileUsage
} = require('./dashboard-api-handlers.cjs');

const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Start dashboard HTTP server.
 * @param {object} opts - { testMode, onReady }
 */
function startServer(opts = {}) {
  const token = crypto.randomBytes(16).toString('hex');
  let idleTimer = null;

  const server = http.createServer((req, res) => {
    resetIdle();
    handleRequest(req, res, token);
  });

  function resetIdle() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      console.log('\n⏱ Dashboard idle for 10 minutes — shutting down.');
      shutdown();
    }, IDLE_TIMEOUT_MS);
  }

  function shutdown() {
    if (idleTimer) clearTimeout(idleTimer);
    server.close();
  }

  // Graceful Ctrl+C
  const onSigint = () => { console.log('\n✓ Dashboard stopped.'); shutdown(); process.exit(0); };
  if (!opts.testMode) process.on('SIGINT', onSigint);

  server.listen({ host: '127.0.0.1', port: 0 }, () => {
    const { port } = server.address();
    const url = `http://127.0.0.1:${port}?token=${token}`;

    if (!opts.testMode) {
      console.log(`\n✓ Dashboard running at: ${url}`);
      console.log('  Press Ctrl+C to stop.\n');
      openBrowser(url);
    }

    resetIdle();
    if (opts.onReady) opts.onReady({ server, url, token, port, shutdown });
  });

  return { server, token, shutdown };
}

/** Route requests to handlers */
function handleRequest(req, res, token) {
  const url = new URL(req.url, 'http://localhost');

  // Validate token on all requests
  if (url.searchParams.get('token') !== token) {
    return jsonResponse(res, 403, { ok: false, error: 'Forbidden' });
  }

  const method = req.method;
  const pathname = url.pathname;

  // Serve dashboard HTML
  if (method === 'GET' && pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(generateHTML(token));
    return;
  }

  // API routes
  if (method === 'GET' && pathname === '/api/profiles') {
    return handleListProfiles(res, jsonResponse);
  }

  if (method === 'GET' && pathname === '/api/usage') {
    return handleUsage(res, jsonResponse);
  }

  const usageProfileMatch = pathname.match(/^\/api\/usage\/(.+)$/);
  if (method === 'GET' && usageProfileMatch) {
    const name = sanitizeName(usageProfileMatch[1]);
    if (!name) return jsonResponse(res, 400, { ok: false, error: 'Invalid profile name' });
    return handleProfileUsage(res, name, jsonResponse);
  }

  // Check-all must come before check/:name to avoid matching "all" as a name
  if (method === 'GET' && pathname === '/api/check-all') {
    return handleCheckAll(res, jsonResponse);
  }

  const checkResultMatch = pathname.match(/^\/api\/check-result\/(.+)$/);
  if (method === 'GET' && checkResultMatch) {
    const name = sanitizeName(checkResultMatch[1]);
    if (!name) return jsonResponse(res, 400, { ok: false, error: 'Invalid profile name' });
    return handleCheckResult(res, name, jsonResponse);
  }

  const checkMatch = pathname.match(/^\/api\/check\/(.+)$/);
  if (method === 'GET' && checkMatch) {
    const name = sanitizeName(checkMatch[1]);
    if (!name) return jsonResponse(res, 400, { ok: false, error: 'Invalid profile name' });
    return handleCheckToken(res, name, jsonResponse);
  }

  const switchMatch = pathname.match(/^\/api\/switch\/(.+)$/);
  if (method === 'POST' && switchMatch) {
    const name = sanitizeName(switchMatch[1]);
    if (!name) return jsonResponse(res, 400, { ok: false, error: 'Invalid profile name' });
    return handleSwitchProfile(res, name, jsonResponse);
  }

  if (method === 'POST' && pathname === '/api/save') {
    return readBody(req, (body) => handleSaveProfile(res, body, jsonResponse));
  }

  const deleteMatch = pathname.match(/^\/api\/delete\/(.+)$/);
  if (method === 'DELETE' && deleteMatch) {
    const name = sanitizeName(deleteMatch[1]);
    if (!name) return jsonResponse(res, 400, { ok: false, error: 'Invalid profile name' });
    return handleDeleteProfile(res, name, jsonResponse);
  }

  jsonResponse(res, 404, { ok: false, error: 'Not found' });
}

// --- Helpers ---

/** Validate and sanitize profile name — prevents path traversal (C1 fix) */
function sanitizeName(raw) {
  const name = decodeURIComponent(raw);
  return /^[a-zA-Z0-9_-]+$/.test(name) ? name : null;
}

/** Send JSON response */
function jsonResponse(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

/** Read request body as string (capped at 1KB to prevent OOM) */
function readBody(req, cb) {
  let data = '';
  req.on('data', chunk => {
    data += chunk;
    if (data.length > 1024) { req.destroy(); cb('{}'); }
  });
  req.on('end', () => cb(data));
}

/** Cross-platform browser open */
function openBrowser(url) {
  const { exec } = require('child_process');
  const platform = process.platform;
  let cmd;
  if (platform === 'win32') cmd = `start "" "${url}"`;
  else if (platform === 'darwin') cmd = `open "${url}"`;
  else cmd = `xdg-open "${url}"`;
  exec(cmd, () => {}); // ignore errors — URL printed as fallback
}

module.exports = { startServer };
