/**
 * Imports each of server.js's modules one at a time, measuring event-loop lag
 * after each. Whichever import makes the lag jump is what blocks the loop.
 *
 * Results are appended synchronously to bisect-result.txt as they happen, so a
 * hang partway through still leaves everything measured up to that point — the
 * last line written names the module that hung.
 *
 *   node bisect-imports.mjs && cat bisect-result.txt
 */
import 'dotenv/config';
import fs from 'node:fs';

const OUT = './bisect-result.txt';
try {
  fs.unlinkSync(OUT);
} catch {
  /* first run */
}

const say = (line) => {
  fs.appendFileSync(OUT, line + '\n');
  console.log(line);
};

const measure = (ms = 3000) =>
  new Promise((resolve) => {
    let last = Date.now();
    let max = 0;
    let beats = 0;
    const iv = setInterval(() => {
      const now = Date.now();
      const drift = now - last - 200;
      if (drift > max) max = drift;
      last = now;
      beats += 1;
    }, 200);
    setTimeout(() => {
      clearInterval(iv);
      resolve({ max, beats });
    }, ms);
  });

const targets = [
  'express',
  'cors',
  'express-rate-limit',
  'helmet',
  'compression',
  'express-mongo-sanitize',
  './utils/logger.js',
  './middleware/requestIdMiddleware.js',
  './middleware/statsMiddleware.js',
  './config/mongodb.js',
  './config/imagekit.js',
  './config/nodemailer.js',
  './services/emailService.js',
  './services/aiService.js',
  './services/firecrawlService.js',
  './utils/distributedRateLimiter.js',
  './utils/emailValidation.js',
  './utils/expireListings.js',
  './utils/autoUnsuspend.js',
  './serverweb.js',
  './routes/healthRoutes.js',
  './routes/userRoutes.js',
  './routes/productRoutes.js',
  './routes/propertyRoutes.js',
  './routes/appointmentRoutes.js',
  './routes/adminRoutes.js',
  './routes/formRoutes.js',
  './routes/newsRoutes.js',
];

const base = await measure();
say(`baseline${' '.repeat(38)} beats=${String(base.beats).padStart(3)} maxLag=${base.max}ms`);
say('');

for (const target of targets) {
  say(`  ... importing ${target}`);

  const started = Date.now();
  try {
    await import(target);
  } catch (error) {
    say(`${target.padEnd(44)} IMPORT FAILED: ${error.message.slice(0, 60)}`);
    continue;
  }
  const importMs = Date.now() - started;

  const result = await measure();
  const flag = result.max > 300 || result.beats < 12 ? '   <<<< BLOCKER' : '';

  say(
    `${target.padEnd(44)} import=${String(importMs).padStart(5)}ms  beats=${String(result.beats).padStart(3)}  maxLag=${String(result.max).padStart(6)}ms${flag}`
  );
}

say('');
say('Healthy looks like beats=15 and maxLag under ~50ms.');
process.exit(0);
