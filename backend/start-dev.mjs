/**
 * Local dev launcher for the REChain API.
 *
 * Why this exists: server.js calls app.listen(port, '0.0.0.0'). On a locked-down
 * Windows machine, endpoint security silently drops inbound connections to a
 * process listening on all interfaces — the TCP handshake completes but no data
 * is ever delivered, so every request hangs until it times out.
 *
 * Binding the loopback interfaces explicitly avoids that. server.js skips its own
 * app.listen when NODE_ENV=test, so we import the fully configured app and bind it
 * here. Routes, middleware and the DB connection are all the real thing.
 *
 * Both 127.0.0.1 (IPv4) and ::1 (IPv6) are bound, because "localhost" resolves to
 * ::1 first in browsers on Windows.
 *
 *   node start-dev.mjs
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const { default: app } = await import('./server.js');

const port = Number(process.env.PORT) || 4000;
const hosts = ['127.0.0.1', '::1'];

for (const host of hosts) {
  await new Promise((resolve) => {
    const server = app.listen(port, host, () => {
      const shown = host.includes(':') ? `[${host}]` : host;
      console.log(`API listening on http://${shown}:${port}`);
      resolve();
    });
    server.on('error', (err) => {
      // A missing IPv6 stack is not fatal — IPv4 alone is enough.
      console.warn(`Could not bind ${host}: ${err.code}`);
      resolve();
    });
  });
}

console.log('Ready. Frontend should call http://localhost:4000');
