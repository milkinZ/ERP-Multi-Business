import 'dotenv/config';

import * as bcrypt from 'bcrypt';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

import { TENANT_ASSIGNABLE_PERMISSION_CODES } from '../src/modules/rbac/tenant-permissions';

const prisma = new PrismaClient();
const tenantId = 'demo-tenant-local';
const outletId = 'demo-outlet-main';
const warehouseId = 'demo-warehouse-main';
const adminEmail = process.env.DEMO_TENANT_ADMIN_EMAIL ?? 'admin@demo.local';
const tenantName = process.env.DEMO_TENANT_NAME ?? 'Demo Tenant';

function assertLocalDemoDatabase() {
  const rawDatabaseUrl = process.env.DATABASE_URL;
  if (!rawDatabaseUrl || process.env.NODE_ENV === 'production') {
    throw new Error(
      'Demo seeding is restricted to a local non-production database.',
    );
  }

  const database = new URL(rawDatabaseUrl);
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(database.hostname) ||
    database.pathname !== '/cafe_os'
  ) {
    throw new Error('Demo seeding requires the local cafe_os database.');
  }
}

async function main() {
  assertLocalDemoDatabase();

  const permissionCodes = [...new Set(TENANT_ASSIGNABLE_PERMISSION_CODES)];
  await prisma.permission.createMany({
    data: permissionCodes.map((code) => ({ code, name: code })),
    skipDuplicates: true,
  });

  const permissions = await prisma.permission.findMany({
    where: { code: { in: permissionCodes } },
    select: { id: true },
  });
  const adminPassword = randomBytes(24).toString('base64url');
  const passwordHash = await bcrypt.hash(adminPassword, 12);
  let createdAdminPassword: string | undefined;

  const seedSummary = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.upsert({
      where: { id: tenantId },
      update: {
        name: tenantName,
        businessType: 'CAFE',
        currencyCode: 'IDR',
        taxJurisdiction: 'ID-ID',
        status: 'ACTIVE',
        deletedAt: null,
      },
      create: {
        id: tenantId,
        name: tenantName,
        businessType: 'CAFE',
        currencyCode: 'IDR',
        taxJurisdiction: 'ID-ID',
        contactEmail: 'contact@demo.local',
        contactPhone: '+62-21-555-0100',
        address: 'Jl. Contoh No. 1, Jakarta',
      },
    });

    const outlet = await tx.outlet.upsert({
      where: { id: outletId },
      update: { name: 'Demo Main Outlet', tenantId },
      create: { id: outletId, name: 'Demo Main Outlet', tenantId },
    });

    const role = await tx.role.upsert({
      where: {
        tenantId_systemKey: { tenantId, systemKey: 'TENANT_ADMIN' },
      },
      update: {
        name: 'Tenant Administrator',
        description: 'Full access to tenant modules.',
        isSystem: true,
      },
      create: {
        name: 'Tenant Administrator',
        description: 'Full access to tenant modules.',
        isSystem: true,
        systemKey: 'TENANT_ADMIN',
        tenantId,
      },
    });

    await tx.rolePermission.createMany({
      data: permissions.map((permission) => ({
        id: randomUUID(),
        roleId: role.id,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });
    await tx.rolePermission.deleteMany({
      where: {
        roleId: role.id,
        permissionId: { notIn: permissions.map((permission) => permission.id) },
      },
    });

    const existingAdmin = await tx.user.findUnique({
      where: { email: adminEmail },
    });
    if (existingAdmin && existingAdmin.tenantId !== tenantId) {
      throw new Error(
        `Tenant administrator email is already used: ${adminEmail}`,
      );
    }

    const admin = existingAdmin
      ? await tx.user.update({
          where: { id: existingAdmin.id },
          data: { isActive: true, deletedAt: null },
        })
      : await tx.user.create({
          data: {
            email: adminEmail,
            password: passwordHash,
            tenantId,
          },
        });
    if (!existingAdmin) createdAdminPassword = adminPassword;

    await tx.userRole.upsert({
      where: { userId_roleId: { userId: admin.id, roleId: role.id } },
      update: { tenantId, deletedAt: null },
      create: { userId: admin.id, roleId: role.id, tenantId },
    });
    await tx.userOutlet.upsert({
      where: { userId_outletId: { userId: admin.id, outletId } },
      update: { tenantId, deletedAt: null },
      create: { userId: admin.id, outletId, tenantId },
    });

    const warehouse = await tx.warehouse.upsert({
      where: { id: warehouseId },
      update: {
        name: 'Demo Main Warehouse',
        code: 'MAIN',
        tenantId,
        outletId,
        isActive: true,
      },
      create: {
        id: warehouseId,
        name: 'Demo Main Warehouse',
        code: 'MAIN',
        tenantId,
        outletId,
      },
    });

    const inventorySeeds = [
      {
        id: 'demo-item-coffee-beans',
        code: 'ING-COFFEE',
        name: 'Arabica Coffee Beans',
        unit: 'KG',
        taxCategory: 'FOOD',
        type: 'INGREDIENT' as const,
        standardCost: '150000',
      },
      {
        id: 'demo-item-milk',
        code: 'ING-MILK',
        name: 'Fresh Milk',
        unit: 'L',
        taxCategory: 'FOOD',
        type: 'INGREDIENT' as const,
        standardCost: '22000',
      },
      {
        id: 'demo-item-cup',
        code: 'SUP-CUP',
        name: 'Paper Cup 12oz',
        unit: 'PCS',
        taxCategory: 'SUPPLY',
        type: 'SUPPLY' as const,
        standardCost: '1200',
      },
      {
        id: 'demo-item-menu-latte',
        code: 'PRD-LATTE',
        name: 'Cafe Latte',
        unit: 'PCS',
        taxCategory: 'FOOD',
        type: 'PRODUCT' as const,
        standardCost: '18000',
      },
      {
        id: 'demo-item-menu-americano',
        code: 'PRD-AMERICANO',
        name: 'Americano',
        unit: 'PCS',
        taxCategory: 'FOOD',
        type: 'PRODUCT' as const,
        standardCost: '10000',
      },
    ];

    for (const item of inventorySeeds) {
      await tx.inventoryItem.upsert({
        where: { id: item.id },
        update: {
          code: item.code,
          name: item.name,
          unit: item.unit,
          taxCategory: item.taxCategory,
          type: item.type,
          valuationMethod: 'STANDARD_COST',
          standardCost: item.standardCost,
          tenantId,
          isActive: true,
        },
        create: {
          id: item.id,
          code: item.code,
          name: item.name,
          unit: item.unit,
          taxCategory: item.taxCategory,
          type: item.type,
          valuationMethod: 'STANDARD_COST',
          standardCost: item.standardCost,
          tenantId,
        },
      });
    }

    const products = [
      {
        id: 'demo-product-latte',
        sku: 'MENU-LATTE',
        name: 'Cafe Latte',
        inventoryItemId: 'demo-item-menu-latte',
        price: 32000,
        kitchenCategory: 'COFFEE',
        kitchenPrepTimeMinutes: 5,
      },
      {
        id: 'demo-product-americano',
        sku: 'MENU-AMERICANO',
        name: 'Americano',
        inventoryItemId: 'demo-item-menu-americano',
        price: 24000,
        kitchenCategory: 'COFFEE',
        kitchenPrepTimeMinutes: 3,
      },
    ];
    for (const product of products) {
      await tx.product.upsert({
        where: { tenantId_sku: { tenantId, sku: product.sku } },
        update: { ...product, tenantId, outletId, isActive: true },
        create: { ...product, tenantId, outletId },
      });
    }

    const supplier = await tx.supplier.upsert({
      where: { tenantId_name: { tenantId, name: 'Demo Coffee Supply' } },
      update: { isActive: true, taxStatus: 'PKP' },
      create: {
        name: 'Demo Coffee Supply',
        phone: '+62-21-555-0200',
        email: 'sales@supplier.demo.local',
        address: 'Jl. Supplier No. 2, Jakarta',
        contactPerson: 'Demo Contact',
        taxNumber: '00.000.000.0-000.000',
        taxStatus: 'PKP',
        tenantId,
      },
    });

    const offerSeeds = [
      {
        id: 'demo-offer-coffee',
        inventoryItemId: 'demo-item-coffee-beans',
        supplierSku: 'SUP-COFFEE-01',
        unit: 'KG',
        unitPrice: '150000',
      },
      {
        id: 'demo-offer-milk',
        inventoryItemId: 'demo-item-milk',
        supplierSku: 'SUP-MILK-01',
        unit: 'L',
        unitPrice: '22000',
      },
      {
        id: 'demo-offer-cup',
        inventoryItemId: 'demo-item-cup',
        supplierSku: 'SUP-CUP-12OZ',
        unit: 'PCS',
        unitPrice: '1200',
      },
    ];
    for (const offer of offerSeeds) {
      await tx.supplierItemOffer.upsert({
        where: { id: offer.id },
        update: {
          ...offer,
          supplierId: supplier.id,
          tenantId,
          currencyCode: 'IDR',
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        },
        create: {
          ...offer,
          supplierId: supplier.id,
          tenantId,
          currencyCode: 'IDR',
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        },
      });
    }

    const station = await tx.kitchenStation.upsert({
      where: {
        tenantId_outletId_name: {
          tenantId,
          outletId,
          name: 'Coffee Bar',
        },
      },
      update: { isActive: true, displayOrder: 1 },
      create: {
        tenantId,
        outletId,
        name: 'Coffee Bar',
        displayOrder: 1,
      },
    });
    for (const category of ['COFFEE']) {
      await tx.kitchenStationCategory.upsert({
        where: { outletId_category: { outletId, category } },
        update: { tenantId, stationId: station.id },
        create: { tenantId, outletId, stationId: station.id, category },
      });
    }

    const latteRecipe = await tx.recipe.upsert({
      where: { productId: 'demo-product-latte' },
      update: { tenantId, isActive: true },
      create: {
        tenantId,
        productId: 'demo-product-latte',
        isActive: true,
      },
    });
    await tx.recipeItem.deleteMany({ where: { recipeId: latteRecipe.id } });
    await tx.recipeItem.createMany({
      data: [
        {
          recipeId: latteRecipe.id,
          inventoryItemId: 'demo-item-coffee-beans',
          quantity: 0.018,
          unit: 'KG',
        },
        {
          recipeId: latteRecipe.id,
          inventoryItemId: 'demo-item-milk',
          quantity: 0.22,
          unit: 'L',
        },
        {
          recipeId: latteRecipe.id,
          inventoryItemId: 'demo-item-cup',
          quantity: 1,
          unit: 'PCS',
        },
      ],
    });

    await tx.accountingSettings.upsert({
      where: { tenantId },
      update: { invoiceApprovalRequired: true, autoPostMatchedInvoices: false },
      create: { tenantId },
    });

    const accountSeeds = [
      ['1000', 'Cash and Bank', 'ASSET', 'CASH_OR_BANK'],
      ['1200', 'Inventory', 'ASSET', 'INVENTORY'],
      ['1300', 'Input Tax', 'ASSET', 'INPUT_TAX'],
      [
        '2100',
        'Goods Received Not Invoiced',
        'LIABILITY',
        'GOODS_RECEIVED_NOT_INVOICED',
      ],
      ['2110', 'Accounts Payable', 'LIABILITY', 'ACCOUNTS_PAYABLE'],
      [
        '2120',
        'Supplier Return Clearing',
        'LIABILITY',
        'SUPPLIER_RETURN_CLEARING',
      ],
      ['2130', 'Withholding Tax Payable', 'LIABILITY', 'WITHHOLDING_PAYABLE'],
      ['5000', 'Cost of Goods Sold', 'EXPENSE', 'COST_OF_GOODS_SOLD'],
      ['5100', 'Purchase Price Variance', 'EXPENSE', 'PURCHASE_PRICE_VARIANCE'],
      ['5200', 'Purchase Discounts', 'EXPENSE', 'PURCHASE_DISCOUNT'],
      ['5300', 'Non-inventory Expense', 'EXPENSE', 'NON_INVENTORY_EXPENSE'],
    ] as const;
    for (const [code, name, type, role] of accountSeeds) {
      const account = await tx.accountingAccount.upsert({
        where: { tenantId_code: { tenantId, code } },
        update: { name, type, isActive: true },
        create: { tenantId, code, name, type },
      });
      await tx.accountingAccountMapping.upsert({
        where: { tenantId_role: { tenantId, role } },
        update: { accountId: account.id },
        create: { tenantId, role, accountId: account.id },
      });
    }

    await tx.accountingPeriod.upsert({
      where: { tenantId_name: { tenantId, name: 'FY 2026' } },
      update: {
        startsAt: new Date('2026-01-01T00:00:00.000Z'),
        endsAt: new Date('2026-12-31T00:00:00.000Z'),
        status: 'OPEN',
      },
      create: {
        tenantId,
        name: 'FY 2026',
        startsAt: new Date('2026-01-01T00:00:00.000Z'),
        endsAt: new Date('2026-12-31T00:00:00.000Z'),
      },
    });

    const taxSeeds = [
      {
        code: 'ID-INPUT-TAX-11',
        name: 'Input tax 11% (demo)',
        kind: 'INPUT_TAX' as const,
        rate: '0.11',
        withholdingTiming: null,
      },
      {
        code: 'ID-WHT-2',
        name: 'Withholding 2% at payment (demo)',
        kind: 'WITHHOLDING' as const,
        rate: '0.02',
        withholdingTiming: 'PAYMENT' as const,
      },
    ];
    for (const tax of taxSeeds) {
      await tx.taxRule.upsert({
        where: { tenantId_code: { tenantId, code: tax.code } },
        update: {
          ...tax,
          tenantId,
          transactionType: 'SUPPLIER_PURCHASE',
          taxCategory: 'FOOD',
          supplierTaxStatus: 'PKP',
          jurisdiction: 'ID-ID',
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
          isActive: true,
        },
        create: {
          ...tax,
          tenantId,
          transactionType: 'SUPPLIER_PURCHASE',
          taxCategory: 'FOOD',
          supplierTaxStatus: 'PKP',
          jurisdiction: 'ID-ID',
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        },
      });
    }

    return {
      tenantId: tenant.id,
      outletId: outlet.id,
      warehouseId: warehouse.id,
      roleId: role.id,
      adminId: admin.id,
      supplierId: supplier.id,
    };
  });

  process.stdout.write(
    JSON.stringify(
      {
        result: 'seeded',
        ...seedSummary,
        tenantAdminEmail: adminEmail,
        tenantAdminTemporaryPassword: createdAdminPassword ?? null,
        permissionCount: permissionCodes.length,
        notes: [
          'The temporary tenant password is shown only when the user is first created.',
          'Provision platform identity separately through the local OIDC/WebAuthn setup.',
        ],
      },
      null,
      2,
    ) + '\n',
  );
}

main()
  .catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
