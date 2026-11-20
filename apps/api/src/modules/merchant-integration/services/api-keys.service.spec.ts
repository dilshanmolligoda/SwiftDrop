import {
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApprovalStatus } from '../../../generated/prisma/enums.js';
import { API_KEY_PREFIX, hashApiKey } from '../domain/api-key.js';
import type {
  ApiKeyWithOwner,
  ApiKeysRepository,
} from '../repositories/api-keys.repository.js';
import { ApiKeysService, MAX_ACTIVE_API_KEYS } from './api-keys.service.js';

const PEPPER = 'unit-test-pepper';
const USER_ID = 'user-1';
const PROFILE_ID = 'profile-1';

function keyRecord(overrides: Partial<ApiKeyWithOwner> = {}): ApiKeyWithOwner {
  return {
    id: 'key-1',
    merchantProfileId: PROFILE_ID,
    name: 'Online store',
    keyPrefix: 'sd_abcdefgh',
    keyHash: 'unused',
    lastUsedAt: null,
    revokedAt: null,
    createdAt: new Date('2026-11-01T00:00:00Z'),
    merchantProfile: {
      id: PROFILE_ID,
      businessName: 'Lanka Gadgets',
      user: {
        id: USER_ID,
        isActive: true,
        approvalStatus: ApprovalStatus.APPROVED,
      },
    },
    ...overrides,
  };
}

