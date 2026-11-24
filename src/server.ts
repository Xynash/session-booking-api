import type { Server } from 'node:http';
import { createApp } from './app';
import { connectDatabase, disconnectDatabase } from './config/db';
import { env } from './config/env';
import { logger, serializeError } from './utils/logger';

let server: Server | undefined;
let shuttingDown = false;

async function shutdown(reason: string, exitCode: number): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('shutting down', { reason });

  // Hard stop if graceful shutdown hangs; unref so it never keeps the process alive by itself.
  setTimeout(() => process.exit(1), 10_000).unref();

  try {
    if (server) await new Promise<void>((resolve, reject) => server!.close((err) => (err ? reject(err) : resolve())));
    await disconnectDatabase();
    process.exit(exitCode);
  } catch (err) {
    logger.error('error during shutdown', { err: serializeError(err) });
    process.exit(1);
  }
}

async function main(): Promise<void> {
  await connectDatabase();

  if (env.NODE_ENV === 'production' && env.CORS_ORIGIN === '*') {
    logger.warn('CORS_ORIGIN is "*" in production; restrict it to your real origins');
  }

  server = createApp().listen(env.PORT, () => logger.info('server listening', { port: env.PORT, env: env.NODE_ENV }));
}

process.on('SIGINT', () => void shutdown('SIGINT', 0));
process.on('SIGTERM', () => void shutdown('SIGTERM', 0));
process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection', { err: serializeError(reason) });
  void shutdown('unhandledRejection', 1);
});
process.on('uncaughtException', (err) => {
  logger.error('uncaughtException', { err: serializeError(err) });
  void shutdown('uncaughtException', 1);
});

main().catch((err) => {
  logger.error('failed to start', { err: serializeError(err) });
  process.exit(1);
});
