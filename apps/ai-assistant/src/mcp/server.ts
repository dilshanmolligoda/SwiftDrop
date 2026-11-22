import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createApi, type ApiCall } from '../backend/api-client.js';

export type ToolRole = 'CUSTOMER' | 'MERCHANT' | 'GUEST';

export interface ToolContext {
  role: ToolRole;
  /** The user's JWT, forwarded to the API. Never sent to the LLM. */
  token?: string;
}

const out = (data: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(data) }],
});

// Same rule as apps/api/src/modules/tracking/domain/tracking-number.ts
const trackingNumber = z
  .string()
  .trim()
  .toUpperCase()
  .max(64)
  .regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/, 'Invalid tracking number')
  .describe('Parcel tracking number, e.g. "SD-AB12CD34"');

/**
 * Builds an MCP server whose tools wrap SwiftDrop API endpoints.
 * Tools are filtered by role, so a customer never sees merchant tools
 * and vice versa. All tools are read-only.
 */
export function buildMcpServer(ctx: ToolContext, api: ApiCall = createApi(ctx.token)): McpServer {
  const server = new McpServer({ name: 'swiftdrop', version: '1.0.0' });

  server.registerTool(
    'estimate_fee',
    {
      description:
        'Estimate the SwiftDrop delivery fee (LKR) and delivery time for a parcel. Use for questions like "How much to send 2 kg to Kandy?".',
      inputSchema: {
        deliveryAddress: z.string().min(2).max(200).describe('Destination city or address, e.g. "Kandy"'),
        weightKg: z.number().min(0.1).max(100).describe('Parcel weight in kilograms'),
        packageSize: z.enum(['SMALL', 'MEDIUM', 'LARGE']).default('SMALL'),
        pickupAddress: z.string().min(2).max(200).default('Colombo'),
      },
    },
    async (args) => out(await api('/pricing/estimate', { method: 'POST', body: args })),
  );

  server.registerTool(
    'track_parcel',
    {
      description: 'Get the current status and status history of a parcel by its tracking number.',
      inputSchema: { trackingNumber },
    },
    async ({ trackingNumber: tn }) => {
      const id = encodeURIComponent(tn);
      const ownPath =
        ctx.role === 'CUSTOMER'
          ? `/customer/tracking/${id}`
          : ctx.role === 'MERCHANT'
            ? `/merchant/track/${id}`
            : null;
      if (ownPath) {
        const own = await api(ownPath);
        if (!own.error) return out(own);
      }
      // Fallback: public tracking (limited, PII-free view)
      return out(await api(`/tracking/${id}`));
    },
  );

  if (ctx.role === 'CUSTOMER') {
    server.registerTool(
      'list_my_deliveries',
      {
        description:
          "List the customer's own deliveries. Use when they ask 'where is my parcel?' without a tracking number.",
        inputSchema: {
          filter: z.enum(['all', 'active', 'history']).default('active'),
          search: z.string().max(100).optional(),
          page: z.number().int().min(1).default(1),
        },
      },
      async (query) => out(await api('/customer/deliveries', { query })),
    );

    server.registerTool(
      'my_delivery_summary',
      { description: "Counts of the customer's active and completed deliveries.", inputSchema: {} },
      async () => out(await api('/customer/deliveries/summary')),
    );
  }

  if (ctx.role === 'MERCHANT') {
    server.registerTool(
      'merchant_dashboard',
      { description: "Overview of the merchant's orders and delivery KPIs.", inputSchema: {} },
      async () => out(await api('/merchant/dashboard')),
    );

    server.registerTool(
      'list_merchant_orders',
      {
        description: "Search and list the merchant's orders.",
        inputSchema: {
          search: z.string().max(100).optional().describe('Tracking number, order reference or recipient'),
          // Mirrors MerchantOrderStatus in apps/api/prisma/schema.prisma
          status: z
            .enum(['AWAITING_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERY_FAILED', 'DELIVERED'])
            .optional(),
          page: z.number().int().min(1).default(1),
        },
      },
      async (query) => out(await api('/merchant/orders', { query })),
    );

    server.registerTool(
      'merchant_pricing_summary',
      { description: "Summary of the merchant's shipping costs.", inputSchema: {} },
      async () => out(await api('/merchant/pricing/summary')),
    );
  }

  return server;
}
