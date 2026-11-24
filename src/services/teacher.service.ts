import { Teacher } from '../models/teacher.model';
import type { CreateTeacherInput } from '../schemas/teacher.schema';

export async function createTeacher(input: CreateTeacherInput) {
  const teacher = await Teacher.create(input);
  return teacher.toJSON();
}
