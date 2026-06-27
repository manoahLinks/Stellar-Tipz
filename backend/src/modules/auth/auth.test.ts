import request from 'supertest';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createApp } from '../../app.js';

const {
  mockChallengeFindUnique,
  mockChallengeDelete,
  mockUserFindUnique,
  mockUserCreate,
  mockRefreshFindUnique,
  mockRefreshCreate,
  mockRefreshUpdate,
  mockRefreshDeleteMany,
  mockVerify,
} = vi.hoisted(() => ({
  mockChallengeFindUnique: vi.fn(),
  mockChallengeDelete: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockUserCreate: vi.fn(),
  mockRefreshFindUnique: vi.fn(),
  mockRefreshCreate: vi.fn(),
  mockRefreshUpdate: vi.fn(),
  mockRefreshDeleteMany: vi.fn(),
  mockVerify: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    authChallenge: {
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
    },
    user: {
      upsert: vi.fn(),
    },
    refreshToken: {
      findUnique: mockRefreshFindUnique,
      create: mockRefreshCreate,
      update: mockRefreshUpdate,
      deleteMany: mockRefreshDeleteMany,
    },
    $disconnect: vi.fn(),
  },
}));

vi.mock('@stellar/stellar-sdk', () => ({
  Keypair: {
    fromPublicKey: vi.fn(() => ({
      verify: mockVerify,
    })),
  },
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn(() => 'mock-access-token'),
  },
  sign: vi.fn(() => 'mock-access-token'),
}));

const { prisma } = await import('../../db/prisma.js');
const { Keypair } = await import('@stellar/stellar-sdk');

const baseChallenge = {
  id: 'ch-1',
  address: 'GABC123',
  nonce: 'nonce-1',
  expiresAt: new Date(Date.now() + 100_000),
  createdAt: new Date(),
};

const baseUser = {
  id: 'user-1',
  stellarAddress: 'GABC123',
  username: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

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
    mockChallengeFindUnique.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/verify')
      .send({ address: 'GABC123', nonce: 'nonexistent', signature: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Challenge not found');
  });

  it('returns 400 when challenge address does not match', async () => {
    prisma.authChallenge.findUnique.mockResolvedValue({
      ...baseChallenge,
      address: 'GDIFFERENT',
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/verify')
      .send({ address: 'GABC123', nonce: 'nonce-1', signature: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Challenge does not match the provided address');
  });

  it('returns 400 when challenge is expired', async () => {
    prisma.authChallenge.findUnique.mockResolvedValue({
      ...baseChallenge,
      expiresAt: new Date(Date.now() - 1000),
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/verify')
      .send({ address: 'GABC123', nonce: 'nonce-1', signature: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Challenge has expired');
  });

  it('returns 401 when signature is invalid', async () => {
    prisma.authChallenge.findUnique.mockResolvedValue(baseChallenge);
    Keypair.fromPublicKey('').verify.mockReturnValue(false);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/verify')
      .send({ address: 'GABC123', nonce: 'nonce-1', signature: 'invalidsig' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid signature');
  });

  it('returns 401 when nonce has already been consumed', async () => {
    prisma.authChallenge.findUnique.mockResolvedValue(baseChallenge);
    Keypair.fromPublicKey('').verify.mockReturnValue(true);
    // Simulate concurrent request already deleted the challenge
    prisma.authChallenge.deleteMany.mockResolvedValue({ count: 0 });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/verify')
      .send({ address: 'GABC123', nonce: 'nonce-1', signature: 'validsig' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Challenge has already been used');
  });

  it('creates a new user and returns tokens on first login', async () => {
    prisma.authChallenge.findUnique.mockResolvedValue(baseChallenge);
    Keypair.fromPublicKey('').verify.mockReturnValue(true);
    prisma.authChallenge.deleteMany.mockResolvedValue({ count: 1 });
    prisma.user.upsert.mockResolvedValue(baseUser);
    prisma.refreshToken.create.mockResolvedValue({});

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/verify')
      .send({ address: 'GABC123', nonce: 'nonce-1', signature: 'validsig' });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBe('mock-access-token');
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.user.stellarAddress).toBe('GABC123');
    // Confirm upsert was used (not findUnique + create)
    expect(prisma.user.upsert).toHaveBeenCalledOnce();
    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stellarAddress: 'GABC123' },
        create: { stellarAddress: 'GABC123' },
        update: {},
      }),
    );
  });

  it('returns existing user data on subsequent logins', async () => {
    const existingUser = { ...baseUser, username: 'tipmaster', id: 'existing-1' };
    prisma.authChallenge.findUnique.mockResolvedValue(baseChallenge);
    Keypair.fromPublicKey('').verify.mockReturnValue(true);
    prisma.authChallenge.deleteMany.mockResolvedValue({ count: 1 });
    prisma.user.upsert.mockResolvedValue(existingUser);
    prisma.refreshToken.create.mockResolvedValue({});

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/verify')
      .send({ address: 'GABC123', nonce: 'nonce-1', signature: 'validsig' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe('existing-1');
    expect(res.body.data.user.username).toBe('tipmaster');
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
    mockRefreshFindUnique.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'invalid' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid refresh token');
  });

  it('returns 401 when refresh token is revoked', async () => {
    mockRefreshFindUnique.mockResolvedValue({
      id: 'rt-1',
      userId: 'user-1',
      hashedToken: 'hash',
      expiresAt: new Date(Date.now() + 100_000),
      revokedAt: new Date(),
      createdAt: new Date(),
      user: baseUser,
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'revoked-token' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Refresh token has been revoked');
  });

  it('returns 401 when refresh token is expired', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1',
      userId: 'user-1',
      hashedToken: 'hash',
      expiresAt: new Date(Date.now() - 1000),
      revokedAt: null,
      createdAt: new Date(),
      user: baseUser,
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'expired-token' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Refresh token has expired');
  });

  it('returns new token pair on successful refresh', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1',
      userId: 'user-1',
      hashedToken: 'hash',
      expiresAt: new Date(Date.now() + 100_000),
      revokedAt: null,
      createdAt: new Date(),
      user: baseUser,
    });
    mockRefreshUpdate.mockResolvedValue({});
    mockRefreshCreate.mockResolvedValue({});

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
