import { z } from 'zod';
import { isValidTimestamp } from '../utils/dateRange';

export const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid 24-character ObjectId');

/** Strict ISO-8601 date-time (e.g. 2026-12-01T10:00:00Z). Ambiguous formats are rejected on purpose. */
export const isoDateTime = z
  .string()
  .datetime({ offset: true, message: 'Must be an ISO-8601 date-time, e.g. 2026-12-01T10:00:00Z' })
  .transform((value) => new Date(value));

export const idParams = z.object({ id: objectId }).strict();

export const timestampString = z
  .string()
  .regex(/^\d{1,16}$/, 'Must be a non-negative integer Unix timestamp (seconds or milliseconds)')
  .transform(Number)
  .refine(isValidTimestamp, 'Must be a valid Unix timestamp');
