import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import {
  GoogleAuthService,
  type OAuthTransaction,
} from './google-auth.service.js';

describe('GoogleAuthService', () => {
  let service: GoogleAuthService;
  let configService: ConfigService;

  const mockConfig: Record<string, string> = {
    GOOGLE_CLIENT_ID: 'test-client-id.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    GOOGLE_CALLBACK_URL: 'http://localhost:4000/api/v1/auth/google/callback',
    JWT_ACCESS_SECRET:
      'test-jwt-secret-at-least-32-bytes-long-for-hmac-sha256-signing!',
  };

  beforeEach(() => {
    configService = {
      get: jest.fn(
        (key: string, fallback?: string) => mockConfig[key] ?? fallback,
      ),
      getOrThrow: jest.fn((key: string) => {
        const val = mockConfig[key];
        if (!val) throw new Error(`Missing ${key}`);
        return val;
      }),
    } as unknown as ConfigService;

    service = new GoogleAuthService(configService);
  });

  describe('isConfigured', () => {
    it('returns true when valid credentials are provided', () => {
      expect(service.isConfigured()).toBe(true);
    });

    it('returns false when client id is missing or placeholder', () => {
      mockConfig.GOOGLE_CLIENT_ID = '<change-me>.apps.googleusercontent.com';
      expect(service.isConfigured()).toBe(false);

      delete (mockConfig as Record<string, string | undefined>)
        .GOOGLE_CLIENT_ID;
      expect(service.isConfigured()).toBe(false);

      mockConfig.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
    });

    it('returns false when client secret is missing or placeholder', () => {
      mockConfig.GOOGLE_CLIENT_SECRET = '<change-me>';
      expect(service.isConfigured()).toBe(false);

      mockConfig.GOOGLE_CLIENT_SECRET = 'test-client-secret';
    });
  });

  describe('createOAuthTransaction', () => {
    it('generates a valid Google auth URL with state, PKCE S256 code challenge, and nonce', () => {
      const { authUrl, cookieValue } = service.createOAuthTransaction('signin');

      expect(authUrl).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(authUrl).toContain(
        'client_id=test-client-id.apps.googleusercontent.com',
      );
      expect(authUrl).toContain('response_type=code');
      expect(authUrl).toContain('code_challenge=');
      expect(authUrl).toContain('code_challenge_method=S256');
      expect(authUrl).toContain('scope=openid');
      expect(authUrl).toContain('state=');
      expect(authUrl).toContain('nonce=');

      const verified = service.verifyTransactionCookie(cookieValue);
      expect(verified).not.toBeNull();
      expect(verified?.intent).toBe('signin');
      expect(verified?.state).toBeDefined();
      expect(verified?.codeVerifier).toBeDefined();
      expect(verified?.nonce).toBeDefined();
    });

    it('throws error when not configured', () => {
      mockConfig.GOOGLE_CLIENT_ID = '<change-me>';
      expect(() => service.createOAuthTransaction('signin')).toThrow(
        'Google OAuth credentials are not configured',
      );
      mockConfig.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
    });
  });

  describe('signTransaction and verifyTransactionCookie', () => {
    it('successfully signs and verifies an OAuth transaction', () => {
      const tx: OAuthTransaction = {
        state: 'random-state-123',
        codeVerifier: 'verifier-456',
        nonce: 'nonce-789',
        intent: 'link',
        linkUserId: 'user-uuid-1',
        createdAt: Date.now(),
      };

      const signedCookie = service.signTransaction(tx);
      const verified = service.verifyTransactionCookie(signedCookie);

      expect(verified).toEqual(tx);
    });

    it('returns null if signature is tampered', () => {
      const tx: OAuthTransaction = {
        state: 'random-state-123',
        codeVerifier: 'verifier-456',
        nonce: 'nonce-789',
        intent: 'signin',
        createdAt: Date.now(),
      };

      const signedCookie = service.signTransaction(tx);
      const tampered = signedCookie.slice(0, -4) + 'abcd';
      expect(service.verifyTransactionCookie(tampered)).toBeNull();
    });

    it('returns null if transaction is expired (> 10 minutes)', () => {
      const tx: OAuthTransaction = {
        state: 'random-state-123',
        codeVerifier: 'verifier-456',
        nonce: 'nonce-789',
        intent: 'signin',
        createdAt: Date.now() - 700000, // 11.6 minutes ago
      };

      const signedCookie = service.signTransaction(tx);
      expect(service.verifyTransactionCookie(signedCookie)).toBeNull();
    });

    it('returns null for malformed cookie value', () => {
      expect(service.verifyTransactionCookie('')).toBeNull();
      expect(
        service.verifyTransactionCookie('invalid-cookie-no-dot'),
      ).toBeNull();
      expect(service.verifyTransactionCookie('one.two.three')).toBeNull();
    });
  });

  describe('exchangeAndVerify', () => {
    let mockOAuthClient: jest.Mocked<Partial<OAuth2Client>>;

    beforeEach(() => {
      mockOAuthClient = {
        getToken: jest.fn(),
        verifyIdToken: jest.fn(),
      };
      service.setClient(mockOAuthClient as unknown as OAuth2Client);
    });

    it('successfully exchanges code and verifies valid Google ID token', async () => {
      (mockOAuthClient.getToken as jest.Mock).mockResolvedValue({
        tokens: { id_token: 'valid-id-token' },
      });

      (mockOAuthClient.verifyIdToken as jest.Mock).mockResolvedValue({
        getPayload: () => ({
          iss: 'https://accounts.google.com',
          sub: 'google-sub-123456789',
          email: 'Test.User@example.com',
          email_verified: true,
          name: 'Test Google User',
          nonce: 'expected-nonce-abc',
        }),
      });

      const identity = await service.exchangeAndVerify(
        'auth-code',
        'code-verifier',
        'expected-nonce-abc',
      );

      expect(identity).toEqual({
        googleSubject: 'google-sub-123456789',
        email: 'test.user@example.com',
        fullName: 'Test Google User',
        emailVerified: true,
      });
    });

    it('throws UnauthorizedException if tokens do not include id_token', async () => {
      (mockOAuthClient.getToken as jest.Mock).mockResolvedValue({
        tokens: {},
      });

      await expect(
        service.exchangeAndVerify('auth-code', 'code-verifier', 'nonce'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException if issuer is invalid', async () => {
      (mockOAuthClient.getToken as jest.Mock).mockResolvedValue({
        tokens: { id_token: 'valid-id-token' },
      });
      (mockOAuthClient.verifyIdToken as jest.Mock).mockResolvedValue({
        getPayload: () => ({
          iss: 'https://untrusted-issuer.com',
          sub: 'sub-1',
          email: 'user@example.com',
          email_verified: true,
          nonce: 'nonce',
        }),
      });

      await expect(
        service.exchangeAndVerify('auth-code', 'code-verifier', 'nonce'),
      ).rejects.toThrow('Invalid Google ID token issuer');
    });

    it('throws UnauthorizedException if email is not verified', async () => {
      (mockOAuthClient.getToken as jest.Mock).mockResolvedValue({
        tokens: { id_token: 'valid-id-token' },
      });
      (mockOAuthClient.verifyIdToken as jest.Mock).mockResolvedValue({
        getPayload: () => ({
          iss: 'https://accounts.google.com',
          sub: 'sub-1',
          email: 'user@example.com',
          email_verified: false,
          nonce: 'nonce',
        }),
      });

      await expect(
        service.exchangeAndVerify('auth-code', 'code-verifier', 'nonce'),
      ).rejects.toThrow('Google email address is not verified');
    });

    it('throws UnauthorizedException if nonce is missing in Google ID token', async () => {
      (mockOAuthClient.getToken as jest.Mock).mockResolvedValue({
        tokens: { id_token: 'valid-id-token' },
      });
      (mockOAuthClient.verifyIdToken as jest.Mock).mockResolvedValue({
        getPayload: () => ({
          iss: 'https://accounts.google.com',
          sub: 'sub-1',
          email: 'user@example.com',
          email_verified: true,
          // nonce is omitted/missing
        }),
      });

      await expect(
        service.exchangeAndVerify(
          'auth-code',
          'code-verifier',
          'expected-nonce',
        ),
      ).rejects.toThrow('Missing nonce in Google ID token');
    });

    it('throws UnauthorizedException if nonce does not match expected nonce', async () => {
      (mockOAuthClient.getToken as jest.Mock).mockResolvedValue({
        tokens: { id_token: 'valid-id-token' },
      });
      (mockOAuthClient.verifyIdToken as jest.Mock).mockResolvedValue({
        getPayload: () => ({
          iss: 'https://accounts.google.com',
          sub: 'sub-1',
          email: 'user@example.com',
          email_verified: true,
          nonce: 'different-nonce',
        }),
      });

      await expect(
        service.exchangeAndVerify(
          'auth-code',
          'code-verifier',
          'expected-nonce',
        ),
      ).rejects.toThrow('Nonce mismatch in Google ID token');
    });
  });
});
