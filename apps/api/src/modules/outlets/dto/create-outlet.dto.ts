import { IsOptional, IsString } from 'class-validator';

export class CreateOutletDto {
  @IsString()
  name!: string;

  // Outlet CRUD is tenant-scoped; tenantId comes from tenant context.
  @IsOptional()
  @IsString()
  warehouseDefaultCode?: string;
}
