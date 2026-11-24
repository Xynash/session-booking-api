const MS_PER_DAY = 86_400_000;
/** Below this value a timestamp can only be in seconds (1e11 s is year 5138; 1e11 ms is 1973). */
const SECONDS_THRESHOLD = 100_000_000_000;

/** Accepts epoch seconds or epoch milliseconds and returns milliseconds. */
export function toMilliseconds(timestamp: number): number {
  return timestamp < SECONDS_THRESHOLD ? timestamp * 1000 : timestamp;
}

export function isValidTimestamp(timestamp: number): boolean {
  return (
    Number.isSafeInteger(timestamp) &&
    timestamp >= 0 &&
    !Number.isNaN(new Date(toMilliseconds(timestamp)).getTime())
  );
}

/**
 * Returns the half-open range [start, end) covering the UTC calendar day that
 * contains the timestamp. All date logic in this API is UTC so results never
 * depend on the server's timezone.
 */
export function utcDayRange(timestamp: number): { start: Date; end: Date } {
  if (!isValidTimestamp(timestamp)) {
    throw new RangeError(`Invalid timestamp: ${timestamp}`);
  }
  const date = new Date(toMilliseconds(timestamp));
  const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return { start: new Date(start), end: new Date(start + MS_PER_DAY) };
}
