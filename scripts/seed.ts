import { connectDatabase, disconnectDatabase } from '../src/config/db';
import { Teacher } from '../src/models/teacher.model';

const teachers = [
  { fullName: 'Asha Verma', email: 'asha.verma@example.com', specialization: 'Mathematics', experience: 8 },
  { fullName: 'Karan Singh', email: 'karan.singh@example.com', specialization: 'Physics', experience: 5 },
  { fullName: 'Meera Nair', email: 'meera.nair@example.com', specialization: 'Computer Science', experience: 12 },
];

async function main(): Promise<void> {
  await connectDatabase();
  for (const teacher of teachers) {
    // Upsert by email so the script is safe to run repeatedly.
    const doc = await Teacher.findOneAndUpdate({ email: teacher.email }, { $setOnInsert: teacher }, { upsert: true, new: true });
    console.log(`${doc.fullName.padEnd(14)} ${doc.specialization.padEnd(18)} teacherId=${doc._id.toString()}`);
  }
  await disconnectDatabase();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
