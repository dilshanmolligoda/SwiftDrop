import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

@Injectable()
export class PasswordService {
  private readonly saltRounds: number;

  constructor(configService: ConfigService) {
    const rounds = Number(
      configService.get<string | number>('PASSWORD_HASH_ROUNDS', 12),
    );
    this.saltRounds = Number.isInteger(rounds) && rounds > 0 ? rounds : 12;
  }

  get rounds(): number {
    return this.saltRounds;
  }

  async hash(password: string): Promise<string> {
    return bcrypt.hash(password, this.saltRounds);
  }

  async verify(
    password: string,
    hash: string | null | undefined,
  ): Promise<boolean> {
    if (!password || !hash) {
      return false;
    }
    return bcrypt.compare(password, hash);
  }
}
