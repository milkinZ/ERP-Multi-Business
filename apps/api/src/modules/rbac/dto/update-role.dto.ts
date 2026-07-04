import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class UpdateRoleDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString({ each: true })
  permissionCodes?: string[];
}
