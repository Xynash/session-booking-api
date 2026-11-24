import type { RequestHandler } from 'express';
import { logger } from '../utils/logger';

export const requestLogger: RequestHandler = (req, res, next) => {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    logger.info('request', {
      requestId: res.locals.requestId,
      method: req.method,
      path: req.path, // path only: query strings and bodies are never logged
      status: res.statusCode,
      durationMs: Number((process.hrtime.bigint() - startedAt) / 1_000_000n),
    });
  });
  next();
};
