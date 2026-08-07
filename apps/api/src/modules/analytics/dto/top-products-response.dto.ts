import { ApiProperty } from '@nestjs/swagger';

export class TopProductItemDto {
  @ApiProperty({ example: 'prod_abc123' })
  productId!: string;

  @ApiProperty({ example: 'Espresso' })
  name!: string;

  @ApiProperty({ example: 450 })
  qtySold!: number;
}

export class TopProductsResponseDto {
  @ApiProperty({ type: [TopProductItemDto] })
  items!: TopProductItemDto[];
}
