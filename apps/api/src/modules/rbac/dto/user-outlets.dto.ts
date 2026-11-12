import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class UserOutletsDto {
  @IsArray()
  @IsString({ each: true })
  outletIds!: string[];

  @IsOptional()
  @IsBoolean()
  tenantWideNotificationAccess?: boolean;
}
