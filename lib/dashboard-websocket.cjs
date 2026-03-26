#!/usr/bin/env node
'use strict';

/**
 * dashboard-websocket.cjs — Minimal RFC 6455 WebSocket server
 *
 * Text frames only. No binary/continuation. Zero dependencies.
 * Used by dashboard-server.cjs for real-time profile updates.
 */

const crypto = require('crypto');

const MAGIC = '258EAFA5-E914-47DA-95CA-5AB9DC76BE58';
const OPCODE_TEXT = 0x81;
const OPCODE_CLOSE = 0x88;
const OPCODE_PING = 0x89;
const OPCODE_PONG = 0x8A;

/** Active WebSocket connections */
const clients = new Set();

/**
 * Handle HTTP upgrade to WebSocket.
 * Validates token query param and Sec-WebSocket-Key header.
 * Returns wrapped socket or null on rejection.
 */
function handleUpgrade(req, socket, head, token) {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname !== '/ws' || url.searchParams.get('token') !== token) {
    socket.destroy();
    return null;
  }

  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return null; }

  const accept = crypto.createHash('sha1').update(key + MAGIC).digest('base64');

  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );

  const ws = wrapSocket(socket);
  clients.add(ws);
  return ws;
}

/**
 * Wrap raw socket with send/on('message') interface.
 * Handles frame decode (masked client→server) and encode (unmasked server→client).
 */
function wrapSocket(socket) {
  const listeners = { message: [], close: [] };
  let buffer = Buffer.alloc(0);

  const ws = {
    send(data) {
      const payload = Buffer.from(typeof data === 'string' ? data : JSON.stringify(data));
      socket.write(encodeFrame(payload));
    },
    on(event, cb) { (listeners[event] || []).push(cb); },
    close() {
      // Send close frame
      const frame = Buffer.alloc(2);
      frame[0] = OPCODE_CLOSE;
      frame[1] = 0;
      try { socket.write(frame); } catch {}
      socket.end();
    },
    get alive() { return !socket.destroyed; }
  };

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 2) {
      const result = decodeFrame(buffer);
      if (!result) break; // incomplete frame
      buffer = buffer.subarray(result.consumed);

      const opcode = result.opcode & 0x0F;
      if (opcode === (OPCODE_TEXT & 0x0F)) {
        const msg = result.payload.toString('utf8');
        for (const cb of listeners.message) cb(msg);
      } else if (opcode === (OPCODE_PING & 0x0F)) {
        // Respond with pong
        const pong = Buffer.alloc(2 + result.payload.length);
        pong[0] = OPCODE_PONG;
        pong[1] = result.payload.length;
        result.payload.copy(pong, 2);
        try { socket.write(pong); } catch {}
      } else if (opcode === (OPCODE_CLOSE & 0x0F)) {
        cleanup();
        return;
      }
    }
  });

  let cleaned = false;
  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    clients.delete(ws);
    for (const cb of listeners.close) cb();
    socket.end();
  }

  socket.on('close', cleanup);
  socket.on('error', cleanup);

  return ws;
}

/** Encode text frame (server→client, unmasked) */
function encodeFrame(payload) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = OPCODE_TEXT;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = OPCODE_TEXT;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    // 64-bit length (unlikely for JSON but handle gracefully)
    header = Buffer.alloc(10);
    header[0] = OPCODE_TEXT;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

/** Decode frame (client→server, masked). Returns { opcode, payload, consumed } or null if incomplete */
function decodeFrame(buf) {
  if (buf.length < 2) return null;

  const opcode = buf[0];
  const masked = (buf[1] & 0x80) !== 0;
  let payloadLen = buf[1] & 0x7F;
  let offset = 2;

  if (payloadLen === 126) {
    if (buf.length < 4) return null;
    payloadLen = buf.readUInt16BE(2);
    offset = 4;
  } else if (payloadLen === 127) {
    if (buf.length < 10) return null;
    payloadLen = Number(buf.readBigUInt64BE(2));
    offset = 10;
  }

  // Cap at 64KB to prevent abuse
  if (payloadLen > 65536) return null;

  const maskLen = masked ? 4 : 0;
  const totalLen = offset + maskLen + payloadLen;
  if (buf.length < totalLen) return null;

  let payload;
  if (masked) {
    const maskKey = buf.subarray(offset, offset + 4);
    payload = Buffer.alloc(payloadLen);
    for (let i = 0; i < payloadLen; i++) {
      payload[i] = buf[offset + 4 + i] ^ maskKey[i % 4];
    }
  } else {
    payload = buf.subarray(offset, offset + payloadLen);
  }

  return { opcode, payload, consumed: totalLen };
}

/** Broadcast JSON message to all connected clients */
function broadcast(data) {
  const msg = typeof data === 'string' ? data : JSON.stringify(data);
  for (const ws of clients) {
    if (ws.alive) {
      try { ws.send(msg); } catch {}
    }
  }
}

/** Get number of active connections */
function clientCount() { return clients.size; }

/** Disconnect all clients */
function closeAll() {
  for (const ws of clients) {
    try { ws.close(); } catch {}
  }
  clients.clear();
}

module.exports = { handleUpgrade, broadcast, clientCount, closeAll };
