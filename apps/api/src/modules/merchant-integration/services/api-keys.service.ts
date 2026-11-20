import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ApiKey } from '../../../generated/prisma/client.js';
import { ApprovalStatus } from '../../../generated/prisma/enums.js';
import {
  extractLookupPrefix,
  generateApiKey,
  hashApiKey,
  verifyApiKey,
} from '../domain/api-key.js';
import { ApiKeysRepository } from '../repositories/api-keys.repository.js';

/** Active (non-revoked) keys a merchant may hold at once. */
export const MAX_ACTIVE_API_KEYS = 5;

const MAX_PREFIX_COLLISION_RETRIES = 3;

/** What a merchant may see about a key after it was created. Never includes the key or its hash. */
export interface ApiKeySummary {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

export interface CreatedApiKey extends ApiKeySummary {
  /** The full key. Returned only in the create response. */
  apiKey: string;
}

/** The merchant behind a request authenticated with X-API-Key. */
export interface ApiKeyPrincipal {
  apiKeyId: string;
  keyPrefix: string;
  merchantProfileId: string;
  businessName: string;
  userId: string;
}

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);

  constructor(
    private readonly apiKeysRepository: ApiKeysRepository,
    private readonly configService: ConfigService,
  ) {}

  async create(userId: string, name: string): Promise<CreatedApiKey> {
    const merchantProfileId = await this.requireMerchantProfileId(userId);

    const activeKeys =
      await this.apiKeysRepository.countActive(merchantProfileId);
    if (activeKeys >= MAX_ACTIVE_API_KEYS) {
      throw new ConflictException(
        `You can have at most ${MAX_ACTIVE_API_KEYS} active API keys. Revoke one before creating another.`,
      );
    }

    const pepper = this.getPepper();

    for (let attempt = 1; ; attempt++) {
      const { plainKey, lookupPrefix } = generateApiKey();
      try {
        const saved = await this.apiKeysRepository.create({
          merchantProfileId,
          name,
          keyPrefix: lookupPrefix,
          keyHash: hashApiKey(plainKey, pepper),
        });
        this.logger.log(
          `API key ${saved.keyPrefix}… created for merchant ${merchantProfileId}`,
        );
        return { ...toSummary(saved), apiKey: plainKey };
      } catch (error) {
        // The random lookup prefix collided with an existing key: try a new key.
        if (
          isUniqueViolation(error) &&
          attempt < MAX_PREFIX_COLLISION_RETRIES
        ) {
          continue;
        }
        throw error;
      }
    }
  }

  async list(userId: string): Promise<ApiKeySummary[]> {
    const merchantProfileId = await this.requireMerchantProfileId(userId);
    const keys = await this.apiKeysRepository.listByMerchant(merchantProfileId);
    return keys.map(toSummary);
  }

  /** Revoking is idempotent; an unknown key and another merchant's key both return 404. */
  async revoke(userId: string, apiKeyId: string): Promise<ApiKeySummary> {
    const merchantProfileId = await this.requireMerchantProfileId(userId);
    const key = await this.apiKeysRepository.findByIdForMerchant(
      apiKeyId,
      merchantProfileId,
    );
    if (!key) {
      throw new NotFoundException('API key not found');
    }
    if (key.revokedAt) {
      return toSummary(key);
    }

    const revoked = await this.apiKeysRepository.revoke(key.id, new Date());
    this.logger.log(
      `API key ${revoked.keyPrefix}… revoked for merchant ${merchantProfileId}`,
    );
    return toSummary(revoked);
  }

  /**
   * Resolves the merchant behind an X-API-Key header value.
   * 401 for a missing, unknown or revoked key; 403 when the owning merchant
   * is not approved or not active.
   */
  async authenticate(plainKey: string | undefined): Promise<ApiKeyPrincipal> {
    if (!plainKey) {
      throw new UnauthorizedException('Missing X-API-Key header');
    }

    const keyPrefix = extractLookupPrefix(plainKey);
    if (!keyPrefix) {
      throw new UnauthorizedException('Invalid API key');
    }

    const pepper = this.getPepper();
    const record =
      await this.apiKeysRepository.findByPrefixWithOwner(keyPrefix);
    if (!record || !verifyApiKey(plainKey, record.keyHash, pepper)) {
      throw new UnauthorizedException('Invalid API key');
    }
    if (record.revokedAt) {
      throw new UnauthorizedException('API key has been revoked');
    }

    const owner = record.merchantProfile.user;
    if (!owner.isActive) {
      throw new ForbiddenException('Merchant account is not active');
    }
    if (owner.approvalStatus !== ApprovalStatus.APPROVED) {
      throw new ForbiddenException('Merchant account is not approved');
    }

    try {
      await this.apiKeysRepository.touchLastUsed(record.id, new Date());
    } catch {
      // Usage tracking must never block an otherwise valid request.
      this.logger.warn(
        `Could not update last-used time for ${record.keyPrefix}…`,
      );
    }

    return {
      apiKeyId: record.id,
      keyPrefix: record.keyPrefix,
      merchantProfileId: record.merchantProfile.id,
      businessName: record.merchantProfile.businessName,
      userId: owner.id,
    };
  }

  private async requireMerchantProfileId(userId: string): Promise<string> {
    const merchantProfileId =
      await this.apiKeysRepository.findMerchantProfileIdByUserId(userId);
    if (!merchantProfileId) {
      throw new NotFoundException('No merchant profile found for this account');
    }
    return merchantProfileId;
  }

  /**
   * Read on use rather than at startup, so the rest of the API still runs on
   * machines where merchant API keys are not configured yet.
   */
  private getPepper(): string {
    const pepper = this.configService.get<string>('API_KEY_PEPPER')?.trim();
    if (!pepper || /^<change-me/i.test(pepper)) {
      this.logger.error('API_KEY_PEPPER is not configured');
      throw new ServiceUnavailableException(
        'Merchant API keys are not configured on this server',
      );
    }
    return pepper;
  }
}

function toSummary(key: ApiKey): ApiKeySummary {
  return {
    id: key.id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
    revokedAt: key.revokedAt,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
