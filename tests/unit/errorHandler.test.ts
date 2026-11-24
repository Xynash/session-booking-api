import { Error as MongooseError } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { normalizeError } from '../../src/middlewares/errorHandler';
import { AppError } from '../../src/utils/AppError';

describe('normalizeError', () => {
  it('passes AppError through untouched', () => {
    const err = AppError.notFound('Session');
    expect(normalizeError(err)).toBe(err);
  });

  it('maps duplicate-key errors to 409 and names the field', () => {
    const result = normalizeError({ code: 11000, keyPattern: { email: 1 } });
    expect(result.statusCode).toBe(409);
    expect(result.message).toContain('email');
  });

  it('maps Mongoose cast errors to 400', () => {
    const cast = new MongooseError.CastError('ObjectId', 'abc', '_id');
    expect(normalizeError(cast).statusCode).toBe(400);
  });

  it('maps malformed-JSON and oversized-body errors from body-parser', () => {
    expect(normalizeError({ status: 400, type: 'entity.parse.failed', message: 'Unexpected token' }).message).toBe(
      'Malformed JSON in request body',
    );
    expect(normalizeError({ status: 413, type: 'entity.too.large' }).code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('maps database connectivity failures to 503', () => {
    expect(normalizeError({ name: 'MongoNetworkError' }).statusCode).toBe(503);
  });

  it('never leaks the message of an unexpected error', () => {
    const result = normalizeError(new Error('connection string mongodb://user:secret@host'));
    expect(result.statusCode).toBe(500);
    expect(result.message).toBe('Internal server error');
    expect(JSON.stringify(result)).not.toContain('secret');
  });
});
