import { Schema, model } from 'mongoose';

export interface IUser {
  fullName: string;
  email: string;
  phone: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    fullName: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    // `unique` builds a unique index: this is what actually guarantees uniqueness under concurrent requests.
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
  },
  { timestamps: true, versionKey: false },
);

export const User = model<IUser>('User', userSchema);
