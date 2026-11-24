import { User } from '../models/user.model';
import type { CreateUserInput } from '../schemas/user.schema';
import { Session, SESSION_STATUS } from '../models/session.model';
import { Types, type PipelineStage } from 'mongoose';
import { AppError } from '../utils/AppError';
import { teacherLookupStages } from './pipelines';

export async function createUser(input: CreateUserInput) {
  // Duplicate emails are rejected by the unique index (E11000) and mapped to 409 by the error handler.
  const user = await User.create(input);
  return user.toJSON();
}

/**
 * "Upcoming" = BOOKED (confirmed, not yet completed). Using status rather than startTime means a
 * booked session whose start time has passed but was not yet marked complete never disappears
 * from both lists.
 */
export async function getUserSessions(userId: string) {
  const exists = await User.exists({ _id: userId });
  if (!exists) throw AppError.notFound('User');

  // Aggregation does not auto-cast like find(), so the ObjectId conversion is explicit.
  const pipeline: PipelineStage[] = [
    { $match: { userId: new Types.ObjectId(userId), status: { $in: [SESSION_STATUS.BOOKED, SESSION_STATUS.COMPLETED] } } },
    ...teacherLookupStages(),
    {
      $facet: {
        upcomingSessions: [
          { $match: { status: SESSION_STATUS.BOOKED } },
          { $sort: { startTime: 1, _id: 1 } },
        ],
        completedSessions: [
          { $match: { status: SESSION_STATUS.COMPLETED } },
          { $sort: { completedAt: -1, _id: 1 } },
        ],
      },
    },
  ];

  const [result] = await Session.aggregate<{ upcomingSessions: unknown[]; completedSessions: unknown[] }>(pipeline);
  // $facet always emits exactly one document, but guard anyway so a surprise cannot become a 500.
  return {
    upcomingSessions: result?.upcomingSessions ?? [],
    completedSessions: result?.completedSessions ?? [],
  };
}
