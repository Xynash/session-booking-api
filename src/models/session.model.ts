import { Schema, model, type Types } from 'mongoose';

export const SESSION_STATUS = {
  AVAILABLE: 'AVAILABLE',
  BOOKED: 'BOOKED',
  COMPLETED: 'COMPLETED',
} as const;

export type SessionStatus = (typeof SESSION_STATUS)[keyof typeof SESSION_STATUS];

export interface ISession {
  teacherId: Types.ObjectId;
  userId: Types.ObjectId | null;
  startTime: Date;
  endTime: Date;
  status: SessionStatus;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const sessionSchema = new Schema<ISession>(
  {
    teacherId: { type: Schema.Types.ObjectId, ref: 'Teacher', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    status: {
      type: String,
      enum: Object.values(SESSION_STATUS),
      default: SESSION_STATUS.AVAILABLE,
      required: true,
    },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

// Data-integrity backstop: even if a caller bypasses the Zod layer, bad data cannot be saved.
sessionSchema.pre('validate', function (next) {
  if (this.startTime && this.endTime && this.endTime <= this.startTime) {
    this.invalidate('endTime', 'endTime must be greater than startTime');
  }
  next();
});

// Indexes match the two aggregation pipelines (equality on status/userId first, then range/sort).
sessionSchema.index({ status: 1, startTime: 1 }); // GET /sessions/available
sessionSchema.index({ userId: 1, status: 1, startTime: 1 }); // GET /users/:id/sessions
sessionSchema.index({ teacherId: 1, startTime: 1 });

export const Session = model<ISession>('Session', sessionSchema);
