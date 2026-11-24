import { Types, type PipelineStage } from 'mongoose';
import { Session, SESSION_STATUS } from '../models/session.model';
import { Teacher } from '../models/teacher.model';
import { User } from '../models/user.model';
import type { CreateSessionInput } from '../schemas/session.schema';
import { AppError } from '../utils/AppError';
import { utcDayRange } from '../utils/dateRange';
import { teacherLookupStages } from './pipelines';

export async function createSession(input: CreateSessionInput) {
  const teacherExists = await Teacher.exists({ _id: input.teacherId });
  if (!teacherExists) throw AppError.notFound('Teacher');

  const session = await Session.create({
    teacherId: new Types.ObjectId(input.teacherId),
    startTime: input.startTime,
    endTime: input.endTime,
    // status defaults to AVAILABLE, userId to null, completedAt to null (see model)
  });
  return session.toJSON();
}

export async function getAvailableSessions(dateTimestamp: number) {
  const { start, end } = utcDayRange(dateTimestamp);

  const pipeline: PipelineStage[] = [
    { $match: { status: SESSION_STATUS.AVAILABLE, startTime: { $gte: start, $lt: end } } },
    { $sort: { startTime: 1, _id: 1 } },
    ...teacherLookupStages(),
  ];
  return Session.aggregate(pipeline);
}

/**
 * Booking is a single atomic compare-and-set: the filter requires status=AVAILABLE and the update
 * flips it to BOOKED in the same operation. If 50 users click "book" at the same instant,
 * MongoDB lets exactly one through; there is no read-then-write window to race in.
 */
export async function bookSession(sessionId: string, userId: string) {
  const userExists = await User.exists({ _id: userId });
  if (!userExists) throw AppError.notFound('User');

  const booked = await Session.findOneAndUpdate(
    { _id: sessionId, status: SESSION_STATUS.AVAILABLE },
    { $set: { status: SESSION_STATUS.BOOKED, userId: new Types.ObjectId(userId) } },
    { new: true, runValidators: true },
  ).lean();
  if (booked) return booked;

  // The update matched nothing: either the session does not exist or it is not AVAILABLE.
  const current = await Session.findById(sessionId).select('status').lean();
  if (!current) throw AppError.notFound('Session');
  throw AppError.conflict(`Session cannot be booked because it is already ${current.status.toLowerCase()}`, {
    currentStatus: current.status,
  });
}

export async function completeSession(sessionId: string) {
  const completed = await Session.findOneAndUpdate(
    { _id: sessionId, status: SESSION_STATUS.BOOKED },
    { $set: { status: SESSION_STATUS.COMPLETED, completedAt: new Date() } },
    { new: true, runValidators: true },
  ).lean();
  if (completed) return completed;

  const current = await Session.findById(sessionId).select('status').lean();
  if (!current) throw AppError.notFound('Session');
  throw AppError.conflict(
    `Only BOOKED sessions can be marked as completed; this session is ${current.status}`,
    { currentStatus: current.status },
  );
}
