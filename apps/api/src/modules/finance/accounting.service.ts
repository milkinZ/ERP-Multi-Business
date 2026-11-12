import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountingAccountRole,
  AccountingAccountType,
  AccountingPeriodStatus,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { CreatePeriodDto } from './dto/create-period.dto';
import { MapAccountDto } from './dto/map-account.dto';
import { UpdateAccountingSettingsDto } from './dto/update-accounting-settings.dto';
import { CreateTaxRuleDto } from './dto/create-tax-rule.dto';

export type JournalLineInput = {
  role: AccountingAccountRole;
  debit?: Prisma.Decimal | number;
  credit?: Prisma.Decimal | number;
  description?: string;
};

const ACCOUNT_TYPES_BY_ROLE: Partial<
  Record<AccountingAccountRole, AccountingAccountType[]>
> = {
  INVENTORY: [AccountingAccountType.ASSET],
  GOODS_RECEIVED_NOT_INVOICED: [AccountingAccountType.LIABILITY],
  ACCOUNTS_PAYABLE: [AccountingAccountType.LIABILITY],
  SUPPLIER_RETURN_CLEARING: [
    AccountingAccountType.ASSET,
    AccountingAccountType.LIABILITY,
  ],
  INPUT_TAX: [AccountingAccountType.ASSET],
  WITHHOLDING_PAYABLE: [AccountingAccountType.LIABILITY],
  PURCHASE_PRICE_VARIANCE: [AccountingAccountType.EXPENSE],
  PURCHASE_DISCOUNT: [
    AccountingAccountType.EXPENSE,
    AccountingAccountType.REVENUE,
  ],
  COST_OF_GOODS_SOLD: [AccountingAccountType.EXPENSE],
  NON_INVENTORY_EXPENSE: [AccountingAccountType.EXPENSE],
  CASH_OR_BANK: [AccountingAccountType.ASSET],
};

@Injectable()
export class AccountingService {
  constructor(private readonly prisma: PrismaService) {}

  listAccounts(tenantId: string) {
    return this.prisma.accountingAccount.findMany({
      where: { tenantId },
      include: { Mappings: { select: { role: true } } },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
    });
  }

