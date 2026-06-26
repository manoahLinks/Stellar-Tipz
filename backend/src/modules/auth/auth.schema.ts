import { z } from 'zod';

export const verifySchema = z.object({
  address: z.string().min(1, 'Address is required'),
  nonce: z.string().min(1, 'Nonce is required'),
  signature: z.string().min(1, 'Signature is required'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});
