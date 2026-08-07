import { ApiProperty } from '@nestjs/swagger';

export class BusinessRegistryResponseDto {
  @ApiProperty({ example: 'tenant-id' })
  id!: string;

  @ApiProperty({ example: 'tenant-id' })
  tenantId!: string;

  @ApiProperty({ example: 'My Cafe' })
  name!: string;

  @ApiProperty({ example: 'CAFE' })
  businessType!: string;

  @ApiProperty({ example: 'contact@cafe.com', nullable: true })
  contactEmail!: string | null;

  @ApiProperty({ example: '+628123456789', nullable: true })
  contactPhone!: string | null;

  @ApiProperty({ example: 'Jl. Sudirman No. 1', nullable: true })
  address!: string | null;

  @ApiProperty({ example: 'ACTIVE' })
  status!: string;

  @ApiProperty({ example: null, nullable: true })
  deletedAt!: string | null;
}
