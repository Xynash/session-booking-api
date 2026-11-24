import type { AnyRoute } from '../routes/define';
import { routes } from '../routes/registry';

/* eslint-disable @typescript-eslint/no-explicit-any */
type PostmanItem = Record<string, any>;

interface NegativeCase {
  name: string;
  method: 'GET' | 'POST' | 'PATCH';
  path: string;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  expectedStatus: number;
  expectedCode: string;
}

const MISSING_ID = '000000000000000000000000';

/** Failure paths, run after the happy path (the session is COMPLETED by then). */
const negativeCases: NegativeCase[] = [
  { name: 'Create User - duplicate email', method: 'POST', path: '/users', body: { fullName: 'Dup User', email: '{{userEmail}}', phone: '+91 98765 43210' }, expectedStatus: 409, expectedCode: 'CONFLICT' },
  { name: 'Create User - invalid body (bad email, unknown field)', method: 'POST', path: '/users', body: { fullName: 'X', email: 'not-an-email', phone: '123', role: 'admin' }, expectedStatus: 400, expectedCode: 'VALIDATION_ERROR' },
  { name: 'Create Session - endTime before startTime', method: 'POST', path: '/sessions', body: { teacherId: '{{teacherId}}', startTime: '{{endTime}}', endTime: '{{startTime}}' }, expectedStatus: 400, expectedCode: 'VALIDATION_ERROR' },
  { name: 'Create Session - teacher does not exist', method: 'POST', path: '/sessions', body: { teacherId: MISSING_ID, startTime: '{{startTime}}', endTime: '{{endTime}}' }, expectedStatus: 404, expectedCode: 'NOT_FOUND' },
  { name: 'Available Sessions - missing dateTimestamp', method: 'GET', path: '/sessions/available', expectedStatus: 400, expectedCode: 'VALIDATION_ERROR' },
  { name: 'Book Session - already completed', method: 'POST', path: '/sessions/{{sessionId}}/book', body: { userId: '{{userId}}' }, expectedStatus: 409, expectedCode: 'CONFLICT' },
  { name: 'Book Session - user does not exist', method: 'POST', path: '/sessions/{{sessionId}}/book', body: { userId: MISSING_ID }, expectedStatus: 404, expectedCode: 'NOT_FOUND' },
  { name: 'Book Session - session does not exist', method: 'POST', path: `/sessions/${MISSING_ID}/book`, body: { userId: '{{userId}}' }, expectedStatus: 404, expectedCode: 'NOT_FOUND' },
  { name: 'Book Session - malformed id', method: 'POST', path: '/sessions/not-an-id/book', body: { userId: '{{userId}}' }, expectedStatus: 400, expectedCode: 'VALIDATION_ERROR' },
  { name: 'Complete Session - already completed', method: 'PATCH', path: '/sessions/{{sessionId}}/complete', expectedStatus: 409, expectedCode: 'CONFLICT' },
  { name: 'User Sessions - user does not exist', method: 'GET', path: `/users/${MISSING_ID}/sessions`, expectedStatus: 404, expectedCode: 'NOT_FOUND' },
];

const COLLECTION_PRE_REQUEST = [
  '// Builds a fresh, valid time slot (tomorrow 10:00-11:00 UTC) so the collection runs on any day.',
  'const d = new Date();',
  'const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);',
  "pm.collectionVariables.set('dateTimestamp', String(dayStart));",
  "pm.collectionVariables.set('startTime', new Date(dayStart + 10 * 3600 * 1000).toISOString());",
  "pm.collectionVariables.set('endTime', new Date(dayStart + 11 * 3600 * 1000).toISOString());",
];

function buildUrl(path: string, query: Record<string, string> | undefined) {
  const queryEntries = Object.entries(query ?? {});
  const queryString = queryEntries.length ? `?${queryEntries.map(([k, v]) => `${k}=${v}`).join('&')}` : '';
  return {
    raw: `{{baseUrl}}${path}${queryString}`,
    host: ['{{baseUrl}}'],
    path: path.split('/').filter(Boolean),
    ...(queryEntries.length ? { query: queryEntries.map(([key, value]) => ({ key, value })) } : {}),
  };
}

function buildItem(opts: {
  name: string;
  description?: string;
  method: string;
  path: string;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  testLines: string[];
}): PostmanItem {
  return {
    name: opts.name,
    event: [{ listen: 'test', script: { type: 'text/javascript', exec: opts.testLines } }],
    request: {
      method: opts.method,
      header: opts.body ? [{ key: 'Content-Type', value: 'application/json' }] : [],
      ...(opts.body ? { body: { mode: 'raw', raw: JSON.stringify(opts.body, null, 2), options: { raw: { language: 'json' } } } } : {}),
      url: buildUrl(opts.path, opts.query),
      ...(opts.description ? { description: opts.description } : {}),
    },
  };
}

function happyPathItem(route: AnyRoute): PostmanItem {
  const meta = route.postman ?? {};
  const status = route.successStatus ?? 200;
  const path = route.path.replace(/:(\w+)/g, (_m, param: string) => `{{${meta.pathVariables?.[param] ?? param}}}`);

  const testLines = [
    `pm.test('Status is ${status}', () => pm.response.to.have.status(${status}));`,
    "pm.test('Response envelope is successful', () => pm.expect(pm.response.json().success).to.eql(true));",
    "pm.test('X-Request-Id header is present', () => pm.response.to.have.header('X-Request-Id'));",
    ...Object.entries(meta.capture ?? {}).map(
      ([variable, jsonPath]) => `pm.collectionVariables.set('${variable}', pm.response.json().${jsonPath});`,
    ),
    ...(meta.tests ?? []),
  ];

  return buildItem({
    name: route.name,
    description: `${route.method.toUpperCase()} ${route.path}\n\n${route.summary}`,
    method: route.method.toUpperCase(),
    path,
    query: meta.query,
    body: meta.body,
    testLines,
  });
}

function negativeItem(c: NegativeCase): PostmanItem {
  return buildItem({
    name: c.name,
    method: c.method,
    path: c.path,
    query: c.query,
    body: c.body,
    testLines: [
      `pm.test('Status is ${c.expectedStatus}', () => pm.response.to.have.status(${c.expectedStatus}));`,
      `pm.test('Error code is ${c.expectedCode}', () => pm.expect(pm.response.json().error.code).to.eql('${c.expectedCode}'));`,
      "pm.test('Error response carries requestId', () => pm.expect(pm.response.json().error.requestId).to.be.a('string'));",
    ],
  });
}

/** Pure function: the collection is derived entirely from the route registry above. */
export function buildCollection(): PostmanItem {
  return {
    info: {
      name: 'Session Booking API',
      description:
        'Generated from the route registry by `npm run postman` (do not edit by hand). Run the "Happy path" folder top to bottom, then "Negative cases".',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    variable: [
      { key: 'baseUrl', value: 'http://localhost:3000' },
      ...['teacherId', 'userId', 'userEmail', 'sessionId', 'dateTimestamp', 'startTime', 'endTime'].map((key) => ({ key, value: '' })),
    ],
    event: [{ listen: 'prerequest', script: { type: 'text/javascript', exec: COLLECTION_PRE_REQUEST } }],
    item: [
      { name: 'Happy path', item: routes.map(happyPathItem) },
      { name: 'Negative cases', item: negativeCases.map(negativeItem) },
    ],
  };
}
