import { normalizePhoneNumber } from './phone.util';

describe('normalizePhoneNumber', () => {
  it('should normalize various valid formats to +94XXXXXXXXX', () => {
    const cases: [string, string][] = [
      ['0712345678', '+94712345678'],
      ['+94712345678', '+94712345678'],
      ['94712345678', '+94712345678'],
      ['94 71 234 5678', '+94712345678'],
    ];
    for (const [input, expected] of cases) {
      expect(normalizePhoneNumber(input)).toBe(expected);
    }
  });

  it('should return empty string for invalid numbers', () => {
    const invalid = ['12345', '+941234567', '94abcdefghi', '+94 71 23'];
    for (const inp of invalid) {
      expect(normalizePhoneNumber(inp)).toBe('');
    }
  });
});

