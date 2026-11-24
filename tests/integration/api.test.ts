import type { Express } from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

let mongod: MongoMemoryServer;
let app: Express;
let disconnect: () => Promise<void>;
let models: {
  User: typeof import('../../src/models/user.model').User;
  Teacher: typeof import('../../src/models/teacher.model').Teacher;
  Session: typeof import('../../src/models/session.model').Session;
};

const OBJECT_ID_THAT_DOES_NOT_EXIST = '000000000000000000000000';
/** A fixed UTC day far in the future, so tests never depend on the current date. */
const DAY = Date.UTC(2031, 5, 15);
const at = (dayOffset: number, hour: number) => new Date(DAY + dayOffset * 86_400_000 + hour * 3_600_000).toISOString();

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri('session_booking_test');

  // Imported only after the env var is set because config/env.ts reads it at import time.
  const db = await import('../../src/config/db');
  await db.connectDatabase();
  disconnect = db.disconnectDatabase;
  models = {
    User: (await import('../../src/models/user.model')).User,
    Teacher: (await import('../../src/models/teacher.model')).Teacher,
    Session: (await import('../../src/models/session.model')).Session,
  };
  app = (await import('../../src/app')).createApp();
});

afterAll(async () => {
  await disconnect?.();
  await mongod?.stop();
});

beforeEach(async () => {
  await Promise.all([models.User.deleteMany({}), models.Teacher.deleteMany({}), models.Session.deleteMany({})]);
});

let counter = 0;
const uniqueEmail = (prefix: string) => `${prefix}.${Date.now()}.${counter++}@example.com`;

async function createTeacher(overrides: Record<string, unknown> = {}) {
  const res = await request(app).post('/teachers').send({
    fullName: 'Asha Verma',
    email: uniqueEmail('teacher'),
    specialization: 'Mathematics',
    experience: 8,
    ...overrides,
  });
  expect(res.status).toBe(201);
  return res.body.data as { _id: string; fullName: string };
}

async function createUser(overrides: Record<string, unknown> = {}) {
  const res = await request(app).post('/users').send({
    fullName: 'Rohan Mehta',
    email: uniqueEmail('user'),
    phone: '+91 98765 43210',
    ...overrides,
  });
  expect(res.status).toBe(201);
  return res.body.data as { _id: string; email: string };
}

async function createSession(teacherId: string, startTime = at(0, 10), endTime = at(0, 11)) {
  const res = await request(app).post('/sessions').send({ teacherId, startTime, endTime });
  expect(res.status).toBe(201);
  return res.body.data as { _id: string };
}

