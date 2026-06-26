import type { Request, Response, NextFunction } from 'express';
import { verifySchema, refreshSchema } from './auth.schema.js';
import * as authService from './auth.service.js';

export async function verify(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { address, nonce, signature } = verifySchema.parse(req.body);
    const result = await authService.verifyChallenge(address, nonce, signature);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const result = await authService.refreshTokens(refreshToken);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}
