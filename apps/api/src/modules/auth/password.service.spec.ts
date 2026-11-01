import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  let service: PasswordService;
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    configService = {
      get: jest.fn().mockReturnValue(10),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<PasswordService>(PasswordService);
  });

  it('hashes password and verifies successfully', async () => {
    const raw = 'my-secure-password';
    const hash = await service.hash(raw);

    expect(hash).toBeDefined();
    expect(hash).not.toEqual(raw);

    const isMatch = await service.verify(raw, hash);
    expect(isMatch).toBe(true);
  });

  it('returns false when password does not match hash', async () => {
    const raw = 'my-secure-password';
    const hash = await service.hash(raw);

    const isMatch = await service.verify('wrong-password', hash);
    expect(isMatch).toBe(false);
  });

  it('returns false when hash is null, undefined, or empty', async () => {
    expect(await service.verify('password', null)).toBe(false);
    expect(await service.verify('password', undefined)).toBe(false);
    expect(await service.verify('password', '')).toBe(false);
  });

  it('returns false when password is empty', async () => {
    const hash = await service.hash('password');
    expect(await service.verify('', hash)).toBe(false);
  });

  it('defaults to 12 rounds if config is invalid or absent', async () => {
    const fallbackConfig = {
      get: jest.fn().mockReturnValue(undefined),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordService,
        { provide: ConfigService, useValue: fallbackConfig },
      ],
    }).compile();

    const fallbackService = module.get<PasswordService>(PasswordService);
    expect(fallbackService.rounds).toBe(12);
  });
});