describe('API 1 - POST /users', () => {
  it('creates a user, lower-cases the email and returns timestamps', async () => {
    const res = await request(app).post('/users').send({ fullName: 'Rohan Mehta', email: 'ROHAN@Example.com', phone: '+91 98765 43210' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true, data: { fullName: 'Rohan Mehta', email: 'rohan@example.com' } });
    expect(res.body.data.createdAt).toBeTypeOf('string');
    expect(res.body.data.updatedAt).toBeTypeOf('string');
  });

  it('rejects a duplicate email with 409, case-insensitively', async () => {
    await createUser({ email: 'dup@example.com' });
    const res = await request(app).post('/users').send({ fullName: 'Other', email: 'DUP@example.com', phone: '+91 98765 43210' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('lets exactly one of many concurrent requests with the same email succeed', async () => {
    const responses = await Promise.all(
      Array.from({ length: 15 }, () =>
        request(app).post('/users').send({ fullName: 'Racer', email: 'race@example.com', phone: '+91 98765 43210' }),
      ),
    );
    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 409)).toHaveLength(14);
    expect(await models.User.countDocuments({ email: 'race@example.com' })).toBe(1);
  });

  it('returns field-level validation errors', async () => {
    const res = await request(app).post('/users').send({ fullName: 'X', email: 'bad', phone: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['fullName', 'email', 'phone']));
  });
});

describe('API 2 - POST /sessions', () => {
  it('creates an AVAILABLE session with null userId and completedAt', async () => {
    const teacher = await createTeacher();
    const res = await request(app).post('/sessions').send({ teacherId: teacher._id, startTime: at(0, 10), endTime: at(0, 11) });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ teacherId: teacher._id, userId: null, status: 'AVAILABLE', completedAt: null });
    expect(new Date(res.body.data.startTime).toISOString()).toBe(at(0, 10));
  });

  it('rejects endTime that is not after startTime', async () => {
    const teacher = await createTeacher();
    for (const endTime of [at(0, 10), at(0, 9)]) {
      const res = await request(app).post('/sessions').send({ teacherId: teacher._id, startTime: at(0, 10), endTime });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it.each([
    ['garbage startTime', { startTime: 'tomorrow', endTime: at(0, 11) }],
    ['garbage endTime', { startTime: at(0, 10), endTime: 'later' }],
    ['both garbage', { startTime: 'x', endTime: 'y' }],
    ['numeric dates', { startTime: 1790000000000, endTime: 1790003600000 }],
    ['missing dates', {}],
  ])('answers 400 (never 500) for %s', async (_label, dates) => {
    const teacher = await createTeacher();
    const res = await request(app).post('/sessions').send({ teacherId: teacher._id, ...dates });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 when the teacher does not exist', async () => {
    const res = await request(app).post('/sessions').send({ teacherId: OBJECT_ID_THAT_DOES_NOT_EXIST, startTime: at(0, 10), endTime: at(0, 11) });
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Teacher not found');
  });

  it('does not let a client choose status or userId', async () => {
    const teacher = await createTeacher();
    const user = await createUser();
    const res = await request(app)
      .post('/sessions')
      .send({ teacherId: teacher._id, startTime: at(0, 10), endTime: at(0, 11), status: 'COMPLETED', userId: user._id });
    expect(res.status).toBe(400);
    expect(await models.Session.countDocuments()).toBe(0);
  });
});

describe('API 3 - GET /sessions/available (aggregation)', () => {
  it('returns only AVAILABLE sessions of that UTC day, sorted, with the teacher embedded', async () => {
    const teacher = await createTeacher({ fullName: 'Asha Verma' });
    const user = await createUser();
    const later = await createSession(teacher._id, at(0, 15), at(0, 16));
    const earlier = await createSession(teacher._id, at(0, 9), at(0, 10));
    const booked = await createSession(teacher._id, at(0, 12), at(0, 13));
    await createSession(teacher._id, at(1, 9), at(1, 10)); // next day
    await createSession(teacher._id, at(-1, 23), at(0, 0)); // previous day, ends at midnight
    await request(app).post(`/sessions/${booked._id}/book`).send({ userId: user._id }).expect(200);

    const res = await request(app).get('/sessions/available').query({ dateTimestamp: DAY + 5 * 3_600_000 });
    expect(res.status).toBe(200);
    expect(res.body.data.map((s: { _id: string }) => s._id)).toEqual([earlier._id, later._id]);
    expect(res.body.data[0].teacher).toMatchObject({ fullName: 'Asha Verma', specialization: 'Mathematics' });
    expect(res.body.data[0].teacher).not.toHaveProperty('createdAt');
  });

  it('includes a session starting exactly at 00:00 UTC and excludes one starting exactly at the next midnight', async () => {
    const teacher = await createTeacher();
    const midnight = await createSession(teacher._id, at(0, 0), at(0, 1));
    await createSession(teacher._id, at(1, 0), at(1, 1));
    const res = await request(app).get('/sessions/available').query({ dateTimestamp: DAY });
    expect(res.body.data.map((s: { _id: string }) => s._id)).toEqual([midnight._id]);
  });

  it('accepts timestamps in seconds as well as milliseconds', async () => {
    const teacher = await createTeacher();
    const session = await createSession(teacher._id);
    const res = await request(app).get('/sessions/available').query({ dateTimestamp: Math.floor(DAY / 1000) });
    expect(res.body.data.map((s: { _id: string }) => s._id)).toEqual([session._id]);
  });

  it('returns an empty array when nothing is available', async () => {
    const res = await request(app).get('/sessions/available').query({ dateTimestamp: DAY });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it.each([
    ['missing parameter', ''],
    ['non-numeric', '?dateTimestamp=abc'],
    ['repeated parameter', '?dateTimestamp=1&dateTimestamp=2'],
    ['operator injection', '?dateTimestamp[$gt]=1'],
    ['absurdly large', '?dateTimestamp=99999999999999999'],
  ])('rejects %s with 400', async (_label, qs) => {
    const res = await request(app).get(`/sessions/available${qs}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('API 4 - POST /sessions/:id/book', () => {
  it('books an AVAILABLE session and associates the user', async () => {
    const teacher = await createTeacher();
    const user = await createUser();
    const session = await createSession(teacher._id);
    const res = await request(app).post(`/sessions/${session._id}/book`).send({ userId: user._id });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ _id: session._id, status: 'BOOKED', userId: user._id });
  });

  it('refuses to book a session twice, even for the same user', async () => {
    const teacher = await createTeacher();
    const [a, b] = [await createUser(), await createUser()];
    const session = await createSession(teacher._id);
    await request(app).post(`/sessions/${session._id}/book`).send({ userId: a._id }).expect(200);
    for (const user of [a, b]) {
      const res = await request(app).post(`/sessions/${session._id}/book`).send({ userId: user._id });
      expect(res.status).toBe(409);
      expect(res.body.error.details).toEqual({ currentStatus: 'BOOKED' });
    }
    expect((await models.Session.findById(session._id))?.userId?.toString()).toBe(a._id);
  });

  it('is race-safe: 25 simultaneous bookings produce exactly one winner', async () => {
    const teacher = await createTeacher();
    const users = await Promise.all(Array.from({ length: 25 }, () => createUser()));
    const session = await createSession(teacher._id);

    const responses = await Promise.all(
      users.map((u) => request(app).post(`/sessions/${session._id}/book`).send({ userId: u._id })),
    );
    const winners = responses.filter((r) => r.status === 200);
    expect(winners).toHaveLength(1);
    expect(responses.filter((r) => r.status === 409)).toHaveLength(24);

    const stored = await models.Session.findById(session._id);
    expect(stored?.status).toBe('BOOKED');
    expect(stored?.userId?.toString()).toBe(winners[0]!.body.data.userId);
  });

  it('returns 404 for an unknown user, an unknown session, and 400 for a malformed id', async () => {
    const teacher = await createTeacher();
    const user = await createUser();
    const session = await createSession(teacher._id);

    const noUser = await request(app).post(`/sessions/${session._id}/book`).send({ userId: OBJECT_ID_THAT_DOES_NOT_EXIST });
    expect(noUser.status).toBe(404);
    expect(noUser.body.error.message).toBe('User not found');
    expect((await models.Session.findById(session._id))?.status).toBe('AVAILABLE');

    const noSession = await request(app).post(`/sessions/${OBJECT_ID_THAT_DOES_NOT_EXIST}/book`).send({ userId: user._id });
    expect(noSession.status).toBe(404);
    expect(noSession.body.error.message).toBe('Session not found');

    const malformed = await request(app).post('/sessions/not-an-id/book').send({ userId: user._id });
    expect(malformed.status).toBe(400);
  });

  it('rejects NoSQL operator objects as userId', async () => {
    const teacher = await createTeacher();
    const session = await createSession(teacher._id);
    const res = await request(app).post(`/sessions/${session._id}/book`).send({ userId: { $ne: null } });
    expect(res.status).toBe(400);
    expect((await models.Session.findById(session._id))?.status).toBe('AVAILABLE');
  });
});

describe('API 5 - PATCH /sessions/:id/complete', () => {
  it('completes a BOOKED session and stamps completedAt', async () => {
    const teacher = await createTeacher();
    const user = await createUser();
    const session = await createSession(teacher._id);
    await request(app).post(`/sessions/${session._id}/book`).send({ userId: user._id }).expect(200);

    const before = Date.now();
    const res = await request(app).patch(`/sessions/${session._id}/complete`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('COMPLETED');
    expect(new Date(res.body.data.completedAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(res.body.data.userId).toBe(user._id);
  });

  it('refuses AVAILABLE and already COMPLETED sessions with 409', async () => {
    const teacher = await createTeacher();
    const user = await createUser();
    const session = await createSession(teacher._id);

    const available = await request(app).patch(`/sessions/${session._id}/complete`);
    expect(available.status).toBe(409);
    expect(available.body.error.details).toEqual({ currentStatus: 'AVAILABLE' });

    await request(app).post(`/sessions/${session._id}/book`).send({ userId: user._id }).expect(200);
    await request(app).patch(`/sessions/${session._id}/complete`).expect(200);
    const again = await request(app).patch(`/sessions/${session._id}/complete`);
    expect(again.status).toBe(409);
  });

  it('returns 404 for an unknown session and 400 for a malformed id', async () => {
    expect((await request(app).patch(`/sessions/${OBJECT_ID_THAT_DOES_NOT_EXIST}/complete`)).status).toBe(404);
    expect((await request(app).patch('/sessions/xyz/complete')).status).toBe(400);
  });

  it('does not allow a completed session to be re-booked', async () => {
    const teacher = await createTeacher();
    const user = await createUser();
    const session = await createSession(teacher._id);
    await request(app).post(`/sessions/${session._id}/book`).send({ userId: user._id }).expect(200);
    await request(app).patch(`/sessions/${session._id}/complete`).expect(200);
    const res = await request(app).post(`/sessions/${session._id}/book`).send({ userId: user._id });
    expect(res.status).toBe(409);
    expect(res.body.error.details).toEqual({ currentStatus: 'COMPLETED' });
  });
});

describe('API 6 - GET /users/:id/sessions (aggregation)', () => {
  it("splits a user's sessions into upcoming and completed, and ignores other users' sessions", async () => {
    const teacher = await createTeacher();
    const [user, other] = [await createUser(), await createUser()];
    const s1 = await createSession(teacher._id, at(2, 10), at(2, 11));
    const s2 = await createSession(teacher._id, at(1, 10), at(1, 11));
    const s3 = await createSession(teacher._id, at(0, 10), at(0, 11));
    const s4 = await createSession(teacher._id, at(0, 12), at(0, 13));
    const theirs = await createSession(teacher._id, at(0, 14), at(0, 15));
    await createSession(teacher._id, at(3, 10), at(3, 11)); // stays AVAILABLE, must not appear

    for (const s of [s1, s2, s3, s4]) await request(app).post(`/sessions/${s._id}/book`).send({ userId: user._id }).expect(200);
    await request(app).post(`/sessions/${theirs._id}/book`).send({ userId: other._id }).expect(200);
    await request(app).patch(`/sessions/${s3._id}/complete`).expect(200);
    await new Promise((r) => setTimeout(r, 15));
    await request(app).patch(`/sessions/${s4._id}/complete`).expect(200);

    const res = await request(app).get(`/users/${user._id}/sessions`);
    expect(res.status).toBe(200);
    // upcoming: soonest first; completed: most recently completed first
    expect(res.body.data.upcomingSessions.map((s: { _id: string }) => s._id)).toEqual([s2._id, s1._id]);
    expect(res.body.data.completedSessions.map((s: { _id: string }) => s._id)).toEqual([s4._id, s3._id]);
    expect(res.body.data.upcomingSessions[0].teacher.fullName).toBe('Asha Verma');
    expect(res.body.data.completedSessions[0].status).toBe('COMPLETED');
  });

  it('returns two empty arrays for a user with no sessions', async () => {
    const user = await createUser();
    const res = await request(app).get(`/users/${user._id}/sessions`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ upcomingSessions: [], completedSessions: [] });
  });

  it('returns 404 for an unknown user and 400 for a malformed id', async () => {
    expect((await request(app).get(`/users/${OBJECT_ID_THAT_DOES_NOT_EXIST}/sessions`)).status).toBe(404);
    expect((await request(app).get('/users/abc/sessions')).status).toBe(400);
  });
});

describe('platform hardening', () => {
  it('returns a JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });

  it('returns 400 for malformed JSON without echoing the payload', async () => {
    const res = await request(app).post('/users').set('Content-Type', 'application/json').send('{"fullName": "x", ');
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Malformed JSON in request body');
  });

  it('returns 413 for oversized bodies', async () => {
    const res = await request(app).post('/users').send({ fullName: 'x'.repeat(20_000) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('sets security headers and hides the framework', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.body).toEqual({ status: 'ok', database: 'up' });
  });

  it('echoes a safe X-Request-Id and replaces an unsafe one', async () => {
    const safe = await request(app).get('/health').set('X-Request-Id', 'client-req-12345');
    expect(safe.headers['x-request-id']).toBe('client-req-12345');
    const unsafe = await request(app).get('/health').set('X-Request-Id', 'bad id with spaces');
    expect(unsafe.headers['x-request-id']).not.toBe('bad id with spaces');
    expect(unsafe.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('includes the request id in error responses', async () => {
    const res = await request(app).get('/users/abc/sessions').set('X-Request-Id', 'trace-me-123456');
    expect(res.body.error.requestId).toBe('trace-me-123456');
  });
});
