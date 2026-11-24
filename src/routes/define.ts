import type { z } from 'zod';

type MaybeSchema = z.ZodTypeAny | undefined;
type Output<S> = S extends z.ZodTypeAny ? z.output<S> : undefined;

/** Extra metadata used only to generate the Postman collection (never at request time). */
export interface PostmanMeta {
  /** Maps path params to collection variables, e.g. { id: 'sessionId' } turns /sessions/:id into /sessions/{{sessionId}}. */
  pathVariables?: Record<string, string>;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  /** Collection variables to save from the JSON response, e.g. { userId: 'data._id' }. */
  capture?: Record<string, string>;
  /** Extra Postman test lines (JavaScript). */
  tests?: string[];
}

export interface RouteDef<P extends MaybeSchema, Q extends MaybeSchema, B extends MaybeSchema> {
  method: 'get' | 'post' | 'patch';
  /** Express-style path, e.g. /sessions/:id/book */
  path: string;
  name: string;
  summary: string;
  successStatus?: number;
  params?: P;
  query?: Q;
  body?: B;
  handler: (input: { params: Output<P>; query: Output<Q>; body: Output<B> }) => Promise<unknown>;
  postman?: PostmanMeta;
}

export type AnyRoute = RouteDef<MaybeSchema, MaybeSchema, MaybeSchema>;

/**
 * Declares one endpoint exactly once. That single declaration drives:
 *  - runtime validation of params / query / body (Zod)
 *  - compile-time types inside the handler (inferred from the same schemas)
 *  - Express route registration
 *  - the generated Postman collection (and a test that fails if it goes stale)
 */
export function defineRoute<
  P extends MaybeSchema = undefined,
  Q extends MaybeSchema = undefined,
  B extends MaybeSchema = undefined,
>(def: RouteDef<P, Q, B>): AnyRoute {
  return def as unknown as AnyRoute;
}
