import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';
import { User } from '../models/user.model';
import { Teacher } from '../models/teacher.model';
import { Session } from '../models/session.model';

// Defence in depth against NoSQL injection: any $-operator that sneaks into a query filter is
// neutralised to a literal equality match. (Zod already prevents it from getting this far.)
mongoose.set('sanitizeFilter', true);
mongoose.set('strictQuery', true);

export async function connectDatabase(uri: string = env.MONGODB_URI): Promise<void> {
  mongoose.connection.on('disconnected', () => logger.warn('mongodb disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('mongodb reconnected'));

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5_000,
    maxPoolSize: 10,
  });

  // Build indexes *before* serving traffic. The unique email index is what makes
  // duplicate-email protection safe under concurrency, so it must exist first.
  await Promise.all([User.init(), Teacher.init(), Session.init()]);
  logger.info('mongodb connected', { db: mongoose.connection.name });
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

export function isDatabaseUp(): boolean {
  return mongoose.connection.readyState === 1;
}
