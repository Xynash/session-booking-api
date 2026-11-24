import { defineRoute } from './define';
import { idParams } from '../schemas/common';
import { createUserBody } from '../schemas/user.schema';
import { createTeacherBody } from '../schemas/teacher.schema';
import { availableSessionsQuery, bookSessionBody, createSessionBody } from '../schemas/session.schema';
import { createUser, getUserSessions } from '../services/user.service';
import { createTeacher } from '../services/teacher.service';
import { bookSession, completeSession, createSession, getAvailableSessions } from '../services/session.service';

/**
 * The API contract. Order matters: it is also the order of the generated Postman
 * collection, so running the collection top to bottom walks the full happy path.
 */
export const routes = [
  defineRoute({
    method: 'post',
    path: '/teachers',
    name: 'Create Teacher (helper)',
    summary: 'Helper endpoint (not in the assignment spec) so the API can be exercised without touching the database.',
    successStatus: 201,
    body: createTeacherBody,
    handler: ({ body }) => createTeacher(body),
    postman: {
      body: {
        fullName: 'Asha Verma',
        email: 'asha.{{$timestamp}}{{$randomInt}}@example.com',
        specialization: 'Mathematics',
        experience: 8,
      },
      capture: { teacherId: 'data._id' },
    },
  }),

  defineRoute({
    method: 'post',
    path: '/users',
    name: 'API 1 - Create User',
    summary: 'Create a new user. Email must be unique.',
    successStatus: 201,
    body: createUserBody,
    handler: ({ body }) => createUser(body),
    postman: {
      body: {
        fullName: 'Rohan Mehta',
        email: 'rohan.{{$timestamp}}{{$randomInt}}@example.com',
        phone: '+91 98765 43210',
      },
      capture: { userId: 'data._id', userEmail: 'data.email' },
    },
  }),

  defineRoute({
    method: 'post',
    path: '/sessions',
    name: 'API 2 - Create Session',
    summary: 'Create an AVAILABLE session for an existing teacher. endTime must be greater than startTime.',
    successStatus: 201,
    body: createSessionBody,
    handler: ({ body }) => createSession(body),
    postman: {
      body: { teacherId: '{{teacherId}}', startTime: '{{startTime}}', endTime: '{{endTime}}' },
      capture: { sessionId: 'data._id' },
      tests: ["pm.test('Session starts AVAILABLE', () => pm.expect(pm.response.json().data.status).to.eql('AVAILABLE'));"],
    },
  }),

  defineRoute({
    method: 'get',
    path: '/sessions/available',
    name: 'API 3 - Available Sessions',
    summary: 'All AVAILABLE sessions on the (UTC) day of dateTimestamp. Implemented with an aggregation pipeline.',
    query: availableSessionsQuery,
    handler: ({ query }) => getAvailableSessions(query.dateTimestamp),
    postman: {
      query: { dateTimestamp: '{{dateTimestamp}}' },
      tests: [
        "pm.test('Created session is listed', () => pm.expect(pm.response.json().data.map(s => s._id)).to.include(pm.collectionVariables.get('sessionId')));",
        "pm.test('Teacher is embedded', () => pm.expect(pm.response.json().data[0].teacher).to.have.property('fullName'));",
      ],
    },
  }),

  defineRoute({
    method: 'post',
    path: '/sessions/:id/book',
    name: 'API 4 - Book Session',
    summary: 'Atomically book an AVAILABLE session for an existing user.',
    params: idParams,
    body: bookSessionBody,
    handler: ({ params, body }) => bookSession(params.id, body.userId),
    postman: {
      pathVariables: { id: 'sessionId' },
      body: { userId: '{{userId}}' },
      tests: ["pm.test('Session is BOOKED for the user', () => { const s = pm.response.json().data; pm.expect(s.status).to.eql('BOOKED'); pm.expect(s.userId).to.eql(pm.collectionVariables.get('userId')); });"],
    },
  }),

  defineRoute({
    method: 'patch',
    path: '/sessions/:id/complete',
    name: 'API 5 - Mark Session Complete',
    summary: 'Mark a BOOKED session as COMPLETED and stamp completedAt.',
    params: idParams,
    handler: ({ params }) => completeSession(params.id),
    postman: {
      pathVariables: { id: 'sessionId' },
      tests: ["pm.test('Session is COMPLETED with completedAt', () => { const s = pm.response.json().data; pm.expect(s.status).to.eql('COMPLETED'); pm.expect(s.completedAt).to.be.a('string'); });"],
    },
  }),

  defineRoute({
    method: 'get',
    path: '/users/:id/sessions',
    name: 'API 6 - User Session List',
    summary: "A user's sessions split into upcomingSessions (BOOKED) and completedSessions. Implemented with an aggregation pipeline ($facet).",
    params: idParams,
    handler: ({ params }) => getUserSessions(params.id),
    postman: {
      pathVariables: { id: 'userId' },
      tests: [
        "pm.test('Session appears under completedSessions', () => pm.expect(pm.response.json().data.completedSessions.map(s => s._id)).to.include(pm.collectionVariables.get('sessionId')));",
        "pm.test('upcomingSessions is empty', () => pm.expect(pm.response.json().data.upcomingSessions).to.have.lengthOf(0));",
      ],
    },
  }),
];
