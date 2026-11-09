// A minimal STOMP 1.2 client: frame codec plus a connection that does CONNECT,
// SUBSCRIBE, heart-beating and MESSAGE delivery. No dependencies. The transport is
// any duplex stream, so tests drive it over a loopback socket.
//
// The passcode lives in a private field and is only ever written to the CONNECT frame.
// It is never emitted in an event, an error message or a log line.
import { EventEmitter } from 'node:events';

const MAX_FRAME_BYTES = 16 * 1024 * 1024;
const NO_ESCAPE = new Set(['CONNECT', 'CONNECTED', 'STOMP']);

function escapeHeader(s) {
  return s.replace(/\\/g, '\\\\').replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/:/g, '\\c');
}

function unescapeHeader(s) {
  return s.replace(/\\([\s\S])|\\$/g, (_, c) => {
    if (!['r', 'n', 'c', '\\'].includes(c)) throw new Error('stomp: invalid header escape');
    return ({ r: '\r', n: '\n', c: ':', '\\': '\\' })[c];
  });
}

const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
function decode(bytes) {
  try { return utf8.decode(bytes); }
  catch { throw new Error('stomp: invalid UTF8'); }
}

export function encodeFrame(command, headers = {}, body = '') {
  const bodyBuf = Buffer.from(body, 'utf8');
  const h = { ...headers };
  if (bodyBuf.length > 0 && h['content-length'] === undefined) h['content-length'] = String(bodyBuf.length);
  const esc = NO_ESCAPE.has(command) ? (s) => s : escapeHeader;
  const lines = [command];
  for (const [k, v] of Object.entries(h)) lines.push(`${esc(k)}:${esc(String(v))}`);
  return Buffer.concat([Buffer.from(lines.join('\n') + '\n\n', 'utf8'), bodyBuf, Buffer.from([0])]);
}

function findHeadEnd(buf) {
  const lf = buf.indexOf('\n\n');
  const crlf = buf.indexOf('\r\n\r\n');
  if (lf < 0 && crlf < 0) return null;
  if (crlf >= 0 && (lf < 0 || crlf < lf)) return { at: crlf, len: 4 };
  return { at: lf, len: 2 };
}

export class FrameParser {
  #buf = Buffer.alloc(0);

  #guard() {
    if (this.#buf.length > MAX_FRAME_BYTES) throw new Error('stomp: frame too large');
  }

