import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountingAccountRole,
  CreditAllocationType,
  Prisma,
  TaxRule,
  SupplierCreditNoteStatus,
  SupplierCreditNoteType,
  SupplierInvoiceMatchStatus,
  SupplierInvoiceStatus,
  TaxRuleKind,
  WithholdingTiming,
} from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../core/database/prisma.service';
import { AccountingService, JournalLineInput } from './accounting.service';
import { CreateSupplierInvoiceDto } from './dto/create-supplier-invoice.dto';
import { CreateSupplierPaymentDto } from './dto/create-supplier-payment.dto';
import { CreateSupplierCreditNoteDto } from './dto/create-supplier-credit-note.dto';

type ResolvedTax = {
  inputTax: Prisma.Decimal;
  withholding: Prisma.Decimal;
  timing: WithholdingTiming | null;
  ruleIds: string[];
  snapshot: Prisma.JsonObject;
};

const money = (value: Prisma.Decimal | number | string) =>
  new Prisma.Decimal(value).toDecimalPlaces(6);

@Injectable()
export class SupplierApService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
  ) {}

  listInvoices(tenantId: string, skip = 0, take = 50) {
    const pagination = this.pagination(skip, take);
    return this.prisma.supplierInvoice.findMany({
      where: { tenantId },
      include: {
        Supplier: { select: { id: true, name: true } },
        Lines: {
          include: {
            ReceiptItem: {
              select: {
                id: true,
                Receipt: {
                  select: {
                    PurchaseOrder: { select: { id: true, poNumber: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ invoiceDate: 'desc' }, { id: 'desc' }],
      skip: pagination.skip,
      take: pagination.take,
    });
  }

  async createInvoice(
    tenantId: string,
    userId: string,
    idempotencyKey: string,
    dto: CreateSupplierInvoiceDto,
  ) {
    this.validateIdempotencyKey(idempotencyKey);
    const requestHash = this.hashRequest(dto);
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.supplierInvoice.findUnique({
          where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
          include: { Lines: true },
        });
        if (existing) {
          if (existing.requestHash !== requestHash) {
            throw new ConflictException(
              'Idempotency-Key was already used with a different supplier invoice',
            );
          }
          return existing;
        }

        const supplier = await tx.supplier.findFirst({
          where: { id: dto.supplierId, tenantId },
        });
        if (!supplier) throw new NotFoundException('Supplier not found');
        const tenant = await tx.tenant.findUnique({
          where: { id: tenantId },
          select: { currencyCode: true, taxJurisdiction: true },
        });
        if (!tenant?.currencyCode) {
          throw new ConflictException(
            'Tenant base currency must be configured before supplier invoicing',
          );
        }
        const invoiceDate = this.asDateOnly(dto.invoiceDate);
        const receiptItemIds = dto.lines.map((line) => line.receiptItemId);
        if (new Set(receiptItemIds).size !== receiptItemIds.length) {
          throw new BadRequestException(
            'A Goods Receipt item may only appear once per invoice',
          );
        }

        for (const receiptItemId of receiptItemIds) {
          const locked = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id"
            FROM "PurchaseOrderReceiptItem"
            WHERE "id" = ${receiptItemId} AND "tenantId" = ${tenantId}
            FOR UPDATE
          `;
          if (locked.length !== 1) {
            throw new BadRequestException(
              'Invoice receipt items must belong to this tenant',
            );
          }
        }

        const receiptItems = await tx.purchaseOrderReceiptItem.findMany({
          where: { id: { in: receiptItemIds }, tenantId },
          include: {
            Receipt: {
              include: {
                PurchaseOrder: {
                  include: {
                    Supplier: true,
                    Tenant: { select: { currencyCode: true } },
                  },
                },
              },
            },
            PurchaseOrderItem: true,
            InventoryItem: { select: { id: true, taxCategory: true } },
          },
        });
        if (receiptItems.length !== receiptItemIds.length) {
          throw new BadRequestException(
            'One or more Goods Receipt items were not found',
          );
        }
        const receiptById = new Map(
          receiptItems.map((receiptItem) => [receiptItem.id, receiptItem]),
        );
        let currencyCode: string | null = null;
        let subtotal = new Prisma.Decimal(0);
        let inputTaxAmount = new Prisma.Decimal(0);
        let withholdingAmount = new Prisma.Decimal(0);
        let withholdingTiming: WithholdingTiming | null = null;
        const exceptions: Array<{ receiptItemId: string; reason: string }> = [];
        const preparedLines: Array<{
          receiptItem: (typeof receiptItems)[number];
          quantity: Prisma.Decimal;
          unitPrice: Prisma.Decimal;
          matchedUnitPrice: Prisma.Decimal;
          lineSubtotal: Prisma.Decimal;
          tax: ResolvedTax;
        }> = [];

        for (const line of dto.lines) {
          const receiptItem = receiptById.get(line.receiptItemId);
          if (!receiptItem) {
            throw new BadRequestException('Goods Receipt item was not found');
          }
          const purchaseOrder = receiptItem.Receipt.PurchaseOrder;
          if (purchaseOrder.supplierId !== supplier.id) {
            throw new BadRequestException(
              'All invoice receipt items must belong to the selected supplier',
            );
          }
          const purchaseCurrency =
            purchaseOrder.currencyCode ?? purchaseOrder.Tenant.currencyCode;
          if (!purchaseCurrency || purchaseCurrency !== tenant.currencyCode) {
            throw new ConflictException(
              'Purchase Order currency does not match the tenant base currency',
            );
          }
          if (currencyCode && currencyCode !== purchaseCurrency) {
            throw new ConflictException(
              'A supplier invoice cannot combine multiple currencies',
            );
          }
          currencyCode = purchaseCurrency;

          const previouslyInvoiced = await tx.supplierInvoiceLine.aggregate({
            where: {
              tenantId,
              receiptItemId: receiptItem.id,
              Invoice: { status: { not: SupplierInvoiceStatus.VOID } },
            },
            _sum: { quantity: true },
          });
          const previouslyReturned = await tx.purchaseOrderReturnItem.aggregate(
            {
              where: { tenantId, receiptItemId: receiptItem.id },
              _sum: { quantity: true },
            },
          );
          const remaining = new Prisma.Decimal(receiptItem.receivedQuantity)
            .sub(previouslyInvoiced._sum.quantity ?? 0)
            .sub(previouslyReturned._sum.quantity ?? 0);
          const quantity = money(line.quantity);
          if (quantity.gt(remaining)) {
            throw new ConflictException(
              'Invoice quantity cannot exceed the received quantity less prior invoices and returns',
            );
          }

          const matchedUnitPrice = new Prisma.Decimal(
            receiptItem.PurchaseOrderItem.unitPrice,
          );
          const unitPrice = money(line.unitPrice);
          if (!unitPrice.eq(matchedUnitPrice)) {
            exceptions.push({
              receiptItemId: receiptItem.id,
              reason:
                'Invoice unit price does not exactly match the Purchase Order',
            });
          }

          const lineSubtotal = money(quantity.mul(unitPrice));
          const tax = await this.resolveTaxes(tx, {
            tenantId,
            supplierTaxStatus: supplier.taxStatus,
            jurisdiction: tenant.taxJurisdiction,
            taxCategory: receiptItem.InventoryItem.taxCategory,
            date: invoiceDate,
            transactionType: 'SUPPLIER_PURCHASE',
            baseAmount: lineSubtotal,
            inputTaxRuleIds: line.inputTaxRuleIds,
            withholdingRuleIds: line.withholdingRuleIds,
            taxExemptReason: line.taxExemptReason,
          });
          if (
            tax.timing &&
            withholdingTiming &&
            tax.timing !== withholdingTiming
          ) {
            throw new BadRequestException(
              'Withholding rules on a single invoice must use one recognition timing',
            );
          }
          withholdingTiming = tax.timing ?? withholdingTiming;
          subtotal = subtotal.add(lineSubtotal);
          inputTaxAmount = inputTaxAmount.add(tax.inputTax);
          withholdingAmount = withholdingAmount.add(tax.withholding);
          preparedLines.push({
            receiptItem,
            quantity,
            unitPrice,
            matchedUnitPrice,
            lineSubtotal,
            tax,
          });
        }

        if (!currencyCode) {
          throw new BadRequestException(
            'At least one receipt item is required',
          );
        }
        const grossAmount = subtotal.add(inputTaxAmount);
        const netPayableAmount = grossAmount.sub(withholdingAmount);
        if (netPayableAmount.isNegative()) {
          throw new BadRequestException(
            'Withholding cannot exceed the invoice gross amount',
          );
        }
        const settings = await tx.accountingSettings.findUnique({
          where: { tenantId },
        });
        const matched = exceptions.length === 0;
        const autoPost =
          matched && (settings?.autoPostMatchedInvoices ?? false);
        const status = !matched
          ? SupplierInvoiceStatus.HELD
          : autoPost
            ? SupplierInvoiceStatus.APPROVED
            : (settings?.invoiceApprovalRequired ?? true)
              ? SupplierInvoiceStatus.PENDING_APPROVAL
              : SupplierInvoiceStatus.APPROVED;

        const invoice = await tx.supplierInvoice.create({
          data: {
            tenantId,
            supplierId: supplier.id,
            invoiceNumber: dto.invoiceNumber.trim(),
            currencyCode,
            invoiceDate,
            dueDate: dto.dueDate ? this.asDateOnly(dto.dueDate) : null,
            status,
            matchStatus: matched
              ? SupplierInvoiceMatchStatus.MATCHED
              : SupplierInvoiceMatchStatus.EXCEPTION,
            subtotal,
            inputTaxAmount,
            withholdingAmount,
            grossAmount,
            netPayableAmount,
            withholdingTiming,
            matchExceptions:
              exceptions.length > 0 ? exceptions : Prisma.JsonNull,
            taxSnapshot: {
              appliedRuleIds: preparedLines.flatMap((line) => line.tax.ruleIds),
              transactionType: 'SUPPLIER_PURCHASE',
            },
            withholdingSnapshot: {
              timing: withholdingTiming,
              lines: preparedLines.map((line) => ({
                receiptItemId: line.receiptItem.id,
                amount: line.tax.withholding.toString(),
                rules: line.tax.snapshot.withholdingRules,
              })),
            },
            idempotencyKey,
            requestHash,
            createdById: userId,
            Lines: {
              create: preparedLines.map((line) => ({
                tenantId,
                receiptItemId: line.receiptItem.id,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                matchedUnitPrice: line.matchedUnitPrice,
                subtotal: line.lineSubtotal,
                inputTaxAmount: line.tax.inputTax,
                withholdingAmount: line.tax.withholding,
                taxCategory: line.receiptItem.InventoryItem.taxCategory,
                taxSnapshot: line.tax.snapshot,
              })),
            },
          },
          include: { Lines: true },
        });
        if (autoPost) {
          await this.postInvoiceInTransaction(tx, tenantId, invoice.id, userId);
        }
        return tx.supplierInvoice.findFirstOrThrow({
          where: { id: invoice.id, tenantId },
          include: { Lines: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async approveInvoice(tenantId: string, userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.supplierInvoice.findFirst({
        where: { id, tenantId },
      });
      if (!invoice) throw new NotFoundException('Supplier invoice not found');
      if (
        invoice.status !== SupplierInvoiceStatus.PENDING_APPROVAL &&
        invoice.status !== SupplierInvoiceStatus.HELD
      ) {
        throw new ConflictException(
          'Only held or pending-approval invoices can be approved',
        );
      }
      return tx.supplierInvoice.update({
        where: { id },
        data: {
          status: SupplierInvoiceStatus.APPROVED,
          approvedById: userId,
          approvedAt: new Date(),
          updatedAt: new Date(),
        },
        include: { Lines: true },
      });
    });
  }

  async postInvoice(tenantId: string, userId: string, id: string) {
    return this.prisma.$transaction(
      (tx) => this.postInvoiceInTransaction(tx, tenantId, id, userId),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async postInvoiceInTransaction(
    tx: Prisma.TransactionClient,
    tenantId: string,
    id: string,
    userId: string,
  ) {
    const invoice = await tx.supplierInvoice.findFirst({
      where: { id, tenantId },
      include: {
        Lines: {
          include: {
            ReceiptItem: {
              include: {
                Receipt: {
                  include: {
                    PurchaseOrder: {
                      include: {
                        Tenant: { select: { currencyCode: true } },
                      },
                    },
                  },
                },
                InventoryItem: true,
              },
            },
          },
        },
      },
    });
    if (!invoice) throw new NotFoundException('Supplier invoice not found');
    if (
      invoice.status === SupplierInvoiceStatus.POSTED ||
      invoice.status === SupplierInvoiceStatus.PARTIALLY_PAID ||
      invoice.status === SupplierInvoiceStatus.PAID
    ) {
      return invoice;
    }
    if (invoice.status !== SupplierInvoiceStatus.APPROVED) {
      throw new ConflictException(
        'Supplier invoice must be approved before posting to AP',
      );
    }

    let matchedAmount = new Prisma.Decimal(0);
    const lines: JournalLineInput[] = [];
    for (const line of invoice.Lines) {
      const purchaseOrder = line.ReceiptItem.Receipt.PurchaseOrder;
      const matchedLineAmount = line.quantity.mul(line.matchedUnitPrice);
      matchedAmount = matchedAmount.add(matchedLineAmount);
      const priceDifference = line.subtotal.sub(matchedLineAmount);
      if (!priceDifference.isZero()) {
        const allocation = await this.allocatePriceDifference(
          tx,
          line.ReceiptItem,
          line.quantity,
          priceDifference,
          id,
        );
        lines.push(...allocation);
      }
      if (!purchaseOrder.id) {
        throw new ConflictException(
          'Invoice receipt line no longer references a Purchase Order',
        );
      }
    }

    lines.push({
      role: AccountingAccountRole.GOODS_RECEIVED_NOT_INVOICED,
      debit: matchedAmount,
      description: `Clear GRNI for supplier invoice ${invoice.invoiceNumber}`,
    });
    if (invoice.inputTaxAmount.gt(0)) {
      lines.push({
        role: AccountingAccountRole.INPUT_TAX,
        debit: invoice.inputTaxAmount,
        description: `Recoverable input tax for ${invoice.invoiceNumber}`,
      });
    }
    const invoiceWithholding =
      invoice.withholdingTiming === WithholdingTiming.INVOICE
        ? invoice.withholdingAmount
        : new Prisma.Decimal(0);
    const accountsPayable = invoice.grossAmount.sub(invoiceWithholding);
    lines.push({
      role: AccountingAccountRole.ACCOUNTS_PAYABLE,
      credit: accountsPayable,
      description: `Accounts payable for ${invoice.invoiceNumber}`,
    });
    if (invoiceWithholding.gt(0)) {
      lines.push({
        role: AccountingAccountRole.WITHHOLDING_PAYABLE,
        credit: invoiceWithholding,
        description: `Withholding recognized on ${invoice.invoiceNumber}`,
      });
    }
    const journal = await this.accounting.postJournal(tx, {
      tenantId,
      entryDate: invoice.invoiceDate,
      currencyCode: invoice.currencyCode,
      sourceType: 'SUPPLIER_INVOICE',
      sourceId: invoice.id,
      memo: `Supplier invoice ${invoice.invoiceNumber}`,
      createdById: userId,
      lines,
    });
    return tx.supplierInvoice
      .update({
        where: { id: invoice.id },
        data: { status: SupplierInvoiceStatus.POSTED, postedAt: new Date() },
        include: { Lines: true },
      })
      .then((posted) => ({ ...posted, JournalEntry: journal }));
  }

  private async allocatePriceDifference(
    tx: Prisma.TransactionClient,
    receiptItem: Prisma.PurchaseOrderReceiptItemGetPayload<{
      include: {
        InventoryItem: true;
        Receipt: { include: { PurchaseOrder: true } };
      };
    }>,
    quantity: Prisma.Decimal,
    difference: Prisma.Decimal,
    invoiceId: string,
  ): Promise<JournalLineInput[]> {
    const inventoryItem = receiptItem.InventoryItem;
    const warehouseId = receiptItem.Receipt.PurchaseOrder.warehouseId;
    if (inventoryItem.valuationMethod === 'STANDARD_COST') {
      return this.signedJournalLine(
        AccountingAccountRole.PURCHASE_PRICE_VARIANCE,
        difference,
        `Standard-cost purchase variance for invoice ${invoiceId}`,
      );
    }

    let quantityOnHand = new Prisma.Decimal(0);
    if (warehouseId) {
      const stock = await tx.inventoryStock.findUnique({
        where: {
          warehouseId_inventoryItemId: {
            warehouseId,
            inventoryItemId: inventoryItem.id,
          },
        },
        select: { quantity: true, averageUnitCost: true },
      });
      quantityOnHand = new Prisma.Decimal(stock?.quantity ?? 0);
      if (inventoryItem.valuationMethod === 'FIFO' && receiptItem.movementId) {
        const layers = await tx.inventoryCostLayer.findMany({
          where: {
            tenantId: receiptItem.tenantId,
            inventoryItemId: inventoryItem.id,
            warehouseId,
            sourceMovementId: receiptItem.movementId,
            remainingQuantity: { gt: 0 },
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
        quantityOnHand = layers.reduce(
          (total, layer) => total.add(layer.remainingQuantity),
          new Prisma.Decimal(0),
        );
      }
    }
    const allocatedQuantity = Prisma.Decimal.min(quantity, quantityOnHand);
    if (
      allocatedQuantity.gt(0) &&
      inventoryItem.valuationMethod === 'FIFO' &&
      !receiptItem.movementId
    ) {
      throw new ConflictException(
        'FIFO invoice adjustments require the original receipt cost layer',
      );
    }
    if (
      allocatedQuantity.gt(0) &&
      inventoryItem.valuationMethod !== 'FIFO' &&
      inventoryItem.valuationMethod !== 'MOVING_WEIGHTED_AVERAGE'
    ) {
      throw new ConflictException(
        'Inventory valuation method is not configured for invoice adjustment',
      );
    }
    const inventoryDifference = quantity.isZero()
      ? new Prisma.Decimal(0)
      : difference.mul(allocatedQuantity).div(quantity).toDecimalPlaces(6);
    const consumedDifference = difference.sub(inventoryDifference);
    const result: JournalLineInput[] = [
      ...this.signedJournalLine(
        AccountingAccountRole.INVENTORY,
        inventoryDifference,
        `Inventory price adjustment for invoice ${invoiceId}`,
      ),
      ...this.signedJournalLine(
        AccountingAccountRole.COST_OF_GOODS_SOLD,
        consumedDifference,
        `Consumed-stock price adjustment for invoice ${invoiceId}`,
      ),
    ];

    if (
      allocatedQuantity.gt(0) &&
      inventoryItem.valuationMethod === 'FIFO' &&
      receiptItem.movementId &&
      !difference.isZero()
    ) {
      const layers = await tx.inventoryCostLayer.findMany({
        where: {
          tenantId: receiptItem.tenantId,
          inventoryItemId: inventoryItem.id,
          warehouseId,
          sourceMovementId: receiptItem.movementId,
          remainingQuantity: { gt: 0 },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      let remainingQuantity = allocatedQuantity;
      const perUnitDifference = difference.div(quantity);
      for (const layer of layers) {
        if (remainingQuantity.lte(0)) break;
        const updatedQuantity = Prisma.Decimal.min(
          layer.remainingQuantity,
          remainingQuantity,
        );
        const updatedUnitCost = layer.unitCost.add(perUnitDifference);
        if (updatedUnitCost.isNegative()) {
          throw new ConflictException(
            'Invoice price adjustment would reduce a FIFO layer below zero cost',
          );
        }
        if (updatedQuantity.eq(layer.remainingQuantity)) {
          await tx.inventoryCostLayer.update({
            where: { id: layer.id },
            data: { unitCost: updatedUnitCost },
          });
        } else {
          await tx.inventoryCostLayer.update({
            where: { id: layer.id },
            data: {
              receivedQuantity: { decrement: updatedQuantity },
              remainingQuantity: { decrement: updatedQuantity },
            },
          });
          await tx.inventoryCostLayer.create({
            data: {
              tenantId: receiptItem.tenantId,
              inventoryItemId: inventoryItem.id,
              warehouseId,
              sourceMovementId: receiptItem.movementId,
              sourceType: 'PURCHASE_PRICE_ADJUSTMENT',
              sourceReferenceId: invoiceId,
              receivedQuantity: updatedQuantity,
              remainingQuantity: updatedQuantity,
              unitCost: updatedUnitCost,
              unit: inventoryItem.unit,
              createdAt: layer.createdAt,
            },
          });
        }
        remainingQuantity = remainingQuantity.sub(updatedQuantity);
      }
    } else if (
      allocatedQuantity.gt(0) &&
      inventoryItem.valuationMethod === 'MOVING_WEIGHTED_AVERAGE' &&
      warehouseId
    ) {
      if (inventoryItem.movingAverageScope === 'PER_ITEM') {
        const stocks = await tx.inventoryStock.aggregate({
          where: { inventoryItemId: inventoryItem.id },
          _sum: { quantity: true },
        });
        const totalStock = new Prisma.Decimal(stocks._sum.quantity ?? 0);
        if (totalStock.lte(0) || inventoryItem.averageUnitCost === null) {
          throw new ConflictException(
            'Moving-average inventory cost is unavailable for invoice adjustment',
          );
        }
        const revised = inventoryItem.averageUnitCost.add(
          inventoryDifference.div(totalStock).toDecimalPlaces(6),
        );
        if (revised.isNegative()) {
          throw new ConflictException(
            'Invoice price adjustment would reduce moving-average cost below zero',
          );
        }
        await tx.inventoryItem.update({
          where: { id: inventoryItem.id },
          data: { averageUnitCost: revised },
        });
      } else {
        const stock = await tx.inventoryStock.findUnique({
          where: {
            warehouseId_inventoryItemId: {
              warehouseId,
              inventoryItemId: inventoryItem.id,
            },
          },
          select: { quantity: true, averageUnitCost: true },
        });
        if (!stock || stock.quantity <= 0 || stock.averageUnitCost === null) {
          throw new ConflictException(
            'Moving-average warehouse cost is unavailable for invoice adjustment',
          );
        }
        const revised = new Prisma.Decimal(stock.averageUnitCost).add(
          inventoryDifference.div(stock.quantity).toDecimalPlaces(6),
        );
        if (revised.isNegative()) {
          throw new ConflictException(
            'Invoice price adjustment would reduce moving-average cost below zero',
          );
        }
        await tx.inventoryStock.update({
          where: {
            warehouseId_inventoryItemId: {
              warehouseId,
              inventoryItemId: inventoryItem.id,
            },
          },
          data: { averageUnitCost: revised, updatedAt: new Date() },
        });
      }
    }
    return result;
  }

  private signedJournalLine(
    role: AccountingAccountRole,
    amount: Prisma.Decimal,
    description: string,
  ): JournalLineInput[] {
    if (amount.isZero()) return [];
    return [
      amount.isPositive()
        ? { role, debit: amount, description }
        : { role, credit: amount.abs(), description },
    ];
  }

  async createPayment(
    tenantId: string,
    userId: string,
    idempotencyKey: string,
    dto: CreateSupplierPaymentDto,
  ) {
    this.validateIdempotencyKey(idempotencyKey);
    const requestHash = this.hashRequest(dto);
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.supplierPayment.findUnique({
          where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
          include: { Allocations: true },
        });
        if (existing) {
          if (existing.requestHash !== requestHash) {
            throw new ConflictException(
              'Idempotency-Key was already used with a different payment',
            );
          }
          return existing;
        }
        const supplier = await tx.supplier.findFirst({
          where: { id: dto.supplierId, tenantId },
        });
        if (!supplier) throw new NotFoundException('Supplier not found');
        const invoiceIds = dto.allocations.map(
          (allocation) => allocation.invoiceId,
        );
        if (new Set(invoiceIds).size !== invoiceIds.length) {
          throw new BadRequestException(
            'An invoice may only appear once per supplier payment',
          );
        }
        let netTotal = new Prisma.Decimal(0);
        const allocations: Array<{
          invoiceId: string;
          allocatedAmount: Prisma.Decimal;
          withholdingAmount: Prisma.Decimal;
          netAmount: Prisma.Decimal;
        }> = [];
        for (const allocation of dto.allocations) {
          const locked = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id"
            FROM "SupplierInvoice"
            WHERE "id" = ${allocation.invoiceId} AND "tenantId" = ${tenantId}
            FOR UPDATE
          `;
          if (locked.length !== 1) {
            throw new NotFoundException('Supplier invoice not found');
          }
          const invoice = await tx.supplierInvoice.findFirst({
            where: {
              id: allocation.invoiceId,
              tenantId,
              supplierId: supplier.id,
              status: {
                in: [
                  SupplierInvoiceStatus.POSTED,
                  SupplierInvoiceStatus.PARTIALLY_PAID,
                ],
              },
            },
          });
          if (!invoice) {
            throw new ConflictException(
              'Payments can only be allocated to posted, unpaid invoices for the selected supplier',
            );
          }
          const previous = await tx.supplierPaymentAllocation.aggregate({
            where: { tenantId, invoiceId: invoice.id },
            _sum: { allocatedAmount: true, withholdingAmount: true },
          });
          const priorAllocated =
            previous._sum.allocatedAmount ?? new Prisma.Decimal(0);
          const postedCreditNotes = await tx.supplierCreditNote.findMany({
            where: {
              tenantId,
              invoiceId: invoice.id,
              status: SupplierCreditNoteStatus.POSTED,
            },
            select: { grossAmount: true, withholdingAdjustment: true },
          });
          const creditApplied = postedCreditNotes.reduce(
            (total, credit) =>
              total.add(
                credit.grossAmount.sub(
                  invoice.withholdingTiming === WithholdingTiming.INVOICE
                    ? credit.withholdingAdjustment
                    : 0,
                ),
              ),
            new Prisma.Decimal(0),
          );
          const outstanding = (
            invoice.withholdingTiming === WithholdingTiming.INVOICE
              ? invoice.netPayableAmount
              : invoice.grossAmount
          )
            .sub(priorAllocated)
            .sub(creditApplied);
          const allocatedAmount = money(allocation.allocatedGross);
          if (allocatedAmount.gt(outstanding)) {
            throw new ConflictException(
              `Payment allocation exceeds outstanding invoice balance ${invoice.invoiceNumber}`,
            );
          }
          let withholdingAmount = new Prisma.Decimal(0);
          if (invoice.withholdingTiming === WithholdingTiming.PAYMENT) {
            const priorWithheld =
              previous._sum.withholdingAmount ?? new Prisma.Decimal(0);
            withholdingAmount = allocatedAmount.eq(outstanding)
              ? invoice.withholdingAmount.sub(priorWithheld)
              : invoice.withholdingAmount
                  .mul(allocatedAmount)
                  .div(invoice.grossAmount)
                  .toDecimalPlaces(6);
          }
          if (withholdingAmount.gt(allocatedAmount)) {
            throw new ConflictException(
              'Withholding exceeds the payment allocation',
            );
          }
          const netAmount = allocatedAmount.sub(withholdingAmount);
          netTotal = netTotal.add(netAmount);
          allocations.push({
            invoiceId: invoice.id,
            allocatedAmount,
            withholdingAmount,
            netAmount,
          });
        }
        const tenant = await tx.tenant.findUnique({
          where: { id: tenantId },
          select: { currencyCode: true },
        });
        if (!tenant?.currencyCode) {
          throw new ConflictException('Tenant base currency is not configured');
        }
        const payment = await tx.supplierPayment.create({
          data: {
            tenantId,
            supplierId: supplier.id,
            paymentDate: this.asDateOnly(dto.paymentDate),
            currencyCode: tenant.currencyCode,
            method: dto.method,
            reference: dto.reference?.trim() || null,
            amount: netTotal,
            idempotencyKey,
            requestHash,
            createdById: userId,
            Allocations: {
              create: allocations.map((allocation) => ({
                tenantId,
                ...allocation,
              })),
            },
          },
          include: { Allocations: true },
        });
        const grossAllocated = allocations.reduce(
          (total, allocation) => total.add(allocation.allocatedAmount),
          new Prisma.Decimal(0),
        );
        const withholdingAtPayment = allocations.reduce(
          (total, allocation) => total.add(allocation.withholdingAmount),
          new Prisma.Decimal(0),
        );
        const journalLines: JournalLineInput[] = [
          {
            role: AccountingAccountRole.ACCOUNTS_PAYABLE,
            debit: grossAllocated,
            description: `Supplier payment ${payment.id}`,
          },
          {
            role: AccountingAccountRole.CASH_OR_BANK,
            credit: netTotal,
            description: `Cash disbursement ${payment.id}`,
          },
        ];
        if (withholdingAtPayment.gt(0)) {
          journalLines.push({
            role: AccountingAccountRole.WITHHOLDING_PAYABLE,
            credit: withholdingAtPayment,
            description: `Withholding recognized on supplier payment ${payment.id}`,
          });
        }
        const journal = await this.accounting.postJournal(tx, {
          tenantId,
          entryDate: payment.paymentDate,
          currencyCode: payment.currencyCode,
          sourceType: 'SUPPLIER_PAYMENT',
          sourceId: payment.id,
          memo: `Supplier payment ${payment.id}`,
          createdById: userId,
          lines: journalLines,
        });
        for (const allocation of allocations) {
          const invoice = await tx.supplierInvoice.findFirstOrThrow({
            where: { id: allocation.invoiceId, tenantId },
          });
          const totalAllocated = await tx.supplierPaymentAllocation.aggregate({
            where: { tenantId, invoiceId: invoice.id },
            _sum: { allocatedAmount: true },
          });
          const payable =
            invoice.withholdingTiming === WithholdingTiming.INVOICE
              ? invoice.netPayableAmount
              : invoice.grossAmount;
          const postedCreditNotes = await tx.supplierCreditNote.findMany({
            where: {
              tenantId,
              invoiceId: invoice.id,
              status: SupplierCreditNoteStatus.POSTED,
            },
            select: { grossAmount: true, withholdingAdjustment: true },
          });
          const creditApplied = postedCreditNotes.reduce(
            (total, credit) =>
              total.add(
                credit.grossAmount.sub(
                  invoice.withholdingTiming === WithholdingTiming.INVOICE
                    ? credit.withholdingAdjustment
                    : 0,
                ),
              ),
            new Prisma.Decimal(0),
          );
          const remaining = payable
            .sub(totalAllocated._sum.allocatedAmount ?? 0)
            .sub(creditApplied);
          await tx.supplierInvoice.update({
            where: { id: invoice.id },
            data: {
              status: remaining.lte(0)
                ? SupplierInvoiceStatus.PAID
                : SupplierInvoiceStatus.PARTIALLY_PAID,
              updatedAt: new Date(),
            },
          });
        }
        return { ...payment, JournalEntry: journal };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  listPayments(tenantId: string, skip = 0, take = 50) {
    const pagination = this.pagination(skip, take);
    return this.prisma.supplierPayment.findMany({
      where: { tenantId },
      include: {
        Supplier: { select: { id: true, name: true } },
        Allocations: {
          include: {
            Invoice: {
              select: {
                id: true,
                invoiceNumber: true,
                grossAmount: true,
                currencyCode: true,
              },
            },
          },
        },
      },
      orderBy: [{ paymentDate: 'desc' }, { id: 'desc' }],
      skip: pagination.skip,
      take: pagination.take,
    });
  }

  listCreditNotes(tenantId: string, skip = 0, take = 50) {
    const pagination = this.pagination(skip, take);
    return this.prisma.supplierCreditNote.findMany({
      where: { tenantId },
      include: {
        Supplier: { select: { id: true, name: true } },
        Invoice: { select: { id: true, invoiceNumber: true, status: true } },
        PurchaseOrderReturn: {
          select: { id: true, purchaseOrderId: true, creditAmount: true },
        },
        Lines: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: pagination.skip,
      take: pagination.take,
    });
  }

  async createCreditNote(
    tenantId: string,
    userId: string,
    idempotencyKey: string,
    dto: CreateSupplierCreditNoteDto,
  ) {
    this.validateIdempotencyKey(idempotencyKey);
    const requestHash = this.hashRequest(dto);
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.supplierCreditNote.findUnique({
          where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
          include: { Lines: true },
        });
        if (existing) {
          if (existing.requestHash !== requestHash) {
            throw new ConflictException(
              'Idempotency-Key was already used with a different credit note',
            );
          }
          return existing;
        }
        const supplier = await tx.supplier.findFirst({
          where: { id: dto.supplierId, tenantId },
        });
        if (!supplier) throw new NotFoundException('Supplier not found');
        const isReturn = dto.type === SupplierCreditNoteType.RETURN;
        if (isReturn && !dto.purchaseOrderReturnId) {
          throw new BadRequestException(
            'Return credit notes must reference a Purchase Order return',
          );
        }
        if (!isReturn && (!dto.invoiceId || !dto.claimReference?.trim())) {
          throw new BadRequestException(
            'Non-return credit notes require an invoice and claim reference',
          );
        }
        if (!isReturn && dto.purchaseOrderReturnId) {
          throw new BadRequestException(
            'Non-return credit notes cannot reference a physical return',
          );
        }
        const invoice = dto.invoiceId
          ? await tx.supplierInvoice.findFirst({
              where: { id: dto.invoiceId, tenantId, supplierId: supplier.id },
              include: { Lines: true },
            })
          : null;
        if (dto.invoiceId && !invoice) {
          throw new NotFoundException('Supplier invoice not found');
        }
        const returnRecord =
          isReturn && dto.purchaseOrderReturnId
            ? await tx.purchaseOrderReturn.findFirst({
                where: {
                  id: dto.purchaseOrderReturnId,
                  tenantId,
                  PurchaseOrder: { supplierId: supplier.id },
                },
                include: {
                  PurchaseOrder: {
                    include: { Tenant: { select: { currencyCode: true } } },
                  },
                  Items: {
                    include: {
                      ReceiptItem: true,
                    },
                  },
                },
              })
            : null;
        if (isReturn && !returnRecord) {
          throw new NotFoundException('Purchase Order return not found');
        }
        const currencyCode =
          invoice?.currencyCode ??
          returnRecord?.PurchaseOrder.currencyCode ??
          returnRecord?.PurchaseOrder.Tenant.currencyCode;
        if (!currencyCode) {
          throw new ConflictException(
            'Credit note requires a configured tenant purchase currency',
          );
        }
        if (invoice && returnRecord) {
          const invoiceReceiptItemIds = new Set(
            (
              await tx.supplierInvoiceLine.findMany({
                where: { tenantId, invoiceId: invoice.id },
                select: { receiptItemId: true },
              })
            ).map((line) => line.receiptItemId),
          );
          if (
            !returnRecord.Items.some(
              (item) =>
                item.receiptItemId &&
                invoiceReceiptItemIds.has(item.receiptItemId),
            )
          ) {
            throw new BadRequestException(
              'The referenced invoice does not include items from this return',
            );
          }
        }

        const returnItemsById = new Map(
          (returnRecord?.Items ?? []).map((item) => [item.id, item]),
        );
        const invoiceLinesById = new Map(
          (invoice?.Lines ?? []).map((line) => [line.id, line]),
        );
        let subtotal = new Prisma.Decimal(0);
        let inputTaxAdjustment = new Prisma.Decimal(0);
        let withholdingAdjustment = new Prisma.Decimal(0);
        const requestedAmountByInvoiceLine = new Map<string, Prisma.Decimal>();
        const requestedQuantityByInvoiceLine = new Map<
          string,
          Prisma.Decimal
        >();
        const requestedAmountByReturnItem = new Map<string, Prisma.Decimal>();
        const prepared: Array<{
          dtoLine: CreateSupplierCreditNoteDto['lines'][number];
          amount: Prisma.Decimal;
          tax: ResolvedTax;
          receiptItemId: string | null;
        }> = [];
        for (const line of dto.lines) {
          const amount = money(line.amount);
          let receiptItemId = line.receiptItemId ?? null;
          let taxCategory: string | null = null;
          const invoiceLine =
            line.invoiceLineId && invoice
              ? invoiceLinesById.get(line.invoiceLineId)
              : undefined;
          if (line.invoiceLineId && (!invoice || !invoiceLine)) {
            throw new BadRequestException(
              'Credit note invoice lines must belong to the referenced invoice',
            );
          }
          if (invoiceLine) {
            if (
              line.receiptItemId &&
              line.receiptItemId !== invoiceLine.receiptItemId
            ) {
              throw new BadRequestException(
                'Credit note receipt item does not match the invoice line',
              );
            }
            receiptItemId = invoiceLine.receiptItemId;
            taxCategory = invoiceLine.taxCategory;
          }

          if (isReturn) {
            if (!line.returnItemId || !returnRecord) {
              throw new BadRequestException(
                'Every return credit line must reference a returned receipt item',
              );
            }
            const returnItem = returnItemsById.get(line.returnItemId);
            if (
              !returnItem ||
              !returnItem.receiptItemId ||
              amount.gt(returnItem.invoicedCreditAmount) ||
              line.quantity === undefined ||
              money(line.quantity).gt(returnItem.invoicedQuantity) ||
              !money(line.quantity).mul(returnItem.unitPrice).eq(amount)
            ) {
              throw new BadRequestException(
                'Return credit lines must match the invoiced quantity and amount from the referenced return',
              );
            }
            const previouslyCreditedReturn =
              await tx.supplierCreditNoteLine.aggregate({
                where: {
                  tenantId,
                  returnItemId: returnItem.id,
                  CreditNote: {
                    status: { not: SupplierCreditNoteStatus.VOID },
                  },
                },
                _sum: { amount: true },
              });
            const remainingReturnCredit = returnItem.invoicedCreditAmount
              .sub(previouslyCreditedReturn._sum.amount ?? 0)
              .sub(requestedAmountByReturnItem.get(returnItem.id) ?? 0);
            if (amount.gt(remainingReturnCredit)) {
              throw new ConflictException(
                'Return quantity has already been credited',
              );
            }
            requestedAmountByReturnItem.set(
              returnItem.id,
              (
                requestedAmountByReturnItem.get(returnItem.id) ??
                new Prisma.Decimal(0)
              ).add(amount),
            );
            if (receiptItemId && receiptItemId !== returnItem.receiptItemId) {
              throw new BadRequestException(
                'Return credit receipt item does not match the physical return',
              );
            }
            receiptItemId = returnItem.receiptItemId;
            if (
              invoice &&
              (!invoiceLine || invoiceLine.receiptItemId !== receiptItemId)
            ) {
              throw new BadRequestException(
                'A return credit linked to an invoice must identify the matching invoice line',
              );
            }
            if (line.allocationType !== CreditAllocationType.INVENTORY) {
              throw new BadRequestException(
                'Physical return credit lines must use the inventory allocation type',
              );
            }
            if (!invoiceLine) {
              const receiptItem = await tx.purchaseOrderReceiptItem.findFirst({
                where: { id: receiptItemId, tenantId },
                include: { InventoryItem: { select: { taxCategory: true } } },
              });
              taxCategory = receiptItem?.InventoryItem.taxCategory ?? null;
            }
          } else {
            if (
              line.returnItemId ||
              !invoice ||
              !invoiceLine ||
              !line.invoiceLineId
            ) {
              throw new BadRequestException(
                'Non-return credit lines must refer to a line on the source invoice',
              );
            }
            taxCategory = invoiceLine.taxCategory;
          }

          if (
            !isReturn &&
            line.allocationType === CreditAllocationType.INVENTORY &&
            line.quantity === undefined
          ) {
            throw new BadRequestException(
              'Inventory credit allocations require an explicit quantity',
            );
          }

          if (invoiceLine) {
            const previouslyCredited =
              await tx.supplierCreditNoteLine.aggregate({
                where: {
                  tenantId,
                  invoiceLineId: invoiceLine.id,
                  CreditNote: {
                    status: { not: SupplierCreditNoteStatus.VOID },
                  },
                },
                _sum: { amount: true, quantity: true },
              });
            const requestedAmount =
              requestedAmountByInvoiceLine.get(invoiceLine.id) ??
              new Prisma.Decimal(0);
            const remainingLineAmount = invoiceLine.subtotal
              .sub(previouslyCredited._sum.amount ?? 0)
              .sub(requestedAmount);
            if (amount.gt(remainingLineAmount)) {
              throw new ConflictException(
                'Credit note amount exceeds the invoice line amount not previously credited',
              );
            }
            if (line.quantity !== undefined) {
              const requestedQuantity =
                requestedQuantityByInvoiceLine.get(invoiceLine.id) ??
                new Prisma.Decimal(0);
              const previouslyCreditedQuantity =
                previouslyCredited._sum.quantity ?? new Prisma.Decimal(0);
              if (
                previouslyCreditedQuantity
                  .add(requestedQuantity)
                  .add(money(line.quantity))
                  .gt(invoiceLine.quantity)
              ) {
                throw new ConflictException(
                  'Credit note quantity exceeds the invoice line quantity not previously credited',
                );
              }
              requestedQuantityByInvoiceLine.set(
                invoiceLine.id,
                requestedQuantity.add(money(line.quantity)),
              );
            }
            requestedAmountByInvoiceLine.set(
              invoiceLine.id,
              requestedAmount.add(amount),
            );
          }

          const tenant = await tx.tenant.findUnique({
            where: { id: tenantId },
            select: { taxJurisdiction: true },
          });
          const transactionType = isReturn
            ? 'SUPPLIER_RETURN_CREDIT_NOTE'
            : 'SUPPLIER_CREDIT_NOTE';
          const tax = await this.resolveTaxes(tx, {
            tenantId,
            supplierTaxStatus: supplier.taxStatus,
            jurisdiction: tenant?.taxJurisdiction ?? null,
            taxCategory,
            date: new Date(),
            transactionType,
            baseAmount: amount,
            inputTaxRuleIds: line.inputTaxRuleIds,
            withholdingRuleIds: line.withholdingRuleIds,
            taxExemptReason: line.taxExemptReason,
          });
          if (
            invoice?.withholdingTiming &&
            tax.timing &&
            invoice.withholdingTiming !== tax.timing
          ) {
            throw new BadRequestException(
              'Credit note withholding timing must match the source invoice',
            );
          }
          subtotal = subtotal.add(amount);
          inputTaxAdjustment = inputTaxAdjustment.add(tax.inputTax);
          withholdingAdjustment = withholdingAdjustment.add(tax.withholding);
          prepared.push({ dtoLine: line, amount, tax, receiptItemId });
        }

        const grossAmount = subtotal.add(inputTaxAdjustment);
        if (withholdingAdjustment.gt(grossAmount)) {
          throw new BadRequestException(
            'Withholding adjustment cannot exceed the credit note gross amount',
          );
        }
        const creditNote = await tx.supplierCreditNote.create({
          data: {
            tenantId,
            supplierId: supplier.id,
            invoiceId: invoice?.id ?? null,
            purchaseOrderReturnId: returnRecord?.id ?? null,
            creditNumber: dto.creditNumber.trim(),
            type: dto.type,
            status: SupplierCreditNoteStatus.PENDING_APPROVAL,
            reason: dto.reason.trim(),
            claimReference: dto.claimReference?.trim() ?? null,
            currencyCode,
            subtotal,
            inputTaxAdjustment,
            withholdingAdjustment,
            grossAmount,
            taxSnapshot: {
              correctionType: dto.type,
              appliedRuleIds: prepared.flatMap((line) => line.tax.ruleIds),
            },
            idempotencyKey,
            requestHash,
            createdById: userId,
            Lines: {
              create: prepared.map((line) => ({
                tenantId,
                invoiceLineId: line.dtoLine.invoiceLineId ?? null,
                receiptItemId: line.receiptItemId,
                returnItemId: line.dtoLine.returnItemId ?? null,
                allocationType: line.dtoLine.allocationType,
                quantity:
                  line.dtoLine.quantity === undefined
                    ? null
                    : money(line.dtoLine.quantity),
                amount: line.amount,
                inputTaxAdjustment: line.tax.inputTax,
                withholdingAdjustment: line.tax.withholding,
                reason: line.dtoLine.taxExemptReason?.trim() ?? null,
                taxSnapshot: line.tax.snapshot,
              })),
            },
          },
          include: { Lines: true },
        });
        return creditNote;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async approveCreditNote(tenantId: string, userId: string, id: string) {
    const result = await this.prisma.supplierCreditNote.updateMany({
      where: {
        id,
        tenantId,
        status: SupplierCreditNoteStatus.PENDING_APPROVAL,
      },
      data: {
        status: SupplierCreditNoteStatus.APPROVED,
        approvedById: userId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      },
    });
    if (result.count !== 1) {
      const existing = await this.prisma.supplierCreditNote.findFirst({
        where: { id, tenantId },
        select: { id: true },
      });
      if (!existing)
        throw new NotFoundException('Supplier credit note not found');
      throw new ConflictException(
        'Only pending-approval credit notes can be approved',
      );
    }
    return this.prisma.supplierCreditNote.findFirstOrThrow({
      where: { id, tenantId },
      include: { Lines: true },
    });
  }

  async postCreditNote(tenantId: string, userId: string, id: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const lockedNote = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "SupplierCreditNote"
          WHERE "id" = ${id} AND "tenantId" = ${tenantId}
          FOR UPDATE
        `;
        if (lockedNote.length !== 1) {
          throw new NotFoundException('Supplier credit note not found');
        }
        const note = await tx.supplierCreditNote.findFirst({
          where: { id, tenantId },
          include: { Lines: true },
        });
        if (!note)
          throw new NotFoundException('Supplier credit note not found');
        if (note.status === SupplierCreditNoteStatus.POSTED) return note;
        if (note.status !== SupplierCreditNoteStatus.APPROVED) {
          throw new ConflictException(
            'Supplier credit note must be approved before posting',
          );
        }
        const invoices = note.invoiceId
          ? [
              await tx.supplierInvoice.findFirst({
                where: {
                  id: note.invoiceId,
                  tenantId,
                  supplierId: note.supplierId,
                  status: {
                    in: [
                      SupplierInvoiceStatus.POSTED,
                      SupplierInvoiceStatus.PARTIALLY_PAID,
                      SupplierInvoiceStatus.PAID,
                    ],
                  },
                },
              }),
            ]
          : await tx.supplierInvoice.findMany({
              where: {
                tenantId,
                supplierId: note.supplierId,
                status: {
                  in: [
                    SupplierInvoiceStatus.POSTED,
                    SupplierInvoiceStatus.PARTIALLY_PAID,
                    SupplierInvoiceStatus.PAID,
                  ],
                },
                Lines: {
                  some: {
                    receiptItemId: {
                      in: note.Lines.map((line) => line.receiptItemId).filter(
                        (receiptItemId): receiptItemId is string =>
                          receiptItemId !== null,
                      ),
                    },
                  },
                },
              },
            });
        const sourceInvoices = invoices.filter(
          (invoice): invoice is NonNullable<typeof invoice> => invoice !== null,
        );
        const invoiceIds = [
          ...new Set(sourceInvoices.map((invoice) => invoice.id)),
        ];
        if (invoiceIds.length !== 1) {
          throw new ConflictException(
            'Credit note posting requires exactly one posted source invoice',
          );
        }
        const selectedInvoice = sourceInvoices[0];
        if (!selectedInvoice) {
          throw new ConflictException(
            'Credit note posting requires a posted source invoice',
          );
        }
        const lockedInvoice = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "SupplierInvoice"
          WHERE "id" = ${selectedInvoice.id} AND "tenantId" = ${tenantId}
          FOR UPDATE
        `;
        if (lockedInvoice.length !== 1) {
          throw new NotFoundException('Supplier invoice not found');
        }
        const invoice = await tx.supplierInvoice.findFirst({
          where: {
            id: selectedInvoice.id,
            tenantId,
            supplierId: note.supplierId,
            status: {
              in: [
                SupplierInvoiceStatus.POSTED,
                SupplierInvoiceStatus.PARTIALLY_PAID,
                SupplierInvoiceStatus.PAID,
              ],
            },
          },
        });
        if (!invoice || invoice.currencyCode !== note.currencyCode) {
          throw new ConflictException(
            'Credit note and posted invoice currencies do not match',
          );
        }
        if (note.type === SupplierCreditNoteType.RETURN) {
          for (const line of note.Lines) {
            const invoiceLine = line.invoiceLineId
              ? await tx.supplierInvoiceLine.findFirst({
                  where: {
                    id: line.invoiceLineId,
                    invoiceId: invoice.id,
                    tenantId,
                    receiptItemId: line.receiptItemId ?? undefined,
                  },
                })
              : line.receiptItemId
                ? await tx.supplierInvoiceLine.findFirst({
                    where: {
                      tenantId,
                      invoiceId: invoice.id,
                      receiptItemId: line.receiptItemId,
                    },
                  })
                : null;
            if (!invoiceLine) {
              throw new ConflictException(
                'Return credit must identify its exact posted invoice line before posting',
              );
            }
            if (!line.invoiceLineId) {
              await tx.supplierCreditNoteLine.update({
                where: { id: line.id },
                data: { invoiceLineId: invoiceLine.id },
              });
            }
          }
        }

        const previouslyCreditedNotes = await tx.supplierCreditNote.findMany({
          where: {
            tenantId,
            invoiceId: invoice.id,
            status: SupplierCreditNoteStatus.POSTED,
          },
          select: {
            grossAmount: true,
            withholdingAdjustment: true,
          },
        });
        const previouslyCredited = previouslyCreditedNotes.reduce(
          (total, credit) =>
            total.add(
              credit.grossAmount.sub(
                invoice.withholdingTiming === WithholdingTiming.INVOICE
                  ? credit.withholdingAdjustment
                  : 0,
              ),
            ),
          new Prisma.Decimal(0),
        );
        const alreadyPaid = await tx.supplierPaymentAllocation.aggregate({
          where: { tenantId, invoiceId: invoice.id },
          _sum: { allocatedAmount: true },
        });
        const payable =
          invoice.withholdingTiming === WithholdingTiming.INVOICE
            ? invoice.netPayableAmount
            : invoice.grossAmount;
        const remainingPayable = payable
          .sub(alreadyPaid._sum.allocatedAmount ?? 0)
          .sub(previouslyCredited);
        const creditPayable = note.grossAmount.sub(
          invoice.withholdingTiming === WithholdingTiming.INVOICE
            ? note.withholdingAdjustment
            : 0,
        );
        if (creditPayable.gt(remainingPayable)) {
          throw new ConflictException(
            'Credit note exceeds the outstanding supplier payable',
          );
        }

        const journalLines: JournalLineInput[] = [
          {
            role: AccountingAccountRole.ACCOUNTS_PAYABLE,
            debit: creditPayable,
            description: `Supplier credit note ${note.creditNumber}`,
          },
        ];
        if (
          invoice.withholdingTiming === WithholdingTiming.INVOICE &&
          note.withholdingAdjustment.gt(0)
        ) {
          journalLines.push({
            role: AccountingAccountRole.WITHHOLDING_PAYABLE,
            debit: note.withholdingAdjustment,
            description: `Withholding correction for ${note.creditNumber}`,
          });
        }
        if (note.type === SupplierCreditNoteType.RETURN) {
          journalLines.push({
            role: AccountingAccountRole.SUPPLIER_RETURN_CLEARING,
            credit: note.subtotal,
            description: `Clear physical return ${note.purchaseOrderReturnId}`,
          });
        } else {
          for (const line of note.Lines) {
            if (
              line.allocationType === CreditAllocationType.INVENTORY &&
              line.quantity &&
              line.receiptItemId
            ) {
              const receiptItem = await tx.purchaseOrderReceiptItem.findFirst({
                where: { id: line.receiptItemId, tenantId },
                include: {
                  InventoryItem: true,
                  Receipt: {
                    include: { PurchaseOrder: true },
                  },
                },
              });
              if (!receiptItem) {
                throw new NotFoundException(
                  'Credit note inventory allocation receipt item not found',
                );
              }
              const adjustmentLines = await this.allocatePriceDifference(
                tx,
                receiptItem,
                line.quantity,
                new Prisma.Decimal(line.amount).negated(),
                note.id,
              );
              const expectedAllocationRole =
                receiptItem.InventoryItem.valuationMethod === 'STANDARD_COST'
                  ? AccountingAccountRole.PURCHASE_PRICE_VARIANCE
                  : AccountingAccountRole.INVENTORY;
              if (
                adjustmentLines.some(
                  (entry) => entry.role !== expectedAllocationRole,
                )
              ) {
                throw new ConflictException(
                  'Inventory credit allocation exceeds inventory still available; allocate the remainder to consumed goods',
                );
              }
              journalLines.push(...adjustmentLines);
              continue;
            }
            const role = this.creditAllocationRole(line.allocationType);
            journalLines.push({
              role,
              credit: line.amount,
              description: `Credit note ${note.creditNumber}`,
            });
          }
        }
        if (note.inputTaxAdjustment.gt(0)) {
          journalLines.push({
            role: AccountingAccountRole.INPUT_TAX,
            credit: note.inputTaxAdjustment,
            description: `Input tax correction for ${note.creditNumber}`,
          });
        }
        const journal = await this.accounting.postJournal(tx, {
          tenantId,
          entryDate: new Date(),
          currencyCode: note.currencyCode,
          sourceType: 'SUPPLIER_CREDIT_NOTE',
          sourceId: note.id,
          memo: `Supplier credit note ${note.creditNumber}`,
          createdById: userId,
          lines: journalLines,
        });
        const posted = await tx.supplierCreditNote.update({
          where: { id: note.id },
          data: {
            invoiceId: invoice.id,
            status: SupplierCreditNoteStatus.POSTED,
            postedAt: new Date(),
            updatedAt: new Date(),
          },
          include: { Lines: true },
        });
        const updatedPayable = payable
          .sub(alreadyPaid._sum.allocatedAmount ?? 0)
          .sub(previouslyCredited)
          .sub(creditPayable);
        const withholdingAmount =
          invoice.withholdingTiming === WithholdingTiming.PAYMENT
            ? Prisma.Decimal.max(
                invoice.withholdingAmount.sub(note.withholdingAdjustment),
                new Prisma.Decimal(0),
              )
            : invoice.withholdingAmount;
        if (updatedPayable.lte(0)) {
          await tx.supplierInvoice.update({
            where: { id: invoice.id },
            data: {
              status: SupplierInvoiceStatus.PAID,
              withholdingAmount,
              updatedAt: new Date(),
            },
          });
        } else if (invoice.withholdingTiming === WithholdingTiming.PAYMENT) {
          await tx.supplierInvoice.update({
            where: { id: invoice.id },
            data: { withholdingAmount, updatedAt: new Date() },
          });
        }
        return { ...posted, JournalEntry: journal };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private creditAllocationRole(type: CreditAllocationType) {
    switch (type) {
      case CreditAllocationType.INVENTORY:
        return AccountingAccountRole.INVENTORY;
      case CreditAllocationType.COST_OF_GOODS_SOLD:
        return AccountingAccountRole.COST_OF_GOODS_SOLD;
      case CreditAllocationType.PURCHASE_DISCOUNT:
        return AccountingAccountRole.PURCHASE_DISCOUNT;
      case CreditAllocationType.NON_INVENTORY:
        return AccountingAccountRole.NON_INVENTORY_EXPENSE;
    }
  }

  private async resolveTaxes(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      supplierTaxStatus: string | null;
      jurisdiction: string | null;
      taxCategory: string | null;
      date: Date;
      transactionType: string;
      baseAmount: Prisma.Decimal;
      inputTaxRuleIds: string[];
      withholdingRuleIds: string[];
      taxExemptReason?: string;
    },
  ): Promise<ResolvedTax> {
    const allIds = [...input.inputTaxRuleIds, ...input.withholdingRuleIds];
    if (new Set(allIds).size !== allIds.length) {
      throw new BadRequestException('Tax rules cannot be duplicated');
    }
    if (allIds.length === 0 && !input.taxExemptReason?.trim()) {
      throw new BadRequestException(
        'Select applicable tax rules or provide an explicit tax treatment reason',
      );
    }
    const rules = await tx.taxRule.findMany({
      where: {
        tenantId: input.tenantId,
        id: { in: allIds },
        isActive: true,
        effectiveFrom: { lte: input.date },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: input.date } }],
      },
    });
    if (rules.length !== allIds.length) {
      throw new BadRequestException(
        'One or more selected tax rules are inactive, out of date, or not found',
      );
    }
    const ruleById = new Map(rules.map((rule) => [rule.id, rule]));
    const selectedInput = input.inputTaxRuleIds.map((id) =>
      this.validateTaxRule(ruleById.get(id)!, TaxRuleKind.INPUT_TAX, input),
    );
    const selectedWithholding = input.withholdingRuleIds.map((id) =>
      this.validateTaxRule(ruleById.get(id)!, TaxRuleKind.WITHHOLDING, input),
    );
    const timings = new Set(
      selectedWithholding.map((rule) => rule.withholdingTiming),
    );
    if (timings.size > 1) {
      throw new BadRequestException(
        'Withholding tax rules with different recognition timing cannot be combined',
      );
    }
    const inputTaxEntries = selectedInput.map((rule) => ({
      id: rule.id,
      code: rule.code,
      name: rule.name,
      rate: rule.rate.toString(),
      amount: input.baseAmount.mul(rule.rate).toDecimalPlaces(6).toString(),
    }));
    const withholdingEntries = selectedWithholding.map((rule) => ({
      id: rule.id,
      code: rule.code,
      name: rule.name,
      rate: rule.rate.toString(),
      timing: rule.withholdingTiming,
      amount: input.baseAmount.mul(rule.rate).toDecimalPlaces(6).toString(),
    }));
    return {
      inputTax: inputTaxEntries.reduce(
        (total, entry) => total.add(entry.amount),
        new Prisma.Decimal(0),
      ),
      withholding: withholdingEntries.reduce(
        (total, entry) => total.add(entry.amount),
        new Prisma.Decimal(0),
      ),
      timing: selectedWithholding[0]?.withholdingTiming ?? null,
      ruleIds: allIds,
      snapshot: {
        inputTaxRules: inputTaxEntries,
        withholdingRules: withholdingEntries,
        taxExemptReason: input.taxExemptReason?.trim() ?? null,
      },
    };
  }

  private validateTaxRule(
    rule: TaxRule,
    expectedKind: TaxRuleKind,
    input: {
      taxCategory: string | null;
      supplierTaxStatus: string | null;
      jurisdiction: string | null;
      transactionType: string;
    },
  ) {
    if (rule.kind !== expectedKind) {
      throw new BadRequestException(
        `Tax rule ${rule.code} has the wrong tax kind`,
      );
    }
    if (rule.transactionType !== input.transactionType) {
      throw new BadRequestException(
        `Tax rule ${rule.code} does not apply to this transaction type`,
      );
    }
    if (rule.taxCategory && rule.taxCategory !== input.taxCategory) {
      throw new BadRequestException(
        `Tax rule ${rule.code} does not apply to this item tax category`,
      );
    }
    if (
      rule.supplierTaxStatus &&
      rule.supplierTaxStatus !== input.supplierTaxStatus
    ) {
      throw new BadRequestException(
        `Tax rule ${rule.code} does not apply to this supplier tax status`,
      );
    }
    if (rule.jurisdiction && rule.jurisdiction !== input.jurisdiction) {
      throw new BadRequestException(
        `Tax rule ${rule.code} does not apply to the tenant jurisdiction`,
      );
    }
    if (expectedKind === TaxRuleKind.WITHHOLDING && !rule.withholdingTiming) {
      throw new BadRequestException(
        `Withholding tax rule ${rule.code} has no recognition timing`,
      );
    }
    return rule;
  }

  private validateIdempotencyKey(value: string) {
    if (!value || value.length > 128 || !/^[\x21-\x7e]+$/.test(value)) {
      throw new BadRequestException(
        'A valid Idempotency-Key header of 1 to 128 visible ASCII characters is required',
      );
    }
  }

  private hashRequest(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private asDateOnly(value: string) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
      throw new BadRequestException('A valid date is required');
    }
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }

  private pagination(skip: number, take: number) {
    return {
      skip: Number.isInteger(skip) && skip >= 0 ? Math.min(skip, 1_000_000) : 0,
      take: Number.isInteger(take) && take > 0 ? Math.min(take, 100) : 50,
    };
  }
}
