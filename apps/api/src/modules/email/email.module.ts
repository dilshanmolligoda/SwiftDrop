import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailService } from './email.service.js';
import { DigestService } from './digest.service.js';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [EmailService, DigestService],
  exports: [EmailService, DigestService],
})
export class EmailModule {}
