/**
 * Reads a .cpuprofile written by `node --cpu-prof` and prints the functions
 * with the most self-time.
 *
 * profile.mjs could not report anything, because it used a setTimeout to stop
 * profiling and the event loop was too blocked to fire it. V8's --cpu-prof
 * samples on its own thread and writes the file at process exit, so it works
 * even when the loop is completely wedged.
 *
 *   node --cpu-prof --cpu-prof-dir=./prof server.js
 *   # reproduce the hang, then Ctrl+C
 *   node analyze-prof.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2] || './prof';

if (!fs.existsSync(dir)) {
  console.error(`No profile directory at ${dir}. Run the server with:\n`);
  console.error('  node --cpu-prof --cpu-prof-dir=./prof server.js\n');
  process.exit(1);
}

const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.cpuprofile'))
  .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t);

if (files.length === 0) {
  console.error(`No .cpuprofile files in ${dir}.`);
  process.exit(1);
}

const file = path.join(dir, files[0].f);
const profile = JSON.parse(fs.readFileSync(file, 'utf8'));

const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();

const shorten = (url = '') =>
  url
    .replace(/^file:\/\/\//, '/')
    .replace(/^.*\/node_modules\//, 'node_modules/')
    .replace(/^node:/, 'node:');

for (const id of profile.samples) {
  const node = byId.get(id);
  if (!node) continue;
  const f = node.callFrame;
  const key = `${f.functionName || '(anonymous)'}  @ ${shorten(f.url)}:${f.lineNumber + 1}`;
  self.set(key, (self.get(key) || 0) + 1);
}

const total = profile.samples.length;
const durationMs = (profile.endTime - profile.startTime) / 1000;

console.log(`\nProfile : ${file}`);
console.log(`Duration: ${durationMs.toFixed(0)}ms, ${total} samples\n`);
console.log('Top self-time:\n');

for (const [name, count] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
  const pct = ((count / total) * 100).toFixed(1).padStart(5);
  const ms = ((count / total) * durationMs).toFixed(0).padStart(7);
  console.log(`  ${pct}%  ${ms}ms  ${name}`);
}

console.log('\n(program) and (idle) are normal. Anything else near the top is the blocker.\n');
