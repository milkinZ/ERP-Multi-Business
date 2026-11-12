import { IsOptional, IsString, MinLength } from 'class-validator';

export class AssignKitchenTicketDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  userId?: string | null;
}
