import { z } from 'zod';

export const createTeacherBody = z
  .object({
    fullName: z.string().trim().min(2).max(100),
    email: z.string().trim().toLowerCase().email().max(254),
    specialization: z.string().trim().min(2).max(100),
    experience: z.number().min(0).max(60),
  })
  .strict();

export type CreateTeacherInput = z.output<typeof createTeacherBody>;
