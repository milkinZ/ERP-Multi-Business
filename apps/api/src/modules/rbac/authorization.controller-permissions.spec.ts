import { AuditLogController } from '../audit-logs/audit-log.controller';
import { OrdersController } from '../orders/orders.controller';
import { TenantsController } from '../tenants/tenants.controller';
import { KitchenController } from '../kitchen/kitchen.controller';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PERMISSIONS_KEY } from '../../common/decorator/permissions.decorator';
import { PERMISSIONS } from './permissions';
import { PermissionGuard } from './permission.guard';

function permissionsFor(
  controller: object,
  method: string,
): string[] | undefined {
  const handler = (controller as Record<string, unknown>)[method];
  return Reflect.getMetadata(PERMISSIONS_KEY, handler as object) as
    | string[]
    | undefined;
}

function expectPermissionGuard(controller: object) {
  const guards = Reflect.getMetadata(GUARDS_METADATA, controller) as
    | unknown[]
    | undefined;
  expect(guards).toContain(PermissionGuard);
}

describe('sensitive tenant controller permissions', () => {
  it('requires order-specific permissions for order operations', () => {
    expectPermissionGuard(OrdersController);

    expect(permissionsFor(OrdersController.prototype, 'create')).toEqual([
      PERMISSIONS.ORDER_CREATE,
    ]);
    expect(permissionsFor(OrdersController.prototype, 'findAll')).toEqual([
      PERMISSIONS.ORDER_READ,
    ]);
    expect(permissionsFor(OrdersController.prototype, 'findOne')).toEqual([
      PERMISSIONS.ORDER_READ,
    ]);
    expect(permissionsFor(OrdersController.prototype, 'updateStatus')).toEqual([
      PERMISSIONS.ORDER_UPDATE,
    ]);
  });

  it('requires business permissions and does not expose tenant creation', () => {
    expectPermissionGuard(TenantsController);

    expect(permissionsFor(TenantsController.prototype, 'getAll')).toEqual([
      PERMISSIONS.BUSINESS_READ,
    ]);
    expect(permissionsFor(TenantsController.prototype, 'getById')).toEqual([
      PERMISSIONS.BUSINESS_READ,
    ]);
    expect(permissionsFor(TenantsController.prototype, 'update')).toEqual([
      PERMISSIONS.BUSINESS_UPDATE,
    ]);
    expect(permissionsFor(TenantsController.prototype, 'softDelete')).toEqual([
      PERMISSIONS.BUSINESS_DELETE,
    ]);
    expect(TenantsController.prototype).not.toHaveProperty('create');
  });

  it('requires the audit-read permission for every audit-log endpoint', () => {
    expectPermissionGuard(AuditLogController);

    for (const method of [
      'listAuditLogs',
      'getAuditLog',
      'getAuditLogsByEntity',
    ]) {
      expect(permissionsFor(AuditLogController.prototype, method)).toEqual([
        PERMISSIONS.AUDIT_LOG_READ,
      ]);
    }
  });

  it('requires Kitchen permissions for queue, priority, and setting operations', () => {
    expectPermissionGuard(KitchenController);

    for (const method of ['getQueue', 'getTicket', 'getSettings']) {
      expect(permissionsFor(KitchenController.prototype, method)).toEqual([
        PERMISSIONS.KITCHEN_READ,
      ]);
    }
    for (const method of [
      'updateSettings',
      'setPriority',
      'startCooking',
      'markReady',
      'markServed',
      'cancel',
      'recall',
    ]) {
      expect(permissionsFor(KitchenController.prototype, method)).toEqual([
        PERMISSIONS.KITCHEN_UPDATE,
      ]);
    }
  });
});