  // Feed bytes; returns the complete frames now available. Throws on a protocol error.
  push(chunk) {
    this.#buf = this.#buf.length === 0 ? Buffer.from(chunk) : Buffer.concat([this.#buf, chunk]);
    const frames = [];
    for (;;) {
      let skip = 0; // heart-beats are bare end-of-lines between frames
      while (skip < this.#buf.length && (this.#buf[skip] === 0x0a || this.#buf[skip] === 0x0d)) skip++;
      if (skip) this.#buf = this.#buf.subarray(skip);
      if (this.#buf.length === 0) break;

      const head = findHeadEnd(this.#buf);
      if (!head) {
        this.#guard();
        break;
      }
      if (head.at + head.len + 1 > MAX_FRAME_BYTES) throw new Error('stomp: frame too large');
      const [command, ...lines] = decode(this.#buf.subarray(0, head.at)).split(/\r?\n/);
      if (!/^[A-Z]+$/.test(command)) throw new Error('stomp: invalid command');
      const noEscape = NO_ESCAPE.has(command);
      const headers = Object.create(null);
      for (const line of lines) {
        const i = line.indexOf(':');
        if (i <= 0 || /[\r\0]/.test(line)) throw new Error('stomp: invalid header');
        const key = noEscape ? line.slice(0, i) : unescapeHeader(line.slice(0, i));
        if (!(key in headers)) headers[key] = noEscape ? line.slice(i + 1) : unescapeHeader(line.slice(i + 1));
      }

      const start = head.at + head.len;
      let end;
      const cl = headers['content-length'];
      if (cl !== undefined) {
        if (!/^\d+$/.test(cl)) throw new Error('stomp: invalid content-length');
        const n = Number(cl);
        if (!Number.isSafeInteger(n) || start + n + 1 > MAX_FRAME_BYTES) throw new Error('stomp: frame too large');
        if (this.#buf.length < start + n + 1) {
          this.#guard();
          break;
        }
        if (this.#buf[start + n] !== 0) throw new Error('stomp: frame not terminated after content-length bytes');
        end = start + n;
      } else {
        end = this.#buf.indexOf(0, start);
        if (end < 0) {
          this.#guard();
          break;
        }
      }
      if (end + 1 > MAX_FRAME_BYTES) throw new Error('stomp: frame too large');
      frames.push({ command, headers, body: decode(this.#buf.subarray(start, end)) });
      this.#buf = this.#buf.subarray(end + 1);
    }
    return frames;
  }
}

// Events: 'connected' ({server}), 'message' ({destination, subscription, headers, body}),
// 'fault' (Error: protocol error, ERROR frame, socket error or heart-beat timeout),
// 'close' (once, when the socket closes).
export class StompClient extends EventEmitter {
  #socket;
  #parser = new FrameParser();
  #login;
  #passcode;
  #vhost;
  #heartbeat;
  #timers = [];
  #handshakeTimer;
  #pending = [];
  #connected = false;
  #closed = false;
  #faulted = false;
  #lastIn = Date.now();

  constructor(socket, { login, passcode, vhost = 'localhost', heartbeat = [15000, 15000] }) {
    super();
    this.#socket = socket;
    this.#login = login;
    this.#passcode = passcode;
    this.#vhost = vhost;
    this.#heartbeat = heartbeat;
  }

  start() {
    const socket = this.#socket;
    socket.on('data', (chunk) => this.#onData(chunk));
    socket.on('error', () => this.#fault(new Error('stomp: socket error')));
    socket.on('close', () => this.#onClose());
    this.#handshakeTimer = setTimeout(() => this.#fault(new Error('stomp: handshake timeout')), 30_000);
    this.#handshakeTimer.unref?.();
    const [cx, cy] = this.#heartbeat;
    socket.write(
      encodeFrame('CONNECT', {
        'accept-version': '1.2,1.1,1.0',
        host: this.#vhost,
        login: this.#login,
        passcode: this.#passcode,
        'heart-beat': `${cx},${cy}`,
      }),
    );
  }

  subscribe(destination, { id = 'sub-0', ack = 'auto' } = {}) {
    const frame = encodeFrame('SUBSCRIBE', { id, destination, ack });
    if (this.#connected) this.#socket.write(frame);
    else this.#pending.push(frame);
  }

  disconnect() {
    if (this.#closed) return;
    try {
      if (this.#connected) this.#socket.write(encodeFrame('DISCONNECT'));
    } finally {
      this.#onClose();
      this.#socket.end();
    }
  }

  #onData(chunk) {
    if (this.#closed || this.#faulted) return;
    this.#lastIn = Date.now();
    let frames;
    try {
      frames = this.#parser.push(chunk);
    } catch (err) {
      this.#fault(err);
      return;
    }
    for (const frame of frames) {
      if (this.#closed || this.#faulted) break;
      this.#onFrame(frame);
    }
  }

  #onFrame(frame) {
    switch (frame.command) {
      case 'CONNECTED': {
        if (this.#connected) { this.#fault(new Error('stomp: repeated CONNECTED')); break; }
        if (!this.#startHeartbeats(frame.headers['heart-beat'])) break;
        clearTimeout(this.#handshakeTimer);
        this.#handshakeTimer = undefined;
        this.#connected = true;
        for (const f of this.#pending.splice(0)) this.#socket.write(f);
        // This value reaches feed logs. Server text is untrusted and may echo credentials.
        this.emit('connected', { server: '' });
        break;
      }
      case 'MESSAGE':
        this.emit('message', {
          destination: frame.headers.destination ?? '',
          subscription: frame.headers.subscription ?? '',
          headers: frame.headers,
          body: frame.body,
        });
        break;
      case 'ERROR':
        this.#fault(new Error('stomp: ERROR frame'));
        break;
      default:
        break; // RECEIPT and anything unknown
    }
  }

  #startHeartbeats(serverValue) {
    const [cx, cy] = this.#heartbeat;
    const value = serverValue ?? '0,0';
    const parts = /^(\d{1,10}),(\d{1,10})$/.exec(value);
    // setInterval silently clamps overflow/Infinity to 1 ms. Reject hostile negotiation
    // before scheduling, and accept CONNECTED once so repeated frames cannot add timers.
    if (!parts || parts.slice(1).some(n => Number(n) > 2_147_483_647)) {
      this.#fault(new Error('stomp: invalid heart-beat'));
      return false;
    }
    const [sx, sy] = parts.slice(1).map(Number);
    if (cx > 0 && sy > 0) {
      this.#timers.push(setInterval(() => this.#socket.write('\n'), Math.max(cx, sy)));
    }
    if (cy > 0 && sx > 0) {
      const expect = Math.max(cy, sx);
      this.#timers.push(
        setInterval(() => {
          if (Date.now() - this.#lastIn > expect * 2.5) this.#fault(new Error('stomp: heart-beat timeout'));
        }, Math.max(10, expect / 2)),
      );
    }
    for (const t of this.#timers) t.unref();
    return true;
  }

  #fault(err) {
    if (this.#closed || this.#faulted) return;
    this.#faulted = true;
    this.#clearTimers();
    this.emit('fault', err);
    this.#socket.destroy();
  }

  #clearTimers() {
    clearTimeout(this.#handshakeTimer);
    this.#handshakeTimer = undefined;
    for (const timer of this.#timers) clearInterval(timer);
    this.#timers = [];
  }

  #onClose() {
    if (this.#closed) return;
    this.#closed = true;
    this.#clearTimers();
    this.emit('close');
  }
}
