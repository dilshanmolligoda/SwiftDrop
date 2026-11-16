import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  ObjectStorage,
  StoreObjectInput,
  StoredObject,
} from './storage.types.js';

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

@Injectable()
export class LocalObjectStorageService implements ObjectStorage {
  private readonly rootDirectory: string;

  constructor(config: ConfigService) {
    const defaultDirectory =
      process.env.NODE_ENV === 'production'
        ? '/app/uploads/proofs'
        : path.resolve(process.cwd(), 'uploads', 'proofs');
    this.rootDirectory = path.resolve(
      config.get<string>('PROOF_STORAGE_DIR', defaultDirectory),
    );
  }

  async store(input: StoreObjectInput): Promise<StoredObject> {
    const extension = EXTENSIONS[input.contentType];
    if (!extension) {
      throw new Error('Unsupported storage content type');
    }

    await mkdir(this.rootDirectory, { recursive: true });
    const key = `${randomUUID()}${extension}`;
    await writeFile(this.resolveKey(key), input.buffer, {
      flag: 'wx',
      mode: 0o600,
    });

    return { key, provider: 'local' };
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.resolveKey(key));
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return;
      }
      throw error;
    }
  }

  private resolveKey(key: string): string {
    if (!/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(key)) {
      throw new Error('Invalid storage key');
    }

    const resolved = path.resolve(this.rootDirectory, key);
    if (!resolved.startsWith(`${this.rootDirectory}${path.sep}`)) {
      throw new Error('Invalid storage key');
    }
    return resolved;
  }
}
