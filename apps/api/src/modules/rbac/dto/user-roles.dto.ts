import { IsArray, IsString } from 'class-validator';

export class UserRolesDto {
  @IsArray()
  @IsString({ each: true })
  roleIds!: string[];
}
