export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'TOO_MANY_REQUESTS'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export interface ValidationIssue {
  location: 'params' | 'query' | 'body';
  path: string;
  message: string;
}

/**
 * The only error type business code throws on purpose. The central error handler
 * turns it into a consistent JSON response; anything else is treated as a bug (500).
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static validation(issues: ValidationIssue[]): AppError {
    return new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', issues);
  }

  static badRequest(message: string): AppError {
    return new AppError(400, 'BAD_REQUEST', message);
  }

  static notFound(resource: string): AppError {
    return new AppError(404, 'NOT_FOUND', `${resource} not found`);
  }

  static conflict(message: string, details?: unknown): AppError {
    return new AppError(409, 'CONFLICT', message, details);
  }
}
