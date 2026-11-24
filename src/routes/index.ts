import { Router } from 'express';
import type { z } from 'zod';
import { AppError, type ValidationIssue } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import type { AnyRoute } from './define';
import { routes } from './registry';

type Location = ValidationIssue['location'];

/** Builds an Express router from route definitions; validation runs before any handler code. */
export function buildRouter(definitions: AnyRoute[]): Router {
  const router = Router();

  for (const route of definitions) {
    router.route(route.path)[route.method](
      asyncHandler(async (req, res) => {
        const issues: ValidationIssue[] = [];
        const parse = (schema: z.ZodTypeAny | undefined, value: unknown, location: Location): unknown => {
          if (!schema) return undefined;
          const result = schema.safeParse(value);
          if (result.success) return result.data;
          for (const issue of result.error.issues) {
            issues.push({ location, path: issue.path.join('.'), message: issue.message });
          }
          return undefined;
        };

        const params = parse(route.params, req.params, 'params');
        const query = parse(route.query, req.query, 'query');
        const body = parse(route.body, req.body, 'body');
        if (issues.length > 0) throw AppError.validation(issues);

        const data = await route.handler({ params, query, body });
        res.status(route.successStatus ?? 200).json({ success: true, data });
      }),
    );
  }
  return router;
}

export const apiRouter = buildRouter(routes);
