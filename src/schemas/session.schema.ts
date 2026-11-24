import { z } from 'zod';
import { isoDateTime, objectId, timestampString } from './common';

export const createSessionBody = z
  .object({
    teacherId: objectId,
    startTime: isoDateTime,
    endTime: isoDateTime,
  })
  .strict()
  .refine((body) => body.endTime.getTime() > body.startTime.getTime(), {
    error: 'endTime must be greater than startTime',
    path: ['endTime'],
    // Only compare once both fields parsed cleanly; otherwise the refinement would run on raw input.
    when: (payload) => payload.issues === undefined || payload.issues.length === 0,
  });

export const availableSessionsQuery = z.object({ dateTimestamp: timestampString }).strict();

export const bookSessionBody = z.object({ userId: objectId }).strict();

export type CreateSessionInput = z.output<typeof createSessionBody>;
