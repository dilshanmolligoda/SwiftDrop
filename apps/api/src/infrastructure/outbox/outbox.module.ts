import { Module } from '@nestjs/common';
import { OutboxWriter } from './outbox.writer.js';

/**
 * Import this in any module whose service changes parcel state.
 * It has no dependencies, so test modules can import it as-is.
 */
@Module({
  providers: [OutboxWriter],
  exports: [OutboxWriter],
})
export class OutboxModule {}
