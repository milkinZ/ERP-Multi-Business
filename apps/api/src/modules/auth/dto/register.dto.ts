import { IsEmail, IsOptional, IsString } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;

  @IsString()
  tenantId!: string;

  @IsString()
  roleId!: string;

  @IsOptional()
  @IsString()
  outletId?: string;
}
