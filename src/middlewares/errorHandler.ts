import type { ErrorRequestHandler } from 'express';
import { Error as MongooseError } from 'mongoose';
import { AppError, type ErrorCode } from '../utils/AppError';
import { logger, serializeError } from '../utils/logger';

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: 'BAD_REQUEST',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

/** Converts anything thrown into an AppError. Unknown errors become a generic 500 with no leaked internals. */
export function normalizeError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  if (err instanceof MongooseError.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
    return new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', details);
  }

  if (err instanceof MongooseError.CastError) {
    return AppError.badRequest(`Invalid value for '${err.path}'`);
  }

  const record = asRecord(err);

  // MongoDB duplicate key (unique index violation), e.g. an email that already exists.
  if (record && record.code === 11000) {
    const fields = Object.keys(asRecord(record.keyPattern) ?? {});
    const label = fields.length > 0 ? fields.join(', ') : 'value';
    return AppError.conflict(`A record with this ${label} already exists`, { fields });
  }

  // Errors raised by body-parser / http-errors (malformed JSON, payload too large, ...).
  if (record && typeof record.status === 'number' && record.status >= 400 && record.status < 500) {
    const status = record.status;
    if (record.type === 'entity.parse.failed') return AppError.badRequest('Malformed JSON in request body');
    if (status === 413) return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
    return new AppError(status, STATUS_TO_CODE[status] ?? 'BAD_REQUEST', 'The request could not be processed');
  }

  // Driver-level connectivity problems are an outage, not a bug.
  if (record && (record.name === 'MongoNetworkError' || record.name === 'MongooseServerSelectionError')) {
    return new AppError(503, 'SERVICE_UNAVAILABLE', 'Database is temporarily unavailable');
  }

  return new AppError(500, 'INTERNAL_ERROR', 'Internal server error');
}

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const appError = normalizeError(err);
  const requestId = res.locals.requestId as string | undefined;

  if (appError.statusCode >= 500) {
    logger.error('unhandled error', { requestId, method: req.method, path: req.path, err: serializeError(err) });
  }

  res.status(appError.statusCode).json({
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details !== undefined ? { details: appError.details } : {}),
      requestId,
    },
  });
};
