import { describe, expect, it } from 'vitest';
import { isValidTimestamp, toMilliseconds, utcDayRange } from '../../src/utils/dateRange';

describe('utcDayRange', () => {
  const noon = Date.UTC(2026, 11, 1, 12, 30);

  it('returns the half-open UTC day containing the timestamp', () => {
    const { start, end } = utcDayRange(noon);
    expect(start.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-12-02T00:00:00.000Z');
  });

  it('treats the first and last millisecond of a day as the same day', () => {
    const first = utcDayRange(Date.UTC(2026, 11, 1, 0, 0, 0, 0));
    const last = utcDayRange(Date.UTC(2026, 11, 1, 23, 59, 59, 999));
    expect(first.start.getTime()).toBe(last.start.getTime());
  });

  it('accepts epoch seconds and epoch milliseconds identically', () => {
    expect(utcDayRange(Math.floor(noon / 1000)).start.getTime()).toBe(utcDayRange(noon).start.getTime());
  });

  it('handles month and year boundaries', () => {
    const { end } = utcDayRange(Date.UTC(2026, 11, 31, 10));
    expect(end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('throws on invalid timestamps', () => {
    expect(() => utcDayRange(Number.NaN)).toThrow(RangeError);
    expect(() => utcDayRange(-5)).toThrow(RangeError);
    expect(() => utcDayRange(9_999_999_999_999_999)).toThrow(RangeError);
  });
});

describe('toMilliseconds / isValidTimestamp', () => {
  it('converts seconds to milliseconds and leaves milliseconds alone', () => {
    expect(toMilliseconds(1_700_000_000)).toBe(1_700_000_000_000);
    expect(toMilliseconds(1_700_000_000_000)).toBe(1_700_000_000_000);
  });

  it('rejects non-integers and out-of-range values', () => {
    expect(isValidTimestamp(1.5)).toBe(false);
    expect(isValidTimestamp(Number.MAX_SAFE_INTEGER)).toBe(false);
    expect(isValidTimestamp(1_700_000_000_000)).toBe(true);
  });
});
