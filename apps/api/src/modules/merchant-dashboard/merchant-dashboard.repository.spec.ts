import { Test } from '@nestjs/testing';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { MerchantOrderStatus } from './merchant-order-status.js';
import { MerchantDashboardRepository } from './merchant-dashboard.repository.js';

describe('MerchantDashboardRepository', () => {
  let repository: MerchantDashboardRepository;
  const queryResults: unknown[] = [];
  const queryCalls: { template: TemplateStringsArray; values: unknown[] }[] =
    [];
  const prisma = {
    $queryRaw: (
      template: TemplateStringsArray,
      ...values: unknown[]
    ): Promise<unknown> => {
      queryCalls.push({ template, values });
      return Promise.resolve(queryResults.shift());
    },
  };

  beforeEach(async () => {
    queryResults.length = 0;
    queryCalls.length = 0;
    const moduleRef = await Test.createTestingModule({
      providers: [
        MerchantDashboardRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    repository = moduleRef.get(MerchantDashboardRepository);
  });

  it('parameterizes search and status filters while constraining list queries by merchant', async () => {
    const order = {
      id: 'order-1',
      reference: 'GL-1',
      trackingNumber: 'SD-1',
      recipient: 'Jane Doe',
      destination: 'Colombo',
      status: MerchantOrderStatus.DELIVERY_FAILED,
      failedDeliveryAttempts: 1,
      updatedAt: new Date(),
    };
    queryResults.push([{ total: 1 }], [order]);

    await expect(
      repository.listOrders('merchant-1', {
        search: 'GL-1',
        status: MerchantOrderStatus.DELIVERY_FAILED,
        page: 2,
        pageSize: 5,
      }),
    ).resolves.toMatchObject({ data: [order], page: 2, pageSize: 5, total: 1 });

    expect(queryCalls).toHaveLength(2);
    for (const { template, values } of queryCalls) {
      expect(template.join('')).toContain('"merchantUserId"');
      expect(values).toContain('merchant-1');
      expect(values).toContain('GL-1');
      expect(template.join('')).not.toContain('GL-1');
    }

    expect(queryCalls[1].values).toEqual(
      expect.arrayContaining(['DELIVERY_FAILED', 5, 5]),
    );
  });

  it('constrains order detail lookup by both merchant and order IDs', async () => {
    queryResults.push([]);

    await expect(
      repository.findOrder('merchant-1', 'order-1'),
    ).resolves.toBeNull();

    const [query] = queryCalls;
    expect(query.template.join('')).toContain('"merchantUserId"');
    expect(query.template.join('')).toContain('"id"');
    expect(query.values).toEqual(['merchant-1', 'order-1']);
  });
});
