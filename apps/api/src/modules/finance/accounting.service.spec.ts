import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  AccountingAccountRole,
  AccountingAccountType,
  AccountingPeriodStatus,
  Prisma,
} from '@prisma/client';
import { AccountingService } from './accounting.service';

describe('AccountingService journal posting', () => {
  const findUnique = jest.fn();
  type CreatedJournalLine = {
    accountId: string;
    debit: Prisma.Decimal;
    credit: Prisma.Decimal;
  };
  type CreateJournalArgs = {
    data: {
      id: string;
      periodId: string;
      Lines: { create: CreatedJournalLine[] };
    };
  };
  const createJournal = jest.fn<
    Promise<{ id: string; Lines: CreatedJournalLine[] }>,
    [CreateJournalArgs]
  >();
  const findPeriods = jest.fn();
  const lockPeriod = jest.fn();
  const findMappings = jest.fn();
  const tx = {
    journalEntry: { findUnique, create: createJournal },
    accountingPeriod: { findMany: findPeriods },
    accountingAccountMapping: { findMany: findMappings },
    $queryRaw: lockPeriod,
  };
  const service = new AccountingService({
    $transaction: jest.fn(),
  } as never);
  const input = {
    tenantId: 'tenant-a',
    entryDate: new Date('2026-11-04T00:00:00.000Z'),
    currencyCode: 'IDR',
    sourceType: 'UNIT_TEST',
    sourceId: 'source-a',
    memo: 'Balanced source journal',
    lines: [
      { role: AccountingAccountRole.INVENTORY, debit: 100 },
      {
        role: AccountingAccountRole.GOODS_RECEIVED_NOT_INVOICED,
        credit: 100,
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    findUnique.mockResolvedValue(null);
    findPeriods.mockResolvedValue([{ id: 'period-a' }]);
    lockPeriod.mockResolvedValue([
      { id: 'period-a', status: AccountingPeriodStatus.OPEN },
    ]);
    findMappings.mockResolvedValue([
      {
        role: AccountingAccountRole.INVENTORY,
        Account: {
          id: 'account-inventory',
          tenantId: 'tenant-a',
          isActive: true,
          type: AccountingAccountType.ASSET,
        },
      },
      {
        role: AccountingAccountRole.GOODS_RECEIVED_NOT_INVOICED,
        Account: {
          id: 'account-grni',
          tenantId: 'tenant-a',
          isActive: true,
          type: AccountingAccountType.LIABILITY,
        },
      },
    ]);
    createJournal.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'journal-created', Lines: data.Lines.create }),
    );
  });

  it('rejects journals whose debits and credits do not balance', async () => {
    await expect(
      service.postJournal(tx as never, {
        ...input,
        lines: [
          { role: AccountingAccountRole.INVENTORY, debit: 100 },
          {
            role: AccountingAccountRole.GOODS_RECEIVED_NOT_INVOICED,
            credit: 50,
          },
        ],
      }),
    ).rejects.toThrow(
      new BadRequestException('Journal debits and credits must balance'),
    );
    expect(findPeriods).not.toHaveBeenCalled();
  });

  it('rejects a posting date without exactly one open accounting period', async () => {
    findPeriods.mockResolvedValue([]);

    await expect(service.postJournal(tx as never, input)).rejects.toThrow(
      new ConflictException(
        'No open accounting period covers this transaction date',
      ),
    );
    expect(createJournal).not.toHaveBeenCalled();
  });

  it('rejects a mapped account owned by another tenant', async () => {
    findMappings.mockResolvedValue([
      {
        role: AccountingAccountRole.INVENTORY,
        Account: {
          id: 'foreign-account',
          tenantId: 'tenant-b',
          isActive: true,
          type: AccountingAccountType.ASSET,
        },
      },
    ]);

    await expect(service.postJournal(tx as never, input)).rejects.toThrow(
      new ConflictException(
        'An active tenant account must be mapped for INVENTORY',
      ),
    );
    expect(createJournal).not.toHaveBeenCalled();
  });

  it('persists a balanced journal with the tenant period and account mappings', async () => {
    const journal = await service.postJournal(tx as never, {
      ...input,
      lines: [
        {
          role: AccountingAccountRole.INVENTORY,
          debit: new Prisma.Decimal(100),
        },
        {
          role: AccountingAccountRole.GOODS_RECEIVED_NOT_INVOICED,
          credit: new Prisma.Decimal(100),
        },
      ],
    });
    expect(journal.id).toBe('journal-created');
    const createArgs = createJournal.mock.calls[0]?.[0];
    expect(createArgs?.data.periodId).toBe('period-a');
    expect(createArgs?.data.Lines.create).toHaveLength(2);
    expect(createArgs?.data.Lines.create[0]).toMatchObject({
      accountId: 'account-inventory',
      debit: new Prisma.Decimal(100),
    });
  });

  it('returns an existing source journal idempotently', async () => {
    findUnique.mockResolvedValue({ id: 'journal-existing', Lines: [] });

    await expect(
      service.postJournal(tx as never, {
        ...input,
        lines: [{ role: AccountingAccountRole.INVENTORY, debit: 1 }],
      }),
    ).resolves.toMatchObject({ id: 'journal-existing' });
    expect(findPeriods).not.toHaveBeenCalled();
    expect(createJournal).not.toHaveBeenCalled();
  });
});
