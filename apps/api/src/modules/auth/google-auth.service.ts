import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client, CodeChallengeMethod } from 'google-auth-library';
import * as crypto from 'crypto';

export interface OAuthTransaction {
  state: string;
  codeVerifier: string;
  nonce: string;
  intent: 'signin' | 'link';
  linkUserId?: string;
  createdAt: number;
}

export interface GoogleUserIdentity {
  googleSubject: string;
  email: string;
  fullName: string;
  emailVerified: boolean;
}

@Injectable()
export class GoogleAuthService {
  private oauthClient: OAuth2Client | null = null;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Checks whether Google OAuth 2.0 credentials are validly configured.
   */
  isConfigured(): boolean {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID')?.trim();
    const clientSecret = this.configService
      .get<string>('GOOGLE_CLIENT_SECRET')
      ?.trim();

    return Boolean(
      clientId &&
      clientSecret &&
      !clientId.startsWith('<change-me') &&
      !clientSecret.startsWith('<change-me'),
    );
  }

  getCallbackUrl(): string {
    return this.configService.get<string>(
      'GOOGLE_CALLBACK_URL',
      'http://localhost:4000/api/v1/auth/google/callback',
    );
  }

  getClientId(): string {
    return this.configService.get<string>('GOOGLE_CLIENT_ID', '').trim();
  }

  getClientSecret(): string {
    return this.configService.get<string>('GOOGLE_CLIENT_SECRET', '').trim();
  }

  private getClient(): OAuth2Client {
    if (!this.oauthClient) {
      this.oauthClient = new OAuth2Client({
        clientId: this.getClientId(),
        clientSecret: this.getClientSecret(),
        redirectUri: this.getCallbackUrl(),
      });
    }
    return this.oauthClient;
  }

  /**
   * For testing: override the OAuth2Client instance.
   */
  setClient(client: OAuth2Client | null): void {
    this.oauthClient = client;
  }

  /**
   * Creates a signed OAuth transaction and generates the Google authorization URL
   * with PKCE (S256), state, and nonce.
   */
  createOAuthTransaction(
    intent: 'signin' | 'link',
    linkUserId?: string,
  ): { authUrl: string; cookieValue: string } {
    if (!this.isConfigured()) {
      throw new Error('Google OAuth credentials are not configured');
    }

    const state = crypto.randomBytes(32).toString('hex');
    const nonce = crypto.randomBytes(32).toString('hex');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    const transaction: OAuthTransaction = {
      state,
      codeVerifier,
      nonce,
      intent,
      linkUserId,
      createdAt: Date.now(),
    };

    const cookieValue = this.signTransaction(transaction);

    const client = this.getClient();
    const authUrl = client.generateAuthUrl({
      access_type: 'online',
      scope: ['openid', 'email', 'profile'],
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
      prompt: 'select_account',
    });

    return { authUrl, cookieValue };
  }

  /**
   * Signs the transaction payload using HMAC-SHA256 with JWT_ACCESS_SECRET.
   */
  signTransaction(transaction: OAuthTransaction): string {
    const secret = this.configService.getOrThrow<string>('JWT_ACCESS_SECRET');
    const json = JSON.stringify(transaction);
    const encoded = Buffer.from(json, 'utf8').toString('base64url');
    const signature = crypto
      .createHmac('sha256', secret)
      .update(encoded)
      .digest('base64url');

    return `${encoded}.${signature}`;
  }

  /**
   * Verifies and decodes the OAuth transaction cookie value.
   * Returns null if signature is invalid, expired (>10m), or corrupted.
   */
  verifyTransactionCookie(cookieValue?: string): OAuthTransaction | null {
    if (!cookieValue || typeof cookieValue !== 'string') {
      return null;
    }

    const parts = cookieValue.split('.');
    if (parts.length !== 2) {
      return null;
    }

    const [encoded, signature] = parts;
    const secret = this.configService.getOrThrow<string>('JWT_ACCESS_SECRET');

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(encoded)
      .digest('base64url');

    const sigBuf = Buffer.from(signature, 'utf8');
    const expectedBuf = Buffer.from(expectedSignature, 'utf8');

    if (
      sigBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(sigBuf, expectedBuf)
    ) {
      return null;
    }

    try {
      const json = Buffer.from(encoded, 'base64url').toString('utf8');
      const transaction = JSON.parse(json) as OAuthTransaction;

      // Max TTL: 10 minutes (600,000 ms)
      if (Date.now() - transaction.createdAt > 600000) {
        return null;
      }

      return transaction;
    } catch {
      return null;
    }
  }

  /**
   * Exchanges the Google authorization code and verifies the ID token.
   */
  async exchangeAndVerify(
    code: string,
    codeVerifier: string,
    expectedNonce: string,
  ): Promise<GoogleUserIdentity> {
    const client = this.getClient();

    const { tokens } = await client.getToken({
      code,
      codeVerifier,
    });

    if (!tokens.id_token) {
      throw new UnauthorizedException('Missing ID token from Google');
    }

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: this.getClientId(),
    });

    const payload = ticket.getPayload();
    if (!payload) {
      throw new UnauthorizedException('Invalid Google ID token payload');
    }

    // Verify issuer
    const validIssuers = ['https://accounts.google.com', 'accounts.google.com'];
    if (!payload.iss || !validIssuers.includes(payload.iss)) {
      throw new UnauthorizedException('Invalid Google ID token issuer');
    }

    // Verify sub
    if (!payload.sub || typeof payload.sub !== 'string') {
      throw new UnauthorizedException(
        'Missing subject identifier in Google ID token',
      );
    }

    // Verify email and verification status
    if (!payload.email || typeof payload.email !== 'string') {
      throw new UnauthorizedException(
        'Missing email address in Google ID token',
      );
    }

    if (payload.email_verified !== true) {
      throw new UnauthorizedException('Google email address is not verified');
    }

    // Verify nonce (mandatory)
    if (!payload.nonce) {
      throw new UnauthorizedException('Missing nonce in Google ID token');
    }

    if (payload.nonce !== expectedNonce) {
      throw new UnauthorizedException('Nonce mismatch in Google ID token');
    }

    return {
      googleSubject: payload.sub,
      email: payload.email.trim().toLowerCase(),
      fullName: payload.name?.trim() || payload.email.split('@')[0],
      emailVerified: payload.email_verified,
    };
  }
}
