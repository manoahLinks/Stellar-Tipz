/**
 * #845 — Auth: current user endpoint GET /auth/me
 *
 * Business logic for the auth module. Currently exposes the
 * `getMe` query used by the /auth/me route.
 */

import { prisma } from '@/db/prisma.js';
import { NotFoundError } from '@/common/errors/AppError.js';
import type { MeResponse } from './auth.schema.js';

/**
 * Fetches a minimal user profile summary by user id.
 *
 * @param userId - The authenticated user's id (from the JWT sub claim).
 * @returns MeResponse — id, stellarAddress, username, timestamps.
 * @throws {NotFoundError} if the user no longer exists in the DB.
 */
export async function getMe(userId: string): Promise<MeResponse> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      stellarAddress: true,
      username: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  return {
    id: user.id,
    stellarAddress: user.stellarAddress,
    username: user.username,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
