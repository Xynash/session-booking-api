import type { PipelineStage } from 'mongoose';
import { Teacher } from '../models/teacher.model';

/** Shared $lookup that attaches a trimmed teacher object to each session. */
export function teacherLookupStages(): PipelineStage[] {
  return [
    {
      $lookup: {
        from: Teacher.collection.name,
        let: { teacherId: '$teacherId' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$teacherId'] } } },
          { $project: { _id: 1, fullName: 1, email: 1, specialization: 1, experience: 1 } },
        ],
        as: 'teacher',
      },
    },
    // Keep the session even if its teacher document was removed, instead of silently hiding it.
    { $unwind: { path: '$teacher', preserveNullAndEmptyArrays: true } },
  ];
}
