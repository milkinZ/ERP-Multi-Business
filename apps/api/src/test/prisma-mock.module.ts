import { Global, Module } from '@nestjs/common';

import { PrismaService } from '../core/database/prisma.service';
import { DomainEventBus } from '../core/events/domain-event-bus.service';
import { SupplierRepository } from '../modules/supplier/supplier.repository';
import { ProductsRepository } from '../modules/products/products.repository';
import { RecipesRepository } from '../modules/recipes/recipes.repository';
import { WarehouseRepository } from '../modules/warehouse/warehouse.repository';
import { IngredientsRepository } from '../modules/ingredients/ingredients.repository';
import { UsersRepository } from '../modules/users/users.repository';
import { OutletsRepository } from '../modules/outlets/outlets.repository';
import { PaymentsRepository } from '../modules/payments/payments.repository';
import { InventoryRepository } from '../modules/inventory/inventory.repository';
import { TenantsRepository } from '../modules/tenants/tenants.repository';
import { KitchenRepository } from '../modules/kitchen/kitchen.repository';
import { AnalyticsRepository } from '../modules/analytics/analytics.repository';

/**
 * Jest unit-test helper.
 *
 * Existing controller/service specs compile without importing PrismaModule.
 * To prevent DI failures, we provide a minimal PrismaService mock.
 */
@Global()
@Module({
  providers: [
    {
      provide: PrismaService,
      useValue: {},
    },
    {
      provide: DomainEventBus,
      useValue: { publish: jest.fn(), subscribe: jest.fn() },
    },
    { provide: SupplierRepository, useValue: {} },
    { provide: ProductsRepository, useValue: {} },
    { provide: RecipesRepository, useValue: {} },
    { provide: WarehouseRepository, useValue: {} },
    { provide: IngredientsRepository, useValue: {} },
    { provide: UsersRepository, useValue: {} },
    { provide: OutletsRepository, useValue: {} },
    { provide: PaymentsRepository, useValue: {} },
    { provide: InventoryRepository, useValue: {} },
    { provide: TenantsRepository, useValue: {} },
    { provide: KitchenRepository, useValue: {} },
    { provide: AnalyticsRepository, useValue: {} },
  ],
  exports: [
    PrismaService,
    DomainEventBus,
    SupplierRepository,
    ProductsRepository,
    RecipesRepository,
    WarehouseRepository,
    IngredientsRepository,
    UsersRepository,
    OutletsRepository,
    PaymentsRepository,
    InventoryRepository,
    TenantsRepository,
    KitchenRepository,
    AnalyticsRepository,
  ],
})
export class PrismaMockModule {}
