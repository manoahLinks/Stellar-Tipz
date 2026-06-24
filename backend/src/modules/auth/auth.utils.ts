/**
 * #835 — Auth: JWT access token issuance util
 *
 * Signs a short-lived JWT access token with the user's id and Stellar address
 * as claims. Expiry is driven by `JWT_EXPIRES_IN` from the validated env config.
 */

import jwt from 'jsonwebtoken';
import { env } from '@/config/env.js';
import { BadRequestError } from '@/common/errors/AppError.js';
import {
  SignAccessTokenInputSchema,
  type JwtPayload,
  type SignAccessTokenInput,
} from './auth.schema.js';

/**
 * Signs a short-lived JWT access token for the given user.
 *
 * @param user - Object containing `id` and `stellarAddress` (validated with Zod).
 * @returns Signed JWT string.
 * @throws {BadRequestError} if input validation fails.
 */
export function signAccessToken(user: SignAccessTokenInput): string {
  const result = SignAccessTokenInputSchema.safeParse(user);
  if (!result.success) {
    throw new BadRequestError('Invalid user input for token signing', result.error.flatten());
  }

  const payload: JwtPayload = {
    sub: result.data.id,
    address: result.data.stellarAddress,
  };

  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

/**
 * Verifies and decodes a JWT access token.
 *
 * @param token - Raw JWT string from the Authorization header.
 * @returns Decoded payload.
 * @throws {JsonWebTokenError | TokenExpiredError} on invalid/expired tokens.
 */
export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}
