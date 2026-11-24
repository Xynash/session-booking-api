import cors from 'cors';
import express, { type Express } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { env } from './config/env';
import { isDatabaseUp } from './config/db';
import { errorHandler } from './middlewares/errorHandler';
import { notFound } from './middlewares/notFound';
import { requestId } from './middlewares/requestId';
import { requestLogger } from './middlewares/requestLogger';
import { apiRouter } from './routes';
import { AppError } from './utils/AppError';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(requestId);
  app.use(requestLogger);
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(',').map((o) => o.trim()),
      methods: ['GET', 'POST', 'PATCH'],
    }),
  );
  app.use(
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      limit: env.RATE_LIMIT_MAX,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: (_req, _res, next) =>
        next(new AppError(429, 'TOO_MANY_REQUESTS', 'Too many requests, please try again later')),
    }),
  );
  // Small body limit: every payload in this API is a few hundred bytes.
  app.use(express.json({ limit: '10kb' }));

  app.get('/health', (_req, res) => {
    const up = isDatabaseUp();
    res.status(up ? 200 : 503).json({ status: up ? 'ok' : 'degraded', database: up ? 'up' : 'down' });
  });

  app.use(apiRouter);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
