/**
 * Request ID Middleware for Request Correlation
 *
 * Assigns a unique request ID to each incoming request for tracing.
 * - Uses X-Request-ID header if provided (for distributed tracing)
 * - Generates UUID v4 if not provided
 * - Attaches child logger with request context to req object
 *
 * Logging behaviour:
 *   Previously only 4xx/5xx responses were logged, which meant a request that
 *   never produced a response at all — the exact case you need logs for — left
 *   no trace whatsoever. Now every request is logged on arrival and on
 *   completion, and one that stays open past a threshold logs a STALLED warning
 *   naming the method, path and request id.
 *
 * Env:
 *   LOG_REQUESTS=false      disable per-request arrive/complete logs
 *                           (defaults to on outside production)
 *   SLOW_REQUEST_MS=10000   how long before an open request is called stalled
 */

import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';

const LOG_REQUESTS =
  process.env.LOG_REQUESTS === 'true' ||
  (process.env.LOG_REQUESTS !== 'false' && process.env.NODE_ENV !== 'production');

const SLOW_REQUEST_MS = Number(process.env.SLOW_REQUEST_MS) || 10_000;

/**
 * Middleware to add request ID and child logger to each request
 */
export const requestIdMiddleware = (req, res, next) => {
  // Use existing request ID from header or generate new one
  req.requestId = req.headers['x-request-id'] || uuidv4();

  // Set response header for client-side correlation
  res.setHeader('X-Request-ID', req.requestId);

  // Create child logger with request context
  req.logger = logger.child({
    requestId: req.requestId,
    method: req.method,
    path: req.path,
  });

  const start = Date.now();
  let settled = false;

  if (LOG_REQUESTS) {
    req.logger.info(`--> ${req.method} ${req.originalUrl}`);
  }

  // A request that never responds is the one worth shouting about.
  const stallTimer = setTimeout(() => {
    if (!settled) {
      req.logger.warn(
        `STALLED ${req.method} ${req.originalUrl} — still open after ${SLOW_REQUEST_MS}ms, no response sent`
      );
    }
  }, SLOW_REQUEST_MS);
  stallTimer.unref?.();

  const done = (outcome) => {
    if (settled) return;
    settled = true;
    clearTimeout(stallTimer);

    const ms = Date.now() - start;

    if (outcome === 'aborted') {
      req.logger.warn(`<-x ${req.method} ${req.originalUrl} client disconnected after ${ms}ms`);
      return;
    }

    if (res.statusCode >= 400) {
      req.logger.warn(`<-- ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
    } else if (LOG_REQUESTS) {
      req.logger.info(`<-- ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
    }
  };

  res.on('finish', () => done('finish'));
  res.on('close', () => {
    // 'close' fires after 'finish' on a normal response; only interesting when it does not.
    if (!res.writableEnded) done('aborted');
  });

  next();
};

export default requestIdMiddleware;
