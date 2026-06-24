/**
 * requireAuth middleware — protects routes that need a valid JWT access token.
 *
 * Reads the Bearer token from the Authorization header, verifies it, and
 * attaches the decoded payload to `res.locals.user` for downstream handlers.
 */

import type { NextFunction, Request, Response } from 'express';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { UnauthorizedError } from '@/common/errors/AppError.js';
import { verifyAccessToken } from './auth.utils.js';
import type { JwtPayload } from './auth.schema.js';

// Extend Express's res.locals type so callers get full type-safety.
declare module 'express-serve-static-core' {
  interface Locals {
    user?: JwtPayload;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or malformed Authorization header'));
  }

  const token = authHeader.slice(7);
  try {
    res.locals.user = verifyAccessToken(token);
    next();
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      next(new UnauthorizedError('Access token expired'));
    } else if (err instanceof JsonWebTokenError) {
      next(new UnauthorizedError('Invalid access token'));
    } else {
      next(err);
    }
  }
}
