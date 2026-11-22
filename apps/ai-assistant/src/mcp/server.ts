import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

type Ctx = { role: 'CUSTOMER' | 'MERCHANT' | 'GUEST'; token?: string };
const out = (d: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(d) }] });
const TN = z.string().trim().toUpperCase().regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/).max(64);

export function buildMcpServer(ctx: Ctx) {
  const server = new McpServer({ name: 'swiftdrop', version: '1.0.0' });
  const api = createApi(ctx.token);

  server.registerTool('estimate_fee', {
    description: 'Estimate SwiftDrop delivery fee (LKR) and delivery days.',
    inputSchema: {
      deliveryAddress: z.string().min(2).describe('Destination city/address, e.g. "Kandy"'),
      weightKg: z.number().min(0.1).max(100),
      packageSize: z.enum(['SMALL', 'MEDIUM', 'LARGE']).default('SMALL'),
      pickupAddress: z.string().default('Colombo'),
    },
  }, async (a) => out(await api('/pricing/estimate', { method: 'POST', body: a })));

  server.registerTool('track_parcel', {
    description: 'Get current status and history of a parcel by tracking number.',
    inputSchema: { trackingNumber: TN },
  }, async ({ trackingNumber }) => {
    const own = ctx.role === 'CUSTOMER' ? `/customer/tracking/${trackingNumber}`
              : ctx.role === 'MERCHANT' ? `/merchant/track/${trackingNumber}` : null;
    const r = own ? await api(own) : null;
    return out(r && !r.error ? r : await api(`/tracking/${trackingNumber}`)); // public fallback
  });

  if (ctx.role === 'CUSTOMER') {
    server.registerTool('list_my_deliveries', {
      description: "List the customer's deliveries. Use when they ask 'where is my parcel' without a tracking number.",
      inputSchema: { filter: z.enum(['all', 'active', 'history']).default('active'), search: z.string().optional() },
    }, async (q) => out(await api('/customer/deliveries', { query: q })));
    server.registerTool('my_delivery_summary', { description: 'Counts of active/delivered parcels.', inputSchema: {} },
      async () => out(await api('/customer/deliveries/summary')));
  }

  if (ctx.role === 'MERCHANT') {
    server.registerTool('merchant_dashboard', { description: 'Merchant KPIs/overview.', inputSchema: {} },
      async () => out(await api('/merchant/dashboard')));
    server.registerTool('list_merchant_orders', {
      description: "Search the merchant's orders.",
      inputSchema: { search: z.string().optional(), status: z.string().optional(), page: z.number().int().min(1).default(1) },
    }, async (q) => out(await api('/merchant/orders', { query: q })));
    server.registerTool('merchant_pricing_summary', { description: 'Shipping spend summary.', inputSchema: {} },
      async () => out(await api('/merchant/pricing/summary')));
  }
  return server;
}
