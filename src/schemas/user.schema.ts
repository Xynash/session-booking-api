import { z } from 'zod';

// .strict() rejects unknown keys: no mass-assignment, and operator objects like {"$gt": ""} can never
// reach a query because every field here is a primitive of a known type.
export const createUserBody = z
  .object({
    fullName: z.string().trim().min(2).max(100),
    email: z.string().trim().toLowerCase().email().max(254),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9][0-9\s\-()]{5,18}[0-9]$/, 'Must be a valid phone number (7-20 digits, optional leading +)'),
  })
  .strict();

export type CreateUserInput = z.output<typeof createUserBody>;
