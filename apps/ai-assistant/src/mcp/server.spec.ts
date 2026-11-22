import { describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildMcpServer, type ToolContext } from './server.js';
import type { ApiCall } from '../backend/api-client.js';

async function connect(ctx: ToolContext, api: ApiCall) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = buildMcpServer(ctx, api);
  const client = new Client({ name: 'test', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

async function toolNames(ctx: ToolContext) {
  const client = await connect(ctx, vi.fn());
  const { tools } = await client.listTools();
  await client.close();
  return tools.map((t) => t.name).sort();
}

describe('buildMcpServer', () => {
  it('gives guests only the public tools', async () => {
    expect(await toolNames({ role: 'GUEST' })).toEqual(['estimate_fee', 'track_parcel']);
  });

  it('gives customers customer tools and no merchant tools', async () => {
    const names = await toolNames({ role: 'CUSTOMER', token: 't' });
    expect(names).toContain('list_my_deliveries');
    expect(names).toContain('my_delivery_summary');
    expect(names).not.toContain('merchant_dashboard');
    expect(names).not.toContain('list_merchant_orders');
  });

  it('gives merchants merchant tools and no customer tools', async () => {
    const names = await toolNames({ role: 'MERCHANT', token: 't' });
    expect(names).toContain('merchant_dashboard');
    expect(names).toContain('list_merchant_orders');
    expect(names).not.toContain('list_my_deliveries');
  });

  it('estimate_fee posts to the pricing API with defaults applied', async () => {
    const api = vi.fn<ApiCall>().mockResolvedValue({ totalCostLkr: 750 });
    const client = await connect({ role: 'GUEST' }, api);

    const result = await client.callTool({
      name: 'estimate_fee',
      arguments: { deliveryAddress: 'Kandy', weightKg: 2 },
    });

    expect(api).toHaveBeenCalledWith('/pricing/estimate', {
      method: 'POST',
      body: { deliveryAddress: 'Kandy', weightKg: 2, packageSize: 'SMALL', pickupAddress: 'Colombo' },
    });
    expect(JSON.stringify(result.content)).toContain('750');
    await client.close();
  });

  it('track_parcel falls back to public tracking when the own-parcel lookup fails', async () => {
    const api = vi
      .fn<ApiCall>()
      .mockResolvedValueOnce({ error: 'Not found', status: 404 })
      .mockResolvedValueOnce({ currentStatus: 'IN_TRANSIT' });
    const client = await connect({ role: 'CUSTOMER', token: 't' }, api);

    await client.callTool({ name: 'track_parcel', arguments: { trackingNumber: 'sd-abc123' } });

    expect(api).toHaveBeenNthCalledWith(1, '/customer/tracking/SD-ABC123');
    expect(api).toHaveBeenNthCalledWith(2, '/tracking/SD-ABC123');
    await client.close();
  });

  it('track_parcel rejects malformed tracking numbers without calling the API', async () => {
    const api = vi.fn<ApiCall>();
    const client = await connect({ role: 'GUEST' }, api);

    const result = await client.callTool({
      name: 'track_parcel',
      arguments: { trackingNumber: '../../admin' },
    });

    expect(result.isError).toBe(true);
    expect(api).not.toHaveBeenCalled();
    await client.close();
  });
});
