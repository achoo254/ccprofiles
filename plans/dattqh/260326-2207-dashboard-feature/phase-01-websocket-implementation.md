# Phase 1: WebSocket Implementation

## Overview
- **Priority:** High (dependency for Phase 2)
- **Status:** Complete
- **Effort:** 1h

Minimal WebSocket server using Node.js `http` upgrade event. Text frames only, no binary. No external dependencies.

## Key Insights

- RFC 6455 WebSocket handshake: upgrade request → SHA-1 hash of key + magic GUID → accept response
- Only need: text frame encode/decode, ping/pong, close handling
- Max frame size: 125 bytes for small messages, 16-bit length for medium, skip 64-bit (not needed)

## Requirements

### Functional
- Accept WebSocket upgrade on `/ws` path with valid token
- Send/receive JSON text frames
- Handle ping/pong for keepalive
- Clean close with status code

### Non-functional
- Zero dependencies
- < 80 LOC

## Related Code Files

| Action | File | Description |
|--------|------|-------------|
| CREATE | `lib/dashboard-websocket.cjs` | Minimal WS server implementation |

## Implementation Steps

1. Create `lib/dashboard-websocket.cjs`
2. Implement `handleUpgrade(req, socket, head, token)`:
   - Validate `Sec-WebSocket-Key` header
   - Validate token query param matches server token
   - Compute accept key: `SHA1(key + '258EAFA5-E914-47DA-95CA-5AB9DC76BE58')` base64
   - Write 101 Switching Protocols response
   - Return wrapped socket with `send(data)` and `on('message', cb)` methods
3. Implement frame encoding (server→client, no mask):
   - Opcode 0x81 (text), length prefix
4. Implement frame decoding (client→server, masked):
   - Read opcode, mask bit, length, mask key
   - Unmask payload
5. Handle close frame (opcode 0x88) gracefully
6. Handle ping (0x89) → respond pong (0x8A)
7. Export: `handleUpgrade`, `broadcast` helper

## Pseudocode

```javascript
// handleUpgrade(req, socket, head, token)
const crypto = require('crypto');
const MAGIC = '258EAFA5-E914-47DA-95CA-5AB9DC76BE58';

function handleUpgrade(req, socket, head, token) {
  // Validate token from URL query
  const url = new URL(req.url, 'http://localhost');
  if (url.searchParams.get('token') !== token) {
    socket.destroy(); return null;
  }

  const key = req.headers['sec-websocket-key'];
  const accept = crypto.createHash('sha1')
    .update(key + MAGIC).digest('base64');

  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );

  // Return wrapper with send/on methods
  return wrapSocket(socket);
}
```

## Todo List

- [x] Create `lib/dashboard-websocket.cjs`
- [x] Implement upgrade handshake with token validation
- [x] Implement text frame encode (server→client)
- [x] Implement text frame decode (client→server, masked)
- [x] Handle close/ping/pong frames
- [x] Export `handleUpgrade` + `broadcast`

## Success Criteria

- WS handshake completes successfully in browser
- Can send JSON from server, receive in browser
- Can send JSON from browser, receive on server
- Invalid token rejects connection
- Clean close on both sides

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Frame parsing bugs | High | Text-only, skip binary/continuation frames |
| Large payloads | Low | Cap at 64KB, sufficient for JSON messages |
| Memory leaks on disconnect | Medium | Track connections, clean up on close/error |
