import { IsArray, IsString } from 'class-validator';

export class RolePermissionsDto {
  @IsArray()
  @IsString({ each: true })
  permissionCodes!: string[];
}
