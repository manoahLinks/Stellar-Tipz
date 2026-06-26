import request from 'supertest';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createApp } from '../../app.js';

vi.mock('../../db/prisma.js', () => {
  const mockPrisma = {
    authChallenge: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    refreshToken: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    $disconnect: vi.fn(),
  };
  return { prisma: mockPrisma };
});

vi.mock('@stellar/stellar-sdk', () => {
  const mockVerify = vi.fn();
  const mockFromPublicKey = vi.fn(() => ({
    verify: mockVerify,
  }));
  return {
    Keypair: {
      fromPublicKey: mockFromPublicKey,
    },
  };
});

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn(() => 'mock-access-token'),
  },
  sign: vi.fn(() => 'mock-access-token'),
}));

const { prisma } = await import('../../db/prisma.js');
const { Keypair } = await import('@stellar/stellar-sdk');
const jwt = await import('jsonwebtoken');

describe('POST /api/v1/auth/verify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when inputs are missing', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/verify')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when challenge is not found', async () => {
    prisma.authChallenge.findUnique.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/verify')
      .send({ address: 'GABC123', nonce: 'nonexistent', signature: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Challenge not found');
  });

  it('returns 400 when challenge is expired', async () => {
    prisma.authChallenge.findUnique.mockResolvedValue({
      id: 'ch-1',
      address: 'GABC123',
      nonce: 'nonce-1',
      expiresAt: new Date(Date.now() - 1000),
      createdAt: new Date(),
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/verify')
      .send({ address: 'GABC123', nonce: 'nonce-1', signature: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Challenge has expired');
  });

  it('returns 401 when signature is invalid', async () => {
    prisma.authChallenge.findUnique.mockResolvedValue({
      id: 'ch-1',
      address: 'GABC123',
      nonce: 'nonce-1',
      expiresAt: new Date(Date.now() + 100000),
      createdAt: new Date(),
    });
    Keypair.fromPublicKey().verify.mockReturnValue(false);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/verify')
      .send({ address: 'GABC123', nonce: 'nonce-1', signature: 'invalidsig' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid signature');
  });

  it('returns tokens on successful verification', async () => {
    prisma.authChallenge.findUnique.mockResolvedValue({
      id: 'ch-1',
      address: 'GABC123',
      nonce: 'nonce-1',
      expiresAt: new Date(Date.now() + 100000),
      createdAt: new Date(),
    });
    Keypair.fromPublicKey().verify.mockReturnValue(true);
    prisma.authChallenge.delete.mockResolvedValue({});
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'user-1',
      stellarAddress: 'GABC123',
      username: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/verify')
      .send({ address: 'GABC123', nonce: 'nonce-1', signature: 'validsig' });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBe('mock-access-token');
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.user.stellarAddress).toBe('GABC123');
  });
});

describe('POST /api/v1/auth/refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when refresh token is missing', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 401 when refresh token is not found', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'invalid' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid refresh token');
  });

  it('returns 401 when refresh token is revoked', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1',
      userId: 'user-1',
      hashedToken: 'hash',
      expiresAt: new Date(Date.now() + 100000),
      revokedAt: new Date(),
      createdAt: new Date(),
      user: { id: 'user-1', stellarAddress: 'GABC123', username: null },
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'revoked-token' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Refresh token has been revoked');
  });

  it('returns tokens on successful refresh', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1',
      userId: 'user-1',
      hashedToken: 'hash',
      expiresAt: new Date(Date.now() + 100000),
      revokedAt: null,
      createdAt: new Date(),
      user: { id: 'user-1', stellarAddress: 'GABC123', username: null },
    });
    prisma.refreshToken.update.mockResolvedValue({});
    prisma.refreshToken.create.mockResolvedValue({});

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'valid-token' });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBe('mock-access-token');
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.user.stellarAddress).toBe('GABC123');
  });
});
