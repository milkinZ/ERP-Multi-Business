import { AccountingAccountRole } from '@prisma/client';
import { IsEnum, IsString } from 'class-validator';

export class MapAccountDto {
  @IsEnum(AccountingAccountRole)
  role!: AccountingAccountRole;

  @IsString()
  accountId!: string;
}
