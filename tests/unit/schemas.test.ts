import { describe, expect, it } from 'vitest';
import { availableSessionsQuery, bookSessionBody, createSessionBody } from '../../src/schemas/session.schema';
import { createUserBody } from '../../src/schemas/user.schema';
import { idParams } from '../../src/schemas/common';

const objectId = '64b7f0c2a1b2c3d4e5f60718';

describe('createUserBody', () => {
  const valid = { fullName: 'Rohan Mehta', email: '  Rohan@Example.COM ', phone: '+91 98765 43210' };

  it('trims and lower-cases the email', () => {
    expect(createUserBody.parse(valid).email).toBe('rohan@example.com');
  });

  it('rejects unknown keys (mass assignment)', () => {
    expect(createUserBody.safeParse({ ...valid, role: 'admin' }).success).toBe(false);
  });

  it('rejects NoSQL operator objects in place of strings', () => {
    expect(createUserBody.safeParse({ ...valid, email: { $gt: '' } }).success).toBe(false);
  });

  it.each(['abc', '12', '+91 (98765) 43210 99999 999'])('rejects bad phone %s', (phone) => {
    expect(createUserBody.safeParse({ ...valid, phone }).success).toBe(false);
  });
});

describe('createSessionBody', () => {
  const base = { teacherId: objectId, startTime: '2026-12-01T10:00:00Z', endTime: '2026-12-01T11:00:00Z' };

  it('parses ISO dates into Date objects', () => {
    const parsed = createSessionBody.parse(base);
    expect(parsed.startTime).toBeInstanceOf(Date);
    expect(parsed.endTime.getTime()).toBeGreaterThan(parsed.startTime.getTime());
  });

  it('rejects endTime equal to or before startTime', () => {
    expect(createSessionBody.safeParse({ ...base, endTime: base.startTime }).success).toBe(false);
    expect(createSessionBody.safeParse({ ...base, endTime: '2026-12-01T09:00:00Z' }).success).toBe(false);
  });

  it('rejects ambiguous date formats and bad ids', () => {
    expect(createSessionBody.safeParse({ ...base, startTime: 'tomorrow' }).success).toBe(false);
    expect(createSessionBody.safeParse({ ...base, startTime: '12/01/2026' }).success).toBe(false);
    expect(createSessionBody.safeParse({ ...base, teacherId: 'nope' }).success).toBe(false);
  });

  it('does not allow clients to set status or userId', () => {
    expect(createSessionBody.safeParse({ ...base, status: 'BOOKED' }).success).toBe(false);
    expect(createSessionBody.safeParse({ ...base, userId: objectId }).success).toBe(false);
  });
});

describe('query / params / book body', () => {
  it('converts dateTimestamp to a number', () => {
    expect(availableSessionsQuery.parse({ dateTimestamp: '1790000000000' }).dateTimestamp).toBe(1790000000000);
  });

  it.each([{}, { dateTimestamp: 'abc' }, { dateTimestamp: ['1', '2'] }, { dateTimestamp: { $gt: '1' } }, { dateTimestamp: '99999999999999999' }])(
    'rejects invalid query %j',
    (query) => {
      expect(availableSessionsQuery.safeParse(query).success).toBe(false);
    },
  );

  it('validates ObjectIds', () => {
    expect(idParams.safeParse({ id: objectId }).success).toBe(true);
    expect(idParams.safeParse({ id: 'not-an-id' }).success).toBe(false);
    expect(bookSessionBody.safeParse({ userId: { $ne: null } }).success).toBe(false);
  });
});
