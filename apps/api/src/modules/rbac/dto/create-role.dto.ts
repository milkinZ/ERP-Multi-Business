import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  // Optional: allow setting permissions by codes at creation time.
  @IsOptional()
  @IsString({ each: true })
  permissionCodes?: string[];
}
