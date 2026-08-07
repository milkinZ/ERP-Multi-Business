import { ApiProperty } from '@nestjs/swagger';

export class FeatureFlagResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  key!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  enabled!: boolean;

  @ApiProperty({ required: false })
  payload?: Record<string, unknown>;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
