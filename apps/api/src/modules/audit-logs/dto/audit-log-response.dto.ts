import { AuditLog } from '@prisma/client';
import { Exclude } from 'class-transformer';

export class AuditLogResponseDto implements Omit<AuditLog, 'id'> {
  id: string;
  userId: string | null;
  tenantId: string;
  outletId: string | null;
  entity: string;
  entityId: string;
  action: string;
  metadata: Record<string, any> | null;
  createdAt: Date;
  updatedAt: Date;

  @Exclude()
  deletedAt: Date | null;
}
