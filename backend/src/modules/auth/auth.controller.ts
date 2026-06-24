/**
 * #845 — Auth: current user endpoint GET /auth/me
 *
 * Request/response handling for auth routes.
 * Delegates all business logic to auth.service.ts.
 */

import type { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '@/common/errors/AppError.js';
import { getMe } from './auth.service.js';

/**
 * GET /auth/me
 * Returns the authenticated user's profile summary.
 * Requires: `requireAuth` middleware (populates res.locals.user).
 */
export async function getMeController(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = res.locals.user;
    if (!user?.sub) {
      return next(new UnauthorizedError('Authenticated user not found in request context'));
    }

    const data = await getMe(user.sub);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}
