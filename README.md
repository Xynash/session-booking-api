# Session Booking API

REST API where teachers publish available sessions, users book them, and completed sessions appear in the user's history.

**Stack:** Node.js 20+, TypeScript (strict), Express 4, MongoDB, Mongoose 8, Zod.

## Quick start

```bash
npm install
cp .env.example .env          # then set MONGODB_URI (Atlas or local)
npm run seed                  # optional: creates 3 teachers and prints their ids
npm run dev                   # http://localhost:3000
```

Need a local MongoDB? `docker run -d -p 27017:27017 mongo:7`, or use a free MongoDB Atlas connection string.

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server with reload |
| `npm run build` / `npm start` | Compile to `dist/` and run it |
| `npm test` | Unit + integration tests (spins up an in-memory MongoDB, nothing to install) |
| `npm run verify` | Typecheck + tests + build (run this before submitting) |
| `npm run postman` | Regenerate the Postman collection from the route registry |
| `npm run seed` | Idempotent teacher seed |

### Environment variables

| Variable | Default | Notes |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development` / `test` / `production` |
| `PORT` | `3000` | |
| `MONGODB_URI` | local dev DB | **Required** when `NODE_ENV=production` |
| `CORS_ORIGIN` | `*` | Comma-separated allowed origins; restrict in production |
| `TRUST_PROXY` | `0` | Number of reverse proxies in front of the app (needed for correct rate limiting behind one) |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | `60000` / `100` | Per-IP request limit |

Config is validated at boot; invalid config exits immediately with a readable message.

## API

All responses use one envelope. Success: `{ "success": true, "data": ... }`. Failure: `{ "success": false, "error": { "code", "message", "details?", "requestId" } }`.

| # | Endpoint | Success | Errors |
| --- | --- | --- | --- |
| 1 | `POST /users` `{fullName, email, phone}` | 201 | 400 validation, 409 duplicate email |
| 2 | `POST /sessions` `{teacherId, startTime, endTime}` | 201 | 400 (`endTime <= startTime`), 404 teacher |
| 3 | `GET /sessions/available?dateTimestamp=` | 200 | 400 bad timestamp |
| 4 | `POST /sessions/:id/book` `{userId}` | 200 | 400, 404 user / session, 409 not AVAILABLE |
| 5 | `PATCH /sessions/:id/complete` | 200 | 400, 404 session, 409 not BOOKED |
| 6 | `GET /users/:id/sessions` | 200 | 400, 404 user |
| - | `POST /teachers` *(helper, not in the spec)* | 201 | 400, 409 duplicate email |
| - | `GET /health` | 200 / 503 | |

APIs 3 and 6 are implemented with MongoDB aggregation pipelines (`$match` → `$sort` → `$lookup`; API 6 uses `$facet` to produce both lists in one round trip).

### Assumptions (documented on purpose)

- **Dates are UTC.** "The supplied date" in API 3 means the UTC calendar day containing `dateTimestamp` (range is `[00:00:00.000Z, next 00:00:00.000Z)`). `dateTimestamp` may be Unix seconds or milliseconds. Request bodies use strict ISO-8601, e.g. `2026-12-01T10:00:00Z`.
- **"Upcoming" = status `BOOKED`.** Using status instead of `startTime > now` means a booked session whose time has passed but was never marked complete cannot vanish from both lists. Upcoming is sorted by `startTime`; completed by `completedAt` (newest first).
- `POST /sessions/:id/book` takes the booking user as `{ "userId": "..." }` in the body (the spec has no auth).
- Teachers have no create endpoint in the spec, so `POST /teachers` and `npm run seed` exist purely to make the API testable.
- Overlapping sessions for the same teacher are allowed (the spec does not forbid them).

## How it is built

**Contract-first: every endpoint is declared once** in `src/routes/registry.ts`. That single declaration (Zod schemas + handler) produces:

1. runtime validation of params, query and body,
2. the handler's TypeScript types (inferred from the same schemas, so they cannot drift),
3. the Express route,
4. the Postman collection, via `npm run postman`, including saved ids, assertions and negative cases.

A test fails if the committed collection is out of sync with the registry, so docs and code cannot diverge. Adding an endpoint is one `defineRoute(...)` block.

```
src/
  config/       env (fail-fast validation), db (connect + index build)
  models/       Mongoose schemas, indexes, integrity hooks
  schemas/      Zod request contracts
  services/     business logic (the only layer that touches models)
  routes/       defineRoute + registry (the contract) + router builder
  middlewares/  requestId, requestLogger, errorHandler, notFound
  docs/         Postman generator
tests/          unit + integration (in-memory MongoDB)
```

### Reliability

- **Atomic state transitions.** Booking and completing are single compare-and-set updates (`filter: status = AVAILABLE` → `BOOKED`). There is no read-then-write window, so 25 simultaneous bookings of one session yield exactly one winner (covered by a test; I verified the test fails if the logic is made non-atomic).
- **Unique emails enforced by a unique index**, built before the server starts listening, with duplicates mapped to 409 (also under concurrent requests, also case-insensitively).
- **One error pipeline.** Validation, Mongoose cast/validation errors, duplicate keys, malformed JSON, oversized bodies and DB outages all map to a stable `{code, message}`; unknown errors become a generic 500 and never leak internals. Every response carries an `X-Request-Id` that also appears in error bodies and logs.
- Async/await only, async errors forwarded to the central handler, graceful shutdown on SIGINT/SIGTERM, process exits on `unhandledRejection` / `uncaughtException` instead of running in an unknown state.
- Integrity backstops in the model (`endTime > startTime`), enums for status, indexes matching each query.

### Security

- Strict Zod schemas on every input: unknown keys rejected (no mass assignment; clients cannot set `status` or `userId` on create), values must be primitives of the expected type, so `{"$gt": ""}`-style NoSQL operator injection never reaches a query. Mongoose `sanitizeFilter` is enabled as a second layer.
- `helmet` security headers, `x-powered-by` removed, CORS allow-list, per-IP rate limiting, 10 kb body limit.
- ObjectIds validated before use; query strings with repeated or nested parameters are rejected.
- Logs contain method, path, status and duration only: never bodies or query strings.
- Secrets live in environment variables; `.env` is git-ignored; production refuses to start without `MONGODB_URI`.

## Testing

`npm test` runs 67 tests: date-range maths, schema contracts, error mapping, Postman sync, and an integration suite that exercises all six APIs against a real in-memory MongoDB, including concurrent booking, concurrent duplicate signup, injection attempts, malformed/oversized payloads and header checks. The first run downloads a MongoDB binary (cached afterwards).

### Postman

Import `postman/session-booking-api.postman_collection.json`, set `baseUrl` if needed, then run the collection (Collection Runner or `newman run`). The *Happy path* folder walks the full flow (it creates its own teacher, user and session and passes ids between requests); *Negative cases* then checks the failure paths. Time slots are generated for "tomorrow, UTC" so it works on any day.
