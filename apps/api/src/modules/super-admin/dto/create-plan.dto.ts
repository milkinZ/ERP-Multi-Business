import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumber, IsString, Min } from 'class-validator';

export class CreatePlanDto {
  @ApiProperty({ example: 'BUSINESS' })
  @IsString()
  type!: string;

  @ApiProperty({ example: 'Business Plan' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 49900 })
  @IsNumber()
  @IsInt()
  @Min(0)
  priceCents!: number;
}
