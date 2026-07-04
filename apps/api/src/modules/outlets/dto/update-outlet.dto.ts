import { IsOptional, IsString } from 'class-validator';

export class UpdateOutletDto {
  @IsOptional()
  @IsString()
  name?: string;
}