describe('ApiKeysService', () => {
  let repository: jest.Mocked<
    Pick<
      ApiKeysRepository,
      | 'findMerchantProfileIdByUserId'
      | 'countActive'
      | 'create'
      | 'listByMerchant'
      | 'findByIdForMerchant'
      | 'revoke'
      | 'findByPrefixWithOwner'
      | 'touchLastUsed'
    >
  >;
  let pepper: string | undefined;
  let service: ApiKeysService;

  beforeAll(() => {
    for (const level of ['log', 'warn', 'error'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
    }
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    pepper = PEPPER;
    repository = {
      findMerchantProfileIdByUserId: jest.fn().mockResolvedValue(PROFILE_ID),
      countActive: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation((data: Record<string, string>) =>
        Promise.resolve({
          id: 'key-1',
          ...data,
          lastUsedAt: null,
          revokedAt: null,
          createdAt: new Date(),
        }),
      ),
      listByMerchant: jest.fn(),
      findByIdForMerchant: jest.fn(),
      revoke: jest.fn(),
      findByPrefixWithOwner: jest.fn(),
      touchLastUsed: jest.fn().mockResolvedValue(undefined),
    };
    const config = { get: jest.fn(() => pepper) } as unknown as ConfigService;
    service = new ApiKeysService(
      repository as unknown as ApiKeysRepository,
      config,
    );
  });

  describe('create', () => {
    it('returns the full key once and stores only its peppered hash', async () => {
      const created = await service.create(USER_ID, 'Online store');

      expect(created.apiKey.startsWith(API_KEY_PREFIX)).toBe(true);
      expect(created.apiKey.startsWith(created.keyPrefix)).toBe(true);

      const stored = repository.create.mock.calls[0][0];
      expect(stored).toEqual({
        merchantProfileId: PROFILE_ID,
        name: 'Online store',
        keyPrefix: created.keyPrefix,
        keyHash: hashApiKey(created.apiKey, PEPPER),
      });
      expect(JSON.stringify(stored)).not.toContain(created.apiKey);
    });

    it('rejects a merchant who already has the maximum number of active keys', async () => {
      repository.countActive.mockResolvedValue(MAX_ACTIVE_API_KEYS);

      await expect(service.create(USER_ID, 'One too many')).rejects.toThrow(
        ConflictException,
      );
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('retries with a new key when the lookup prefix collides', async () => {
      repository.create.mockRejectedValueOnce({ code: 'P2002' });

      const created = await service.create(USER_ID, 'Online store');

      expect(repository.create).toHaveBeenCalledTimes(2);
      expect(created.apiKey).toBeDefined();
    });

    it('returns 404 for an account without a merchant profile', async () => {
      repository.findMerchantProfileIdByUserId.mockResolvedValue(null);

      await expect(service.create(USER_ID, 'Online store')).rejects.toThrow(
        NotFoundException,
      );
    });

    it.each([undefined, '', '<change-me-long-random>'])(
      'returns 503 when API_KEY_PEPPER is %p',
      async (value) => {
        pepper = value;
        await expect(service.create(USER_ID, 'Online store')).rejects.toThrow(
          ServiceUnavailableException,
        );
      },
    );
  });

  describe('list', () => {
    it('never exposes the hash or the full key', async () => {
      repository.listByMerchant.mockResolvedValue([
        keyRecord({ keyHash: 'secret-hash' }),
      ]);

      const keys = await service.list(USER_ID);

      expect(keys).toHaveLength(1);
      expect(keys[0]).not.toHaveProperty('keyHash');
      expect(keys[0]).not.toHaveProperty('apiKey');
      expect(keys[0].keyPrefix).toBe('sd_abcdefgh');
    });
  });

  describe('revoke', () => {
    it('only looks up keys belonging to the signed-in merchant', async () => {
      repository.findByIdForMerchant.mockResolvedValue(null);

      await expect(
        service.revoke(USER_ID, 'someone-elses-key'),
      ).rejects.toThrow(NotFoundException);
      expect(repository.findByIdForMerchant).toHaveBeenCalledWith(
        'someone-elses-key',
        PROFILE_ID,
      );
      expect(repository.revoke).not.toHaveBeenCalled();
    });

    it('sets revokedAt on an active key', async () => {
      repository.findByIdForMerchant.mockResolvedValue(keyRecord());
      repository.revoke.mockImplementation((id, revokedAt) =>
        Promise.resolve(keyRecord({ id, revokedAt })),
      );

      const result = await service.revoke(USER_ID, 'key-1');

      expect(result.revokedAt).toBeInstanceOf(Date);
    });

    it('is idempotent for an already revoked key', async () => {
      const revokedAt = new Date('2026-11-02T00:00:00Z');
      repository.findByIdForMerchant.mockResolvedValue(
        keyRecord({ revokedAt }),
      );

      const result = await service.revoke(USER_ID, 'key-1');

      expect(result.revokedAt).toEqual(revokedAt);
      expect(repository.revoke).not.toHaveBeenCalled();
    });
  });

  describe('authenticate', () => {
    let plainKey: string;

    beforeEach(async () => {
      plainKey = (await service.create(USER_ID, 'Online store')).apiKey;
      const stored = repository.create.mock.calls[0][0];
      repository.findByPrefixWithOwner.mockResolvedValue(
        keyRecord({ keyPrefix: stored.keyPrefix, keyHash: stored.keyHash }),
      );
    });

    it('resolves the merchant for a valid key and records its use', async () => {
      const principal = await service.authenticate(plainKey);

      expect(principal).toEqual({
        apiKeyId: 'key-1',
        keyPrefix: plainKey.slice(0, API_KEY_PREFIX.length + 8),
        merchantProfileId: PROFILE_ID,
        businessName: 'Lanka Gadgets',
        userId: USER_ID,
      });
      expect(repository.touchLastUsed).toHaveBeenCalledWith(
        'key-1',
        expect.any(Date),
      );
    });

    it.each([undefined, '', 'not-a-swiftdrop-key'])(
      'returns 401 for a missing or malformed key (%p)',
      async (value) => {
        await expect(service.authenticate(value)).rejects.toThrow(
          UnauthorizedException,
        );
        expect(repository.findByPrefixWithOwner).not.toHaveBeenCalled();
      },
    );

    it('returns 401 for an unknown key', async () => {
      repository.findByPrefixWithOwner.mockResolvedValue(null);
      await expect(service.authenticate(plainKey)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('returns 401 when the prefix matches but the secret part is wrong', async () => {
      const tampered = plainKey.slice(0, -4) + 'XXXX';
      await expect(service.authenticate(tampered)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('returns 401 for a revoked key', async () => {
      const record = await repository.findByPrefixWithOwner('');
      repository.findByPrefixWithOwner.mockResolvedValue({
        ...record!,
        revokedAt: new Date(),
      });

      await expect(service.authenticate(plainKey)).rejects.toThrow(
        'API key has been revoked',
      );
    });

    it.each([ApprovalStatus.PENDING, ApprovalStatus.REJECTED])(
      'returns 403 when the merchant is %s',
      async (approvalStatus) => {
        const record = await repository.findByPrefixWithOwner('');
        record!.merchantProfile.user.approvalStatus = approvalStatus;

        await expect(service.authenticate(plainKey)).rejects.toThrow(
          ForbiddenException,
        );
      },
    );

    it('returns 403 when the merchant account is inactive', async () => {
      const record = await repository.findByPrefixWithOwner('');
      record!.merchantProfile.user.isActive = false;

      await expect(service.authenticate(plainKey)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('still authenticates when recording last use fails', async () => {
      repository.touchLastUsed.mockRejectedValue(new Error('db busy'));

      await expect(service.authenticate(plainKey)).resolves.toMatchObject({
        merchantProfileId: PROFILE_ID,
      });
    });
  });
});
