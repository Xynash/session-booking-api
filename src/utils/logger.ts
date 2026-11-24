import { env } from '../config/env';

type Level = 'info' | 'warn' | 'error';

function write(level: Level, message: string, meta: Record<string, unknown> = {}): void {
  if (env.NODE_ENV === 'test') return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...meta });
  (level === 'error' ? process.stderr : process.stdout).write(`${line}\n`);
}

export function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) return { name: err.name, message: err.message, stack: err.stack };
  return { value: String(err) };
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => write('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write('error', message, meta),
};
