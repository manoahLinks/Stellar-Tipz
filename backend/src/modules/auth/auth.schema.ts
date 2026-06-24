import { z } from 'zod';

/** Shape of the JWT payload we sign and verify. */
export const JwtPayloadSchema = z.object({
  sub: z.string().min(1),          // User.id (cuid)
  address: z.string().min(1),      // User.stellarAddress
  iat: z.number().optional(),
  exp: z.number().optional(),
});

export type JwtPayload = z.infer<typeof JwtPayloadSchema>;

/** Input accepted by signAccessToken(). */
export const SignAccessTokenInputSchema = z.object({
  id: z.string().min(1, 'User id is required'),
  stellarAddress: z.string().min(1, 'Stellar address is required'),
});

export type SignAccessTokenInput = z.infer<typeof SignAccessTokenInputSchema>;

/** Response shape for GET /auth/me */
export const MeResponseSchema = z.object({
  id: z.string(),
  stellarAddress: z.string(),
  username: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type MeResponse = z.infer<typeof MeResponseSchema>;
