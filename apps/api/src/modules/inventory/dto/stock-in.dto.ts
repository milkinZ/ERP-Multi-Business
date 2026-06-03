import {
    IsInt,
    IsOptional,
    IsString,
    Min,
} from 'class-validator'

export class StockInDto {
    @IsString()
    inventoryItemId!: string

    @IsString()
    warehouseId!: string

    @IsInt()
    @Min(1)
    quantity!: number

    @IsOptional()
    @IsString()
    note?: string
}