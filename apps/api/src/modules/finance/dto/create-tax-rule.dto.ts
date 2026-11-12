import { TaxRuleKind, WithholdingTiming } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreateTaxRuleDto {
  @IsString()
  @Length(1, 40)
  code!: string;

  @IsString()
  @Length(1, 120)
  name!: string;

  @IsEnum(TaxRuleKind)
  kind!: TaxRuleKind;

  @IsString()
  @Length(1, 48)
  transactionType!: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  taxCategory?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  supplierTaxStatus?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  jurisdiction?: string;

  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(0)
  @Max(1)
  rate!: number;

  @IsOptional()
  @IsEnum(WithholdingTiming)
  withholdingTiming?: WithholdingTiming;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}
