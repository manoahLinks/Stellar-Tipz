/**
 * Auth module router.
 * Mount in app.ts:  app.use(`${env.API_BASE_PATH}/auth`, authRouter);
 */

import { Router } from 'express';
import { requireAuth } from './auth.middleware.js';
import { getMeController } from './auth.controller.js';

export const authRouter = Router();

/**
 * GET /api/v1/auth/me
 * Returns the authenticated user's profile summary.
 * @requires Authorization: Bearer <access_token>
 */
authRouter.get('/me', requireAuth, getMeController);
