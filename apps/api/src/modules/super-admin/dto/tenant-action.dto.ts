import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class TenantActionDto {
  @ApiPropertyOptional({ example: 'Suspected fraud' })
  @IsOptional()
  @IsString()
  reason?: string;
}
