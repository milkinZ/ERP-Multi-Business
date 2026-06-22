import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './core/database/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ProductsModule } from './modules/products/products.module';
import { OrdersModule } from './modules/orders/orders.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { KitchenModule } from './modules/kitchen/kitchen.module';
import { IngredientsModule } from './modules/ingredients/ingredients.module';
import { RecipesModule } from './modules/recipes/recipes.module';
import { WarehouseModule } from './modules/warehouse/warehouse.module';
import { SupplierModule } from './modules/supplier/supplier.module';
import { PurchaseOrderModule } from './modules/purchase-orders/purchase-order.module';
import { AppConfigModule } from './infrastructure/config/config.module';
import { OutboxModule } from './infrastructure/events/outbox.module';
import { HealthModule } from './infrastructure/health/health.module';
import { RequestContextMiddlewareModule } from './infrastructure/request/middleware.module';
import { QueueModule } from './infrastructure/queue/queue.module';
import { SecurityModule } from './infrastructure/security/security.module';
import { LoggerModule } from './infrastructure/logger/pino-logger.module';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    ProductsModule,
    OrdersModule,
    InventoryModule,
    PaymentsModule,
    AnalyticsModule,
    KitchenModule,
    IngredientsModule,
    RecipesModule,
    WarehouseModule,
    SupplierModule,
    PurchaseOrderModule,
    OutboxModule,
    HealthModule,
    RequestContextMiddlewareModule,
    QueueModule,
    SecurityModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
