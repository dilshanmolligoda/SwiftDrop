import { Module } from '@nestjs/common';
import { OutboxModule } from '../../infrastructure/outbox/outbox.module.js';
import { StorageModule } from '../../infrastructure/storage/storage.module.js';
import { CourierController } from './courier.controller.js';
import { CourierService } from './courier.service.js';

@Module({
  imports: [OutboxModule, StorageModule],
  controllers: [CourierController],
  providers: [CourierService],
})
export class CourierModule {}
