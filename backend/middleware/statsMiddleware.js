import Stats from '../models/statsModel.js';

/**
 * API usage tracking.
 *
 * Previously this awaited `Stats.create()` inside `res.on('finish')` — one database
 * round trip per request, each holding a connection from the Mongoose pool. When
 * individual writes are slow (an on-access virus scanner over the MongoDB data
 * directory will do it), those writes queue up, saturate the pool, and every
 * subsequent request blocks waiting for a connection. The server appears to hang
 * permanently after a handful of requests.
 *
 * Requests are now buffered in memory and flushed in one `insertMany` on an
 * interval, so a slow database can never stall request handling. Telemetry is
 * best-effort by nature: if the process dies with a partial buffer, we lose a few
 * rows, which is an acceptable trade for not taking the API down with it.
 *
 * Set DISABLE_API_STATS=true to turn tracking off entirely.
 */

const FLUSH_INTERVAL_MS = Number(process.env.API_STATS_FLUSH_MS) || 10_000;
const MAX_BUFFER = Number(process.env.API_STATS_MAX_BUFFER) || 500;

const disabled = process.env.DISABLE_API_STATS === 'true';

let buffer = [];
let flushing = false;
let timer = null;

async function flush() {
  if (flushing || buffer.length === 0) return;

  flushing = true;
  const batch = buffer;
  buffer = [];

  try {
    await Stats.insertMany(batch, { ordered: false });
  } catch (error) {
    // Telemetry must never take the API down. Drop the batch and carry on.
    console.error(`Error flushing ${batch.length} API stats:`, error.message);
  } finally {
    flushing = false;
  }
}

function scheduleFlush() {
  if (timer) return;
  timer = setInterval(flush, FLUSH_INTERVAL_MS);
  // Do not hold the event loop open just for telemetry.
  timer.unref?.();
}

export const trackAPIStats = (req, res, next) => {
  if (disabled) return next();

  const start = Date.now();

  res.on('finish', () => {
    if (req.method === 'OPTIONS' || req.method === 'HEAD') return;

    // Drop rather than grow without bound if the database is unavailable.
    if (buffer.length >= MAX_BUFFER) return;

    buffer.push({
      endpoint: req.originalUrl,
      method: req.method,
      responseTime: Date.now() - start,
      statusCode: res.statusCode,
    });

    scheduleFlush();
  });

  next();
};

/** Flush anything still buffered — call from the graceful shutdown path. */
export const flushAPIStats = flush;
