import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { Keypair } from '@stellar/stellar-sdk';
import { prisma } from '../../db/prisma.js';
import { config } from '../../config/index.js';
import { BadRequestError, UnauthorizedError } from '../../common/errors/AppError.js';
import type { AuthUser } from './auth.types.js';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

function signAccessToken(user: AuthUser): string {
  return jwt.sign(
    { sub: user.id, stellarAddress: user.stellarAddress },
    config.auth.jwtSecret,
    { expiresIn: config.auth.jwtExpiresIn } as SignOptions,
  );
}

export interface ChallengeResult {
  id: string;
  address: string;
  expiresAt: Date;
  messageToSign: string;
}

export async function createChallenge(address: string): Promise<ChallengeResult> {
  const nonce = crypto.randomBytes(32).toString('hex');
  const ttlSeconds = config.auth.challengeTtlSeconds;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  const challenge = await prisma.authChallenge.create({
    data: { address, nonce, expiresAt },
  });

  return {
    id: challenge.id,
    address: challenge.address,
    expiresAt: challenge.expiresAt,
    messageToSign: `Sign this message to authenticate with Stellar Tipz. Nonce: ${nonce}`,
  };
}

export async function verifyChallenge(
  address: string,
  nonce: string,
  signature: string,
): Promise<{ accessToken: string; refreshToken: string; user: AuthUser }> {
  const challenge = await prisma.authChallenge.findUnique({
    where: { nonce },
  });

  if (!challenge) {
    throw new BadRequestError('Challenge not found');
  }

  if (challenge.address !== address) {
    throw new BadRequestError('Challenge does not match the provided address');
  }

  if (challenge.expiresAt < new Date()) {
    throw new BadRequestError('Challenge has expired');
  }

  const kp = Keypair.fromPublicKey(address);
  const message = Buffer.from(nonce);
  const sigBuffer = Buffer.from(signature, 'hex');

  const isValid = kp.verify(message, sigBuffer);
  if (!isValid) {
    throw new UnauthorizedError('Invalid signature');
  }

  await prisma.authChallenge.delete({ where: { id: challenge.id } });

  let user = await prisma.user.findUnique({ where: { stellarAddress: address } });
  if (!user) {
    user = await prisma.user.create({ data: { stellarAddress: address } });
  }

  const authUser: AuthUser = {
    id: user.id,
    stellarAddress: user.stellarAddress,
    username: user.username,
  };

  const accessToken = signAccessToken(authUser);
  const rawRefresh = generateRefreshToken();
  const hashed = hashToken(rawRefresh);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      hashedToken: hashed,
      expiresAt: new Date(Date.now() + parseDurationToMs(config.auth.refreshTokenExpiresIn)),
    },
  });

  return { accessToken, refreshToken: rawRefresh, user: authUser };
}

export async function refreshTokens(
  rawRefreshToken: string,
): Promise<{ accessToken: string; refreshToken: string; user: AuthUser }> {
  const hashed = hashToken(rawRefreshToken);

  const existing = await prisma.refreshToken.findUnique({
    where: { hashedToken: hashed },
    include: { user: true },
  });

  if (!existing) {
    throw new UnauthorizedError('Invalid refresh token');
  }

  if (existing.revokedAt) {
    await prisma.refreshToken.deleteMany({ where: { userId: existing.userId } });
    throw new UnauthorizedError('Refresh token has been revoked');
  }

  if (existing.expiresAt < new Date()) {
    throw new UnauthorizedError('Refresh token has expired');
  }

  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });

  const authUser: AuthUser = {
    id: existing.user.id,
    stellarAddress: existing.user.stellarAddress,
    username: existing.user.username,
  };

  const accessToken = signAccessToken(authUser);
  const rawNewRefresh = generateRefreshToken();
  const hashedNew = hashToken(rawNewRefresh);

  await prisma.refreshToken.create({
    data: {
      userId: existing.user.id,
      hashedToken: hashedNew,
      expiresAt: new Date(Date.now() + parseDurationToMs(config.auth.refreshTokenExpiresIn)),
    },
  });

  return { accessToken, refreshToken: rawNewRefresh, user: authUser };
}

function parseDurationToMs(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return 7 * 24 * 60 * 60 * 1000;
  }
}
