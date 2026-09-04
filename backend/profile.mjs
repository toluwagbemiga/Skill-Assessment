/**
 * Finds what is blocking the event loop.
 *
 * diagnose.mjs showed the loop stalling for tens of seconds with no traffic, so
 * something is doing synchronous work from startup. This runs a real CPU profile
 * over the server's first N seconds and prints the functions with the most
 * self-time — that names the culprit directly instead of bisecting for it.
 *
 *   node profile.mjs           # profiles for 20s, then prints and exits
 *   PROFILE_SECONDS=45 node profile.mjs
 */
import inspector from 'node:inspector';
import { promisify } from 'node:util';

const SECONDS = Number(process.env.PROFILE_SECONDS) || 20;

const session = new inspector.Session();
session.connect();
const post = promisify(session.post).bind(session);

await post('Profiler.enable');
await post('Profiler.setSamplingInterval', { interval: 200 });
await post('Profiler.start');

console.log(`[prof] profiling for ${SECONDS}s — leave this running…\n`);

// Start the real server while the profiler samples.
import('./server.js').catch((e) => console.error('[prof] server import failed:', e));

setTimeout(async () => {
  const { profile } = await post('Profiler.stop');

  // Aggregate self-time per function.
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();

  const total = profile.samples.length;
  for (const id of profile.samples) {
    const node = byId.get(id);
    if (!node) continue;
    const f = node.callFrame;
    const name = (f.functionName || '(anonymous)') + '  @ ' +
      (f.url || '').replace(/^file:\/\/\//, '').replace(/^.*node_modules\//, 'node_modules/') +
      ':' + (f.lineNumber + 1);
    self.set(name, (self.get(name) || 0) + 1);
  }

  const rows = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);

  console.log(`\n[prof] ${total} samples over ${SECONDS}s. Top self-time:\n`);
  for (const [name, count] of rows) {
    const pct = ((count / total) * 100).toFixed(1).padStart(5);
    console.log(`  ${pct}%  ${name}`);
  }

  // Anything holding the loop open is worth naming too.
  const handles = (process._getActiveHandles?.() || []).map((h) => h?.constructor?.name);
  const counts = handles.reduce((a, h) => ((a[h] = (a[h] || 0) + 1), a), {});
  console.log('\n[prof] active handles:', JSON.stringify(counts));

  process.exit(0);
}, SECONDS * 1000);
