import { BlockList, isIP } from 'node:net';

/**
 * Stops merchant webhook URLs from reaching SwiftDrop's own network (SSRF):
 * a merchant could otherwise register http://postgres:5432 or a cloud metadata
 * address and make the worker call it.
 *
 * The worker checks the address it actually connects to (after DNS), so a
 * hostname that resolves to a private IP is refused too.
 */

const PRIVATE_RANGES = new BlockList();

// IPv4 — RFC 1918, loopback, link-local (incl. cloud metadata 169.254.169.254),
// "this network", carrier-grade NAT, benchmarking, multicast and reserved.
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  PRIVATE_RANGES.addSubnet(network, prefix, 'ipv4');
}

// IPv6 — unspecified, loopback, unique-local, link-local, multicast,
// documentation, and the NAT64 / IPv4-mapped forms (checked via the IPv4 part).
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  ['2001:db8::', 32],
] as const) {
  PRIVATE_RANGES.addSubnet(network, prefix, 'ipv6');
}

/** True only for addresses on the public internet. Invalid input → false. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;

  if (family === 6) {
    const mapped = embeddedIpv4(address);
    if (mapped !== null) return isPublicAddress(mapped);
    return !PRIVATE_RANGES.check(address, 'ipv6');
  }
  return !PRIVATE_RANGES.check(address, 'ipv4');
}

/** IPv4 inside ::ffff:a.b.c.d (mapped) or 64:ff9b::a.b.c.d (NAT64), else null. */
function embeddedIpv4(address: string): string | null {
  const lower = address.toLowerCase();
  const match = /^(?:::ffff:|64:ff9b::)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lower);
  if (match) return match[1];

  // Hex form, e.g. ::ffff:7f00:1
  const hex = /^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(
    lower,
  );
  if (!hex) return null;
  const high = parseInt(hex[1], 16);
  const low = parseInt(hex[2], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join('.');
}