  async createAccount(tenantId: string, dto: CreateAccountDto) {
    try {
      return await this.prisma.accountingAccount.create({
        data: {
          tenantId,
          code: dto.code.trim(),
          name: dto.name.trim(),
          type: dto.type,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Account code already exists');
      }
      throw error;
    }
  }

  async mapAccount(tenantId: string, dto: MapAccountDto) {
    const account = await this.prisma.accountingAccount.findFirst({
      where: { id: dto.accountId, tenantId, isActive: true },
    });
    if (!account) throw new NotFoundException('Active account not found');
    this.assertAccountType(dto.role, account.type);
    return this.prisma.accountingAccountMapping.upsert({
      where: { tenantId_role: { tenantId, role: dto.role } },
      create: {
        tenantId,
        role: dto.role,
        accountId: account.id,
      },
      update: { accountId: account.id, updatedAt: new Date() },
      include: { Account: true },
    });
  }

  listPeriods(tenantId: string) {
    return this.prisma.accountingPeriod.findMany({
      where: { tenantId },
      orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
    });
  }

  async createPeriod(tenantId: string, dto: CreatePeriodDto) {
    const startsAt = this.asDateOnly(dto.startsAt);
    const endsAt = this.asDateOnly(dto.endsAt);
    if (startsAt > endsAt) {
      throw new BadRequestException(
        'Accounting period start must not follow end',
      );
    }
    const overlap = await this.prisma.accountingPeriod.findFirst({
      where: {
        tenantId,
        startsAt: { lte: endsAt },
        endsAt: { gte: startsAt },
      },
      select: { id: true },
    });
    if (overlap) {
      throw new ConflictException('Accounting periods may not overlap');
    }
    return this.prisma.accountingPeriod.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        startsAt,
        endsAt,
      },
    });
  }

  async closePeriod(tenantId: string, id: string) {
    const result = await this.prisma.accountingPeriod.updateMany({
      where: { id, tenantId, status: AccountingPeriodStatus.OPEN },
      data: { status: AccountingPeriodStatus.CLOSED, updatedAt: new Date() },
    });
    if (result.count !== 1) {
      const period = await this.prisma.accountingPeriod.findFirst({
        where: { id, tenantId },
      });
      if (!period) throw new NotFoundException('Accounting period not found');
      throw new ConflictException('Accounting period is already closed');
    }
    return this.prisma.accountingPeriod.findFirstOrThrow({
      where: { id, tenantId },
    });
  }

  async getSettings(tenantId: string) {
    return (
      (await this.prisma.accountingSettings.findUnique({
        where: { tenantId },
      })) ?? {
        tenantId,
        invoiceApprovalRequired: true,
        autoPostMatchedInvoices: false,
        updatedAt: null,
      }
    );
  }

  updateSettings(tenantId: string, dto: UpdateAccountingSettingsDto) {
    return this.prisma.accountingSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
        invoiceApprovalRequired: dto.invoiceApprovalRequired ?? true,
        autoPostMatchedInvoices: dto.autoPostMatchedInvoices ?? false,
      },
      update: {
        ...(dto.invoiceApprovalRequired === undefined
          ? {}
          : { invoiceApprovalRequired: dto.invoiceApprovalRequired }),
        ...(dto.autoPostMatchedInvoices === undefined
          ? {}
          : { autoPostMatchedInvoices: dto.autoPostMatchedInvoices }),
        updatedAt: new Date(),
      },
    });
  }

  listTaxRules(tenantId: string) {
    return this.prisma.taxRule.findMany({
      where: { tenantId },
      orderBy: [{ effectiveFrom: 'desc' }, { code: 'asc' }],
    });
  }

  async createTaxRule(tenantId: string, dto: CreateTaxRuleDto) {
    const effectiveFrom = this.asDateOnly(dto.effectiveFrom);
    const effectiveTo = dto.effectiveTo
      ? this.asDateOnly(dto.effectiveTo)
      : null;
    if (effectiveTo && effectiveTo <= effectiveFrom) {
      throw new BadRequestException(
        'Tax rule end date must be after its start date',
      );
    }
    if (dto.kind === 'WITHHOLDING' && !dto.withholdingTiming) {
      throw new BadRequestException(
        'Withholding tax rules require a recognition timing',
      );
    }
    if (dto.kind === 'INPUT_TAX' && dto.withholdingTiming) {
      throw new BadRequestException(
        'Input tax rules cannot define withholding timing',
      );
    }
    try {
      return await this.prisma.taxRule.create({
        data: {
          tenantId,
          code: dto.code.trim(),
          name: dto.name.trim(),
          kind: dto.kind,
          transactionType: dto.transactionType.trim(),
          taxCategory: dto.taxCategory?.trim() ?? null,
          supplierTaxStatus: dto.supplierTaxStatus?.trim() ?? null,
          jurisdiction: dto.jurisdiction?.trim() ?? null,
          rate: new Prisma.Decimal(dto.rate),
          withholdingTiming: dto.withholdingTiming ?? null,
          effectiveFrom,
          effectiveTo,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Tax rule code already exists');
      }
      throw error;
    }
  }

  listJournals(tenantId: string, skip = 0, take = 50) {
    const pageSkip = this.normalizePageValue(skip, 0, 1_000_000);
    const pageTake = this.normalizePageValue(take, 50, 100);
    return this.prisma.journalEntry.findMany({
      where: { tenantId },
      include: {
        Period: { select: { id: true, name: true, status: true } },
        Lines: {
          include: {
            Account: { select: { id: true, code: true, name: true } },
          },
          orderBy: { id: 'asc' },
        },
      },
      orderBy: [{ entryDate: 'desc' }, { id: 'desc' }],
      skip: pageSkip,
      take: pageTake,
    });
  }

  async postJournal(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      entryDate: Date;
      currencyCode: string;
      sourceType: string;
      sourceId: string;
      memo: string;
      createdById?: string;
      lines: JournalLineInput[];
    },
  ) {
    const existing = await tx.journalEntry.findUnique({
      where: {
        tenantId_sourceType_sourceId: {
          tenantId: input.tenantId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
        },
      },
      include: { Lines: true },
    });
    if (existing) return existing;

    const lines = input.lines
      .map((line) => ({
        ...line,
        debit: new Prisma.Decimal(line.debit ?? 0),
        credit: new Prisma.Decimal(line.credit ?? 0),
      }))
      .filter((line) => !line.debit.isZero() || !line.credit.isZero());
    if (lines.length < 2) {
      throw new BadRequestException(
        'A journal must contain at least two lines',
      );
    }
    for (const line of lines) {
      if (line.debit.isNegative() || line.credit.isNegative()) {
        throw new BadRequestException('Journal amounts cannot be negative');
      }
      if (!line.debit.isZero() && !line.credit.isZero()) {
        throw new BadRequestException(
          'A journal line cannot contain both debit and credit',
        );
      }
    }
    const debitTotal = lines.reduce(
      (total, line) => total.add(line.debit),
      new Prisma.Decimal(0),
    );
    const creditTotal = lines.reduce(
      (total, line) => total.add(line.credit),
      new Prisma.Decimal(0),
    );
    if (!debitTotal.eq(creditTotal) || debitTotal.isZero()) {
      throw new BadRequestException('Journal debits and credits must balance');
    }

    const entryDate = this.asDateOnly(input.entryDate);
    const periodCandidates = await tx.accountingPeriod.findMany({
      where: {
        tenantId: input.tenantId,
        status: AccountingPeriodStatus.OPEN,
        startsAt: { lte: entryDate },
        endsAt: { gte: entryDate },
      },
      select: { id: true },
      take: 2,
    });
    if (periodCandidates.length !== 1) {
      throw new ConflictException(
        periodCandidates.length === 0
          ? 'No open accounting period covers this transaction date'
          : 'Multiple open accounting periods cover this transaction date',
      );
    }
    const lockedPeriods = await tx.$queryRaw<
      Array<{ id: string; status: string }>
    >`
      SELECT "id", "status"
      FROM "AccountingPeriod"
      WHERE "id" = ${periodCandidates[0].id} AND "tenantId" = ${input.tenantId}
      FOR UPDATE
    `;
    if (lockedPeriods[0]?.status !== AccountingPeriodStatus.OPEN) {
      throw new ConflictException('Accounting period is closed');
    }

    const roles = [...new Set(lines.map((line) => line.role))];
    const mappings = await tx.accountingAccountMapping.findMany({
      where: { tenantId: input.tenantId, role: { in: roles } },
      include: { Account: true },
    });
    const mappingsByRole = new Map(
      mappings.map((mapping) => [mapping.role, mapping.Account]),
    );
    for (const role of roles) {
      const account = mappingsByRole.get(role);
      if (
        !account ||
        !account.isActive ||
        account.tenantId !== input.tenantId
      ) {
        throw new ConflictException(
          `An active tenant account must be mapped for ${role}`,
        );
      }
      this.assertAccountType(role, account.type);
    }

    const journalId = randomUUID();
    const journal = await tx.journalEntry.create({
      data: {
        id: journalId,
        tenantId: input.tenantId,
        periodId: periodCandidates[0].id,
        number: `JE-${journalId}`,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        currencyCode: input.currencyCode,
        entryDate,
        memo: input.memo,
        createdById: input.createdById,
        Lines: {
          create: lines.map((line) => ({
            tenantId: input.tenantId,
            accountId: mappingsByRole.get(line.role)!.id,
            description: line.description,
            debit: line.debit,
            credit: line.credit,
          })),
        },
      },
      include: { Lines: true },
    });
    return journal;
  }

  private assertAccountType(
    role: AccountingAccountRole,
    type: AccountingAccountType,
  ) {
    const expected = ACCOUNT_TYPES_BY_ROLE[role];
    if (expected && !expected.includes(type)) {
      throw new BadRequestException(
        `Account type ${type} is not valid for mapping ${role}`,
      );
    }
  }

  private asDateOnly(value: string | Date) {
    const date = value instanceof Date ? new Date(value) : new Date(value);
    if (!Number.isFinite(date.getTime())) {
      throw new BadRequestException('A valid date is required');
    }
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }

  private normalizePageValue(value: number, fallback: number, max: number) {
    return Number.isInteger(value) && value >= 0
      ? Math.min(value, max)
      : fallback;
  }
}
