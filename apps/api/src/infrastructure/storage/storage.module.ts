import { Module } from '@nestjs/common';
import { LocalObjectStorageService } from './local-object-storage.service.js';
import { OBJECT_STORAGE } from './storage.types.js';

@Module({
  providers: [
    LocalObjectStorageService,
    { provide: OBJECT_STORAGE, useExisting: LocalObjectStorageService },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
