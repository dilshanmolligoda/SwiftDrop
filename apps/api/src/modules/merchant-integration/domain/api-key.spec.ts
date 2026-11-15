import {
  API_KEY_PREFIX,
  extractLookupPrefix,
  generateApiKey,
  hashApiKey,
  verifyApiKey,
} from './api-key.js';

const PEPPER = 'test-pepper-value';

describe('api-key', () => {
  describe('generateApiKey', () => {
    it('creates a prefixed key with its lookup prefix', () => {
      const { plainKey, lookupPrefix } = generateApiKey();

      expect(plainKey.startsWith(API_KEY_PREFIX)).toBe(true);
      expect(plainKey.length).toBeGreaterThan(40);
      expect(plainKey.startsWith(lookupPrefix)).toBe(true);
      expect(lookupPrefix).toHaveLength(API_KEY_PREFIX.length + 8);
    });

    it('creates a different key every time', () => {
      expect(generateApiKey().plainKey).not.toEqual(generateApiKey().plainKey);
    });
  });

  describe('extractLookupPrefix', () => {
    it('returns the lookup prefix of a valid key', () => {
      const { plainKey, lookupPrefix } = generateApiKey();
      expect(extractLookupPrefix(plainKey)).toBe(lookupPrefix);
    });

    it('returns null for values that cannot be a SwiftDrop key', () => {
      expect(extractLookupPrefix('')).toBeNull();
      expect(extractLookupPrefix('wrong_abcdefghijklmnop')).toBeNull();
      expect(extractLookupPrefix(`${API_KEY_PREFIX}short`)).toBeNull();
    });
  });

  describe('hashApiKey', () => {
    it('never returns the plain key', () => {
      const { plainKey } = generateApiKey();
      const hash = hashApiKey(plainKey, PEPPER);

      expect(hash).not.toContain(plainKey);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('gives a different hash with a different pepper', () => {
      const { plainKey } = generateApiKey();
      expect(hashApiKey(plainKey, PEPPER)).not.toEqual(
        hashApiKey(plainKey, 'other-pepper'),
      );
    });

    it('throws when the pepper is empty', () => {
      expect(() => hashApiKey('sd_anything', '')).toThrow();
    });
  });

  describe('verifyApiKey', () => {
    it('accepts the key that produced the stored hash', () => {
      const { plainKey } = generateApiKey();
      const storedHash = hashApiKey(plainKey, PEPPER);

      expect(verifyApiKey(plainKey, storedHash, PEPPER)).toBe(true);
    });

    it('rejects a different key', () => {
      const storedHash = hashApiKey(generateApiKey().plainKey, PEPPER);
      expect(verifyApiKey(generateApiKey().plainKey, storedHash, PEPPER)).toBe(
        false,
      );
    });

    it('rejects the right key hashed with another pepper', () => {
      const { plainKey } = generateApiKey();
      const storedHash = hashApiKey(plainKey, 'other-pepper');

      expect(verifyApiKey(plainKey, storedHash, PEPPER)).toBe(false);
    });

    it('rejects empty keys and missing or malformed hashes', () => {
      const { plainKey } = generateApiKey();

      expect(verifyApiKey('', 'abc', PEPPER)).toBe(false);
      expect(verifyApiKey(plainKey, null, PEPPER)).toBe(false);
      expect(verifyApiKey(plainKey, undefined, PEPPER)).toBe(false);
      expect(verifyApiKey(plainKey, 'not-hex', PEPPER)).toBe(false);
    });
  });
});
