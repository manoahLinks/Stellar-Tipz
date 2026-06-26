import { Router } from 'express';
import * as authController from './auth.controller.js';

export const authRouter = Router();

authRouter.post('/verify', authController.verify);
authRouter.post('/refresh', authController.refresh);
