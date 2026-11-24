import { Schema, model } from 'mongoose';

export interface ITeacher {
  fullName: string;
  email: string;
  specialization: string;
  /** Years of teaching experience. */
  experience: number;
  createdAt: Date;
  updatedAt: Date;
}

const teacherSchema = new Schema<ITeacher>(
  {
    fullName: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    specialization: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    experience: { type: Number, required: true, min: 0, max: 60 },
  },
  { timestamps: true, versionKey: false },
);

export const Teacher = model<ITeacher>('Teacher', teacherSchema);
