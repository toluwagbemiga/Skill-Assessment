/**
 * Diagnostic launcher for the "requests hang but the handler is fast" problem.
 *
 * Starts the real server and, alongside it, reports:
 *
 *   - a heartbeat every 2s, so you can see whether the event loop is alive
 *   - event-loop lag, which shows if something synchronous is blocking it
 *   - raw TCP connections accepted, counted before Express sees anything
 *   - raw bytes arriving on each socket
 *
 * That combination distinguishes the three possibilities:
 *
 *   heartbeats stop            -> the event loop is blocked
 *   heartbeats fine, no "conn" -> the request never reaches this process
 *   "conn" + "data" but no -->  -> Node has the bytes but Express is not
 *                                 dispatching, i.e. blocked in a middleware
 *
 *   node diagnose.mjs
 */
import net from 'net';

const t0 = Date.now();
const stamp = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(6) + 's';

// ── event loop lag ────────────────────────────────────────────
let last = Date.now();
let maxLag = 0;
setInterval(() => {
  const now = Date.now();
  const lag = now - last - 500;
  if (lag > maxLag) maxLag = lag;
  last = now;
}, 500);

// ── heartbeat ─────────────────────────────────────────────────
let beats = 0;
setInterval(() => {
  beats += 1;
  console.log(
    `[hb ${stamp()}] beat=${beats} loopLagMax=${maxLag}ms rss=${Math.round(process.memoryUsage().rss / 1048576)}MB conns=${conns} bytes=${bytes}`
  );
  maxLag = 0;
}, 2000);

// ── count raw TCP accepts before Express is involved ──────────
let conns = 0;
let bytes = 0;
const origListen = net.Server.prototype.listen;
net.Server.prototype.listen = function patchedListen(...args) {
  this.on('connection', (socket) => {
    conns += 1;
    const id = conns;
    console.log(`[tcp ${stamp()}] conn#${id} accepted from ${socket.remoteAddress}`);
    socket.on('data', (chunk) => {
      bytes += chunk.length;
      const head = chunk.toString('utf8', 0, Math.min(60, chunk.length)).split('\r\n')[0];
      console.log(`[tcp ${stamp()}] conn#${id} +${chunk.length}B  ${head}`);
    });
    socket.on('close', () => console.log(`[tcp ${stamp()}] conn#${id} closed`));
  });
  return origListen.apply(this, args);
};

console.log(`[diag ${stamp()}] starting server.js …`);
await import('./server.js');
console.log(`[diag ${stamp()}] server.js import finished`);
