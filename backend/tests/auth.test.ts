import request from 'supertest';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createApp } from '../src/app.js';

const mockAuthChallengeCreate = vi.fn();

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    authChallenge: {
      create: mockAuthChallengeCreate,
    },
  },
}));

const validAddress = 'GCDUEW3G6B6G3WY5X6HJ6Z7O4X7K7Q5V5Z7O4X7K7Q5V5Z7O4X7K7Q';

function mockChallengeCreate(): void {
  mockAuthChallengeCreate.mockResolvedValue({
    id: 'challenge-1',
    address: validAddress,
    nonce: 'abc123',
    expiresAt: new Date(Date.now() + 300_000),
    createdAt: new Date(),
  });
}

describe('POST /api/v1/auth/challenge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChallengeCreate();
  });

  it('returns 201 with challenge on valid request', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/challenge')
      .send({ address: validAddress });

    expect(res.status).toBe(201);
    expect(res.body.challenge).toBeDefined();
    expect(res.body.challenge.address).toBe(validAddress);
    expect(res.body.challenge.messageToSign).toContain('Sign this message');
    expect(mockAuthChallengeCreate).toHaveBeenCalledOnce();
  });

  it('returns 400 for invalid Stellar address', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/challenge')
      .send({ address: 'not-a-valid-address' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for missing address', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/challenge')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 429 when rate limit is exceeded', async () => {
    const app = createApp();
    const requests = Array.from({ length: 11 }, () =>
      request(app)
        .post('/api/v1/auth/challenge')
        .send({ address: validAddress }),
    );

    const results = await Promise.all(requests);
    const throttled = results.filter((r) => r.status === 429);
    expect(throttled.length).toBeGreaterThan(0);
  });
});
