export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export interface StoreObjectInput {
  buffer: Buffer;
  contentType: string;
}

export interface StoredObject {
  key: string;
  provider: string;
}

export interface ObjectStorage {
  store(input: StoreObjectInput): Promise<StoredObject>;
  delete(key: string): Promise<void>;
}
