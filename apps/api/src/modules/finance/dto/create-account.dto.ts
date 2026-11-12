import { AccountingAccountType } from '@prisma/client';
import { IsEnum, IsString, Length } from 'class-validator';

export class CreateAccountDto {
  @IsString()
  @Length(1, 32)
  code!: string;

  @IsString()
  @Length(1, 120)
  name!: string;

  @IsEnum(AccountingAccountType)
  type!: AccountingAccountType;
}
