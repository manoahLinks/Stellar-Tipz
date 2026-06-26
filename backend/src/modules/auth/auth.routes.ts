import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { ZodError } from 'zod';
import * as authController from './auth.controller.js';
import { challengeRequestSchema } from './auth.validation.js';
import { createChallenge } from './auth.service.js';
import { AppError } from '../../common/errors/AppError.js';
import { logger } from '../../common/utils/logger.js';
import { mergeOpenApiPaths } from '../../docs/openapi.js';
import { env } from '../../config/env.js';

const authLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT', message: 'Too many requests, please try again later' } },
});

export const authRouter = Router();

authRouter.use(authLimiter);

authRouter.post('/challenge', async (req, res, next) => {
  try {
    const { address } = challengeRequestSchema.parse(req.body);
    const challenge = await createChallenge(address);
    res.status(201).json({ challenge });
  } catch (err) {
    if (err instanceof ZodError) {
      next(err);
      return;
    }
    logger.error({ err }, 'Failed to create auth challenge');
    next(new AppError(500, 'Failed to create challenge', 'CHALLENGE_ERROR'));
  }
});

authRouter.post('/verify', authController.verify);
authRouter.post('/refresh', authController.refresh);

const authBasePath = `${env.API_BASE_PATH}/auth`;
mergeOpenApiPaths({
  [`${authBasePath}/challenge`]: {
    post: {
      tags: ['Auth'],
      summary: 'Request a sign-in challenge',
      description: 'Issues a random nonce challenge for a Stellar address with TTL.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                address: { type: 'string', description: 'Stellar public key (G...)', example: 'GCDUEW3G6B6G3WY5X6HJ6Z7O4X7K7Q5V5Z7O4X7K7Q5V5Z7O4X7K7Q' },
              },
              required: ['address'],
            },
          },
        },
      },
      responses: {
        '201': {
          description: 'Challenge created',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  challenge: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      address: { type: 'string' },
                      expiresAt: { type: 'string', format: 'date-time' },
                      messageToSign: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
        '400': { description: 'Validation error' },
        '429': { description: 'Rate limit exceeded' },
      },
    },
  },
});
